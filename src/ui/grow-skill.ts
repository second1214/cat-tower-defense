// 成長 > スキル（スキルツリー。家族で共有・役割ごと）。
// ツリーは 15列 × 26行と大きいので、スマホでは「枝」（攻撃・体力・速さ・技・支援）ごとに3列で見せて、たてにスクロールする。
// 枝どうしは根もと（はじめの一歩）でしかつながっていないので、枝ごとに見ても形はそのまま。
import {
  canLearn, familyLevel, heroUid, isNodeOpen, learnSkill, nextNodeCost, nodeCost, nodeLevel, partyRoles, partyUids,
  catRole, resetSkills, skillSpent, skillTreeOf,
} from "../core/progress";
import { fmt } from "../core/num";
import { ROLES, type SaveData } from "../core/save";
import type { CharRole } from "../core/types";
import { ROLE_NAMES } from "../data/chars";
import {
  BRANCH_NAMES, COMBO_NAMES, SKILL_BRANCHES, SKILL_MAP, TIERS, TIER_MIN_LEVEL, effectText, type SkillBranch, type SkillNode,
} from "../data/skills";
import type { Ctx } from "./ctx";
import { badge, h, svgIcon } from "./dom";
import { COMBO_ICON, ICONS, branchSvg, roleSvg } from "./icons";
import { roleCanLearn } from "./badges";

/** 行の高さ（px）。 */
const ROOT_H = 92;
const ROW_H = 100;
const COMBO_H = 108;
const GAP_H = 14;
/** 左の段の札のはば。 */
const GUT = 38;
/** 線の座標（横は 0〜600 にのばして描く）。 */
const VB_W = 600;

const selNode: Partial<Record<CharRole, string | null>> = {};
const branchOf: Partial<Record<CharRole, SkillBranch>> = {};

type NodeState = "max" | "can" | "poor" | "lvlock" | "locked";

function nodeState(save: SaveData, role: CharRole, n: SkillNode): NodeState {
  const lv = nodeLevel(save, role, n.id);
  if (lv >= n.maxLevel) return "max";
  if (!n.req.every((r) => nodeLevel(save, role, r.id) >= r.lv)) return "locked";
  if (familyLevel(save) < n.minCharLevel) return "lvlock";
  return canLearn(save, role, n.id).ok ? "can" : "poor";
}

function branchCanLearn(save: SaveData, role: CharRole, b: SkillBranch): boolean {
  return skillTreeOf(role).some((n) => n.branch === b && n.req.length > 0 && canLearn(save, role, n.id).ok);
}

/** いま見ている役割（えらんでいなければ主人公の役割）。 */
export function currentSkillRole(ctx: Ctx): CharRole {
  const r = ctx.ui.skillRole;
  if (r && ROLES.includes(r)) return r;
  return catRole(ctx.save, heroUid(ctx.save));
}

export function renderSkillTab(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const role = currentSkillRole(ctx);
  const heroRole = catRole(save, heroUid(save));
  const pRoles = partyRoles(save);
  const branch = branchOf[role] ?? "atk";
  const fam = familyLevel(save);

  // ---- 役割のタブ ----
  const roleTabs = h("div", { class: "sk-roles" }, ROLES.map((r) => h("button", {
    class: `sk-role rl-${r} ${r === role ? "on" : ""}`,
    onclick: () => { if (r !== role) { ctx.ui.skillRole = r; ctx.rerender(); } },
  },
    badge(pRoles.includes(r) && roleCanLearn(save, r)),
    svgIcon(roleSvg(r), "sk-role-ico"),
    h("span", { class: "sk-role-name" }, ROLE_NAMES[r]),
    r === heroRole ? h("span", { class: "sk-role-mark" }, "主人公") : pRoles.includes(r) ? h("span", { class: "sk-role-mark mate" }, "相棒") : null)));

  // ---- この役割で戦う猫 ----
  const users = partyUids(save).filter((u) => catRole(save, u) === role).map((u) => save.cats[u].name);
  const spent = skillSpent(save, role);
  const info = h("div", { class: "sk-info" },
    h("span", { class: "sk-fam" }, "家族 Lv", h("b", null, String(fam))),
    h("span", { class: `sk-users ${users.length ? "" : "none"}` }, users.length
      ? `${users.join("・")} に効いているよ`
      : `パーティに${ROLE_NAMES[role]}の猫がいないよ`),
    h("button", {
      class: "btn btn-small btn-red sk-reset", disabled: spent <= 0,
      onclick: async () => {
        if (await ctx.confirm(`${ROLE_NAMES[role]}のスキルをぜんぶ忘れて、使ったちゅ〜る ${fmt(spent)} を全部もどしますか？`, "リセット", true)) {
          const back = resetSkills(ctx.save, role);
          selNode[role] = null;
          ctx.commit();
          ctx.toast(`ちゅ〜る ${fmt(back)} がもどりました`);
        }
      },
    }, "リセット"));

  // ---- 枝のタブ ----
  const tree = skillTreeOf(role);
  const branchTabs = h("div", { class: "sk-branches" }, SKILL_BRANCHES.map((b) => {
    const combos = tree.filter((n) => n.branch === b && n.combo).length;
    const got = tree.filter((n) => n.branch === b && nodeLevel(save, role, n.id) > 0).length;
    return h("button", {
      class: `sk-br bc-${b} ${b === branch ? "on" : ""}`,
      onclick: () => { if (branchOf[role] !== b) { branchOf[role] = b; ctx.rerender(); } },
    },
      branchCanLearn(save, role, b) ? h("span", { class: "sk-br-dot" }) : null,
      h("span", { class: "sk-br-top" }, svgIcon(branchSvg(b), "sk-br-ico"), h("span", { class: "sk-br-name" }, BRANCH_NAMES[b])),
      h("span", { class: "sk-br-sub" }, h("span", null, `${got}`), combos ? h("span", { class: "sk-br-star" }, svgIcon(COMBO_ICON), String(combos)) : null));
  }));

  return h("div", { class: "sub sub-skill" },
    roleTabs,
    h("div", { class: "sk-head" }, info, branchTabs),
    renderBranch(ctx, role, branch),
    h("div", { class: "sk-panel" }, renderNodePanel(ctx, role, spent)));
}

/** 1つの枝（3列）を、たてに並べて描く。 */
function renderBranch(ctx: Ctx, role: CharRole, b: SkillBranch): HTMLElement {
  const save = ctx.save;
  const bi = SKILL_BRANCHES.indexOf(b);
  const all = skillTreeOf(role);
  const nodes = all.filter((n) => n.branch === b || n.req.length === 0);
  const root = all.find((n) => n.req.length === 0)!;
  const fam = familyLevel(save);
  const sel = selNode[role] ?? null;

  // 行の位置（グリッドの y → 上からの px）
  const comboTiers = new Set(nodes.filter((n) => n.combo).map((n) => n.tier));
  const rowTop: number[] = [];
  const rowH: number[] = [];
  let y = 0;
  rowTop[0] = 0; rowH[0] = ROOT_H; y = ROOT_H;
  for (let t = 0; t < TIERS; t++) {
    rowTop[1 + 2 * t] = y; rowH[1 + 2 * t] = ROW_H; y += ROW_H;
    const ch = comboTiers.has(t) ? COMBO_H : GAP_H;
    rowTop[2 + 2 * t] = y; rowH[2 + 2 * t] = ch; y += ch;
  }
  const H = y + 24;
  const laneOf = (n: SkillNode) => (n.req.length === 0 ? 1 : n.pos.x - bi * 3);
  // 複合効果のノードは、列と列のあいだに置く（まっすぐの線と重ならないように）
  const fx = (n: SkillNode) => (n.combo ? (laneOf(n) === 1 ? 2 / 6 : 4 / 6) : (laneOf(n) * 2 + 1) / 6);  // 0〜1
  const cy = (n: SkillNode) => rowTop[n.pos.y] + (n.combo ? 44 : n.req.length === 0 ? 38 : 40);

  // 段の札と、まだ開いていない段のかげ
  const tiers: HTMLElement[] = [];
  for (let t = 0; t < TIERS; t++) {
    const top = rowTop[1 + 2 * t];
    const lock = fam < TIER_MIN_LEVEL[t];
    const height = rowH[1 + 2 * t] + rowH[2 + 2 * t];
    tiers.push(h("div", { class: `st-tier ${lock ? "lock" : ""} ${t % 2 ? "odd" : ""}`, style: `top:${top}px;height:${height}px` },
      h("div", { class: "st-tier-k" },
        h("span", { class: "st-tier-n" }, `${t + 1}`),
        h("span", { class: "st-tier-lv" }, lock ? svgIcon(ICONS.lock) : null, `Lv${TIER_MIN_LEVEL[t]}`))));
  }

  // 線
  const lines: string[] = [];
  for (const n of nodes) {
    for (const r of n.req) {
      const p = SKILL_MAP[r.id];
      if (!p) continue;
      const okReq = nodeLevel(save, role, r.id) >= r.lv;
      const has = nodeLevel(save, role, n.id) > 0;
      const cls = okReq && has ? `ln-on lc-${b}` : okReq ? `ln-ready lc-${b}` : "ln-off";
      const x1 = fx(p) * VB_W, y1 = cy(p), x2 = fx(n) * VB_W, y2 = cy(n);
      const my = y2 - (n.combo ? 58 : 56);
      const d = x1 === x2 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} V${my} H${x2} V${y2}`;
      lines.push(`<path d="${d}" class="${cls} ${n.combo ? "ln-combo" : ""}" vector-effect="non-scaling-stroke"/>`);
    }
  }
  const svg = `<svg class="st-lines" width="100%" height="${H}" viewBox="0 0 ${VB_W} ${H}" preserveAspectRatio="none">${lines.join("")}</svg>`;

  // いちばん深く取ったノード（はじめて開いたとき、そこまでスクロールする）
  let focusId = root.id;
  let deepest = -1;
  for (const n of nodes) if (nodeLevel(save, role, n.id) > 0 && cy(n) > deepest) { deepest = cy(n); focusId = n.id; }

  const els = nodes.map((n) => {
    const lv = nodeLevel(save, role, n.id);
    const st = nodeState(save, role, n);
    const isRoot = n.req.length === 0;
    const ico = n.combo ? COMBO_ICON : branchSvg(n.branch);
    return h("button", {
      class: `st-node st-${st} br-${b} ${n.combo ? "combo" : ""} ${lv > 0 ? "has" : ""} ${sel === n.id ? "sel" : ""} ${isRoot ? "root" : ""}`,
      style: `left:${(fx(n) * 100).toFixed(3)}%;top:${cy(n)}px`,
      "aria-label": `${n.name} Lv${lv}/${n.maxLevel}`,
      dataset: { node: n.id, ...(n.id === focusId ? { autofocus: "1" } : {}) },
      onclick: () => { selNode[role] = n.id; ctx.rerender(); },
    },
      h("span", { class: "st-circle" },
        svgIcon(ico),
        h("span", { class: "st-lv" }, `${lv}/${n.maxLevel}`)),
      h("span", { class: "st-name" }, n.name));
  });

  const view = h("div", { class: `st-view sk-view bv-${b}`, dataset: { sk: `tree-${role}-${b}` } },
    h("div", { class: "st-canvas", style: `height:${H}px` },
      tiers,
      h("div", { class: "st-lanes", style: `left:${GUT}px` },
        h("div", { class: "st-svgwrap", html: svg }),
        els)));
  attachDrag(view);
  return view;
}

/** マウスのドラッグでも、たてに動かせるようにする（タッチはふつうのスクロール）。 */
function attachDrag(view: HTMLElement): void {
  let drag: { id: number; y: number; st: number; moved: boolean } | null = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { id: e.pointerId, y: e.clientY, st: view.scrollTop, moved: false };
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) > 5) {
      drag.moved = true;
      view.classList.add("dragging");
      try { view.setPointerCapture(e.pointerId); } catch { /* 何もしない */ }
    }
    if (drag.moved) view.scrollTop = drag.st - dy;
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    view.classList.remove("dragging");
    if (moved) {
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      view.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => view.removeEventListener("click", stop, { capture: true }), 0);
    }
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
}

/** そのノードを、ちゅ〜るが足りるあいだ何レベル上げられるか（と、その合計）。 */
function affordable(save: SaveData, role: CharRole, n: SkillNode): { levels: number; cost: number } {
  if (!isNodeOpen(save, role, n.id).ok) return { levels: 0, cost: 0 };
  let lv = nodeLevel(save, role, n.id);
  let churu = save.churu;
  let levels = 0, cost = 0;
  while (lv < n.maxLevel) {
    const c = nodeCost(n, lv);
    if (c > churu) break;
    churu -= c; cost += c; lv++; levels++;
  }
  return { levels, cost };
}

function renderNodePanel(ctx: Ctx, role: CharRole, spent: number): HTMLElement {
  const save = ctx.save;
  const id = selNode[role];
  const n = id ? SKILL_MAP[id] : undefined;
  if (!n || n.role !== role) {
    return h("div", { class: "np np-empty" },
      svgIcon(ICONS.paw, "np-empty-ico"),
      h("div", null,
        h("div", { class: "np-empty-t" }, "スキルをタップしてね"),
        h("div", { class: "muted small" }, "光っているスキルは、いま取れます。", h("span", { class: "np-star" }, svgIcon(COMBO_ICON)), "は複合効果のとくべつなスキル"),
        h("div", { class: "muted small np-spent" }, `${ROLE_NAMES[role]}に使った `, svgIcon(ICONS.churu), fmt(spent))));
  }
  const lv = nodeLevel(save, role, n.id);
  const cost = nextNodeCost(save, role, n.id);
  const can = canLearn(save, role, n.id);
  const open = isNodeOpen(save, role, n.id);
  const many = affordable(save, role, n);
  const maxed = lv >= n.maxLevel;
  const combo = n.combo ? n.effects.find((e) => e.combo)?.combo : undefined;
  const learnOnce = () => {
    const r = learnSkill(ctx.save, role, n.id);
    if (r.ok) ctx.commit(); else ctx.toast(r.reason, "ng");
  };
  const learnMax = () => {
    let last = 0;
    for (;;) {
      const r = learnSkill(ctx.save, role, n.id);
      if (!r.ok) break;
      last = r.value;
    }
    if (last) ctx.commit();
  };
  return h("div", { class: `np br-${n.branch} ${n.combo ? "np-combo" : ""}` },
    h("div", { class: "np-head" },
      h("span", { class: `np-ico ic-${n.branch} ${n.combo ? "combo" : ""}` }, svgIcon(n.combo ? COMBO_ICON : branchSvg(n.branch))),
      h("div", { class: "np-title" },
        h("div", { class: "np-name" }, n.name, combo ? h("span", { class: "np-ctag" }, "複合効果") : null),
        h("div", { class: "np-sub" }, combo ? `${COMBO_NAMES[combo]}・` : "", `${BRANCH_NAMES[n.branch]}・段${n.tier + 1}・家族 Lv${n.minCharLevel}〜`)),
      h("div", { class: `np-lv ${maxed ? "max" : ""}` }, h("small", null, "Lv"), `${lv}`, h("small", null, `/${n.maxLevel}`))),
    h("div", { class: "np-eff" },
      h("span", { class: "np-now" }, lv > 0 ? effectText(n, lv) : "まだなし"),
      !maxed ? h("span", { class: "np-arrow" }, "→") : null,
      !maxed ? h("span", { class: "np-next" }, effectText(n, lv + 1)) : h("span", { class: "np-maxtag" }, "最大")),
    !maxed && !can.ok ? h("div", { class: `np-reason ${open.ok ? "poor" : ""}` }, can.reason) : null,
    maxed ? null : h("div", { class: "np-btns" },
      h("button", { class: `btn ${can.ok ? "btn-gold" : "btn-gray is-off"} np-learn`, disabled: !can.ok, onclick: learnOnce },
        h("span", { class: "np-bt" }, "習得 +1"),
        h("span", { class: `np-bc ${cost != null && save.churu < cost ? "lack" : ""}` }, svgIcon(ICONS.churu), cost != null ? fmt(cost) : "-")),
      h("button", { class: `btn ${many.levels > 1 ? "btn-purple" : "btn-gray is-off"} np-max`, disabled: many.levels <= 1, onclick: learnMax },
        h("span", { class: "np-bt" }, many.levels > 1 ? `まとめて +${many.levels}` : "まとめて"),
        h("span", { class: "np-bc" }, svgIcon(ICONS.churu), many.levels > 1 ? fmt(many.cost) : "-"))));
}
