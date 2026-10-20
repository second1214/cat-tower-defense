// 成長 > キャラ（猫の一覧・くわしく・スキルツリー）。
import {
  canLearn, charPower, expToNext, isNodeOpen, learnSkill, nextNodeCost, nodeCost, nodeLevel, resetSkills, resolveChar, selectChar,
  skillSpent, skillTreeOf, MAX_CHAR_LEVEL,
} from "../core/progress";
import { fmt } from "../core/num";
import type { SaveData } from "../core/save";
import type { ResolvedChar } from "../core/types";
import { CHARS, CHAR_MAP, RARITY_RANK, ROLE_NAMES } from "../data/chars";
import {
  BRANCH_NAMES, SKILL_BRANCHES, SKILL_MAP, SKILL_TREE_SIZE, effectText, type SkillBranch, type SkillNode,
} from "../data/skills";
import type { Ctx } from "./ctx";
import { badge, bar, fmtS, h, svgIcon } from "./dom";
import { ICONS, branchSvg, catSvg } from "./icons";
import { catIcon } from "./cafe";
import { charCanLearn, gachaBadge } from "./badges";
import { bondHearts, openGacha, rarityPill } from "./gacha";

// ================= 一覧 =================

export function gachaBanner(ctx: Ctx, cls = ""): HTMLElement {
  const save = ctx.save;
  return h("button", { class: `gacha-banner ${cls}`, onclick: () => openGacha(ctx) },
    badge(gachaBadge(save)),
    svgIcon(ICONS.tent, "gbn-ico"),
    h("span", { class: "gbn-text" },
      h("span", { class: "gbn-title" }, "譲渡会会場"),
      h("span", { class: "gbn-sub" }, "ちゅ〜るで新しい猫をお迎え")),
    h("span", { class: "gbn-go" }, "行く"));
}

export function renderCharList(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const owned = CHARS.filter((c) => save.chars[c.id]);
  const power = new Map(owned.map((c) => [c.id, charPower(save, c.id)]));
  owned.sort((a, b) => (power.get(b.id)! - power.get(a.id)!) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
  const notOwned = CHARS.filter((c) => !save.chars[c.id]).sort((a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]);

  const cards = owned.map((def) => {
    const cs = save.chars[def.id];
    const sel = save.selectedChar === def.id;
    return h("button", { class: `card cat-card r-${def.rarity} ${sel ? "selected" : ""}`, onclick: () => openCharDetail(ctx, def.id) },
      badge(charCanLearn(save, def.id)),
      sel ? h("span", { class: "sel-tag" }, "出撃中") : null,
      h("span", { class: "cc-tags" }, h("span", { class: "rar-tag" }, def.rarity), h("span", { class: `role-tag role-${def.role}` }, ROLE_NAMES[def.role])),
      catIcon(def.id, "card-ico"),
      h("div", { class: "card-name" }, def.name),
      h("div", { class: "card-lv" }, `Lv ${cs.level}`),
      bondHearts(cs.bond, "bond-sm"),
      h("div", { class: "card-passive" }, def.passive.name));
  });
  const locked = notOwned.map((def) => h("div", { class: `card cat-card locked r-${def.rarity}` },
    h("span", { class: "rar-tag" }, def.rarity),
    svgIcon(catSvg(def.id, true), "card-ico"),
    h("div", { class: "card-name" }, "？？？"),
    h("div", { class: "card-lock" }, "譲渡会で会えるかも")));

  return h("div", { class: "sub sub-char" },
    h("div", { class: "scroll", dataset: { sk: "chars" } },
      gachaBanner(ctx),
      h("div", { class: "sub-head sub-head-in" }, h("span", null, "猫たち（つよい順）"), h("span", { class: "muted" }, `${owned.length} / ${CHARS.length}`)),
      h("div", { class: "grid grid-3" }, cards, locked)));
}

// ================= くわしく =================

type DetailMode = "tree" | "stats";
const detailMode: Record<string, DetailMode> = {};
const selectedNode: Record<string, string | null> = {};
const treeScroll: Record<string, { x: number; y: number }> = {};

const num1 = (n: number) => (Math.round(n * 10) / 10).toString();
const pctS = (n: number) => `${Math.round(n * 1000) / 10}%`;

function statRows(rows: [string, string][]): HTMLElement {
  return h("div", { class: "stats" }, rows.map(([k, v]) => h("div", { class: "stat" }, h("span", { class: "stat-k" }, k), h("span", { class: "stat-v" }, v))));
}

/** 特殊技能のうち、ふつう（効果なし）でないものだけ。 */
export function specialRows(rc: ResolvedChar): [string, string][] {
  const rows: [string, string][] = [];
  if (rc.crit > 0) rows.push(["会心", pctS(rc.crit)], ["会心ダメージ", `×${num1(rc.critMul)}`]);
  if (rc.multiHit > 0) rows.push(["連続攻撃", `+${rc.multiHit}回`]);
  if (rc.lifesteal > 0) rows.push(["吸血", pctS(rc.lifesteal)]);
  if (rc.regen > 0) rows.push(["自動回復", `${pctS(rc.regen)}/秒`]);
  if (rc.knockback > 0) rows.push(["押しもどし", `${Math.round(rc.knockback * 100) / 100}マス`]);
  if (rc.poison > 0) rows.push(["毒", `${pctS(rc.poison)}/秒`]);
  if (rc.slowHit < 1) rows.push(["おそくする", pctS(1 - rc.slowHit)]);
  if (rc.pierce > 0) rows.push(["つらぬく", `${rc.pierce}匹`]);
  if (rc.kibbleBonus > 0) rows.push(["カリカリ", `+${pctS(rc.kibbleBonus)}`]);
  if (rc.objectAura > 0) rows.push(["まわりのオブジェクト", `+${pctS(rc.objectAura)}`]);
  if (rc.repair > 0) rows.push(["修理", `${pctS(rc.repair)}/秒`]);
  if (rc.reviveHp > 0.5) rows.push(["復活の体力", pctS(rc.reviveHp)]);
  if (rc.dodge > 0) rows.push(["よける", pctS(rc.dodge)]);
  return rows;
}

export function openCharDetail(ctx: Ctx, charId: string): void {
  const def = CHAR_MAP[charId];
  if (!def) return;
  ctx.modals.open({
    title: def.name,
    cls: "modal-tall modal-char",
    onClose: () => { selectedNode[charId] = null; },
    render: () => {
      const save = ctx.save;
      const cs = save.chars[charId];
      if (!cs) return h("div", { class: "muted" }, "まだお迎えしていません");
      const need = expToNext(cs.level);
      const sel = save.selectedChar === charId;
      const mode = detailMode[charId] ?? "tree";
      const setMode = (m: DetailMode) => { if (detailMode[charId] !== m) { detailMode[charId] = m; ctx.rerender(); } };
      return h("div", { class: "char-detail" },
        h("div", { class: "cd-top" },
          h("div", { class: `cd-frame fr-${def.rarity}` }, catIcon(charId, "cd-ico")),
          h("div", { class: "cd-info" },
            h("div", { class: "cd-row" },
              rarityPill(def.rarity),
              h("span", { class: `role-tag role-${def.role}` }, ROLE_NAMES[def.role]),
              bondHearts(cs.bond),
              h("span", { class: "cd-lv" }, `Lv ${cs.level}`)),
            bar(cs.level >= MAX_CHAR_LEVEL ? 1 : cs.exp / need, "bar-exp", cs.level >= MAX_CHAR_LEVEL ? "MAX" : `経験値 ${fmt(cs.exp)} / ${fmt(need)}`),
            h("div", { class: "cd-passive" }, h("b", null, def.passive.name), h("span", null, def.passive.desc)))),
        h("div", { class: "cd-actions" },
          h("div", { class: "seg" },
            h("button", { class: `seg-btn ${mode === "tree" ? "on" : ""}`, onclick: () => setMode("tree") }, badge(charCanLearn(save, charId)), "スキルツリー"),
            h("button", { class: `seg-btn ${mode === "stats" ? "on" : ""}`, onclick: () => setMode("stats") }, "ステータス")),
          h("button", {
            class: `btn btn-small ${sel ? "btn-gray is-off" : "btn-green"} cd-sel`, disabled: sel,
            onclick: () => { selectChar(ctx.save, charId); ctx.commit(); ctx.toast(`${def.name}が出撃します`); },
          }, sel ? "出撃中" : "出撃させる")),
        mode === "tree" ? renderTreeArea(ctx, charId) : renderStats(ctx, charId));
    },
    footer: () => {
      const save = ctx.save;
      if (!save.chars[charId] || (detailMode[charId] ?? "tree") !== "tree") return null;
      return renderNodePanel(ctx, charId);
    },
  });
}

function renderStats(ctx: Ctx, charId: string): HTMLElement {
  const save = ctx.save;
  const def = CHAR_MAP[charId];
  const rc = resolveChar(save, charId);
  const sp = specialRows(rc);
  return h("div", { class: "cd-scroll" },
    h("div", { class: "cd-power" }, "つよさの目安 ", h("b", null, fmt(charPower(save, charId)))),
    h("div", { class: "panel-title" }, "ステータス"),
    statRows([
      ["体力", fmtS(rc.maxHp)],
      ["攻撃", fmtS(rc.atk)],
      ["攻撃の間隔", `${Math.round(rc.atkInterval * 100) / 100}秒`],
      ["届く距離", `${num1(rc.range)}マス`],
      ["範囲", rc.aoe > 0 ? `${num1(rc.aoe)}マス` : "なし"],
      ["移動", `${num1(rc.moveSpeed)}`],
      ["休けい", `${num1(rc.restTime)}秒`],
      ["受けるダメージ", `${Math.round(rc.armor * 100)}%`],
    ]),
    h("div", { class: "panel-title" }, "特技"),
    sp.length ? statRows(sp) : h("div", { class: "muted small cd-none" }, "まだ特技はありません（スキルツリーで覚えられます）"),
    h("div", { class: "panel-title" }, "その猫らしさ"),
    h("div", { class: "cd-passive-box" }, h("b", null, def.passive.name), h("div", null, def.passive.desc)),
    h("div", { class: "cd-desc" }, def.desc));
}

// ================= スキルツリー =================

/** 1マスの大きさ（横・縦）。縦は名前が入るように少し広め。上は枝の名前のぶんあける。 */
const CELL = 68;
const CELL_H = 82;
const PAD_TOP = 26;

type NodeState = "max" | "can" | "poor" | "lvlock" | "rarlock" | "locked";

function nodeState(save: SaveData, charId: string, n: SkillNode): NodeState {
  const lv = nodeLevel(save, charId, n.id);
  if (lv >= n.maxLevel) return "max";
  const def = CHAR_MAP[charId];
  const c = save.chars[charId];
  if (n.minRarity && def && RARITY_RANK[def.rarity] < RARITY_RANK[n.minRarity]) return "rarlock";
  if (!n.req.every((r) => nodeLevel(save, charId, r.id) >= r.lv)) return "locked";
  if (c && c.level < n.minCharLevel) return "lvlock";
  return canLearn(save, charId, n.id).ok ? "can" : "poor";
}

const BRANCH_COLS: Record<SkillBranch, [number, number]> = {
  atk: [0, 2], def: [3, 5], spd: [6, 8], tech: [9, 11], support: [12, 14],
};

function renderTreeArea(ctx: Ctx, charId: string): HTMLElement {
  const save = ctx.save;
  const nodes = skillTreeOf(charId);
  const W = SKILL_TREE_SIZE.w * CELL;
  const H = SKILL_TREE_SIZE.h * CELL_H + PAD_TOP;
  const cx = (n: SkillNode) => (n.pos.x + 0.5) * CELL;
  const cy = (n: SkillNode) => PAD_TOP + (n.pos.y + 0.4) * CELL_H;
  const sel = selectedNode[charId] ?? null;

  // 枝の帯
  const bands = SKILL_BRANCHES.map((b) => {
    const [x0, x1] = BRANCH_COLS[b];
    return h("div", { class: `st-band bd-${b}`, style: `left:${x0 * CELL}px;width:${(x1 - x0 + 1) * CELL}px;height:${H}px` },
      h("div", { class: "st-band-name" }, svgIcon(branchSvg(b)), BRANCH_NAMES[b]));
  });

  // 線
  const lines: string[] = [];
  for (const n of nodes) {
    for (const r of n.req) {
      const p = SKILL_MAP[r.id];
      if (!p) continue;
      const okReq = nodeLevel(save, charId, r.id) >= r.lv;
      const has = nodeLevel(save, charId, n.id) > 0;
      const cls = okReq && has ? `ln-on lc-${n.branch}` : okReq ? `ln-ready lc-${n.branch}` : "ln-off";
      // 段がちがうときは、ひじ曲がりの線（縦 → 横 → 縦）
      const x1 = cx(p), y1 = cy(p), x2 = cx(n), y2 = cy(n);
      const my = y2 - CELL_H * 0.62;
      const d = x1 === x2 || y2 <= y1 ? `M${x1} ${y1} L${x2} ${y2}` : `M${x1} ${y1} V${my} H${x2} V${y2}`;
      lines.push(`<path d="${d}" class="${cls}"/>`);
    }
  }
  const svg = `<svg class="st-lines" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${lines.join("")}</svg>`;

  const els = nodes.map((n) => {
    const lv = nodeLevel(save, charId, n.id);
    const st = nodeState(save, charId, n);
    const gate = st === "rarlock" ? `${n.minRarity}以上` : st === "lvlock" ? `Lv${n.minCharLevel}` : null;
    const isRoot = n.req.length === 0;
    return h("button", {
      class: `st-node st-${st} br-${n.branch} ${lv > 0 ? "has" : ""} ${sel === n.id ? "sel" : ""} ${isRoot ? "root" : ""}`,
      style: `left:${cx(n)}px;top:${cy(n)}px`,
      "aria-label": `${n.name} Lv${lv}/${n.maxLevel}`,
      dataset: { node: n.id },
      onclick: () => { selectedNode[charId] = n.id; ctx.rerender(); },
    },
      h("span", { class: "st-circle" },
        svgIcon(st === "rarlock" ? ICONS.lock : branchSvg(n.branch)),
        h("span", { class: "st-lv" }, `${lv}/${n.maxLevel}`),
        gate ? h("span", { class: "st-gate" }, gate) : null),
      h("span", { class: "st-name" }, n.name));
  });

  const view = h("div", { class: "st-view" },
    h("div", { class: "st-canvas", style: `width:${W}px;height:${H}px` }, bands, h("div", { class: "st-svgwrap", html: svg }), els));
  attachPan(view, charId);

  const spent = skillSpent(save, charId);
  return h("div", { class: "st-area" },
    h("div", { class: "st-toolbar" },
      h("span", { class: "st-hint" }, "ドラッグで動かせるよ"),
      h("span", { class: "st-spent" }, "使った ", svgIcon(ICONS.churu), fmt(spent)),
      h("button", {
        class: "btn btn-small btn-red st-reset", disabled: spent <= 0,
        onclick: async () => {
          if (await ctx.confirm(`スキルをぜんぶ忘れて、使ったちゅ〜る ${fmt(spent)} を全部もどしますか？`, "リセット", true)) {
            const back = resetSkills(ctx.save, charId);
            selectedNode[charId] = null;
            ctx.commit();
            ctx.toast(`ちゅ〜る ${fmt(back)} がもどりました`);
          }
        },
      }, "リセット")),
    view);
}

/** スクロール位置をおぼえて、マウスのドラッグでも動かせるようにする（タッチはふつうのスクロール）。 */
function attachPan(view: HTMLElement, charId: string): void {
  view.addEventListener("scroll", () => { treeScroll[charId] = { x: view.scrollLeft, y: view.scrollTop }; }, { passive: true });
  queueMicrotask(() => {
    const mem = treeScroll[charId];
    if (mem) { view.scrollLeft = mem.x; view.scrollTop = mem.y; return; }
    // はじめは根もと（まん中の上）
    view.scrollLeft = Math.max(0, (SKILL_TREE_SIZE.w * CELL) / 2 - view.clientWidth / 2);
    view.scrollTop = 0;
    treeScroll[charId] = { x: view.scrollLeft, y: view.scrollTop };
  });
  let drag: { id: number; x: number; y: number; sl: number; st: number; moved: boolean } | null = null;
  view.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false };
  });
  view.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      view.classList.add("dragging");
      try { view.setPointerCapture(e.pointerId); } catch { /* 何もしない */ }
    }
    if (drag.moved) { view.scrollLeft = drag.sl - dx; view.scrollTop = drag.st - dy; }
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    view.classList.remove("dragging");
    if (moved) {
      // ドラッグのあとのクリックは無視する
      const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      view.addEventListener("click", stop, { capture: true, once: true });
      setTimeout(() => view.removeEventListener("click", stop, { capture: true }), 0);
    }
  };
  view.addEventListener("pointerup", end);
  view.addEventListener("pointercancel", end);
}

/** そのノードを、ちゅ〜るが足りるあいだ何レベル上げられるか（と、その合計）。 */
function affordable(save: SaveData, charId: string, n: SkillNode): { levels: number; cost: number } {
  if (!isNodeOpen(save, charId, n.id).ok) return { levels: 0, cost: 0 };
  let lv = nodeLevel(save, charId, n.id);
  let churu = save.churu;
  let levels = 0, cost = 0;
  while (lv < n.maxLevel) {
    const c = nodeCost(n, lv);
    if (c > churu) break;
    churu -= c; cost += c; lv++; levels++;
  }
  return { levels, cost };
}

function renderNodePanel(ctx: Ctx, charId: string): HTMLElement {
  const save = ctx.save;
  const id = selectedNode[charId];
  const n = id ? SKILL_MAP[id] : undefined;
  if (!n) {
    return h("div", { class: "np np-empty" },
      svgIcon(ICONS.paw, "np-empty-ico"),
      h("div", null, h("div", { class: "np-empty-t" }, "スキルをタップしてね"),
        h("div", { class: "muted small" }, "光っているスキルは、いま取れます。ちゅ〜るは譲渡会会場にも使えるよ")));
  }
  const lv = nodeLevel(save, charId, n.id);
  const cost = nextNodeCost(save, charId, n.id);
  const can = canLearn(save, charId, n.id);
  const open = isNodeOpen(save, charId, n.id);
  const many = affordable(save, charId, n);
  const maxed = lv >= n.maxLevel;
  const learnOnce = () => {
    const r = learnSkill(ctx.save, charId, n.id);
    if (r.ok) ctx.commit(); else ctx.toast(r.reason, "ng");
  };
  const learnMax = () => {
    let last = 0;
    for (;;) {
      const r = learnSkill(ctx.save, charId, n.id);
      if (!r.ok) break;
      last = r.value;
    }
    if (last) ctx.commit();
  };
  return h("div", { class: `np br-${n.branch}` },
    h("div", { class: "np-head" },
      h("span", { class: `np-ico ic-${n.branch}` }, svgIcon(branchSvg(n.branch))),
      h("div", { class: "np-title" },
        h("div", { class: "np-name" }, n.name),
        h("div", { class: "np-sub" }, BRANCH_NAMES[n.branch], n.minRarity ? `・${n.minRarity} 以上` : "", `・猫 Lv${n.minCharLevel}〜`)),
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
