/// <reference types="vite/client" />
// メニュー画面（DOM）。startApp(root) で始める。
import "./styles.css";
import { mulberry32, type Rng } from "../core/rng";
import { type SaveData, clearSave, exportSave, importSave, loadSave, newSave, writeSave } from "../core/save";
import {
  buildLoadout, grantRewards, heroUid, isStageUnlocked, nextStageId, stageById, syncUnlocks, type RewardResult,
} from "../core/progress";
import { fmt } from "../core/num";
import type { BattleResult, Loadout } from "../core/types";
import { CHAR_MAP, MAX_BOND } from "../data/chars";
import { OBJECT_MAP } from "../data/objects";
import { type Ctx, type GachaSub, type GrowSub, Modals, type StartBattle, type Tab, type UiState } from "./ctx";
import { badge, h, svgIcon } from "./dom";
import { ICONS, bagSvg, objectSvg } from "./icons";
import { catIcon, loadCatSprites } from "./cafe";
import { gachaBadge, growBadge, relicBadge } from "./badges";
import { renderMain } from "./tab-main";
import { renderGrow } from "./tab-grow";
import { renderRelic } from "./tab-relic";
import { renderGachaTab } from "./gacha";
import { equipCard } from "./grow-equip";
import { openSetup } from "./cat-form";
import { bondHearts } from "./parts";

// 戦闘画面は別のモジュール。まだないときは、かんたんな代わりを使う。
const battleModules = import.meta.glob<{ startBattle: StartBattle }>("../battle/screen.ts");

async function loadStartBattle(): Promise<StartBattle> {
  const loader = battleModules["../battle/screen.ts"];
  if (loader) {
    try {
      const m = await loader();
      if (typeof m.startBattle === "function") return m.startBattle;
    } catch (e) {
      console.warn("戦闘画面を読みこめませんでした", e);
    }
  }
  return stubBattle;
}

/** 戦闘画面がまだないとき用（開発用）。 */
const stubBattle: StartBattle = (root, loadout: Loadout, opts) => {
  const el = h("div", { class: "stub-battle" },
    h("div", { class: "panel" },
      h("div", { class: "panel-title" }, `${loadout.stage.id} ${loadout.stage.name}（仮の戦闘）`),
      h("p", null, `${loadout.char.name} と オブジェクト ${loadout.objects.length}こ`),
      h("div", { class: "foot-row" },
        h("button", { class: "btn btn-gold", onclick: () => opts.onEnd({ win: true, stageId: loadout.stage.id, kills: 10, time: 60, wavesCleared: loadout.stage.waves.length }) }, "勝った"),
        h("button", { class: "btn btn-red", onclick: () => opts.onEnd({ win: false, stageId: loadout.stage.id, kills: 2, time: 30, wavesCleared: 0 }) }, "負けた")),
      h("button", { class: "btn btn-gray btn-wide", onclick: () => opts.onQuit() }, "やめる")));
  root.appendChild(el);
  return { destroy: () => el.remove() };
};

export interface AppHandle {
  readonly ctx: Ctx;
  /** テスト用: 勝ったときの処理（報酬→保存→ポップアップ）をそのまま呼ぶ。 */
  finishBattle(result: BattleResult): void;
  showRewards(res: RewardResult): void;
  destroy(): void;
}

export function startApp(root: HTMLElement): void {
  const handle = createApp(root);
  // 画面の確認用（?uitest のときだけ）: window.__catApp から勝ち・報酬を呼べる
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("uitest")) {
    (globalThis as { __catApp?: AppHandle }).__catApp = handle;
  }
}

export function createApp(root: HTMLElement): AppHandle {
  const app = h("div", { class: "cat-app" });
  const col = h("div", { class: "ca-col" });
  const top = h("div", { class: "ca-top" });
  const body = h("div", { class: "ca-body" });
  const nav = h("nav", { class: "ca-nav" });
  const layer = h("div", { class: "ca-layer" });
  const toastBox = h("div", { class: "ca-toasts", "aria-live": "polite" });
  col.append(top, body, nav, layer, toastBox);
  app.append(col);
  root.appendChild(app);

  const modals = new Modals(layer);
  const ui: UiState = { tab: "main", growSub: "char", fuseMode: false, fuseSel: [], equipFilter: "all", gachaSub: "bag", skillRole: null };
  // 開発用: ?tab=gacha|grow|main|relic で最初のタブ
  if (typeof location !== "undefined") {
    const t = new URLSearchParams(location.search).get("tab");
    if (t === "gacha" || t === "grow" || t === "main" || t === "relic") ui.tab = t;
  }
  let save: SaveData = loadSave();
  syncUnlocks(save);
  writeSave(save);

  const scrollMem = new Map<string, number>();
  let inBattle = false;

  const ctx: Ctx = {
    get save() { return save; },
    set save(s: SaveData) { save = s; },
    ui,
    commit() { writeSave(save); render(); },
    rerender() { render(); },
    withRng<T>(fn: (rng: Rng) => T): T {
      const rng = mulberry32(save.seed);
      const r = fn(rng);
      save.seed = Math.floor(rng() * 4294967296) >>> 0;
      return r;
    },
    modals,
    toast,
    confirm,
    goTab(tab: Tab, sub?: GrowSub | GachaSub) {
      modals.closeAll();
      ui.tab = tab;
      if (sub === "bag" || sub === "adopt") ui.gachaSub = sub;
      else if (sub) ui.growSub = sub;
      ui.fuseMode = false;
      ui.fuseSel = [];
      render();
    },
    play,
  };

  function toast(msg: string, kind: "ok" | "ng" = "ok"): void {
    const t = h("div", { class: `toast toast-${kind}` }, msg);
    toastBox.appendChild(t);
    while (toastBox.childElementCount > 3) toastBox.firstElementChild?.remove();
    setTimeout(() => t.classList.add("out"), 1800);
    setTimeout(() => t.remove(), 2200);
  }

  function confirm(msg: string, okLabel = "OK", danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const done = (v: boolean) => { if (!answered) { answered = true; resolve(v); } m.close(); };
      const m = modals.open({
        cls: "modal-small modal-confirm",
        closeButton: false,
        onClose: () => { if (!answered) { answered = true; resolve(false); } },
        render: () => h("div", { class: "confirm-msg" }, msg),
        footer: () => h("div", { class: "foot-row" },
          h("button", { class: "btn btn-gray", onclick: () => done(false) }, "やめる"),
          h("button", { class: `btn ${danger ? "btn-red" : "btn-gold"}`, onclick: () => done(true) }, okLabel)),
      });
    });
  }

  // ---------- 描画 ----------

  function rememberScroll(): void {
    body.querySelectorAll<HTMLElement>("[data-sk]").forEach((el) => scrollMem.set(`${ui.tab}:${el.dataset.sk}`, el.scrollTop));
  }

  function restoreScroll(): void {
    body.querySelectorAll<HTMLElement>("[data-sk]").forEach((el) => {
      const key = `${ui.tab}:${el.dataset.sk}`;
      const v = scrollMem.get(key);
      if (v != null) { el.scrollTop = v; return; }
      const target = el.querySelector<HTMLElement>("[data-autofocus]");
      if (target) el.scrollTop = Math.max(0, target.offsetTop - el.clientHeight / 2 + target.offsetHeight / 2);
    });
  }

  function render(): void {
    if (inBattle) return;
    rememberScroll();
    renderTop();
    body.replaceChildren(ui.tab === "main" ? renderMain(ctx) : ui.tab === "grow" ? renderGrow(ctx) : ui.tab === "gacha" ? renderGachaTab(ctx) : renderRelic(ctx));
    restoreScroll();
    renderNav();
    modals.rerenderAll();
  }

  function renderTop(): void {
    top.replaceChildren(
      h("div", { class: "res res-coin", title: "お金" }, svgIcon(ICONS.coin), h("span", null, fmt(save.coins))),
      h("div", { class: "res res-relic", title: "レリックポイント" }, svgIcon(ICONS.relic), h("span", null, fmt(save.relicPoints))),
      h("div", { class: "res res-churu", title: "ちゅ〜る（スキル・ねこ福袋に使う）" }, svgIcon(ICONS.churu), h("span", null, fmt(save.churu))),
      h("div", { class: "top-space" }),
      h("button", { class: "gear-btn", "aria-label": "設定", onclick: openSettings }, svgIcon(ICONS.gear)));
  }

  function renderNav(): void {
    const items: [Tab, string, string, boolean][] = [
      ["gacha", "福袋", bagSvg(false), gachaBadge(save)],
      ["grow", "成長", ICONS.tabGrow, growBadge(save)],
      ["main", "メイン", ICONS.tabMain, false],
      ["relic", "レリック", ICONS.tabRelic, relicBadge(save)],
    ];
    nav.replaceChildren(...items.map(([id, label, icon, b]) => h("button", {
      class: `nav-btn nav-${id} ${ui.tab === id ? "on" : ""}`,
      onclick: () => { if (ui.tab !== id) ctx.goTab(id); },
    }, h("span", { class: "nav-ico-wrap" }, svgIcon(icon, "nav-ico"), badge(b)), h("span", { class: "nav-label" }, label))));
  }

  // ---------- 設定 ----------

  function openSettings(): void {
    const m = modals.open({
      title: "設定",
      render: () => {
        const ta = h("textarea", { class: "save-text", rows: "4", placeholder: "ここにセーブの文字をはりつけて「読みこむ」" }) as HTMLTextAreaElement;
        return h("div", { class: "settings" },
          h("div", { class: "panel-title" }, "セーブのバックアップ"),
          h("div", { class: "foot-row" },
            h("button", {
              class: "btn btn-blue btn-small", onclick: async () => {
                const text = exportSave(save);
                ta.value = text;
                try { await navigator.clipboard.writeText(text); toast("コピーしました"); } catch { ta.select(); toast("文字を選んだので、コピーしてね"); }
              },
            }, "書き出す（コピー）"),
            h("button", {
              class: "btn btn-green btn-small", onclick: async () => {
                const s = importSave(ta.value.trim());
                if (!s) { toast("読みこめませんでした", "ng"); return; }
                if (!(await confirm("いまのデータを、この内容で上書きしますか？", "上書きする", true))) return;
                save = s; syncUnlocks(save); writeSave(save); m.close(); render(); toast("読みこみました");
                if (!save.setupDone) openSetup(ctx);
              },
            }, "読みこむ")),
          ta,
          h("div", { class: "panel-title danger-title" }, "データを消す"),
          h("p", { class: "muted small" }, "猫・オブジェクト・装備・レリック、ぜんぶ最初からになります。"),
          h("button", {
            class: "btn btn-red btn-wide", onclick: async () => {
              if (!(await confirm("本当にデータを消しますか？\nもとには戻せません。", "消す", true))) return;
              clearSave(); save = newSave(); writeSave(save);
              ui.tab = "main"; ui.fuseMode = false; ui.fuseSel = [];
              scrollMem.clear(); modals.closeAll(); render(); toast("データを消しました");
              openSetup(ctx);
            },
          }, "データを消す"));
      },
    });
  }

  // ---------- 戦闘 ----------

  let battle: { destroy(): void } | null = null;

  async function play(stageId: string): Promise<void> {
    if (inBattle) return;
    if (!isStageUnlocked(save, stageId)) { toast("まだ遊べないステージです", "ng"); return; }
    const lo = buildLoadout(save, stageId);
    if (!lo) { toast("ステージが見つかりません", "ng"); return; }
    inBattle = true;
    modals.closeAll();
    const start = await loadStartBattle();
    app.style.display = "none";
    const host = h("div", { class: "ca-battle-host" });
    root.appendChild(host);
    let ended = false;
    const finish = (after: () => void) => {
      if (ended) return;
      ended = true;
      setTimeout(() => {
        try { battle?.destroy(); } catch (e) { console.warn(e); }
        battle = null;
        host.remove();
        app.style.display = "";
        inBattle = false;
        render();
        after();
      }, 0);
    };
    const seed = ctx.withRng((r) => Math.floor(r() * 4294967296) >>> 0);
    writeSave(save);
    try {
      battle = start(host, lo, {
        onEnd: (result) => finish(() => finishBattle(result)),
        onQuit: () => finish(() => undefined),
        seed,
      });
    } catch (e) {
      console.error(e);
      toast("戦闘を始められませんでした", "ng");
      finish(() => undefined);
    }
  }

  function finishBattle(result: BattleResult): void {
    const stage = stageById(result.stageId);
    if (!result.win || !stage) { showLose(result); return; }
    const res = ctx.withRng((rng) => grantRewards(save, stage, rng));
    if (res.firstClear) save.selectedStage = nextStageId(save);
    writeSave(save);
    render();
    showRewards(res);
  }

  function showLose(result: BattleResult): void {
    const m = modals.open({
      title: "ざんねん…",
      cls: "modal-small",
      dismissable: false,
      closeButton: false,
      render: () => h("div", { class: "lose" },
        catIcon(save.cats[heroUid(save)]?.look ?? "chatora", "lose-ico"),
        h("p", { class: "lose-msg" }, "虫たちに押しきられちゃった…"),
        h("p", null, "成長タブで強化してもう一度！"),
        h("p", { class: "muted small" }, `${result.stageId}　たおした虫 ${result.kills}ひき・波 ${result.wavesCleared}`)),
      footer: () => h("div", { class: "foot-row" },
        h("button", { class: "btn btn-gray", onclick: () => m.close() }, "メインへ"),
        h("button", { class: "btn btn-green", onclick: () => { m.close(); ctx.goTab("grow"); } }, "強化する")),
    });
  }

  function showRewards(res: RewardResult): void {
    const m = modals.open({
      title: `${res.stageId} クリア！`,
      cls: "modal-reward",
      dismissable: false,
      closeButton: false,
      render: () => {
        const ups = Object.entries(res.levelUps).filter(([uid]) => save.cats[uid]);
        const bonds = Object.entries(res.bondUps).filter(([uid]) => save.cats[uid]);
        const hero = save.cats[heroUid(save)];
        return h("div", { class: "reward" },
          h("div", { class: "rwp-banner" }, catIcon(hero?.look ?? "chatora", "rwp-cat"), h("div", null, res.firstClear ? "はじめてのクリア！" : "ママを守った！")),
          h("div", { class: "rwp-grid" },
            h("div", { class: "rwp-item" }, svgIcon(ICONS.exp), h("span", null, `+${fmt(res.exp)}`)),
            h("div", { class: "rwp-item" }, svgIcon(ICONS.coin), h("span", null, `+${fmt(res.coins)}`)),
            res.relicPoints > 0 ? h("div", { class: "rwp-item" }, svgIcon(ICONS.relic), h("span", null, `+${fmt(res.relicPoints)}`)) : null,
            h("div", { class: "rwp-item rwp-churu" }, svgIcon(ICONS.churu), h("span", null, `+${fmt(res.churu + res.churuFromLevels)}`))),
          h("div", { class: "rwp-churu-note" },
            h("span", null, res.firstClear ? "クリア（はじめて ×2）" : "クリア", h("b", null, ` +${fmt(res.churu)}`)),
            res.churuFromLevels > 0 ? h("span", null, "レベルアップ", h("b", null, ` +${fmt(res.churuFromLevels)}`)) : null),
          res.newNeighbors.length ? h("div", { class: "rwp-sec rwp-nb" },
            h("div", { class: "rwp-nb-t" }, svgIcon(ICONS.tent, "rwp-nb-ico"), "近所の猫が譲渡会に来たよ！"),
            h("div", { class: "rwp-nb-cats" }, res.newNeighbors.map((id) => h("div", { class: "rwp-nb-cat" },
              catIcon(id, "rwp-nb-cat-ico"), h("span", null, CHAR_MAP[id]?.name ?? id)))),
            h("div", { class: "muted small" }, "福袋タブの「譲渡会」で、無料でお迎えできます")) : null,
          ups.length ? h("div", { class: "rwp-sec" },
            h("div", { class: "panel-title" }, "レベルアップ"),
            h("div", { class: "rwp-ups" }, ups.map(([uid, n]) => {
              const c = save.cats[uid];
              return h("div", { class: "rwp-up" },
                catIcon(c.look, "rwp-up-ico"), h("span", { class: "rwp-up-name" }, c.name), h("b", null, `Lv${c.level}`), h("span", { class: "up" }, `+${n}`));
            }))) : null,
          bonds.length ? h("div", { class: "rwp-sec" },
            h("div", { class: "panel-title" }, "なかよし度アップ"),
            h("div", { class: "rwp-ups" }, bonds.map(([uid, b]) => {
              const c = save.cats[uid];
              return h("div", { class: "rwp-up rwp-bond" },
                catIcon(c.look, "rwp-up-ico"), h("span", { class: "rwp-up-name" }, c.name), bondHearts(b), h("span", { class: "up" }, b >= MAX_BOND ? "最大！" : `${b}`));
            }))) : null,
          res.equips.length ? h("div", { class: "rwp-sec" },
            h("div", { class: "panel-title" }, `装備 ${res.equips.length}こ`),
            h("div", { class: "rwp-cards" }, res.equips.map((it) => equipCard(null, it)))) : null,
          res.shards.length ? h("div", { class: "rwp-sec" },
            h("div", { class: "panel-title" }, "かけら"),
            h("div", { class: "rwp-cards" }, res.shards.map((s) => {
              const def = OBJECT_MAP[s.id];
              return h("div", { class: `card shard-card r-${def?.rarity ?? "N"}` }, svgIcon(objectSvg(s.id, def?.kind), "card-ico"), h("span", { class: "shard-n" }, `×${s.count}`));
            }))) : null,
          res.newObjects.length ? h("div", { class: "rwp-sec rwp-new" },
            h("div", { class: "panel-title" }, "あたらしいオブジェクト！"),
            h("div", { class: "rwp-cards" },
              res.newObjects.map((id) => h("div", { class: `card new-card r-${OBJECT_MAP[id]?.rarity ?? "N"}` }, svgIcon(objectSvg(id, OBJECT_MAP[id]?.kind), "card-ico"), h("span", { class: "card-name small" }, OBJECT_MAP[id]?.name ?? id))))) : null);
      },
      footer: () => res.newNeighbors.length
        ? h("div", { class: "foot-row" },
          h("button", { class: "btn btn-gray", onclick: () => m.close() }, "やったね！"),
          h("button", { class: "btn btn-green", onclick: () => { m.close(); ctx.goTab("gacha", "adopt"); } }, "譲渡会へ"))
        : h("button", { class: "btn btn-gold btn-wide", onclick: () => m.close() }, "やったね！"),
    });
  }

  // Esc でいちばん上のモーダルを閉じる（PC）
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") modals.closeTop(); };
  window.addEventListener("keydown", onKey);

  loadCatSprites(() => render());
  render();
  if (!save.setupDone) openSetup(ctx);

  return {
    ctx,
    finishBattle,
    showRewards,
    destroy() {
      window.removeEventListener("keydown", onKey);
      try { battle?.destroy(); } catch { /* 何もしない */ }
      app.remove();
    },
  };
}
