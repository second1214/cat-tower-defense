// 譲渡会会場（ガチャ）。ちゅ〜るを持って譲渡会に行き、段ボールのキャリーから猫をお迎えする。
import {
  BOND_REFUND, PITY_PULLS, PULL10_COST, PULL_COST, canPull, pull, pullRates, pullsToPity, type PullResult,
} from "../core/gacha";
import { fmt } from "../core/num";
import { writeSave } from "../core/save";
import { CHARS, CHAR_MAP, CHAR_RARITIES, MAX_BOND, ROLE_NAMES, type CharRarity } from "../data/chars";
import type { Ctx } from "./ctx";
import { bar, h, svgIcon } from "./dom";
import { ICONS, carrierSvg, catSvg, tentSvg } from "./icons";

/** ハート（なかよし度）を n/MAX_BOND で並べる。 */
export function bondHearts(n: number, cls = ""): HTMLElement {
  const hs: HTMLElement[] = [];
  for (let i = 0; i < MAX_BOND; i++) hs.push(svgIcon(ICONS.heart, i < n ? "bh on" : "bh"));
  return h("span", { class: `bond ${cls}`, title: `なかよし度 ${n} / ${MAX_BOND}` }, hs);
}

export function rarityPill(r: CharRarity, cls = ""): HTMLElement {
  return h("span", { class: `rar-pill rp-${r} ${cls}` }, r);
}

/** 譲渡会会場を開く。 */
export function openGacha(ctx: Ctx): void {
  ctx.modals.open({
    title: "譲渡会会場",
    cls: "modal-tall modal-gacha",
    render: () => {
      const save = ctx.save;
      const owned = CHARS.filter((c) => save.chars[c.id]).length;
      const toPity = pullsToPity(save);
      return h("div", { class: "gacha" },
        h("div", { class: "gc-scene" },
          h("div", { class: "gc-bunting" }, Array.from({ length: 11 }, (_, i) => h("span", { class: `gb gb${i % 4}` }))),
          h("div", { class: "gc-sign" }, "ねこの譲渡会"),
          svgIcon(tentSvg(), "gc-tent"),
          h("div", { class: "gc-boxes" },
            svgIcon(carrierSvg(false), "gc-box b1"),
            h("div", { class: "gc-peek" }, svgIcon(carrierSvg(true), "gc-box-open"), svgIcon(catSvg("mike"), "gc-peek-cat")),
            svgIcon(carrierSvg(false), "gc-box b2"))),
        h("div", { class: "gc-talk" }, "あたらしい家族をさがしている猫たちが、キャリーの中で待っているよ。ちゅ〜るを持って会いに行こう！"),
        h("div", { class: "gc-info" },
          h("div", { class: "gc-churu" }, svgIcon(ICONS.churu, "gc-churu-ico"),
            h("div", null, h("div", { class: "gc-k" }, "持っているちゅ〜る"), h("div", { class: "gc-v" }, fmt(save.churu)))),
          h("div", { class: "gc-pity" },
            h("div", { class: "gc-pity-t" }, toPity <= 1 ? "次は SSR 以上が必ず来る！" : h("span", null, "あと ", h("b", null, String(toPity)), " 回で SSR 以上が必ず来る")),
            bar(save.gachaPity / PITY_PULLS, "bar-pity"),
            h("div", { class: "gc-note" }, "10回まとめてなら、SR 以上が1匹は必ず来るよ"))),
        h("div", { class: "gc-btns" },
          pullButton(ctx, 1),
          pullButton(ctx, 10)),
        h("div", { class: "gc-foot" },
          h("button", { class: "btn btn-small btn-gray", onclick: () => openRates(ctx) }, "出会える確率"),
          h("div", { class: "gc-stat" }, `会えた猫 ${owned} / ${CHARS.length}・これまで ${save.totalPulls} 回`)));
    },
  });
}

function pullButton(ctx: Ctx, count: 1 | 10): HTMLElement {
  const save = ctx.save;
  const can = canPull(save, count);
  const cost = count === 10 ? PULL10_COST : PULL_COST;
  return h("div", { class: "gc-btn-wrap" },
    h("button", {
      class: `btn gc-btn ${count === 10 ? "gc-btn10" : "gc-btn1"} ${can.ok ? "" : "is-off"}`,
      disabled: !can.ok,
      onclick: () => doPull(ctx, count),
    },
      h("span", { class: "gc-btn-t" }, count === 10 ? "10回お迎え" : "1回お迎え"),
      h("span", { class: "gc-btn-c" }, svgIcon(ICONS.churu), String(cost), count === 10 ? h("span", { class: "gc-otoku" }, "1回ぶんおとく") : null)),
    !can.ok ? h("div", { class: "gc-lack" }, can.reason) : null);
}

function doPull(ctx: Ctx, count: 1 | 10): void {
  const res = ctx.withRng((rng) => pull(ctx.save, rng, count));
  if (!res.ok) { ctx.toast(res.reason, "ng"); return; }
  // 先に保存・描きなおし（演出の途中で描きなおさないように）
  writeSave(ctx.save);
  ctx.rerender();
  showPullAnim(ctx, res.value);
}

const RARITY_LABEL: Record<CharRarity, string> = { N: "N", R: "R", SR: "SR", SSR: "SSR", UR: "UR" };

function resultLine(r: PullResult): HTMLElement {
  if (r.isNew) return h("div", { class: "pr-tag pr-new" }, "NEW!");
  if (r.bondUp) return h("div", { class: "pr-tag pr-bond pr-2l" }, h("span", null, "なかよし度"), h("span", null, svgIcon(ICONS.heart), "+1"));
  return h("div", { class: "pr-tag pr-refund pr-2l" }, h("span", null, "なかよし最大"), h("span", null, "→ ", svgIcon(ICONS.churu), `+${r.refund}`));
}

/** キャリーを1つずつ開ける演出。 */
function showPullAnim(ctx: Ctx, results: PullResult[]): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let next = 0;
  let done = false;
  const boxes = results.map((r) => {
    const def = CHAR_MAP[r.charId];
    return h("div", { class: `pr-cell pr-${r.rarity}` },
      h("div", { class: "pr-glow" }),
      h("div", { class: "pr-closed" }, svgIcon(carrierSvg(false), "pr-box")),
      h("div", { class: "pr-open" },
        h("div", { class: "pr-cat-wrap" }, svgIcon(catSvg(r.charId), "pr-cat"), svgIcon(carrierSvg(true), "pr-box-open")),
        h("div", { class: "pr-rar" }, RARITY_LABEL[r.rarity], r.pity ? h("span", { class: "pr-extra" }, "かならず") : r.guaranteed ? h("span", { class: "pr-extra" }, "おまけ") : null),
        h("div", { class: "pr-name" }, def?.name ?? r.charId),
        resultLine(r)));
  });
  const grid = h("div", { class: `pr-grid ${results.length === 1 ? "pr-one" : ""}` }, boxes);
  const best = results.reduce((m, r) => Math.max(m, CHAR_RARITIES.indexOf(r.rarity)), 0);
  const summary = h("div", { class: "pr-sum" });
  const body = h("div", { class: "pull-anim" }, h("div", { class: "pr-head" }, "キャリーを開けてみよう…"), grid, summary);

  const okBtn = h("button", { class: "btn btn-gold gc-ok" }, "スキップ");
  const foot = h("div", { class: "foot-row" }, okBtn);

  const finish = () => {
    done = true;
    if (timer) clearTimeout(timer);
    boxes.forEach((b) => b.classList.add("opened"));
    const news = results.filter((r) => r.isNew).length;
    const refund = results.reduce((s, r) => s + r.refund, 0);
    const ups = results.filter((r) => r.bondUp).length;
    summary.replaceChildren(...[
      news ? h("span", null, `はじめまして ${news}匹`) : null,
      ups ? h("span", null, `なかよし度アップ ${ups}`) : null,
      refund ? h("span", null, "おみやげ ", svgIcon(ICONS.churu), `+${refund}`) : null,
    ].filter((x): x is HTMLElement => !!x));
    (body.firstElementChild as HTMLElement).textContent = best >= 3 ? "すごい出会い！" : "ようこそ、おうちへ！";
    okBtn.textContent = "OK";
  };
  const step = () => {
    if (done) return;
    if (next >= boxes.length) { finish(); return; }
    const b = boxes[next];
    const r = results[next];
    const rank = CHAR_RARITIES.indexOf(r.rarity);
    b.classList.add("shaking");
    const wait = rank >= 3 ? 900 : rank >= 2 ? 520 : 300;
    timer = setTimeout(() => {
      b.classList.remove("shaking");
      b.classList.add("opened");
      next++;
      timer = setTimeout(step, results.length === 1 ? 200 : 170);
    }, wait);
  };

  const m = ctx.modals.open({
    cls: "modal-pull",
    dismissable: false,
    closeButton: false,
    render: () => body,
    footer: () => foot,
    onClose: () => { done = true; if (timer) clearTimeout(timer); },
  });
  okBtn.addEventListener("click", () => {
    if (!done) finish();
    else m.close();
  });
  timer = setTimeout(step, 250);
}

function openRates(ctx: Ctx): void {
  ctx.modals.open({
    title: "出会える確率",
    cls: "modal-rates",
    render: () => h("div", { class: "rates" },
      pullRates().map((g) => h("div", { class: `rt-group rt-${g.rarity}` },
        h("div", { class: "rt-head" }, rarityPill(g.rarity), h("span", { class: "rt-rate" }, pct(g.rate)),
          h("span", { class: "muted small" }, `${g.chars.length}匹`)),
        h("div", { class: "rt-cats" }, g.chars.map((c) => {
          const def = CHAR_MAP[c.id];
          const own = !!ctx.save.chars[c.id];
          return h("div", { class: `rt-cat ${own ? "own" : ""}` },
            svgIcon(catSvg(c.id, !own), "rt-cat-ico"),
            h("div", { class: "rt-cat-name" }, own ? def?.name ?? c.id : "？？？"),
            h("div", { class: "rt-cat-rate" }, pct(c.rate)),
            def && own ? h("div", { class: "rt-role" }, ROLE_NAMES[def.role]) : null);
        })))),
      h("div", { class: "rt-notes" },
        h("div", null, `・SSR 以上が来ないまま ${PITY_PULLS} 回目になると、SSR 以上が必ず来ます。`),
        h("div", null, "・10回まとめてお迎えすると、SR 以上が1匹は必ず来ます。"),
        h("div", null, `・同じ猫とまた会えると、なかよし度が上がります（最大 ${MAX_BOND}）。なかよし度 1 につき、基本の体力・攻撃 +20%。`),
        h("div", null, "・なかよし度が最大の猫がまた来たら、ちゅ〜るのおみやげ: ",
          CHAR_RARITIES.map((r) => `${r} ${BOND_REFUND[r]}`).join("・"))),
    ),
  });
}

function pct(r: number): string {
  const v = r * 100;
  return `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`;
}
