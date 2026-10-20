// 成長 > キャラ（猫の一覧・くわしく・スキルツリー）。
import {
  canLearn, expToNext, learnSkill, resetSkills, resolveChar, selectChar, skillPoints, skillTreeOf, MAX_CHAR_LEVEL,
} from "../core/progress";
import { fmt } from "../core/num";
import { BRANCH_NAMES, CHARS, CHAR_MAP, ROLE_NAMES, SKILL_MAP, type SkillNode } from "../data/chars";
import { stageIdOf } from "../data/stages";
import type { Ctx } from "./ctx";
import { badge, bar, fmtS, h, svgIcon } from "./dom";
import { ICONS, branchSvg, catSvg } from "./icons";
import { charCanLearn } from "./badges";

export function renderCharList(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const cards = CHARS.map((def) => {
    const cs = save.chars[def.id];
    if (!cs) {
      return h("div", { class: "card cat-card locked" },
        svgIcon(catSvg(def.id, true), "card-ico"),
        h("div", { class: "card-name" }, "？？？"),
        h("div", { class: "card-lock" }, `${stageIdOf(def.unlockStage - 1)} クリアで仲間に`));
    }
    const need = expToNext(cs.level);
    const sel = save.selectedChar === def.id;
    return h("button", { class: `card cat-card ${sel ? "selected" : ""}`, onclick: () => openCharDetail(ctx, def.id) },
      badge(charCanLearn(save, def.id)),
      sel ? h("span", { class: "sel-tag" }, "出撃中") : null,
      h("span", { class: `role-tag role-${def.role}` }, ROLE_NAMES[def.role]),
      svgIcon(catSvg(def.id), "card-ico"),
      h("div", { class: "card-name" }, def.name),
      h("div", { class: "card-lv" }, `Lv ${cs.level}`),
      bar(cs.level >= MAX_CHAR_LEVEL ? 1 : cs.exp / need, "bar-exp"));
  });
  const owned = Object.keys(save.chars).length;
  return h("div", { class: "sub sub-char" },
    h("div", { class: "sub-head" }, h("span", null, "猫たち"), h("span", { class: "muted" }, `${owned} / ${CHARS.length}`)),
    h("div", { class: "scroll", dataset: { sk: "chars" } }, h("div", { class: "grid grid-3" }, cards)));
}

function statRows(rows: [string, string][]): HTMLElement {
  return h("div", { class: "stats" }, rows.map(([k, v]) => h("div", { class: "stat" }, h("span", { class: "stat-k" }, k), h("span", { class: "stat-v" }, v))));
}

const num1 = (n: number) => (Math.round(n * 10) / 10).toString();

export function openCharDetail(ctx: Ctx, charId: string): void {
  const def = CHAR_MAP[charId];
  if (!def) return;
  ctx.modals.open({
    title: def.name,
    cls: "modal-tall",
    render: () => {
      const save = ctx.save;
      const cs = save.chars[charId];
      if (!cs) return h("div", { class: "muted" }, "まだ仲間になっていません");
      const rc = resolveChar(save, charId);
      const need = expToNext(cs.level);
      const sel = save.selectedChar === charId;
      const sp = skillPoints(save, charId);
      return h("div", { class: "char-detail" },
        h("div", { class: "cd-top" },
          svgIcon(catSvg(charId), "cd-ico"),
          h("div", { class: "cd-info" },
            h("div", { class: "cd-row" }, h("span", { class: `role-tag role-${def.role}` }, ROLE_NAMES[def.role]), h("span", { class: "cd-lv" }, `Lv ${cs.level}`)),
            bar(cs.level >= MAX_CHAR_LEVEL ? 1 : cs.exp / need, "bar-exp bar-lg", cs.level >= MAX_CHAR_LEVEL ? "MAX" : `${fmt(cs.exp)} / ${fmt(need)}`),
            h("div", { class: "cd-desc" }, def.desc))),
        h("button", {
          class: `btn ${sel ? "btn-gray is-off" : "btn-green"} btn-wide`, disabled: sel,
          onclick: () => { selectChar(save, charId); ctx.commit(); ctx.toast(`${def.name}が出撃します`); },
        }, sel ? "出撃中" : "この猫で出撃する"),
        h("div", { class: "panel-title" }, "ステータス"),
        statRows([
          ["体力", fmtS(rc.maxHp)],
          ["攻撃", fmtS(rc.atk)],
          ["攻撃の間隔", `${num1(rc.atkInterval)}秒`],
          ["届く距離", `${num1(rc.range)}マス`],
          ["範囲", rc.aoe > 0 ? `${num1(rc.aoe)}マス` : "なし"],
          ["移動", `${num1(rc.moveSpeed)}`],
          ["休けい", `${num1(rc.restTime)}秒`],
          ["受けるダメージ", `${Math.round(rc.armor * 100)}%`],
          ["拾える距離", `${num1(rc.pickupRange)}マス`],
        ]),
        h("div", { class: "skill-head" },
          h("div", { class: "panel-title" }, "スキルツリー"),
          h("div", { class: `sp ${sp > 0 ? "sp-on" : ""}` }, "スキルポイント ", h("b", null, String(sp))),
          h("button", {
            class: "btn btn-small btn-red", disabled: cs.skills.length === 0,
            onclick: async () => {
              if (await ctx.confirm("スキルをぜんぶ忘れて、ポイントを戻しますか？（無料）", "リセット", true)) {
                resetSkills(ctx.save, charId);
                ctx.commit();
                ctx.toast("スキルをリセットしました");
              }
            },
          }, "リセット")),
        renderSkillTree(ctx, charId));
    },
  });
}

/** node.pos を使ってスキルを並べ、前のスキルへ線を引く。 */
function renderSkillTree(ctx: Ctx, charId: string): HTMLElement {
  const save = ctx.save;
  const nodes = skillTreeOf(charId);
  const learned = save.chars[charId]?.skills ?? [];
  const cols = 3;
  const rows = Math.max(...nodes.map((n) => n.pos.y)) + 1;
  const ROW = 96;
  const W = 300;
  const cx = (n: SkillNode) => ((n.pos.x + 0.5) / cols) * W;
  const cy = (n: SkillNode) => n.pos.y * ROW + ROW / 2;
  const lines: string[] = [];
  for (const n of nodes) {
    for (const r of n.req) {
      const p = SKILL_MAP[r];
      if (!p) continue;
      const on = learned.includes(r) && learned.includes(n.id);
      const ready = learned.includes(r) && !learned.includes(n.id);
      lines.push(`<line x1="${cx(p)}" y1="${cy(p)}" x2="${cx(n)}" y2="${cy(n)}" class="${on ? "ln-on" : ready ? "ln-ready" : "ln-off"}" vector-effect="non-scaling-stroke"/>`);
    }
  }
  const svg = `<svg class="st-lines" viewBox="0 0 ${W} ${rows * ROW + 24}" preserveAspectRatio="none">${lines.join("")}</svg>`;
  const els = nodes.map((n) => {
    const isL = learned.includes(n.id);
    const can = canLearn(save, charId, n.id);
    const reqOk = n.req.every((r) => learned.includes(r));
    const st = isL ? "learned" : can.ok ? "learnable" : reqOk ? "waiting" : "locked";
    return h("button", {
      class: `st-node st-${st} br-${n.branch}`,
      style: `left:${((n.pos.x + 0.5) / cols) * 100}%;top:${cy(n)}px`,
      onclick: () => openSkillNode(ctx, charId, n.id),
    },
      h("span", { class: "st-circle" }, svgIcon(isL ? ICONS.check : branchSvg(n.branch)), !isL ? h("span", { class: "st-cost" }, String(n.cost)) : null),
      h("span", { class: "st-label" }, h("span", { class: "st-name" }, n.name), h("span", { class: "st-eff" }, n.desc)));
  });
  return h("div", { class: "skilltree" },
    h("div", { class: "st-branches" }, (["atk", "hp", "spd"] as const).map((b) => h("span", { class: `st-br br-${b}` }, BRANCH_NAMES[b]))),
    h("div", { class: "st-canvas", style: `height:${rows * ROW + 24}px` }, h("div", { class: "st-svgwrap", html: svg }), els));
}

function openSkillNode(ctx: Ctx, charId: string, nodeId: string): void {
  const n = SKILL_MAP[nodeId];
  if (!n) return;
  const m = ctx.modals.open({
    title: n.name,
    cls: "modal-small",
    render: () => {
      const save = ctx.save;
      const learned = save.chars[charId]?.skills.includes(nodeId);
      const can = canLearn(save, charId, nodeId);
      return h("div", { class: "skill-pop" },
        h("div", { class: `sp-branch br-${n.branch}` }, svgIcon(branchSvg(n.branch)), BRANCH_NAMES[n.branch]),
        h("div", { class: "sp-eff" }, n.desc),
        n.req.length ? h("div", { class: "muted small" }, "必要: ", n.req.map((r) => SKILL_MAP[r]?.name ?? r).join("・")) : null,
        h("div", { class: "sp-cost" }, "必要なスキルポイント ", h("b", null, String(n.cost)), `（のこり ${skillPoints(save, charId)}）`),
        learned ? h("div", { class: "chip chip-ok" }, "覚えています")
          : !can.ok ? h("div", { class: "reason" }, can.reason) : null);
    },
    footer: () => {
      const save = ctx.save;
      const learned = save.chars[charId]?.skills.includes(nodeId);
      const can = canLearn(save, charId, nodeId);
      if (learned) return h("button", { class: "btn btn-gray btn-wide", onclick: () => m.close() }, "とじる");
      return h("button", {
        class: `btn btn-wide ${can.ok ? "btn-gold" : "btn-gray is-off"}`, disabled: !can.ok,
        onclick: () => {
          const r = learnSkill(ctx.save, charId, nodeId);
          if (r.ok) { m.close(); ctx.commit(); ctx.toast(`「${n.name}」を覚えた！`); } else ctx.toast(r.reason, "ng");
        },
      }, "覚える");
    },
  });
}
