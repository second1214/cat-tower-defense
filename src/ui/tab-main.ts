// メイン（ステージを選ぶ）。
import {
  FIRST_CLEAR_CHURU_MUL, buildLoadout, selectChar, estimateDps, isStageUnlocked, nextStageId, relicBonus, stageById, stageIndexOf, stageLoad, STAGES,
} from "../core/progress";
import { fmt } from "../core/num";
import { CHAR_MAP, ROLE_NAMES } from "../data/chars";
import { OBJECT_MAP } from "../data/objects";
import { CHAPTER_NAMES, stageIdOf } from "../data/stages";
import { MAX_LOADOUT, writeSave } from "../core/save";
import type { Ctx } from "./ctx";
import { h, svgIcon } from "./dom";
import { ICONS, objectSvg } from "./icons";
import { rarityPill } from "./gacha";
import { openCharDetail } from "./grow-char";
import { renderCafe, catIcon } from "./cafe";

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

  const charDef = CHAR_MAP[save.selectedChar];
  const cs = save.chars[save.selectedChar];
  const ch = ((stage.chapter - 1) % 5) + 1;

  // ---- 上: ステージ ----
  const chip = (icon: string, value: string, cls = "", title = "") =>
    h("span", { class: `mn-rw ${cls}`, title }, svgIcon(icon, "mn-rw-ico"), h("span", null, value));
  const drop = (n: number) => (n * (1 + rel.drop)).toFixed(rel.drop ? 1 : 0);
  const stagePanel = h("div", { class: `mn-stage ch${ch}` },
    h("div", { class: "mn-row" },
      h("button", { class: "arrow-btn mn-arrow", "aria-label": "前のステージ", disabled: g <= 0, onclick: () => go(-1) }, svgIcon(ICONS.left)),
      h("div", { class: "mn-mid" },
        h("div", { class: "mn-ch" }, `第${stage.chapter}章　${CHAPTER_NAMES[stage.chapter - 1] ?? ""}`),
        h("div", { class: "mn-idrow" },
          h("span", { class: "mn-id" }, id),
          h("span", { class: "mn-name" }, boss ? h("span", { class: "boss-tag" }, "ボス") : null, stage.name))),
      h("button", { class: "arrow-btn mn-arrow", "aria-label": "次のステージ", disabled: g >= maxG, onclick: () => go(1) }, svgIcon(ICONS.right))),
    h("div", { class: "mn-rws" },
      chip(ICONS.exp, fmt(Math.round(rw.exp * (1 + rel.exp))), "", "経験値"),
      chip(ICONS.coin, fmt(Math.round(rw.coins * (1 + rel.coins))), "", "お金"),
      chip(ICONS.churu, fmt(Math.round(rw.churu * (firstClear ? FIRST_CLEAR_CHURU_MUL : 1) * (1 + rel.churu))), firstClear ? "mn-rw-x2" : "", firstClear ? "ちゅ〜る（はじめては2倍）" : "ちゅ〜る"),
      firstClear ? chip(ICONS.relic, fmt(rw.relicPoints), "mn-rw-first", "レリックポイント（はじめてだけ）") : null,
      chip(ICONS.equipBox, `×${drop(rw.equipDrops)}`, "", "装備"),
      chip(ICONS.shard, `×${drop(rw.objectDrops)}`, "", "かけら")),
    h("div", { class: "mn-pow" },
      h("span", { class: "mn-pow-k" }, "おすすめ戦力"),
      h("b", { class: "mn-pow-v" }, fmt(need)),
      h("span", { class: `diff diff-${diff.cls}` }, diff.label),
      h("span", { class: "mn-pow-sp" }),
      !unlocked ? h("span", { class: "chip chip-lock" }, svgIcon(ICONS.lock), `${stageIdOf(g - 1)} をクリア`)
        : clears > 0 ? h("span", { class: "chip chip-ok" }, `クリア ${clears}回`)
          : h("span", { class: "chip chip-new" }, "はじめて")),
  );

  // ---- 下: もちもの・プレイ ----
  const slots: HTMLElement[] = [];
  for (let i = 0; i < MAX_LOADOUT; i++) {
    const oid = save.loadout[i];
    const def = oid ? OBJECT_MAP[oid] : undefined;
    slots.push(def
      ? h("span", { class: `mn-obj r-${def.rarity}` }, svgIcon(objectSvg(def.id, def.kind)), h("span", { class: "mn-obj-lv" }, `${save.objects[def.id]?.level ?? 1}`))
      : h("span", { class: "mn-obj empty" }));
  }
  const party = h("div", { class: "mn-party" },
    h("button", { class: "mn-party-cat", "aria-label": "猫を選ぶ", onclick: () => ctx.goTab("grow", "char") }, catIcon(save.selectedChar, "mn-party-cat-ico")),
    h("button", { class: "mn-party-objs", "aria-label": "オブジェクトを選ぶ", onclick: () => ctx.goTab("grow", "obj") },
      h("span", { class: "mn-party-k" }, "もちもの"), slots));

  const playBtn = h("button", {
    class: `btn btn-play ${unlocked ? "" : "is-off"}`, disabled: !unlocked,
    onclick: () => ctx.play(id),
  }, unlocked ? "プレイ" : "まだ遊べません");

  // ---- まん中: 猫カフェ ----
  const onCatTap = (cid: string) => {
    if (cid === ctx.save.selectedChar) { openCharDetail(ctx, cid); return; }
    openCatBubble(ctx, cid);
  };
  const cafe = renderCafe(ctx, onCatTap);

  const plate = h("button", { class: "mn-plate", onclick: () => openCharDetail(ctx, save.selectedChar) },
    h("span", { class: "mn-plate-name" }, charDef?.name ?? "?"),
    h("span", { class: "mn-plate-sub" },
      h("span", { class: "mn-plate-lv" }, `Lv${cs?.level ?? 1}`),
      charDef ? h("span", { class: `role-tag role-${charDef.role}` }, ROLE_NAMES[charDef.role]) : null,
      h("span", { class: "mn-plate-pow" }, "戦力 ", h("b", { class: `pv-${diff.cls}` }, fmt(mine)))));

  return h("div", { class: "tab tab-main" },
    cafe,
    stagePanel,
    plate,
    h("div", { class: "mn-foot" }, party, playBtn));
}

/** ほかの猫をタップ: 名前と「この子で出撃」。 */
function openCatBubble(ctx: Ctx, cid: string): void {
  const def = CHAR_MAP[cid];
  const cs = ctx.save.chars[cid];
  if (!def || !cs) return;
  const m = ctx.modals.open({
    cls: "modal-small modal-catpop",
    closeButton: false,
    render: () => h("div", { class: "catpop" },
      catIcon(cid, "catpop-ico"),
      h("div", { class: "catpop-name" }, def.name),
      h("div", { class: "catpop-sub" }, rarityPill(def.rarity), h("span", { class: `role-tag role-${def.role}` }, ROLE_NAMES[def.role]), h("b", null, `Lv${cs.level}`)),
      h("div", { class: "catpop-talk" }, CAT_TALK[Math.floor(Math.random() * CAT_TALK.length)])),
    footer: () => h("div", { class: "foot-row" },
      h("button", { class: "btn btn-gray", onclick: () => { m.close(); openCharDetail(ctx, cid); } }, "くわしく"),
      h("button", {
        class: "btn btn-green", onclick: () => {
          selectChar(ctx.save, cid); m.close(); ctx.commit(); ctx.toast(`${def.name}が出撃します`);
        },
      }, "出撃させる")),
  });
}

const CAT_TALK = ["にゃ〜ん（なでて）", "ごはんまだかにゃ？", "ママはぼくが守るにゃ", "ねむいにゃ…", "窓の外、なにかいたにゃ！", "あそんでくれるの？"];
