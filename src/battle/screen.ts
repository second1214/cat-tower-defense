// 戦闘の画面（盤面の canvas ＋ 上のバー ＋ 下のカード）。入力（スティック・キーボード）をまとめて、毎コマ battle.step() を呼ぶ。
//
// 使い方:
//   const h = startBattle(root, loadout, { onEnd(result) { ... }, onQuit() { ... } });
//   h.destroy(); // 画面を消すとき（onEnd / onQuit のあとに呼び出し側で）
// root は画面いっぱいの要素を渡す（中に position:absolute で全面に広がる）。
//
// 操作:
//   スマホ: 盤面のどこかに指を置くと、そこにスティックが出る（ドラッグで移動）。カードを押すと置く。複数の指で同時に操作できる。
//   PC: WASD / 矢印キーで移動、1〜5 で置く、E かスペースで強化、Esc か P で一時停止。

import "./battle.css";
import type { BattleInput, BattleResult, Loadout } from "../core/types";
import { Battle, type BattleEvent } from "./engine";
import { BattleView } from "./view";
import { getSprite, loadSpriteOverrides, spriteVersion, SPRITE_SIZE } from "./sprites";
import { fmt } from "../core/num";

export interface BattleScreenOptions {
  /** 戦闘が終わって「つぎへ」を押したとき（1回だけ呼ぶ）。ごほうびの画面は呼び出し側で出す。 */
  onEnd(result: BattleResult): void;
  /** 一時停止から「あきらめる」を押したとき。 */
  onQuit(): void;
  seed?: number;
}

export interface BattleScreenHandle {
  destroy(): void;
}

const STICK_R = 46;       // スティックの半径（CSS px）
const STICK_DEAD = 0.12;  // これより小さい傾きは無視
const MAX_DT = 0.1;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

/** 小さい canvas に絵を描く（カードのアイコンなど）。 */
function iconCanvas(cls: string, parent: HTMLElement, cssSize: number): HTMLCanvasElement {
  const c = el("canvas", cls, parent);
  const d = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(cssSize * d);
  c.height = Math.round(cssSize * d);
  return c;
}

function paintIcon(c: HTMLCanvasElement, img: CanvasImageSource): void {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, c.width, c.height);
}

function timeText(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const HEART_SVG = `<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21 C 5 15, 1 11.5, 1 7 A 5.6 5.6 0 0 1 12 4.6 A 5.6 5.6 0 0 1 23 7 C 23 11.5, 19 15, 12 21 Z"/></svg>`;

export function startBattle(root: HTMLElement, loadout: Loadout, opts: BattleScreenOptions): BattleScreenHandle {
  loadSpriteOverrides();
  const battle = new Battle(loadout, opts.seed ?? ((Math.random() * 2 ** 31) | 0));

  if (getComputedStyle(root).position === "static") root.style.position = "relative";

  // ---- DOM ----
  const wrap = el("div", "bt-root", root);
  const col = el("div", "bt-col", wrap);

  // 上のバー
  const top = el("header", "bt-top", col);
  const mamaBox = el("div", "bt-mama", top);
  paintIcon(iconCanvas("bt-mama-icon", mamaBox, 30), getSprite("mama", "normal"));
  const heartsBox = el("div", "bt-hearts", mamaBox);
  const useHearts = battle.mamaMaxHp <= 10;
  const hearts: HTMLElement[] = [];
  let mamaBarFill: HTMLElement | null = null;
  let mamaBarText: HTMLElement | null = null;
  if (useHearts) {
    for (let i = 0; i < battle.mamaMaxHp; i++) {
      const h = el("span", "bt-heart", heartsBox);
      h.innerHTML = HEART_SVG;
      hearts.push(h);
    }
  } else {
    const bar = el("div", "bt-mamabar", heartsBox);
    mamaBarFill = el("div", "bt-mamabar-fill", bar);
    mamaBarText = el("span", "bt-mamabar-text", bar);
  }
  const mid = el("div", "bt-mid", top);
  const waveText = el("div", "bt-wave", mid);
  const timeEl = el("div", "bt-time", mid);
  const pauseBtn = el("button", "bt-pause", top);
  pauseBtn.type = "button";
  pauseBtn.setAttribute("aria-label", "一時停止");
  el("span", "", pauseBtn);
  el("span", "", pauseBtn);

  // 盤面
  const board = el("div", "bt-board", col);
  const canvas = el("canvas", "bt-canvas", board);
  const stick = el("div", "bt-stick", board);
  const knob = el("div", "bt-knob", stick);
  const toast = el("div", "bt-toast", board);
  const hint = el("div", "bt-hint", board, "指でなぞって猫を動かそう");

  // 下のパネル
  const bottom = el("footer", "bt-bottom", col);
  const row1 = el("div", "bt-row1", bottom);
  const kibbleBox = el("div", "bt-kibble", row1);
  paintIcon(iconCanvas("bt-kibble-icon", kibbleBox, 34), getSprite("pickup", "kibble"));
  const kibbleNum = el("span", "bt-kibble-num", kibbleBox, "0");
  const upBtn = el("button", "bt-upg", row1);
  upBtn.type = "button";
  const upTitle = el("span", "bt-upg-title", upBtn, "強化");
  const upSub = el("span", "bt-upg-sub", upBtn, "");

  const cardsBox = el("div", "bt-cards", bottom);
  interface CardUI {
    btn: HTMLButtonElement; icon: HTMLCanvasElement; cost: HTMLElement; cd: HTMLElement; cdText: HTMLElement;
    last: { dis: boolean; poor: boolean; cd: number; cdt: string };
  }
  const cards: CardUI[] = loadout.objects.slice(0, 5).map((o, i) => {
    const btn = el("button", "bt-card", cardsBox);
    btn.type = "button";
    btn.dataset.kind = o.kind;
    el("span", "bt-key", btn, String(i + 1));
    const icon = iconCanvas("bt-card-icon", btn, 44);
    paintIcon(icon, getSprite("object", o.id, { kind: o.kind }));
    el("span", "bt-card-name", btn, o.name);
    const costRow = el("span", "bt-card-cost", btn);
    paintIcon(iconCanvas("bt-mini-kibble", costRow, 14), getSprite("pickup", "kibble"));
    const cost = el("span", "", costRow, fmt(o.cost));
    const cd = el("span", "bt-card-cd", btn);
    const cdText = el("span", "bt-card-cdtext", btn);
    return { btn, icon, cost, cd, cdText, last: { dis: false, poor: false, cd: -1, cdt: "" } };
  });
  let iconVersion = spriteVersion();

  // 演出用の、全体にかぶせる canvas（カリカリが数字へ飛んでいく）
  const fxCanvas = el("canvas", "bt-fx", wrap);
  const fxG = fxCanvas.getContext("2d")!;

  // 一時停止・結果
  const overlay = el("div", "bt-overlay", wrap);
  overlay.hidden = true;

  // ---- 状態 ----
  const view = new BattleView(canvas, battle);
  let paused = false;
  let destroyed = false;
  let endShown = false;
  let endCalled = false;
  let endTimer = 0;
  let pendingPlace: number | null = null;
  let pendingUpgrade = false;
  const keys = new Set<string>();
  const stickState = { id: -1, bx: 0, by: 0, x: 0, y: 0 };
  let hintShown = true;
  let toastTimer = 0;
  let fxDirty = false;

  interface Fly { x0: number; y0: number; x1: number; y1: number; t: number; life: number }
  const flies: Fly[] = [];

  // ---- 大きさ ----
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize(): void {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = board.getBoundingClientRect();
    view.resize(r.width, r.height, dpr);
    const wr = wrap.getBoundingClientRect();
    fxCanvas.width = Math.round(wr.width * dpr);
    fxCanvas.height = Math.round(wr.height * dpr);
    view.render(0);
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(board);
  ro.observe(wrap);
  window.addEventListener("resize", resize);

  // ---- 入力: スティック ----
  function boardPoint(e: PointerEvent): { x: number; y: number } {
    const r = board.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function onBoardDown(e: PointerEvent): void {
    if (paused || endShown) return;
    if (stickState.id !== -1) return;
    e.preventDefault();
    const p = boardPoint(e);
    stickState.id = e.pointerId;
    stickState.bx = p.x; stickState.by = p.y;
    stickState.x = 0; stickState.y = 0;
    try { board.setPointerCapture(e.pointerId); } catch { /* 古いブラウザ */ }
    stick.style.transform = `translate(${p.x - STICK_R}px, ${p.y - STICK_R}px)`;
    knob.style.transform = "translate(0px, 0px)";
    stick.classList.add("on");
    if (hintShown) { hintShown = false; hint.classList.add("gone"); }
  }
  function onBoardMove(e: PointerEvent): void {
    if (e.pointerId !== stickState.id) return;
    e.preventDefault();
    const p = boardPoint(e);
    let dx = p.x - stickState.bx, dy = p.y - stickState.by;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // 指が遠くへ行ったら、スティックの根元もついていく
      const k = (d - STICK_R) / d;
      stickState.bx += dx * k; stickState.by += dy * k;
      dx = p.x - stickState.bx; dy = p.y - stickState.by;
      stick.style.transform = `translate(${stickState.bx - STICK_R}px, ${stickState.by - STICK_R}px)`;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let mx = dx / STICK_R, my = dy / STICK_R;
    const len = Math.hypot(mx, my);
    if (len < STICK_DEAD) { mx = 0; my = 0; }
    else { const k = Math.min(1, (len - STICK_DEAD) / (1 - STICK_DEAD)) / len; mx *= k; my *= k; }
    stickState.x = mx; stickState.y = my;
  }
  function onBoardUp(e: PointerEvent): void {
    if (e.pointerId !== stickState.id) return;
    stickState.id = -1;
    stickState.x = 0; stickState.y = 0;
    stick.classList.remove("on");
  }
  board.addEventListener("pointerdown", onBoardDown);
  board.addEventListener("pointermove", onBoardMove);
  board.addEventListener("pointerup", onBoardUp);
  board.addEventListener("pointercancel", onBoardUp);
  board.addEventListener("lostpointercapture", onBoardUp);

  // ---- 入力: カード・強化 ----
  function showToast(text: string): void {
    toast.textContent = text;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    toastTimer = 1.4;
  }
  function bump(elm: HTMLElement, cls: string): void {
    elm.classList.remove(cls);
    void elm.offsetWidth;
    elm.classList.add(cls);
  }
  function tryPlace(i: number): void {
    if (paused || endShown || i >= loadout.objects.length) return;
    const chk = battle.canPlace(i);
    if (!chk.ok) {
      showToast(chk.reason ?? "置けません");
      if (cards[i]) bump(cards[i].btn, "shake");
      return;
    }
    pendingPlace = i;
    if (cards[i]) bump(cards[i].btn, "press");
  }
  function tryUpgrade(): void {
    if (paused || endShown) return;
    const chk = battle.canUpgrade();
    if (!chk.ok) {
      showToast(chk.reason ?? "強化できません");
      bump(upBtn, "shake");
      return;
    }
    pendingUpgrade = true;
    bump(upBtn, "press");
  }
  cards.forEach((c, i) => {
    c.btn.addEventListener("pointerdown", (e) => { e.preventDefault(); tryPlace(i); });
    c.btn.addEventListener("click", (e) => { if (e.detail === 0) tryPlace(i); }); // キーボードの Enter
  });
  upBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); tryUpgrade(); });
  upBtn.addEventListener("click", (e) => { if (e.detail === 0) tryUpgrade(); });
  pauseBtn.addEventListener("click", () => setPaused(true));

  // 長押しメニュー・ダブルタップ拡大を止める
  const stopCtx = (e: Event) => e.preventDefault();
  wrap.addEventListener("contextmenu", stopCtx);

  // ---- 入力: キーボード ----
  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE_KEYS.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
      if (hintShown) { hintShown = false; hint.classList.add("gone"); }
      return;
    }
    if (e.repeat) return;
    if (e.code === "Escape" || e.code === "KeyP") {
      e.preventDefault();
      if (endShown) return;
      setPaused(!paused);
      return;
    }
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (m) { e.preventDefault(); tryPlace(Number(m[1]) - 1); return; }
    if (e.code === "KeyE" || e.code === "Space") { e.preventDefault(); tryUpgrade(); }
  }
  function onKeyUp(e: KeyboardEvent): void { keys.delete(e.code); }
  function onBlur(): void { keys.clear(); }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  function onVis(): void { if (document.hidden && !endShown) setPaused(true); }
  document.addEventListener("visibilitychange", onVis);

  function readMove(): { x: number; y: number } {
    if (stickState.id !== -1) return { x: stickState.x, y: stickState.y };
    let x = 0, y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  // ---- 一時停止・結果 ----
  function setPaused(p: boolean): void {
    if (endShown || destroyed) return;
    paused = p;
    keys.clear();
    if (stickState.id !== -1) { stickState.id = -1; stickState.x = 0; stickState.y = 0; stick.classList.remove("on"); }
    if (!p) { overlay.hidden = true; overlay.replaceChildren(); return; }
    overlay.replaceChildren();
    overlay.hidden = false;
    const card = el("div", "bt-dialog", overlay);
    el("div", "bt-dialog-title", card, "ひとやすみ");
    el("div", "bt-dialog-sub", card, `なみ ${Math.max(1, battle.waveIndex)}/${battle.waveTotal}　・　${timeText(battle.time)}`);
    const resume = el("button", "bt-btn bt-btn-main", card, "つづける");
    resume.type = "button";
    resume.addEventListener("click", () => setPaused(false));
    const quit = el("button", "bt-btn bt-btn-sub", card, "あきらめる");
    quit.type = "button";
    quit.addEventListener("click", () => {
      quit.disabled = true;
      opts.onQuit();
    });
    resume.focus();
  }

  function showResult(res: BattleResult): void {
    endShown = true;
    overlay.replaceChildren();
    overlay.hidden = false;
    overlay.classList.add("result");
    const card = el("div", `bt-dialog ${res.win ? "win" : "lose"}`, overlay);
    const pic = iconCanvas("bt-result-pic", card, 96);
    paintIcon(pic, res.win ? getSprite("cat", loadout.char.id, { role: loadout.char.role }) : getSprite("mama", "scared"));
    el("div", "bt-dialog-title", card, res.win ? "ママを守った！" : "ママがにげちゃった…");
    const stats = el("div", "bt-stats", card);
    const row = (k: string, v: string) => {
      const r = el("div", "bt-stat", stats);
      el("span", "", r, k);
      el("b", "", r, v);
    };
    row("たおした虫", fmt(res.kills));
    row("じかん", timeText(res.time));
    row("なみ", `${res.wavesCleared}/${battle.waveTotal}`);
    const next = el("button", "bt-btn bt-btn-main", card, "つぎへ");
    next.type = "button";
    next.addEventListener("click", () => {
      if (endCalled) return;
      endCalled = true;
      next.disabled = true;
      opts.onEnd(res);
    });
    next.focus();
  }

  // ---- 出来事 ----
  function onEvents(evs: readonly BattleEvent[]): void {
    view.onEvents(evs);
    for (const e of evs) {
      switch (e.type) {
        case "wave": {
          const last = e.value === battle.waveTotal;
          view.showBanner(last ? "さいごのなみ！" : `なみ ${e.value}`, `${e.value}/${battle.waveTotal}`);
          break;
        }
        case "mamaHit":
          bump(mamaBox, "hit");
          bump(wrap, "hurt");
          if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* 無視 */ }
          break;
        case "pickup":
          addFly(e.x, e.y);
          break;
        case "win":
        case "lose":
          endTimer = 1.3;
          break;
      }
    }
  }

  function addFly(bx: number, by: number): void {
    if (flies.length >= 24) return;
    const br = board.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const kr = kibbleBox.getBoundingClientRect();
    const p = view.toPx(bx, by);
    flies.push({
      x0: br.left - wr.left + p.x, y0: br.top - wr.top + p.y,
      x1: kr.left - wr.left + 20, y1: kr.top - wr.top + kr.height / 2,
      t: 0, life: 0.5 + Math.random() * 0.15,
    });
  }

  function drawFlies(dt: number): void {
    if (flies.length === 0 && !fxDirty) return;
    fxG.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxG.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    fxDirty = flies.length > 0;
    const img = getSprite("pickup", "kibble");
    const s = 22;
    let w = 0;
    let arrived = false;
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      f.t += dt;
      if (f.t >= f.life) { arrived = true; continue; }
      flies[w++] = f;
      const k = f.t / f.life;
      const e = k * k * (3 - 2 * k);
      const x = f.x0 + (f.x1 - f.x0) * e;
      const y = f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 60;
      const sc = 1 - k * 0.3;
      fxG.drawImage(img, x - (s * sc) / 2, y - (s * sc) / 2, s * sc, s * sc);
    }
    flies.length = w;
    if (arrived) bump(kibbleBox, "pop");
  }

  // ---- 上下のバーの更新（変わったときだけ DOM をさわる） ----
  const last = { mama: -1, wave: "", time: "", kib: "", up: "", upDis: null as boolean | null, upSub: "" };
  function updateHud(): void {
    const s = battle.state;
    if (s.mamaHp !== last.mama) {
      last.mama = s.mamaHp;
      if (useHearts) hearts.forEach((h, i) => h.classList.toggle("empty", i >= s.mamaHp));
      else if (mamaBarFill && mamaBarText) {
        mamaBarFill.style.width = `${(100 * s.mamaHp) / Math.max(1, s.mamaMaxHp)}%`;
        mamaBarText.textContent = `${fmt(s.mamaHp)}/${fmt(s.mamaMaxHp)}`;
      }
    }
    const wv = `なみ ${Math.max(1, s.waveIndex)}/${s.waveTotal}`;
    if (wv !== last.wave) { last.wave = wv; waveText.textContent = wv; }
    const tt = timeText(s.time);
    if (tt !== last.time) { last.time = tt; timeEl.textContent = tt; }
    const kb = fmt(s.kibble);
    if (kb !== last.kib) { last.kib = kb; kibbleNum.textContent = kb; }

    // カード
    const v = spriteVersion();
    const repaint = v !== iconVersion;
    iconVersion = v;
    cards.forEach((c, i) => {
      const o = loadout.objects[i];
      if (repaint) paintIcon(c.icon, getSprite("object", o.id, { kind: o.kind }));
      const ok = battle.canPlace(i).ok;
      const poor = s.kibble < o.cost;
      const ratio = battle.cooldownRatio(i);
      const cdq = Math.round(ratio * 100);
      const cdt = s.cooldowns[i] > 0 ? s.cooldowns[i].toFixed(s.cooldowns[i] < 10 ? 1 : 0) : "";
      if (c.last.dis !== !ok) { c.last.dis = !ok; c.btn.classList.toggle("disabled", !ok); c.btn.setAttribute("aria-disabled", String(!ok)); }
      if (c.last.poor !== poor) { c.last.poor = poor; c.cost.parentElement!.classList.toggle("poor", poor); }
      if (c.last.cd !== cdq) { c.last.cd = cdq; c.cd.style.transform = `scaleY(${ratio})`; }
      if (c.last.cdt !== cdt) { c.last.cdt = cdt; c.cdText.textContent = cdt; }
    });

    // 強化ボタン
    const up = battle.canUpgrade();
    let title: string, sub: string;
    if (up.obj) {
      title = `強化 ${fmt(up.cost ?? 0)}`;
      sub = up.ok ? `${up.obj.def.name} Lv${up.obj.level + 1}→${up.obj.level + 2}` : (up.reason ?? "");
    } else {
      title = "強化";
      sub = "オブジェクトの上で押す";
    }
    if (title !== last.up) { last.up = title; upTitle.textContent = title; }
    if (sub !== last.upSub) { last.upSub = sub; upSub.textContent = sub; }
    if (last.upDis !== !up.ok) { last.upDis = !up.ok; upBtn.classList.toggle("disabled", !up.ok); upBtn.classList.toggle("ready", up.ok); }
  }

  // ---- ループ ----
  let raf = 0;
  let prev = performance.now();
  const input: BattleInput = { move: { x: 0, y: 0 }, place: null, upgrade: false };
  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(MAX_DT, Math.max(0, (now - prev) / 1000));
    prev = now;
    if (!paused) {
      input.move = readMove();
      input.place = pendingPlace;
      input.upgrade = pendingUpgrade;
      pendingPlace = null;
      pendingUpgrade = false;
      battle.step(dt, input);
      onEvents(battle.events);
      if (battle.result && !endShown) {
        endTimer -= dt;
        if (endTimer <= 0) showResult(battle.result);
      }
      view.render(dt);
      drawFlies(dt);
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toast.classList.remove("show"); }
    }
    updateHud();
  }
  resize();
  updateHud();
  raf = requestAnimationFrame(frame);

  // 開発用（コンソールやテストから見られるように）
  (window as unknown as { __battle?: Battle }).__battle = battle;

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      wrap.remove();
      const w = window as unknown as { __battle?: Battle };
      if (w.__battle === battle) delete w.__battle;
    },
  };
}
