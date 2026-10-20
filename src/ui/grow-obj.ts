// 成長 > オブジェクト（持っていく5つ・一覧・レベルアップ）。
import { canLevelUpObject, objectPerks, levelUpObject, objectUpgradeCost, resolveObject, toggleLoadout } from "../core/progress";
import { fmt } from "../core/num";
import { MAX_LOADOUT, type SaveData } from "../core/save";
import type { ResolvedObject } from "../core/types";
import { KIND_NAMES, OBJECTS, OBJECT_MAP } from "../data/objects";
import { stageIdOf } from "../data/stages";
import type { Ctx } from "./ctx";
import { badge, bar, fmtS, h, svgIcon } from "./dom";
import { ICONS, kindSvg, objectSvg } from "./icons";
import { objCanLevel } from "./badges";

export function renderObjList(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const slots: HTMLElement[] = [];
  for (let i = 0; i < MAX_LOADOUT; i++) {
    const id = save.loadout[i];
    const def = id ? OBJECT_MAP[id] : undefined;
    slots.push(def
      ? h("button", {
        class: `lo-obj r-${def.rarity}`, "aria-label": `${def.name}を外す`,
        onclick: () => { toggleLoadout(ctx.save, def.id); ctx.commit(); },
      }, svgIcon(objectSvg(def.id, def.kind)), h("span", { class: "lo-lv" }, `Lv${save.objects[def.id]?.level ?? 1}`), h("span", { class: "lo-x" }, "×"))
      : h("div", { class: "lo-obj empty" }, "あき"));
  }
  const cards = OBJECTS.map((def) => {
    const os = save.objects[def.id];
    if (!os) {
      return h("div", { class: `card obj-card locked r-${def.rarity}` },
        h("span", { class: "rar-tag" }, def.rarity),
        svgIcon(objectSvg(def.id, def.kind), "card-ico sil"),
        h("div", { class: "card-name" }, "？？？"),
        h("div", { class: "card-lock" }, `${stageIdOf(def.unlockStage - 1)} クリア`));
    }
    const cost = objectUpgradeCost(save, def.id)!;
    const inLo = save.loadout.includes(def.id);
    const ro = resolveObject(save, def.id)!;
    return h("button", { class: `card obj-card r-${def.rarity} ${inLo ? "selected" : ""}`, onclick: () => openObjDetail(ctx, def.id) },
      badge(objCanLevel(save, def.id)),
      h("span", { class: "rar-tag" }, def.rarity),
      inLo ? h("span", { class: "check-tag" }, svgIcon(ICONS.check)) : null,
      h("span", { class: "kind-tag", title: KIND_NAMES[def.kind] }, svgIcon(kindSvg(def.kind))),
      svgIcon(objectSvg(def.id, def.kind), "card-ico"),
      h("span", { class: "card-tags" }, blockTag(ro.block), h("span", { class: "sz-tag" }, `${sizeOf(ro, def.id).w}×${sizeOf(ro, def.id).h}`)),
      h("div", { class: "card-name small" }, def.name),
      h("div", { class: "card-row" }, h("span", { class: "card-lv" }, `Lv${os.level}`), h("span", { class: "kib" }, svgIcon(ICONS.kibble), String(ro.cost))),
      bar(os.shards / cost.shards, `bar-shard ${os.shards >= cost.shards ? "full" : ""}`, `${fmt(os.shards)}/${fmt(cost.shards)}`));
  });
  const owned = Object.keys(save.objects).length;
  return h("div", { class: "sub sub-obj" },
    h("div", { class: "panel lo-panel" },
      h("div", { class: "panel-title" }, "選択中のオブジェクト", h("span", { class: "muted" }, `  ${save.loadout.length}/${MAX_LOADOUT}`)),
      h("div", { class: "lo-row" }, slots),
      h("div", { class: "lo-hint muted small" }, "戦闘では、下のカードを盤面へドラッグして置くよ。カリカリがあれば待ち時間なしで何こでも！")),
    h("div", { class: "sub-head" }, h("span", null, "持っているオブジェクト"), h("span", { class: "muted" }, `${owned} / ${OBJECTS.length}`)),
    h("div", { class: "scroll", dataset: { sk: "objs" } }, h("div", { class: "grid grid-4" }, cards)));
}

/** 通れない（虫がよける）・通れる（上を通る）のしるし。 */
export function blockTag(block: boolean, cls = "blk-tag"): HTMLElement {
  return h("span", { class: `${cls} ${block ? "blk-on" : "blk-off"}`, title: block ? "虫は通れず、よけて回り込む" : "虫は上を通る" }, block ? "通れない" : "通れる");
}

function objStats(o: ResolvedObject, next?: ResolvedObject | null): [string, string][] {
  const arrow = (a: number, b?: number) => (b != null && fmtS(b) !== fmtS(a) ? `${fmtS(a)} → ${fmtS(b)}` : fmtS(a));
  const s1 = (n: number) => `${Math.round(n * 100) / 100}秒`;
  const rows: [string, string][] = [["置くカリカリ", String(o.cost)], ["体力", arrow(o.maxHp, next?.maxHp)]];
  if (o.kind !== "producer" && o.kind !== "wall") rows.push(["攻撃", arrow(o.atk, next?.atk)], ["間隔", s1(o.interval)]);
  if (o.kind === "shooter") rows.push(["届く距離", `${o.range}マス先`]);
  if (o.kind === "aoe" || o.kind === "slow") rows.push(["範囲", `${o.range}マス`]);
  if (o.kind === "slow") rows.push(["おそくする", `${Math.round((1 - o.slow) * 100)}%`]);
  if (o.kind === "producer") {
    const p = (n: number) => (Math.round(n * 10) / 10).toString();
    rows.push(["生産", next && p(next.produce) !== p(o.produce) ? `${p(o.produce)} → ${p(next.produce)}` : p(o.produce)], ["間隔", s1(o.interval)]);
  }
  rows.push(["強化のカリカリ", String(o.upgradeCost)], ["強化1回", `×${o.upgradeMul}`]);
  return rows;
}

export interface PerkView { level: number; name: string; desc: string; unlocked: boolean }

/** レベルで解放される特殊効果の一覧。 */
export function perksOf(save: SaveData, id: string): PerkView[] {
  return [...objectPerks(save, id)].sort((a, b) => a.level - b.level);
}

/** オブジェクトの大きさ（マス）。 */
export function sizeOf(ro: ResolvedObject | null, id: string): { w: number; h: number } {
  const base = OBJECT_MAP[id]?.base;
  const w = ro?.w ?? base?.w ?? 1;
  const hh = ro?.h ?? base?.h ?? 1;
  return { w: Math.max(1, w || 1), h: Math.max(1, hh || 1) };
}

/** 大きさの小さな図（w×h のマス）。 */
function sizeGlyph(w: number, hh: number, block: boolean): HTMLElement {
  const cells: HTMLElement[] = [];
  for (let i = 0; i < w * hh; i++) cells.push(h("span", { class: "sz-cell" }));
  return h("span", { class: `sz-glyph ${block ? "blk-on" : "blk-off"}`, style: `grid-template-columns:repeat(${w},1fr);aspect-ratio:${w}/${hh}` }, cells);
}

function perkList(save: SaveData, id: string): HTMLElement | null {
  const perks = perksOf(save, id);
  if (!perks.length) return null;
  const nextIdx = perks.findIndex((p) => !p.unlocked);
  return h("div", { class: "perks" },
    h("div", { class: "panel-title" }, "レベルで解放される力",
      h("span", { class: "muted small" }, `  ${perks.filter((p) => p.unlocked).length} / ${perks.length}`)),
    nextIdx >= 0 ? h("div", { class: "pk-next-line" }, h("b", null, `Lv${perks[nextIdx].level}`), "で解放: ", h("b", null, perks[nextIdx].name)) : h("div", { class: "pk-next-line done" }, "ぜんぶ解放した！"),
    h("div", { class: "pk-list" }, perks.map((p, i) => h("div", { class: `pk ${p.unlocked ? "pk-on" : i === nextIdx ? "pk-next" : "pk-off"}` },
      h("span", { class: "pk-lv" }, p.unlocked ? svgIcon(ICONS.check) : null, `Lv${p.level}`),
      h("span", { class: "pk-body" }, h("span", { class: "pk-name" }, p.name), h("span", { class: "pk-desc" }, p.desc)),
      h("span", { class: "pk-st" }, p.unlocked ? "解放ずみ" : i === nextIdx ? "つぎ" : "")))));
}

function nextLevelPreview(save: SaveData, id: string): ResolvedObject | null {
  const clone: SaveData = structuredClone(save);
  if (!clone.objects[id]) return null;
  clone.objects[id].level++;
  return resolveObject(clone, id);
}

export function openObjDetail(ctx: Ctx, id: string): void {
  const def = OBJECT_MAP[id];
  if (!def) return;
  ctx.modals.open({
    title: def.name,
    render: () => {
      const save = ctx.save;
      const os = save.objects[id];
      if (!os) return h("div", { class: "muted" }, "まだ持っていません");
      const ro = resolveObject(save, id)!;
      const next = nextLevelPreview(save, id);
      const cost = objectUpgradeCost(save, id)!;
      const size = sizeOf(ro, id);
      return h("div", { class: "obj-detail" },
        h("div", { class: "cd-top" },
          h("div", { class: `od-frame r-${def.rarity}` }, svgIcon(objectSvg(def.id, def.kind), "cd-ico")),
          h("div", { class: "cd-info" },
            h("div", { class: "cd-row" },
              h("span", { class: `rar-pill r-${def.rarity}` }, def.rarity),
              h("span", { class: "kind-pill" }, svgIcon(kindSvg(def.kind)), KIND_NAMES[def.kind]),
              h("span", { class: "cd-lv" }, `Lv ${os.level}`)),
            h("div", { class: "cd-desc" }, def.desc),
            h("div", { class: "od-size" },
              sizeGlyph(size.w, size.h, ro.block),
              h("span", { class: "od-size-t" }, `${size.w}×${size.h}マス`),
              blockTag(ro.block, "blk-pill")),
            h("div", { class: `blk-note ${ro.block ? "blk-on" : "blk-off"}` }, ro.block ? "虫はここを通れず、よけて遠回りする（道は完全にはふさげない）" : "虫は上を通っていく（道をふさがない）"),
            bar(os.shards / cost.shards, `bar-shard bar-lg ${os.shards >= cost.shards ? "full" : ""}`, `かけら ${fmt(os.shards)} / ${fmt(cost.shards)}`))),
        perkList(save, id),
        h("div", { class: "panel-title" }, "ステータス", h("span", { class: "muted small" }, "（→ は次のレベル）")),
        h("div", { class: "stats" }, objStats(ro, next).map(([k, v]) => h("div", { class: "stat" }, h("span", { class: "stat-k" }, k), h("span", { class: "stat-v" }, v)))),
      );
    },
    footer: () => {
      const save = ctx.save;
      if (!save.objects[id]) return null;
      const inLo = save.loadout.includes(id);
      const cost = objectUpgradeCost(save, id)!;
      const can = canLevelUpObject(save, id);
      const full = !inLo && save.loadout.length >= MAX_LOADOUT;
      return h("div", { class: "foot-row" },
        h("button", {
          class: `btn ${inLo ? "btn-red" : full ? "btn-gray is-off" : "btn-blue"}`,
          disabled: full,
          onclick: () => { toggleLoadout(ctx.save, id); ctx.commit(); },
        }, inLo ? "はずす" : full ? "いっぱい" : "持っていく"),
        h("button", {
          class: `btn btn-lvup ${can.ok ? "btn-gold" : "btn-gray is-off"}`, disabled: !can.ok,
          onclick: () => {
            const r = levelUpObject(ctx.save, id);
            if (r.ok) { ctx.commit(); ctx.toast(`${def.name}が Lv${ctx.save.objects[id].level} になった！`); } else ctx.toast(r.reason, "ng");
          },
        },
          h("span", { class: "lvup-t" }, "レベルアップ"),
          h("span", { class: "lvup-c" },
            h("span", { class: save.objects[id].shards >= cost.shards ? "" : "lack" }, svgIcon(ICONS.shard), fmt(cost.shards)),
            h("span", { class: save.coins >= cost.coins ? "" : "lack" }, svgIcon(ICONS.coin), fmt(cost.coins)))));
    },
  });
}
