// 成長タブ（キャラ・スキル・オブジェクト・装備のサブタブ）。
import type { Ctx, GrowSub } from "./ctx";
import { badge, h } from "./dom";
import { anyCharBadge, anyEquipBadge, anyObjBadge, anySkillBadge } from "./badges";
import { renderCharList } from "./grow-char";
import { renderSkillTab } from "./grow-skill";
import { renderObjList } from "./grow-obj";
import { renderEquipList } from "./grow-equip";

export function renderGrow(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const subs: [GrowSub, string, boolean][] = [
    ["char", "キャラ", anyCharBadge(save)],
    ["skill", "スキル", anySkillBadge(save)],
    ["obj", "オブジェクト", anyObjBadge(save)],
    ["equip", "装備", anyEquipBadge(save)],
  ];
  const cur = ctx.ui.growSub;
  return h("div", { class: "tab tab-grow" },
    h("div", { class: "subtabs subtabs-4" }, subs.map(([id, label, b]) => h("button", {
      class: `subtab ${cur === id ? "on" : ""}`,
      onclick: () => { if (ctx.ui.growSub !== id) { ctx.ui.growSub = id; ctx.ui.fuseMode = false; ctx.ui.fuseSel = []; ctx.rerender(); } },
    }, label, badge(b)))),
    cur === "char" ? renderCharList(ctx) : cur === "skill" ? renderSkillTab(ctx) : cur === "obj" ? renderObjList(ctx) : renderEquipList(ctx));
}
