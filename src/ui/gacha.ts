// 下のタブ「福袋」: ねこ福袋（ちゅ〜るで「わざ」を引く）と、譲渡会（近所の猫を無料でお迎え）。
import {
  PITY_PULLS, PULL10_COST, PULL_COST, WAZA_REFUND, canPull, pull, pullRates, pullsToPity, type PullResult,
} from "../core/gacha";
import { adoptNeighbor, adoptableNeighbors } from "../core/progress";
import { fmt } from "../core/num";
import { MAX_CATS, writeSave } from "../core/save";
import { CHARS, CHAR_MAP, NEIGHBOR_UNLOCK, ROLE_NAMES } from "../data/chars";
import { PERSONALITY_MAP } from "../data/personality";
import { stageIdOf } from "../data/stages";
import { MAX_WAZA_LEVEL, RARITIES, RARITY_RANK, WAZAS, WAZA_MAP, wazaText } from "../data/waza";
import type { Ctx, GachaSub } from "./ctx";
import { badge, bar, h, svgIcon } from "./dom";
import { ICONS, bagSvg, tentSvg, carrierSvg } from "./icons";
import { catIcon } from "./cafe";
import { adoptBadge, bagBadge } from "./badges";
import { rarityPill, roleTag, wazaIcon, wazaStars } from "./parts";
import { openCatDetail } from "./grow-char";

export { rarityPill, bondHearts } from "./parts";

/** 福袋タブへ行く。 */
export function openGacha(ctx: Ctx, sub: GachaSub = "bag"): void {
  ctx.goTab("gacha", sub);
}

/** 下のタブ「福袋」。 */
export function renderGachaTab(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const cur = ctx.ui.gachaSub;
  const subs: [GachaSub, string, string, boolean][] = [
    ["bag", "ねこ福袋", bagSvg(false), bagBadge(save)],
    ["adopt", "譲渡会", ICONS.tent, adoptBadge(save)],
  ];
  return h("div", { class: `tab tab-gacha gs-${cur}` },
    h("div", { class: "gc-subtabs" }, subs.map(([id, label, icon, b]) => h("button", {
      class: `gc-subtab ${cur === id ? "on" : ""}`,
      onclick: () => { if (ctx.ui.gachaSub !== id) { ctx.ui.gachaSub = id; ctx.rerender(); } },
    }, svgIcon(icon, "gc-subtab-ico"), h("span", null, label), badge(b)))),
    cur === "bag" ? renderBag(ctx) : renderAdopt(ctx));
}

// ================= ねこ福袋 =================

function renderBag(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const toPity = pullsToPity(save);
  const owned = WAZAS.filter((w) => save.wazas[w.id]).length;
  return h("div", { class: "scroll gacha", dataset: { sk: "bag" } },
    h("div", { class: "gc-scene bag-scene" },
      h("div", { class: "gc-bunting" }, Array.from({ length: 11 }, (_, i) => h("span", { class: `gb gb${i % 4}` }))),
      h("div", { class: "bag-rays" }),
      h("div", { class: "gc-sign" }, "ねこ福袋"),
      h("div", { class: "bag-shelf" },
        svgIcon(bagSvg(false, "#4aa3ff"), "bag-side b1"),
        svgIcon(bagSvg(false, "#ff6b6b"), "bag-main"),
        svgIcon(bagSvg(false, "#b46bff"), "bag-side b2")),
      h("div", { class: "bag-spark s1" }), h("div", { class: "bag-spark s2" }), h("div", { class: "bag-spark s3" })),
    h("div", { class: "gc-talk" }, "福袋の中には、猫の「わざ」が入っているよ。覚えたわざは、うちの子なら何匹にでもつけられる！"),
    h("div", { class: "gc-info" },
      h("div", { class: "gc-churu" }, svgIcon(ICONS.churu, "gc-churu-ico"),
        h("div", null, h("div", { class: "gc-k" }, "持っているちゅ〜る"), h("div", { class: "gc-v" }, fmt(save.churu)))),
      h("div", { class: "gc-pity" },
        h("div", { class: "gc-pity-t" }, toPity <= 1 ? "次は SSR 以上が必ず出る！" : h("span", null, "あと ", h("b", null, String(toPity)), " 回で SSR 以上が必ず出る")),
        bar(save.gachaPity / PITY_PULLS, "bar-pity"),
        h("div", { class: "gc-note" }, "10回まとめてなら、SR 以上が1つは必ず出るよ"))),
    h("div", { class: "gc-btns" }, pullButton(ctx, 1), pullButton(ctx, 10)),
    h("div", { class: "gc-foot" },
      h("button", { class: "btn btn-small btn-gray", onclick: () => openRates(ctx) }, "中身と確率"),
      h("div", { class: "gc-stat" }, `覚えたわざ ${owned} / ${WAZAS.length}・これまで ${save.totalPulls} 回`)));
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
      h("span", { class: "gc-btn-t" }, count === 10 ? "10回あける" : "1回あける"),
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

function resultTag(r: PullResult): HTMLElement {
  if (r.isNew) return h("div", { class: "pr-tag pr-new" }, "NEW!");
  if (r.levelUp) return h("div", { class: "pr-tag pr-lvup" }, svgIcon(ICONS.sparkle), `Lv${r.level}`, r.level >= MAX_WAZA_LEVEL ? " 最大" : "");
  return h("div", { class: "pr-tag pr-refund pr-2l" }, h("span", null, "Lv最大"), h("span", null, "→ ", svgIcon(ICONS.churu), `+${r.refund}`));
}

const BAG_COLORS = ["#ff6b6b", "#4aa3ff", "#ffb03d", "#b46bff", "#4fd67a"];

/** 福袋を1つずつあける演出。 */
export function showPullAnim(ctx: Ctx, results: PullResult[]): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let next = 0;
  let done = false;
  const cells = results.map((r, i) => {
    const def = WAZA_MAP[r.wazaId];
    return h("div", { class: `pr-cell pr-${r.rarity}` },
      h("div", { class: "pr-glow" }),
      h("div", { class: "pr-closed" }, svgIcon(bagSvg(false, BAG_COLORS[i % BAG_COLORS.length]), "pr-box")),
      h("div", { class: "pr-open" },
        h("div", { class: "pr-wz" }, def ? wazaIcon(def, "pr-wz-ico") : null),
        h("div", { class: "pr-rar" }, r.rarity, r.pity ? h("span", { class: "pr-extra" }, "かならず") : r.guaranteed ? h("span", { class: "pr-extra" }, "おまけ") : null),
        h("div", { class: "pr-name" }, def?.name ?? r.wazaId),
        h("div", { class: "pr-slot" }, def?.slot === "main" && def.role ? ROLE_NAMES[def.role] : "サブ"),
        resultTag(r)));
  });
  const grid = h("div", { class: `pr-grid ${results.length === 1 ? "pr-one" : ""}` }, cells);
  const best = results.reduce((m, r) => Math.max(m, RARITY_RANK[r.rarity]), 0);
  const summary = h("div", { class: "pr-sum" });
  const head = h("div", { class: "pr-head" }, "福袋をあけてみよう…");
  const detail = h("div", { class: "pr-detail" });
  const body = h("div", { class: `pull-anim best-${best}` }, head, grid, summary, detail);

  const okBtn = h("button", { class: "btn btn-gold gc-ok" }, "スキップ");
  const foot = h("div", { class: "foot-row" }, okBtn);

  const finish = () => {
    done = true;
    if (timer) clearTimeout(timer);
    cells.forEach((b) => b.classList.add("opened"));
    const news = results.filter((r) => r.isNew).length;
    const refund = results.reduce((s, r) => s + r.refund, 0);
    const ups = results.filter((r) => r.levelUp).length;
    summary.replaceChildren(...[
      news ? h("span", { class: "ps-new" }, `新しいわざ ${news}`) : null,
      ups ? h("span", null, `レベルアップ ${ups}`) : null,
      refund ? h("span", null, "おみやげ ", svgIcon(ICONS.churu), `+${refund}`) : null,
    ].filter((x): x is HTMLElement => !!x));
    // 1回のときは、わざの説明も出す
    if (results.length === 1) {
      const r = results[0];
      const def = WAZA_MAP[r.wazaId];
      if (def) {
        const eff = wazaText(def, r.level);
        const parts = [h("div", { class: "pr-eff" }, eff)];
        if (def.slot === "main" || eff !== def.desc) parts.unshift(h("div", { class: "pr-desc" }, def.desc));
        detail.replaceChildren(...parts);
      }
    }
    body.classList.add("all-open");
    head.textContent = best >= 3 ? "すごいわざが出た！" : best >= 2 ? "いいわざが出たよ！" : "わざを覚えたよ！";
    okBtn.textContent = "OK";
  };
  const step = () => {
    if (done) return;
    if (next >= cells.length) { finish(); return; }
    const b = cells[next];
    const rank = RARITY_RANK[results[next].rarity];
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
    title: "福袋の中身と確率",
    cls: "modal-rates modal-tall",
    render: () => h("div", { class: "rates" },
      pullRates().map((g) => h("div", { class: `rt-group rt-${g.rarity}` },
        h("div", { class: "rt-head" }, rarityPill(g.rarity), h("span", { class: "rt-rate" }, pct(g.rate)),
          h("span", { class: "muted small" }, `${g.wazas.length}こ・1つ ${pct(g.wazas[0]?.rate ?? 0)}`)),
        h("div", { class: "rt-wazas" }, g.wazas.map((x) => {
          const def = WAZA_MAP[x.id];
          if (!def) return null;
          const w = ctx.save.wazas[x.id];
          return h("div", { class: `rt-wz ${w ? "own" : ""}` },
            wazaIcon(def, "rt-wz-ico"),
            h("div", { class: "rt-wz-body" },
              h("div", { class: "rt-wz-name" }, def.name, w ? wazaStars(w.level) : h("span", { class: "rt-wz-no" }, "まだ")),
              h("div", { class: "rt-wz-sub" }, def.slot === "main" && def.role ? roleTag(def.role) : h("span", { class: "sub-tag" }, "サブ"),
                h("span", { class: "rt-wz-desc" }, def.desc))));
        })))),
      h("div", { class: "rt-notes" },
        h("div", null, `・SSR 以上が出ないまま ${PITY_PULLS} 回目になると、SSR 以上が必ず出ます。`),
        h("div", null, "・10回まとめてあけると、SR 以上が1つは必ず出ます。"),
        h("div", null, `・同じわざがまた出ると、わざのレベルが上がります（最大 ${MAX_WAZA_LEVEL}。1つにつき効果 +20%）。`),
        h("div", null, "・レベルが最大のわざがまた出たら、ちゅ〜るのおみやげ: ",
          RARITIES.map((r) => `${r} ${WAZA_REFUND[r]}`).join("・")))),
  });
}

function pct(r: number): string {
  const v = r * 100;
  return `${v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)}%`;
}

// ================= 譲渡会（近所の猫） =================

function renderAdopt(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const here = adoptableNeighbors(save);
  const have = new Set(Object.values(save.cats).map((c) => c.preset).filter(Boolean));
  const full = Object.keys(save.cats).length >= MAX_CATS;
  const upcoming = CHARS.filter((d) => !have.has(d.id) && !here.includes(d.id))
    .sort((a, b) => (NEIGHBOR_UNLOCK[a.id] ?? 999) - (NEIGHBOR_UNLOCK[b.id] ?? 999));
  const peek = here[0] ?? "mike";

  const cards = here.map((id) => {
    const def = CHAR_MAP[id];
    const pers = PERSONALITY_MAP[def.personality];
    return h("div", { class: "ad-card" },
      h("div", { class: "ad-ico-wrap" }, catIcon(id, "ad-ico"), svgIcon(carrierSvg(true), "ad-box")),
      h("div", { class: "ad-body" },
        h("div", { class: "ad-name" }, def.name, h("span", { class: "pers-pill" }, pers?.name ?? "")),
        h("div", { class: "ad-desc" }, def.desc),
        h("button", {
          class: `btn btn-small ${full ? "btn-gray is-off" : "btn-green"} ad-go`, disabled: full,
          onclick: () => {
            const r = adoptNeighbor(ctx.save, id);
            if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
            ctx.commit();
            showWelcome(ctx, r.value);
          },
        }, "お迎えする")));
  });

  return h("div", { class: "scroll gacha", dataset: { sk: "adopt" } },
    h("div", { class: "gc-scene" },
      h("div", { class: "gc-bunting" }, Array.from({ length: 11 }, (_, i) => h("span", { class: `gb gb${i % 4}` }))),
      h("div", { class: "gc-sign" }, "ねこの譲渡会"),
      svgIcon(tentSvg(), "gc-tent"),
      h("div", { class: "gc-boxes" },
        svgIcon(carrierSvg(false), "gc-box b1"),
        h("div", { class: "gc-peek" }, svgIcon(carrierSvg(true), "gc-box-open"), here.length ? catIcon(peek, "gc-peek-cat") : null),
        svgIcon(carrierSvg(false), "gc-box b2"))),
    h("div", { class: "gc-talk" }, here.length
      ? "近所の猫たちが、新しいおうちをさがしに来ているよ。無料でお迎えできる！"
      : "いまは来ている猫がいないみたい。ステージを進めると、近所の猫が会いに来るよ。"),
    full ? h("div", { class: "ad-full" }, `猫は ${MAX_CATS} 匹までです。お迎えするには、成長タブでだれかとお別れしてね`) : null,
    here.length ? h("div", { class: "ad-list" }, h("div", { class: "ad-sec" }, `来ている猫 ${here.length}匹`), cards) : null,
    upcoming.length ? h("div", { class: "ad-list" },
      h("div", { class: "ad-sec" }, "これから来る猫"),
      h("div", { class: "ad-locked" }, upcoming.map((d, i) => {
        const g = NEIGHBOR_UNLOCK[d.id] ?? 0;
        return h("div", { class: `ad-lk ${i === 0 ? "next" : ""}` },
          catIcon(d.id, "ad-lk-ico", true),
          h("div", { class: "ad-lk-name" }, "？？？"),
          h("div", { class: "ad-lk-when" }, `${stageIdOf(g)} クリア`));
      }))) : null,
    h("div", { class: "gc-foot" }, h("div", { class: "gc-stat" }, `お迎えした近所の猫 ${have.size} / ${CHARS.length}`)));
}

/** お迎えしたときのよろこび。 */
function showWelcome(ctx: Ctx, uid: string): void {
  const c = ctx.save.cats[uid];
  if (!c) return;
  const m = ctx.modals.open({
    cls: "modal-small modal-welcome",
    closeButton: false,
    render: () => h("div", { class: "welcome" },
      h("div", { class: "wl-rays" }),
      catIcon(c.look, "wl-ico"),
      h("div", { class: "wl-t" }, `${c.name}がうちの子になった！`),
      h("div", { class: "muted small" }, "成長タブで、わざをつけたり相棒にしたりできるよ")),
    footer: () => h("div", { class: "foot-row" },
      h("button", { class: "btn btn-gray", onclick: () => m.close() }, "OK"),
      h("button", { class: "btn btn-green", onclick: () => { m.close(); ctx.goTab("grow", "char"); openCatDetail(ctx, uid); } }, "くわしく")),
  });
}
