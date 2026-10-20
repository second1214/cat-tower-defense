// 成長 > 装備（頭・首・胴体の3枠、手持ち、合成、売る）。
import {
  autoEquip, autoFuse, equip, equipBonus, equipScore, equipSellPrice, findEquip, fuseEquips, isEquipped, sellEquip, unequip,
} from "../core/progress";
import { fmt } from "../core/num";
import {
  EQUIP_MAP, EQUIP_RARITY_NAMES, EQUIP_SLOTS, MAX_EQUIP_RARITY, SLOT_NAMES, affixText, equipBaseStats,
  type EquipItem, type EquipSlot,
} from "../data/equips";
import type { Ctx, EquipFilter } from "./ctx";
import { badge, h, svgIcon } from "./dom";
import { ICONS, equipSvg, slotSvg } from "./icons";
import { fusableGroups } from "./badges";

export const rarName = (r: number) => EQUIP_RARITY_NAMES[r] ?? "N";
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export function sortEquips(list: EquipItem[]): EquipItem[] {
  const slotOrder = (s: EquipSlot) => EQUIP_SLOTS.indexOf(s);
  return [...list].sort((a, b) => b.rarity - a.rarity || slotOrder(a.slot) - slotOrder(b.slot) || equipScore(b) - equipScore(a) || a.uid.localeCompare(b.uid));
}

/** 装備の小さなカード。 */
export function equipCard(ctx: Ctx | null, it: EquipItem, opts: { onclick?: () => void; cls?: string; equipped?: boolean } = {}): HTMLElement {
  const def = EQUIP_MAP[it.defId];
  return h(opts.onclick ? "button" : "div", { class: `card eq-card r-${rarName(it.rarity)} ${opts.cls ?? ""}`, onclick: opts.onclick },
    h("span", { class: "rar-tag" }, rarName(it.rarity)),
    opts.equipped ? h("span", { class: "eq-tag" }, "E") : null,
    svgIcon(equipSvg(it.defId), "card-ico"),
    h("div", { class: "card-name small" }, def?.name ?? "?"),
    ctx && opts.equipped === undefined && isEquipped(ctx.save, it.uid) ? h("span", { class: "eq-tag" }, "E") : null);
}

function pruneFuse(ctx: Ctx): void {
  const ui = ctx.ui;
  ui.fuseSel = ui.fuseSel.filter((u) => !!findEquip(ctx.save, u));
}

export function renderEquipList(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const ui = ctx.ui;
  pruneFuse(ctx);

  const slots = EQUIP_SLOTS.map((s) => {
    const uid = save.equipped[s];
    const it = uid ? findEquip(save, uid) : undefined;
    const hasCand = !it && save.equips.some((e) => e.slot === s);
    return h("button", {
      class: `eq-slot ${it ? `r-${rarName(it.rarity)}` : "empty"}`,
      onclick: () => (it ? openEquipDetail(ctx, it.uid) : (ui.equipFilter = s, ctx.rerender())),
    },
      badge(hasCand),
      h("span", { class: "eq-slot-name" }, SLOT_NAMES[s]),
      it ? svgIcon(equipSvg(it.defId), "eq-slot-ico") : svgIcon(slotSvg(s), "eq-slot-ico dim"),
      h("span", { class: "eq-slot-item" }, it ? `${rarName(it.rarity)} ${EQUIP_MAP[it.defId]?.name ?? ""}` : "なし"));
  });

  const eb = equipBonus(save);
  const bonus = h("div", { class: "eq-bonus" },
    h("span", null, "猫とオブジェクト：攻撃 ", h("b", null, `×${fmtMul(eb.baseAtkMul)}`)),
    h("span", null, "体力 ", h("b", null, `×${fmtMul(eb.baseHpMul)}`)));

  const groups = fusableGroups(save);
  const actions = h("div", { class: "eq-actions" },
    h("button", {
      class: "btn btn-small btn-blue", disabled: save.equips.length === 0,
      onclick: () => { autoEquip(ctx.save); ctx.commit(); ctx.toast("いちばん強い装備をつけました"); },
    }, "おまかせ装備"),
    h("button", {
      class: "btn btn-small btn-purple has-badge", disabled: groups.length === 0,
      onclick: async () => {
        if (!(await ctx.confirm("合成できる装備を、ぜんぶまとめて合成しますか？\n（弱いもの・つけていないものから使います）", "まとめて合成"))) return;
        const n = ctx.withRng((rng) => autoFuse(ctx.save, rng));
        ui.fuseSel = [];
        ctx.commit();
        ctx.toast(n > 0 ? `${n}回 合成しました！` : "合成できる組がありません", n > 0 ? "ok" : "ng");
      },
    }, badge(groups.length > 0), "まとめて合成"),
    h("button", {
      class: `btn btn-small ${ui.fuseMode ? "btn-gold" : "btn-gray"}`,
      onclick: () => { ui.fuseMode = !ui.fuseMode; ui.fuseSel = []; ctx.rerender(); },
    }, ui.fuseMode ? "合成をやめる" : "えらんで合成"));

  const filters: [EquipFilter, string][] = [["all", "すべて"], ["head", "頭"], ["neck", "首"], ["body", "胴体"]];
  const filterRow = h("div", { class: "chips" }, filters.map(([f, label]) => h("button", {
    class: `chip-btn ${ui.equipFilter === f ? "on" : ""}`,
    onclick: () => { ui.equipFilter = f; ctx.rerender(); },
  }, label)));

  let list = sortEquips(save.equips);
  if (ui.equipFilter !== "all") list = list.filter((e) => e.slot === ui.equipFilter);
  const first = ui.fuseSel.length ? findEquip(save, ui.fuseSel[0]) : undefined;

  const cards = list.map((it) => {
    const eq = isEquipped(save, it.uid);
    if (!ui.fuseMode) return equipCard(ctx, it, { equipped: eq, onclick: () => openEquipDetail(ctx, it.uid) });
    const sel = ui.fuseSel.includes(it.uid);
    const ok = it.rarity < MAX_EQUIP_RARITY && (!first || (first.slot === it.slot && first.rarity === it.rarity));
    return equipCard(ctx, it, {
      equipped: eq,
      cls: sel ? "fuse-sel" : ok ? "" : "fuse-dim",
      onclick: () => {
        if (sel) ui.fuseSel = ui.fuseSel.filter((u) => u !== it.uid);
        else if (it.rarity >= MAX_EQUIP_RARITY) { ctx.toast("UR はこれ以上合成できません", "ng"); return; }
        else if (!ok) { ctx.toast("同じ枠・同じレアリティの装備を選んでね", "ng"); return; }
        else if (ui.fuseSel.length >= 3) { ctx.toast("3つまでです", "ng"); return; }
        else ui.fuseSel = [...ui.fuseSel, it.uid];
        ctx.rerender();
      },
    });
  });

  const fuseBar = ui.fuseMode ? h("div", { class: "panel fuse-bar" },
    h("div", { class: "fuse-slots" }, [0, 1, 2].map((i) => {
      const it = ui.fuseSel[i] ? findEquip(save, ui.fuseSel[i]) : undefined;
      return it ? equipCard(ctx, it, { cls: "mini", onclick: () => { ui.fuseSel = ui.fuseSel.filter((u) => u !== it.uid); ctx.rerender(); } })
        : h("div", { class: "card eq-card mini empty" }, "＋");
    }),
    h("div", { class: "fuse-arrow" }, "→"),
    h("div", { class: `card eq-card mini fuse-result ${first ? `r-${rarName(first.rarity + 1)}` : "empty"}` },
      first ? [h("span", { class: "rar-tag" }, rarName(first.rarity + 1)), svgIcon(equipSvg(first.defId), "card-ico")] : "？")),
    h("div", { class: "fuse-help" }, first ? `${SLOT_NAMES[first.slot]}・${rarName(first.rarity)} を3つ（${ui.fuseSel.length}/3）` : "同じ枠・同じレアリティの装備を3つ選んでね"),
    h("button", {
      class: `btn btn-wide ${ui.fuseSel.length === 3 ? "btn-gold" : "btn-gray is-off"}`, disabled: ui.fuseSel.length !== 3,
      onclick: () => doFuse(ctx),
    }, "合成"))
    : null;

  return h("div", { class: "sub sub-equip" },
    h("div", { class: "panel eq-panel" }, h("div", { class: "eq-slots" }, slots), bonus),
    actions,
    fuseBar,
    h("div", { class: "sub-head" }, filterRow, h("span", { class: "muted" }, `${save.equips.length}こ`)),
    h("div", { class: "scroll", dataset: { sk: "equips" } },
      cards.length ? h("div", { class: "grid grid-5" }, cards)
        : h("div", { class: "empty-msg" }, "装備はまだありません。ステージをクリアすると落ちてくるよ")));
}

function fmtMul(v: number): string {
  return v < 100 ? (Math.round(v * 100) / 100).toString() : fmt(v);
}

function doFuse(ctx: Ctx): void {
  const uids = [...ctx.ui.fuseSel];
  const res = ctx.withRng((rng) => fuseEquips(ctx.save, uids, rng));
  if (!res.ok) { ctx.toast(res.reason, "ng"); return; }
  ctx.ui.fuseSel = [];
  ctx.commit();
  showNewEquip(ctx, res.value, "合成せいこう！");
}

export function showNewEquip(ctx: Ctx, it: EquipItem, title: string): void {
  const m = ctx.modals.open({
    title,
    cls: "modal-small",
    render: () => h("div", { class: "fuse-done" },
      h("div", { class: `fuse-shine r-${rarName(it.rarity)}` }, equipCard(ctx, it, { cls: "big" })),
      equipInfo(it)),
    footer: () => h("button", { class: "btn btn-gold btn-wide", onclick: () => m.close() }, "やったね！"),
  });
}

function equipInfo(it: EquipItem): HTMLElement {
  const def = EQUIP_MAP[it.defId];
  const b = equipBaseStats(it);
  return h("div", { class: "eq-info" },
    h("div", { class: "eq-info-name" }, h("span", { class: `rar-pill r-${rarName(it.rarity)}` }, rarName(it.rarity)), def?.name ?? "?", h("span", { class: "muted small" }, `（${SLOT_NAMES[it.slot]}）`)),
    def ? h("div", { class: "cd-desc" }, def.desc) : null,
    h("div", { class: "panel-title" }, "基本"),
    h("div", { class: "stats" },
      h("div", { class: "stat" }, h("span", { class: "stat-k" }, "攻撃"), h("span", { class: "stat-v" }, `+${pct(b.atk)}`)),
      h("div", { class: "stat" }, h("span", { class: "stat-k" }, "体力"), h("span", { class: "stat-v" }, `+${pct(b.hp)}`))),
    h("div", { class: "panel-title" }, `補正（${it.affixes.length}）`),
    h("ul", { class: "affixes" }, it.affixes.map((a) => h("li", null, affixText(a)))));
}

export function openEquipDetail(ctx: Ctx, uid: string): void {
  const m = ctx.modals.open({
    title: "装備",
    render: () => {
      const it = findEquip(ctx.save, uid);
      if (!it) return h("div", { class: "muted" }, "この装備はもうありません");
      return h("div", { class: "eq-detail" },
        h("div", { class: "cd-top" }, equipCard(ctx, it, { cls: "big", equipped: isEquipped(ctx.save, uid) }), equipInfo(it)));
    },
    footer: () => {
      const save = ctx.save;
      const it = findEquip(save, uid);
      if (!it) return h("button", { class: "btn btn-gray btn-wide", onclick: () => m.close() }, "とじる");
      const eq = isEquipped(save, uid);
      const price = equipSellPrice(save, it);
      return h("div", { class: "foot-row" },
        h("button", {
          class: "btn btn-red", disabled: eq,
          onclick: async () => {
            if (it.rarity >= 2 && !(await ctx.confirm(`${rarName(it.rarity)} の装備を売りますか？`, "売る", true))) return;
            const r = sellEquip(ctx.save, uid);
            if (r.ok) { m.close(); ctx.commit(); ctx.toast(`${fmt(r.value)} コインで売れた`); } else ctx.toast(r.reason, "ng");
          },
        }, h("span", { class: "lvup-t" }, eq ? "つけています" : "売る"), h("span", { class: "lvup-c" }, svgIcon(ICONS.coin), fmt(price))),
        eq
          ? h("button", { class: "btn btn-gray", onclick: () => { unequip(ctx.save, it.slot); ctx.commit(); } }, "はずす")
          : h("button", { class: "btn btn-green", onclick: () => { equip(ctx.save, uid); ctx.commit(); ctx.toast("つけました"); } }, "つける"));
    },
  });
}
