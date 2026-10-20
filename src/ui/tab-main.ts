// メイン（ステージを選ぶ）。
import {
  buildLoadout, estimateDps, isStageUnlocked, nextStageId, relicBonus, stageById, stageIndexOf, stageLoad, STAGES,
} from "../core/progress";
import { fmt } from "../core/num";
import { CHAR_MAP, ROLE_NAMES } from "../data/chars";
import { OBJECT_MAP } from "../data/objects";
import { BUG_MAP } from "../data/bugs";
import { CHAPTER_NAMES, stageIdOf } from "../data/stages";
import { MAX_LOADOUT, writeSave } from "../core/save";
import type { Ctx } from "./ctx";
import { h, svgIcon } from "./dom";
import { ICONS, catSvg, objectSvg } from "./icons";

/** 戦力の目安（DPS を見やすい数にしたもの）。 */
const POWER_SCALE = 10;

export function difficultyOf(ratio: number): { label: string; cls: string } {
  if (ratio >= 2) return { label: "楽勝", cls: "easy" };
  if (ratio >= 1) return { label: "ちょうどいい", cls: "fair" };
  return { label: "きびしい", cls: "hard" };
}

function currentStageId(ctx: Ctx): string {
  const s = ctx.save;
  const id = s.selectedStage;
  const g = stageIndexOf(id);
  if (g < 0 || g > s.cleared + 2 || g >= STAGES.length) return nextStageId(s);
  return id;
}

export function renderMain(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const id = currentStageId(ctx);
  const stage = stageById(id)!;
  const g = stageIndexOf(id);
  const unlocked = isStageUnlocked(save, id);
  const maxG = Math.min(STAGES.length - 1, save.cleared + 2);
  const go = (d: number) => {
    const ng = Math.max(0, Math.min(maxG, g + d));
    if (ng === g) return;
    save.selectedStage = stageIdOf(ng);
    writeSave(save);
    ctx.rerender();
  };

  const lo = buildLoadout(save, id)!;
  const load = stageLoad(stage);
  const need = (load.totalHp / load.duration) * POWER_SCALE;
  const mine = estimateDps(lo).total * POWER_SCALE;
  const ratio = need > 0 ? mine / need : 0;
  const diff = difficultyOf(ratio);
  const firstClear = g > save.cleared;
  const rel = relicBonus(save);
  const rw = stage.rewards;
  const boss = stage.index === 10;
  const clears = save.clearCounts[id] ?? 0;

  // 出てくる虫
  const bugIds: string[] = [];
  for (const w of stage.waves) for (const b of w.bugs) if (!bugIds.includes(b.bug)) bugIds.push(b.bug);

  const charDef = CHAR_MAP[save.selectedChar];
  const cs = save.chars[save.selectedChar];

  const header = h("div", { class: `panel stage-head ch${((stage.chapter - 1) % 5) + 1}` },
    h("div", { class: "stage-chapter" }, `第${stage.chapter}章　${CHAPTER_NAMES[stage.chapter - 1]}`),
    h("div", { class: "stage-nav" },
      h("button", { class: "arrow-btn", "aria-label": "前のステージ", disabled: g <= 0, onclick: () => go(-1) }, svgIcon(ICONS.left)),
      h("div", { class: "stage-id-wrap" },
        h("div", { class: "stage-id" }, id),
        h("div", { class: "stage-name" }, boss ? h("span", { class: "boss-tag" }, "ボス") : null, stage.name)),
      h("button", { class: "arrow-btn", "aria-label": "次のステージ", disabled: g >= maxG, onclick: () => go(1) }, svgIcon(ICONS.right))),
    h("div", { class: "stage-status" },
      !unlocked ? h("span", { class: "chip chip-lock" }, svgIcon(ICONS.lock), `${stageIdOf(g - 1)} をクリアすると遊べます`)
        : clears > 0 ? h("span", { class: "chip chip-ok" }, `クリア ${clears}回`)
          : h("span", { class: "chip chip-new" }, "はじめて")),
    h("div", { class: "bug-row" }, h("span", { class: "bug-row-label" }, "出てくる虫"),
      bugIds.map((b) => h("span", { class: `bug-chip ${BUG_MAP[b]?.boss ? "boss" : ""}` }, BUG_MAP[b]?.name ?? b))),
  );

  const power = h("div", { class: "panel power" },
    h("div", { class: "power-row" },
      h("div", { class: "power-col" }, h("div", { class: "power-k" }, "おすすめ戦力"), h("div", { class: "power-v" }, fmt(need))),
      h("div", { class: `diff diff-${diff.cls}` }, diff.label),
      h("div", { class: "power-col" }, h("div", { class: "power-k" }, "あなたの戦力"), h("div", { class: `power-v pv-${diff.cls}` }, fmt(mine)))),
    h("div", { class: `power-meter pm-${diff.cls}` }, h("div", { class: "pm-fill", style: `width:${Math.min(100, (ratio / 2.5) * 100).toFixed(1)}%` }),
      h("div", { class: "pm-mark", style: `left:${(100 / 2.5).toFixed(1)}%` })),
  );

  const rwRow = (icon: string, label: string, value: string, cls = "") =>
    h("div", { class: `rw ${cls}` }, svgIcon(icon, "rw-ico"), h("div", { class: "rw-k" }, label), h("div", { class: "rw-v" }, value));
  const rewards = h("div", { class: "panel rewards" },
    h("div", { class: "panel-title" }, "もらえるもの"),
    h("div", { class: "rw-grid" },
      rwRow(ICONS.exp, "経験値", fmt(Math.round(rw.exp * (1 + rel.exp)))),
      rwRow(ICONS.coin, "お金", fmt(Math.round(rw.coins * (1 + rel.coins)))),
      rwRow(ICONS.relic, "レリック", firstClear ? fmt(rw.relicPoints) : "クリアずみ", firstClear ? "rw-first" : "rw-done"),
      rwRow(ICONS.equipBox, "装備", `×${(rw.equipDrops * (1 + rel.drop)).toFixed(rel.drop ? 1 : 0)}`),
      rwRow(ICONS.shard, "かけら", `×${(rw.objectDrops * (1 + rel.drop)).toFixed(rel.drop ? 1 : 0)}`),
    ),
    firstClear ? h("div", { class: "rw-note" }, "はじめてのクリアでレリックポイントがもらえます") : null,
  );

  const slots: HTMLElement[] = [];
  for (let i = 0; i < MAX_LOADOUT; i++) {
    const oid = save.loadout[i];
    const def = oid ? OBJECT_MAP[oid] : undefined;
    slots.push(def
      ? h("div", { class: `lo-obj r-${def.rarity}` }, svgIcon(objectSvg(def.id, def.kind)), h("span", { class: "lo-lv" }, `Lv${save.objects[def.id]?.level ?? 1}`))
      : h("div", { class: "lo-obj empty" }, "なし"));
  }
  const party = h("div", { class: "panel party" },
    h("div", { class: "panel-title" }, "いっしょに戦う"),
    h("div", { class: "party-row" },
      h("button", { class: "party-cat", onclick: () => ctx.goTab("grow", "char") },
        svgIcon(catSvg(save.selectedChar), "party-cat-ico"),
        h("div", { class: "party-cat-name" }, charDef?.name ?? "?"),
        h("div", { class: "party-cat-sub" }, `Lv${cs?.level ?? 1}・${charDef ? ROLE_NAMES[charDef.role] : ""}`)),
      h("button", { class: "party-objs", "aria-label": "オブジェクトを選ぶ", onclick: () => ctx.goTab("grow", "obj") }, slots)),
  );

  const playBtn = h("button", {
    class: `btn btn-play ${unlocked ? "" : "is-off"}`, disabled: !unlocked,
    onclick: () => ctx.play(id),
  }, unlocked ? "プレイ" : "まだ遊べません");

  return h("div", { class: "tab tab-main" },
    h("div", { class: "scroll", dataset: { sk: "main" } }, header, power, rewards, party),
    h("div", { class: "main-foot" },
      h("div", { class: "mama-line" }, svgIcon(ICONS.mama, "mama-ico"), h("span", null, firstClear ? "ママを虫から守ってね！" : "もう一度あそんで、強くなろう")),
      playBtn),
  );
}
