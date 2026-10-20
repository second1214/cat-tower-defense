// レリック（全体の永続強化）の道。
import { canUnlockRelic, nextRelic, relicBonus, unlockRelic, type RelicBonus } from "../core/progress";
import { fmt } from "../core/num";
import { RELICS, type RelicStat } from "../data/relics";
import type { Ctx } from "./ctx";
import { bar, h, svgIcon } from "./dom";
import { ICONS } from "./icons";

const STAT_LABEL: Record<RelicStat, string> = {
  dmg: "ダメージ", charHp: "猫の体力", kibble: "カリカリ増加", startKibble: "最初のカリカリ",
  mamaHp: "ママの HP", objCost: "置くカリカリ", drop: "ドロップ", exp: "経験値", coins: "お金",
};

function statValue(stat: RelicStat, b: RelicBonus): { text: string; on: boolean } {
  const v = b[stat];
  const p = Math.round(v * 100);
  switch (stat) {
    case "dmg": case "charHp": return { text: `×${v < 1000 ? Math.round(v * 100) / 100 : fmt(v)}`, on: v !== 1 };
    case "startKibble": case "mamaHp": return { text: `+${v}`, on: v !== 0 };
    case "objCost": return { text: `-${p}%`, on: v !== 0 };
    default: return { text: `+${p}%`, on: v !== 0 };
  }
}

const STAT_ORDER: RelicStat[] = ["dmg", "charHp", "mamaHp", "kibble", "startKibble", "objCost", "drop", "exp", "coins"];

export function renderRelic(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const done = save.relics.length;
  const total = RELICS.length;
  const next = nextRelic(save);
  const b = relicBonus(save);

  const summary = h("div", { class: "panel relic-sum" },
    h("div", { class: "rs-head" },
      h("div", { class: "panel-title" }, "効果"),
      h("div", { class: "rs-prog" }, `解放 ${done} / ${total}`)),
    bar(done / total, "bar-relic"),
    h("div", { class: "rs-grid" }, STAT_ORDER.map((s) => {
      const v = statValue(s, b);
      return h("div", { class: `rs-item ${v.on ? "on" : ""}` }, h("span", { class: "rs-k" }, STAT_LABEL[s]), h("span", { class: "rs-v" }, v.text));
    })));

  const rows = RELICS.map((n, i) => {
    const unlocked = save.relics.includes(n.id);
    const isNext = next?.id === n.id;
    const can = isNext && canUnlockRelic(save, n.id).ok;
    const st = unlocked ? "done" : isNext ? (can ? "next can" : "next") : "locked";
    const side = i % 2 === 0 ? "left" : "right";
    const onTap = () => {
      if (unlocked) { ctx.toast(`「${n.name}」は解放ずみ`); return; }
      if (!isNext) { ctx.toast("先に前のレリックを解放してね", "ng"); return; }
      const r = unlockRelic(ctx.save, n.id);
      if (r.ok) { ctx.commit(); ctx.toast(`「${n.name}」を解放！ ${n.desc}`); } else ctx.toast(r.reason, "ng");
    };
    const card = h("div", { class: "rl-card" },
      h("div", { class: "rl-name" }, n.name),
      h("div", { class: "rl-desc" }, n.desc),
      unlocked ? h("div", { class: "rl-cost done" }, "解放ずみ")
        : h("div", { class: `rl-cost ${isNext && !can ? "lack" : ""}` }, svgIcon(ICONS.relic), fmt(n.cost), isNext ? h("span", { class: "rl-go" }, can ? "タップで解放" : "ポイント不足") : null));
    return h("button", { class: `rl-row rl-${side} ${st.split(" ").map((s) => `rl-${s}`).join(" ")}`, onclick: onTap, dataset: isNext ? { autofocus: "1" } : undefined },
      h("div", { class: "rl-side rl-side-l" }, side === "left" ? card : null),
      h("div", { class: "rl-node" }, svgIcon(unlocked || isNext ? ICONS.relic : ICONS.lock), h("span", { class: "rl-num" }, String(i + 1))),
      h("div", { class: "rl-side rl-side-r" }, side === "right" ? card : null));
  });

  return h("div", { class: "tab tab-relic" },
    summary,
    h("div", { class: "scroll relic-path", dataset: { sk: "relic" } },
      h("div", { class: "rl-title" }, "おうちのレリック"),
      h("div", { class: "rl-list" }, h("div", { class: "rl-spine" }), rows),
      done === total ? h("div", { class: "rl-title" }, "ぜんぶ解放した！") : null));
}
