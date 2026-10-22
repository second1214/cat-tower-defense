// 戦闘の画面（盤面の canvas ＋ 上のバー ＋ 下のカード）。入力（スティック・カードのドラッグ・キーボード）をまとめて、毎コマ battle.step() を呼ぶ。
//
// 使い方:
//   const h = startBattle(root, loadout, { onEnd(result) { ... }, onQuit() { ... } });
//   h.destroy(); // 画面を消すとき（onEnd / onQuit のあとに呼び出し側で）
// root は画面いっぱいの要素を渡す（中に position:absolute で全面に広がる）。
//
// 操作（v3）:
//   置く: 下のカードを盤面へドラッグ → 指の少し上に「影」が出る（マスにそろう。緑＝置ける、赤＝置けない＋理由）→ 指をはなすと置く。
//         カードの上・盤面の外ではなすとやめる。カードをタップ → 盤面のマスをタップ、でも置ける（もう一度カードをタップでやめる）。
//   強化: 置いたオブジェクトをタップ → となりに小さな窓（レベル・特殊効果・強化ボタン）。
//   猫: カードを持っていない・選んでいないときに盤面を指でなぞるとスティック（オブジェクトの上から始めてもよい。動かせばスティック）。
//   PC: WASD / 矢印キーで移動、1〜5 でカードを選んでマスをクリック、Esc でやめる（何も選んでいなければ一時停止）、
//       P で一時停止、F で速さ（x1/x2/x3）。
// 右上の「x1 / x2 / x3」で速さを切りかえる。
// v5: カードを持っている・選んでいる・強化の窓を出しているあいだは、戦闘が止まる（battle.setHold）。盤面の上に「配置中・一時停止」
//     （タップでやめる）。虫の通り道は、置いているあいだだけ出す（「みち」ボタンは無くした）。盤面の外（上のバー・下のパネル）を
//     押しても、やめて戦闘にもどる。上のバーには、ステージの wall が 1 / 2 なら「難関」「大難関」。ママの顔は PNG があれば縦横比そのまま。

import "./battle.css";
import type { BattleInput, BattleResult, Loadout } from "../core/types";
import { Battle, type BattleEvent, type ObjState } from "./engine";
import { BattleView } from "./view";
import { createAutoPilot } from "./auto";
import { getCatPose, getSprite, imageSize, loadCatIdlePoses, loadSpriteOverrides, spriteVersion } from "./sprites";
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
const DRAG_START = 8;     // これだけ動いたらドラッグ（CSS px）
const TAP_SLOP = 10;      // オブジェクトのタップとスティックの境目

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
  g.drawImage(img, 0, 0, c.width, c.height);
}

/** 縦横比そのままで、canvas に収めて描く（切らない。ママの PNG など）。 */
function paintFit(c: HTMLCanvasElement, img: CanvasImageSource): void {
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  const { w, h } = imageSize(img);
  const k = Math.min(c.width / Math.max(1, w), c.height / Math.max(1, h));
  const dw = w * k, dh = h * k;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
}

function timeText(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const HEART_SVG = `<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21 C 5 15, 1 11.5, 1 7 A 5.6 5.6 0 0 1 12 4.6 A 5.6 5.6 0 0 1 23 7 C 23 11.5, 19 15, 12 21 Z"/></svg>`;

const KIND_LABEL: Record<string, string> = {
  shooter: "うつ", wall: "かべ", aoe: "まとめて", slow: "おそく", producer: "カリカリ", mine: "わな", zap: "でんげき", poison: "どく",
};

export function startBattle(root: HTMLElement, loadout: Loadout, opts: BattleScreenOptions): BattleScreenHandle {
  loadSpriteOverrides();
  loadCatIdlePoses();
  const battle = new Battle(loadout, opts.seed ?? ((Math.random() * 2 ** 31) | 0));

  if (getComputedStyle(root).position === "static") root.style.position = "relative";

  // ---- DOM ----
  const wrap = el("div", "bt-root", root);
  const col = el("div", "bt-col", wrap);

  // 上のバー
  const top = el("header", "bt-top", col);
  const mamaBox = el("div", "bt-mama", top);
  const mamaIcon = iconCanvas("bt-mama-icon", mamaBox, 30);
  paintFit(mamaIcon, getSprite("mama", "normal"));
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
  const waveRow = el("div", "bt-waverow", mid);
  const wall = loadout.stage.wall ?? 0;
  if (wall === 1 || wall === 2) el("span", `bt-wall w${wall}`, waveRow, wall === 2 ? "大難関" : "難関");
  const waveText = el("div", "bt-wave", waveRow);
  const timeEl = el("div", "bt-time", mid);
  const autoBtn = el("button", "bt-speed bt-auto", top, "オート");
  autoBtn.type = "button";
  autoBtn.setAttribute("aria-label", "オート（オブジェクトと猫をまかせる）");
  const speedBtn = el("button", "bt-speed", top, "x1");
  speedBtn.type = "button";
  speedBtn.setAttribute("aria-label", "速さ");
  const pauseBtn = el("button", "bt-pause", top);
  pauseBtn.type = "button";
  pauseBtn.setAttribute("aria-label", "一時停止");
  el("span", "", pauseBtn);
  el("span", "", pauseBtn);

  // 盤面
  const board = el("div", "bt-board", col);
  const canvas = el("canvas", "bt-canvas", board);
  const stick = el("div", "bt-stick", board);
  // 必殺技のボタン（ゲージがたまると光る）
  const specBtn = el("button", "bt-special", board);
  specBtn.type = "button";
  specBtn.hidden = !loadout.char.special;
  el("span", "bt-special-name", specBtn, loadout.char.special?.name ?? "");
  el("span", "bt-special-t", specBtn, "必殺");
  for (const ev of ["pointerdown", "touchstart", "mousedown"]) specBtn.addEventListener(ev, (e) => e.stopPropagation());
  specBtn.addEventListener("click", (e) => { e.stopPropagation(); battle.useSpecial(0); });
  let specShown = -1;
  const knob = el("div", "bt-knob", stick);
  const toast = el("div", "bt-toast", board);
  const hint = el("div", "bt-hint", board);
  el("span", "", hint, "カードを盤面へドラッグして置こう");
  el("span", "bt-hint-sub", hint, "盤面をなぞると猫が動くよ");
  // 置いているあいだ（＝止まっている）のしるし。押すとやめる
  const holdTag = el("button", "bt-hold", board);
  holdTag.type = "button";
  holdTag.hidden = true;
  const holdText = el("span", "bt-hold-t", holdTag, "配置中・一時停止");
  el("span", "bt-hold-x", holdTag, "×");
  holdTag.setAttribute("aria-label", "やめて戦闘にもどる");
  const pop = el("div", "bt-pop", board);
  pop.hidden = true;

  // 下のパネル
  const bottom = el("footer", "bt-bottom", col);
  const row1 = el("div", "bt-row1", bottom);
  const kibbleBox = el("div", "bt-kibble", row1);
  paintIcon(iconCanvas("bt-kibble-icon", kibbleBox, 26), getSprite("pickup", "kibble"));
  const kibbleNum = el("span", "bt-kibble-num", kibbleBox, "0");
  // 猫たち（相棒がいるときだけ）: 小さな顔＋体力のバー（休けい中はうすく）
  const party: { box: HTMLElement; icon: HTMLCanvasElement; fill: HTMLElement; last: { hp: number; rest: boolean } }[] = [];
  if (battle.cats.length > 1) {
    const partyBox = el("div", "bt-party", row1);
    for (const c of battle.cats) {
      const box = el("div", `bt-pcat${c.companion ? " mate" : ""}`, partyBox);
      box.title = c.char.name;
      const icon = iconCanvas("bt-pcat-icon", box, 22);
      paintIcon(icon, getSprite("cat", c.char.look, { role: c.char.role }));
      const bar = el("div", "bt-pcat-bar", box);
      party.push({ box, icon, fill: el("div", "bt-pcat-fill", bar), last: { hp: -1, rest: false } });
    }
  }
  const modeText = el("div", "bt-mode", row1, "");

  const cardsBox = el("div", "bt-cards", bottom);
  interface CardUI { btn: HTMLButtonElement; icon: HTMLCanvasElement; cost: HTMLElement; last: { dis: boolean } }
  const cards: CardUI[] = loadout.objects.slice(0, 5).map((o, i) => {
    const btn = el("button", "bt-card", cardsBox);
    btn.type = "button";
    btn.dataset.kind = o.kind;
    el("span", "bt-key", btn, String(i + 1));
    const w = Math.max(1, Math.floor(o.w || 1)), h = Math.max(1, Math.floor(o.h || 1));
    el("span", `bt-card-tag ${o.block ? "block" : "flat"}`, btn, `${o.block ? "かべ" : "ゆか"}${w > 1 || h > 1 ? ` ${w}×${h}` : ""}`);
    const icon = iconCanvas("bt-card-icon", btn, 40);
    paintIcon(icon, getSprite("object", o.id, { kind: o.kind }));
    el("span", "bt-card-name", btn, o.name);
    const costRow = el("span", "bt-card-cost", btn);
    paintIcon(iconCanvas("bt-mini-kibble", costRow, 14), getSprite("pickup", "kibble"));
    const cost = el("span", "", costRow, fmt(o.cost));
    return { btn, icon, cost, last: { dis: false } };
  });
  let iconVersion = spriteVersion();

  // 演出用の、全体にかぶせる canvas（カリカリが数字へ飛んでいく）
  const fxCanvas = el("canvas", "bt-fx", wrap);
  const fxG = fxCanvas.getContext("2d")!;

  // 一時停止・結果
  const overlay = el("div", "bt-overlay", wrap);
  overlay.hidden = true;

  // エンドレスは、始めた波（stage.index）からの通しの番号で出す
  const endless = !!loadout.stage.endless;
  const endlessBase = endless ? loadout.stage.index : 0;
  const waveLabel = (i: number) => (endless ? `なみ ${endlessBase + i}` : `なみ ${i}/${battle.waveTotal}`);

  // ---- 状態 ----
  const view = new BattleView(canvas, battle);
  let speed = 1;
  function setSpeed(v: number): void {
    speed = v;
    speedBtn.textContent = `x${v}`;
    speedBtn.classList.toggle("fast", v > 1);
    speedBtn.classList.toggle("faster", v > 2);
    savePref("bt-speed", String(v));
  }
  let paused = false;
  let destroyed = false;
  // オート: オブジェクトを置く・強化する、猫を動かす（スティックをさわっているあいだは、猫は手で動かす）
  const pilot = createAutoPilot(battle, loadout);
  let autoOn = false, autoThink = 0;
  function setAuto(v: boolean): void {
    autoOn = v;
    autoBtn.classList.toggle("on", v);
    savePref("bt-auto", v ? "1" : "0");
  }
  let endShown = false;
  let endCalled = false;
  let endTimer = 0;
  const keys = new Set<string>();
  const stickState = { id: -1, bx: 0, by: 0, x: 0, y: 0 };
  let hintShown = true;
  let toastTimer = 0;
  let fxDirty = false;
  /** タップで選んだカード（-1 なら無し）。 */
  let sel = -1;
  /** カードのドラッグ。 */
  let drag: { id: number; slot: number; sx: number; sy: number; active: boolean; touch: boolean } | null = null;
  /** 選んだカードを置くために、盤面を押している指。 */
  let aimId = -1;
  let aimTouch = false;
  /** オブジェクトの上で押した指（動かなければタップ、動けばスティック）。 */
  let tapCand: { id: number; x: number; y: number; obj: ObjState } | null = null;
  /** 情報の窓を出しているオブジェクト。 */
  let popObj: ObjState | null = null;
  /** 影の位置（盤面の点。毎コマ置けるかを確かめなおす）。 */
  let ghostAt: { slot: number; x: number; y: number } | null = null;

  function loadPref(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
  function savePref(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* 保存できなくてもよい */ } }
  function hideHint(): void { if (hintShown) { hintShown = false; hint.classList.add("gone"); } }

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

  // ---- 影（置く場所の予告） ----
  function boardPointXY(clientX: number, clientY: number): { x: number; y: number } {
    const r = board.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  function insideBoard(clientX: number, clientY: number): boolean {
    const r = board.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }
  /** 指の位置から、影の中心（盤面の点）を決める。指でかくれないよう、タッチのときは少し上にずらす。 */
  function aimPoint(slot: number, clientX: number, clientY: number, touch: boolean): { x: number; y: number } {
    const p = boardPointXY(clientX, clientY);
    const fp = battle.footprint(slot);
    const lift = touch ? view.L.u * (fp.h / 2 + 1.1) : 0;
    return view.fromPx(p.x, p.y - lift);
  }
  function setGhost(slot: number, x: number, y: number): void {
    ghostAt = { slot, x, y };
    refreshGhost();
  }
  function refreshGhost(): void {
    if (!ghostAt) { view.ghost = null; return; }
    const a = battle.anchorAt(ghostAt.slot, ghostAt.x, ghostAt.y);
    const chk = battle.placeCheck(ghostAt.slot, a.col, a.row);
    view.ghost = { slot: ghostAt.slot, col: a.col, row: a.row, ok: chk.ok, reason: chk.reason };
  }
  function clearGhost(): void { ghostAt = null; view.ghost = null; }
  /** 影の所に置く。置けたら true。 */
  function placeAtGhost(): boolean {
    if (!ghostAt || paused || endShown) return false;
    const a = battle.anchorAt(ghostAt.slot, ghostAt.x, ghostAt.y);
    const slot = ghostAt.slot;
    const r = battle.place(slot, a.col, a.row);
    if (!r.ok) {
      showToast(r.reason ?? "置けません");
      if (cards[slot]) bump(cards[slot].btn, "shake");
      return false;
    }
    if (cards[slot]) bump(cards[slot].btn, "press");
    if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* 無視 */ }
    return true;
  }
  function setSel(i: number): void {
    sel = i;
    cards.forEach((c, k) => c.btn.classList.toggle("sel", k === i));
    board.classList.toggle("aiming", i >= 0);
    if (i < 0 && aimId === -1 && !(drag && drag.active)) clearGhost();
    updateMode();
  }
  function updateMode(): void {
    const t = drag && drag.active ? "はなすと置くよ（カードの上でやめる）"
      : sel >= 0 ? `「${loadout.objects[sel]?.name ?? ""}」を置くマスをタップ`
      : "カードを盤面へドラッグ／置いた物をタップで強化";
    if (modeText.textContent !== t) modeText.textContent = t;
    modeText.classList.toggle("on", sel >= 0 || !!(drag && drag.active));
  }

  // ---- 情報の窓（強化） ----
  const popTitle = el("div", "bt-pop-title", pop);
  const popClose = el("button", "bt-pop-close", pop, "×");
  popClose.type = "button";
  popClose.setAttribute("aria-label", "とじる");
  const popInfo = el("div", "bt-pop-info", pop);
  const popPerks = el("div", "bt-pop-perks", pop);
  const popBtn = el("button", "bt-pop-up", pop);
  popBtn.type = "button";
  // どける（カリカリは戻らない。どけるたびに高くなる）
  const rmBtn = el("button", "bt-pop-rm", pop);
  rmBtn.type = "button";
  const popLast = { key: "" };
  function openPop(o: ObjState): void {
    popObj = o;
    view.selectedUid = o.uid;
    pop.hidden = false;
    popLast.key = "";
    updatePop();
    // 位置: オブジェクトの右（入らなければ左）。縦は中心にそろえる
    const L = view.L;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const right = L.ox + (o.col + o.w) * L.cw + 6;
    const left = L.ox + o.col * L.cw - 6 - pw;
    let x: number, y: number;
    if (right + pw <= L.w - 4) { x = right; y = L.oy + o.cy * L.ch - ph / 2; }
    else if (left >= 4) { x = left; y = L.oy + o.cy * L.ch - ph / 2; }
    else {
      x = L.ox + o.cx * L.cw - pw / 2;
      y = L.oy + (o.row + o.h) * L.ch + 6;
      if (y + ph > L.h - 4) y = L.oy + o.row * L.ch - ph - 6;
    }
    y = Math.max(4, Math.min(L.h - ph - 4, y));
    x = Math.max(4, Math.min(L.w - pw - 4, x));
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  function closePop(): void {
    popObj = null;
    view.selectedUid = -1;
    pop.hidden = true;
  }
  function updatePop(): void {
    const o = popObj;
    if (!o) return;
    if (o.hp <= 0) { closePop(); return; }
    const chk = battle.upgradeCheck(o);
    const d = o.def;
    const rm = battle.removeCheck(o);
    const key = `${o.level}|${chk.ok}|${fmt(o.upgradeCost)}|${fmt(o.atk)}|${fmt(Math.ceil(o.hp))}|${rm.ok}|${rm.cost}`;
    if (key === popLast.key) return;
    popLast.key = key;
    popTitle.textContent = `${d.name}  Lv${o.level + 1}`;
    const info: string[] = [];
    info.push(KIND_LABEL[d.kind] ?? d.kind);
    if (d.kind === "producer") info.push(`カリカリ +${fmt(d.produce)} / ${d.interval}秒`);
    else if (d.kind !== "wall" && o.atk > 0) info.push(`こうげき ${fmt(o.atk)}`);
    if (d.range > 0 && d.kind !== "wall" && d.kind !== "producer") info.push(`しゃてい ${Math.round(d.range * 10) / 10}`);
    // たいきゅう（虫にかじられると減る。強化で満タンにもどる）
    if (d.kind !== "mine") info.push(`たいきゅう ${fmt(Math.ceil(o.hp))}/${fmt(o.maxHp)}`);
    popInfo.textContent = info.join("・");
    popPerks.replaceChildren();
    const perks = d.perks && d.perks.length > 0 ? d.perks : [];
    for (const p of perks) el("span", "bt-perk", popPerks, p);
    popPerks.hidden = perks.length === 0;
    popBtn.replaceChildren();
    el("span", "bt-pop-up-t", popBtn, "強化");
    const c = el("span", "bt-pop-up-c", popBtn);
    paintIcon(iconCanvas("bt-mini-kibble", c, 14), getSprite("pickup", "kibble"));
    el("span", "", c, fmt(o.upgradeCost));
    popBtn.classList.toggle("disabled", !chk.ok);
    popBtn.setAttribute("aria-disabled", String(!chk.ok));
    rmBtn.replaceChildren();
    el("span", "bt-pop-up-t", rmBtn, "どける");
    const rc = el("span", "bt-pop-up-c", rmBtn);
    paintIcon(iconCanvas("bt-mini-kibble", rc, 14), getSprite("pickup", "kibble"));
    el("span", "", rc, fmt(rm.cost ?? 0));
    rmBtn.classList.toggle("disabled", !rm.ok);
  }
  pop.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
  popClose.addEventListener("click", () => closePop());
  popBtn.addEventListener("click", () => {
    if (!popObj || paused || endShown) return;
    const r = battle.upgrade(popObj);
    if (!r.ok) { showToast(r.reason ?? "強化できません"); bump(popBtn, "shake"); return; }
    bump(popBtn, "press");
    updatePop();
  });

  rmBtn.addEventListener("click", () => {
    if (!popObj || paused || endShown) return;
    const r = battle.remove(popObj);
    if (!r.ok) { showToast(r.reason ?? "どけられません"); bump(rmBtn, "shake"); return; }
    showToast(`どけた（次は ${fmt(battle.removeCost(r.obj!))} カリカリ）`);
    closePop();
  });

  // ---- 入力: 盤面（スティック・置く・タップ） ----
  function startStick(id: number, x: number, y: number): void {
    stickState.id = id;
    stickState.bx = x; stickState.by = y;
    stickState.x = 0; stickState.y = 0;
    stick.style.transform = `translate(${x - STICK_R}px, ${y - STICK_R}px)`;
    knob.style.transform = "translate(0px, 0px)";
    stick.classList.add("on");
    hideHint();
  }
  function moveStick(x: number, y: number): void {
    let dx = x - stickState.bx, dy = y - stickState.by;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      // 指が遠くへ行ったら、スティックの根元もついていく
      const k = (d - STICK_R) / d;
      stickState.bx += dx * k; stickState.by += dy * k;
      dx = x - stickState.bx; dy = y - stickState.by;
      stick.style.transform = `translate(${stickState.bx - STICK_R}px, ${stickState.by - STICK_R}px)`;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let mx = dx / STICK_R, my = dy / STICK_R;
    const len = Math.hypot(mx, my);
    if (len < STICK_DEAD) { mx = 0; my = 0; }
    else { const k = Math.min(1, (len - STICK_DEAD) / (1 - STICK_DEAD)) / len; mx *= k; my *= k; }
    stickState.x = mx; stickState.y = my;
  }
  function endStick(): void {
    stickState.id = -1;
    stickState.x = 0; stickState.y = 0;
    stick.classList.remove("on");
  }
  function onBoardDown(e: PointerEvent): void {
    if (paused || endShown) return;
    e.preventDefault();
    const p = boardPointXY(e.clientX, e.clientY);
    if (popObj) {
      // 窓の外を押したら閉じる（同じオブジェクトをもう一度押したときも）
      const bp = view.fromPx(p.x, p.y);
      const o = battle.objectAt(Math.floor(bp.x), Math.floor(bp.y));
      closePop();
      if (o && sel < 0) return;
    }
    if (sel >= 0) {
      if (aimId !== -1) return;
      aimId = e.pointerId;
      aimTouch = e.pointerType !== "mouse";
      try { board.setPointerCapture(e.pointerId); } catch { /* 古いブラウザ */ }
      const a = aimPoint(sel, e.clientX, e.clientY, aimTouch);
      setGhost(sel, a.x, a.y);
      return;
    }
    if (drag && drag.active) return;
    if (stickState.id !== -1 || tapCand) return;
    try { board.setPointerCapture(e.pointerId); } catch { /* 古いブラウザ */ }
    const bp = view.fromPx(p.x, p.y);
    const o = battle.objectAt(Math.floor(bp.x), Math.floor(bp.y));
    if (o) { tapCand = { id: e.pointerId, x: p.x, y: p.y, obj: o }; return; }
    startStick(e.pointerId, p.x, p.y);
  }
  function onBoardMove(e: PointerEvent): void {
    if (e.pointerId === aimId) {
      e.preventDefault();
      const a = aimPoint(sel, e.clientX, e.clientY, aimTouch);
      if (sel >= 0) setGhost(sel, a.x, a.y);
      return;
    }
    // マウスで選んでいるときは、押さなくても影がついてくる
    if (e.pointerType === "mouse" && sel >= 0 && aimId === -1 && !(drag && drag.active)) {
      const a = aimPoint(sel, e.clientX, e.clientY, false);
      setGhost(sel, a.x, a.y);
      return;
    }
    const p = boardPointXY(e.clientX, e.clientY);
    if (tapCand && e.pointerId === tapCand.id) {
      if (Math.hypot(p.x - tapCand.x, p.y - tapCand.y) > TAP_SLOP) {
        const t = tapCand;
        tapCand = null;
        startStick(t.id, t.x, t.y);
        moveStick(p.x, p.y);
      }
      return;
    }
    if (e.pointerId !== stickState.id) return;
    e.preventDefault();
    moveStick(p.x, p.y);
  }
  function onBoardUp(e: PointerEvent): void {
    if (e.pointerId === aimId) {
      aimId = -1;
      if (e.type === "pointerup" && sel >= 0) {
        if (placeAtGhost()) setSel(-1);
        else if (e.pointerType !== "mouse") clearGhost();
      } else if (e.type !== "lostpointercapture") clearGhost();
      return;
    }
    if (tapCand && e.pointerId === tapCand.id) {
      const o = tapCand.obj;
      tapCand = null;
      if (e.type === "pointerup" && o.hp > 0) { openPop(o); hideHint(); }
      return;
    }
    if (e.pointerId !== stickState.id) return;
    endStick();
  }
  function onBoardLeave(e: PointerEvent): void {
    if (e.pointerType === "mouse" && aimId === -1 && !(drag && drag.active)) clearGhost();
  }
  board.addEventListener("pointerdown", onBoardDown);
  board.addEventListener("pointermove", onBoardMove);
  board.addEventListener("pointerup", onBoardUp);
  board.addEventListener("pointercancel", onBoardUp);
  board.addEventListener("lostpointercapture", onBoardUp);
  board.addEventListener("pointerleave", onBoardLeave);

  // ---- 入力: カード（ドラッグ・タップ） ----
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
  function toggleSel(i: number): void {
    if (paused || endShown || i >= cards.length) return;
    closePop();
    if (sel === i) { setSel(-1); return; }
    if (!battle.canAfford(i)) {
      showToast("カリカリが足りません");
      bump(cards[i].btn, "shake");
    }
    setSel(i);
    hideHint();
  }
  cards.forEach((c, i) => {
    c.btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (paused || endShown || drag) return;
      try { c.btn.setPointerCapture(e.pointerId); } catch { /* 古いブラウザ */ }
      drag = { id: e.pointerId, slot: i, sx: e.clientX, sy: e.clientY, active: false, touch: e.pointerType !== "mouse" };
    });
    c.btn.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      e.preventDefault();
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < DRAG_START) return;
        drag.active = true;
        closePop();
        if (sel >= 0) setSel(-1);
        c.btn.classList.add("dragging");
        wrap.classList.add("dragging");
        hideHint();
        updateMode();
      }
      if (insideBoard(e.clientX, e.clientY)) {
        const a = aimPoint(i, e.clientX, e.clientY, drag.touch);
        setGhost(i, a.x, a.y);
      } else {
        clearGhost();
      }
    });
    const end = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag;
      drag = null;
      c.btn.classList.remove("dragging");
      wrap.classList.remove("dragging");
      if (d.active) {
        if (e.type === "pointerup" && ghostAt && insideBoard(e.clientX, e.clientY)) placeAtGhost();
        clearGhost();
      } else if (e.type === "pointerup") {
        toggleSel(i);
      }
      updateMode();
    };
    c.btn.addEventListener("pointerup", end);
    c.btn.addEventListener("pointercancel", end);
    c.btn.addEventListener("lostpointercapture", end);
    c.btn.addEventListener("click", (e) => { if (e.detail === 0) toggleSel(i); }); // キーボードの Enter
  });
  pauseBtn.addEventListener("click", () => setPaused(true));
  speedBtn.addEventListener("click", () => setSpeed(speed >= 3 ? 1 : speed + 1));
  autoBtn.addEventListener("click", () => setAuto(!autoOn));
  /** 置く・強化をやめて、戦闘にもどる。 */
  function cancelPlacing(): void {
    closePop();
    if (sel >= 0) setSel(-1);
    if (aimId === -1 && !(drag && drag.active)) clearGhost();
  }
  holdTag.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); cancelPlacing(); });
  holdTag.addEventListener("click", (e) => { if (e.detail === 0) cancelPlacing(); });
  // 盤面・カード・窓の外（上のバー・下のパネルのすきま）を押したら、やめる
  wrap.addEventListener("pointerdown", (e) => {
    const t = e.target as Node | null;
    if (!t || paused || endShown) return;
    if (board.contains(t) || cardsBox.contains(t) || overlay.contains(t)) return;
    if (sel >= 0 || popObj) cancelPlacing();
  }, true);

  // 長押しメニューを止める
  const stopCtx = (e: Event) => e.preventDefault();
  wrap.addEventListener("contextmenu", stopCtx);

  // ---- 入力: キーボード ----
  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  function onKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (MOVE_KEYS.has(e.code)) {
      keys.add(e.code);
      e.preventDefault();
      hideHint();
      return;
    }
    if (e.repeat) return;
    if (e.code === "Escape") {
      e.preventDefault();
      if (endShown) return;
      if (!paused && (sel >= 0 || popObj || (drag && drag.active))) {
        closePop();
        setSel(-1);
        clearGhost();
        return;
      }
      setPaused(!paused);
      return;
    }
    if (e.code === "KeyP") { e.preventDefault(); if (!endShown) setPaused(!paused); return; }
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (m) { e.preventDefault(); toggleSel(Number(m[1]) - 1); return; }
    if (e.code === "KeyF") { e.preventDefault(); setSpeed(speed >= 3 ? 1 : speed + 1); }
  }
  function onKeyUp(e: KeyboardEvent): void { keys.delete(e.code); }
  function onBlur(): void { keys.clear(); }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  function onVis(): void { if (document.hidden && !endShown) setPaused(true); }
  document.addEventListener("visibilitychange", onVis);

  const moveVec = { x: 0, y: 0 };
  function readMove(): { x: number; y: number } {
    if (stickState.id !== -1) { moveVec.x = stickState.x; moveVec.y = stickState.y; return moveVec; }
    let x = 0, y = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;
    const l = Math.hypot(x, y);
    moveVec.x = l > 0 ? x / l : 0;
    moveVec.y = l > 0 ? y / l : 0;
    return moveVec;
  }

  // ---- 一時停止・結果 ----
  function setPaused(p: boolean): void {
    if (endShown || destroyed) return;
    paused = p;
    keys.clear();
    if (stickState.id !== -1) endStick();
    tapCand = null;
    aimId = -1;
    if (p) { closePop(); setSel(-1); clearGhost(); }
    if (!p) { overlay.hidden = true; overlay.replaceChildren(); return; }
    overlay.replaceChildren();
    overlay.hidden = false;
    const card = el("div", "bt-dialog", overlay);
    el("div", "bt-dialog-title", card, "ひとやすみ");
    el("div", "bt-dialog-sub", card, `${waveLabel(Math.max(1, battle.waveIndex))}　・　${timeText(battle.time)}`);
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
    closePop();
    setSel(-1);
    clearGhost();
    overlay.replaceChildren();
    overlay.hidden = false;
    overlay.classList.add("result");
    const card = el("div", `bt-dialog ${res.win ? "win" : "lose"}`, overlay);
    const pic = iconCanvas("bt-result-pic", card, 96);
    const look = loadout.char.look || loadout.char.id;
    if (res.win) paintIcon(pic, getCatPose(look, "win") ?? getSprite("cat", look, { role: loadout.char.role }));
    else paintFit(pic, getSprite("mama", "scared"));
    el("div", "bt-dialog-title", card, res.win ? "ママを守った！" : "ママがにげちゃった…");
    const stats = el("div", "bt-stats", card);
    const row = (k: string, v: string) => {
      const r = el("div", "bt-stat", stats);
      el("span", "", r, k);
      el("b", "", r, v);
    };
    row("たおした虫", fmt(res.kills));
    row("じかん", timeText(res.time));
    row("なみ", endless ? `${endlessBase + res.wavesCleared} までこえた` : `${res.wavesCleared}/${battle.waveTotal}`);
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
    let flyN = 0;
    for (const e of evs) {
      switch (e.type) {
        case "wave": {
          const last = e.value === battle.waveTotal;
          if (endless) view.showBanner(`なみ ${endlessBase + e.value}`, (endlessBase + e.value) % 10 === 0 ? "ぬしが来る！" : "");
          else view.showBanner(last ? "さいごのなみ！" : `なみ ${e.value}`, `${e.value}/${battle.waveTotal}`);
          break;
        }
        case "mamaHit":
          mamaScaredT = 1.2;
          bump(mamaBox, "hit");
          bump(wrap, "hurt");
          if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* 無視 */ }
          break;
        case "kibble":
          if (flyN++ < 4) addFly(e.x, e.y);
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
      x1: kr.left - wr.left + 16, y1: kr.top - wr.top + kr.height / 2,
      t: 0, life: 0.5 + Math.random() * 0.15,
    });
  }

  function drawFlies(dt: number): void {
    if (flies.length === 0 && !fxDirty) return;
    fxG.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxG.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    fxDirty = flies.length > 0;
    const img = getSprite("pickup", "kibble");
    const s = 18;
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
      const y = f.y0 + (f.y1 - f.y0) * e - Math.sin(k * Math.PI) * 50;
      const sc = 1 - k * 0.3;
      fxG.drawImage(img, x - (s * sc) / 2, y - (s * sc) / 2, s * sc, s * sc);
    }
    flies.length = w;
    if (arrived) bump(kibbleBox, "pop");
  }

  // ---- 上下のバーの更新（変わったときだけ DOM をさわる） ----
  const last = { mama: -1, wave: "", time: "", kib: "", scared: false };
  let mamaScaredT = 0;
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
    const wv = waveLabel(Math.max(1, s.waveIndex));
    if (wv !== last.wave) { last.wave = wv; waveText.textContent = wv; }
    const tt = timeText(s.time);
    if (tt !== last.time) { last.time = tt; timeEl.textContent = tt; }
    const kb = fmt(s.kibble);
    if (kb !== last.kib) { last.kib = kb; kibbleNum.textContent = kb; }

    const v = spriteVersion();
    const repaint = v !== iconVersion;
    iconVersion = v;
    // ママの顔（虫が着いたすぐあと・負けたときは、こわがる顔）
    const scared = mamaScaredT > 0 || (!!s.result && !s.result.win);
    if (repaint || scared !== last.scared) { last.scared = scared; paintFit(mamaIcon, getSprite("mama", scared ? "scared" : "normal")); }
    party.forEach((p, i) => {
      const c = battle.cats[i];
      if (repaint) paintIcon(p.icon, getSprite("cat", c.char.look, { role: c.char.role }));
      const hp = Math.round((100 * c.hp) / Math.max(1e-9, c.maxHp));
      if (hp !== p.last.hp) { p.last.hp = hp; p.fill.style.width = `${hp}%`; }
      if (c.resting !== p.last.rest) { p.last.rest = c.resting; p.box.classList.toggle("rest", c.resting); }
    });
    cards.forEach((c, i) => {
      const o = loadout.objects[i];
      if (repaint) paintIcon(c.icon, getSprite("object", o.id, { kind: o.kind }));
      const dis = !battle.canAfford(i);
      if (c.last.dis !== dis) {
        c.last.dis = dis;
        c.btn.classList.toggle("disabled", dis);
        c.btn.setAttribute("aria-disabled", String(dis));
        c.cost.parentElement!.classList.toggle("poor", dis);
      }
    });
    updatePop();
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
    // 置いている・選んでいる・強化の窓を出しているあいだは止める（道も出す）
    const placing = sel >= 0 || !!(drag && drag.active);
    const holding = (placing || !!popObj) && !endShown && !battle.result;
    battle.setHold(holding);
    view.showPath = placing;
    if (holdTag.hidden === holding) {
      holdTag.hidden = !holding;
      wrap.classList.toggle("holding", holding);
    }
    if (holding) {
      const t = placing ? "配置中・一時停止" : "強化中・一時停止";
      if (holdText.textContent !== t) holdText.textContent = t;
    }
    if (mamaScaredT > 0 && !paused && !holding) mamaScaredT -= dt;
    if (!paused) {
      input.move = readMove();
      if (autoOn && !holding && !battle.result) {
        if (battle.time >= autoThink) { pilot.decide(); autoThink = battle.time + 0.5; }
        if (input.move.x === 0 && input.move.y === 0) input.move = pilot.steer();
      }
      battle.step(dt * speed, input);
      const g = Math.round((battle.cats[0]?.gauge ?? 0) * 100);
      if (g !== specShown) {
        specShown = g;
        specBtn.style.setProperty("--g", `${g}%`);
        specBtn.classList.toggle("ready", g >= 100);
      }
      onEvents(battle.events);
      if (ghostAt) refreshGhost();
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
  setAuto(loadPref("bt-auto") === "1");
  const sp = Number(loadPref("bt-speed"));
  if (sp === 2 || sp === 3) setSpeed(sp);
  updateMode();
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
