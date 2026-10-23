// メイン（ステージを選ぶ）。
import {
  FIRST_CLEAR_CHURU_MUL, buildLoadout, nextEndlessReward, catRole, estimateDps, heroUid, isStageUnlocked, mainWazaOf, nextStageId, partyUids,
  relicBonus, setParty, stageById, stageIndexOf, stageLoad, STAGES,
} from "../core/progress";
import { fmt } from "../core/num";
import { OBJECT_MAP } from "../data/objects";
import { CHAPTER_NAMES, stageIdOf } from "../data/stages";
import { MAX_LOADOUT, PARTY_SIZE, writeSave } from "../core/save";
import type { Ctx } from "./ctx";
import { h, svgIcon } from "./dom";
import { ICONS, PLUS_ICON, objectSvg } from "./icons";
import { rarityPill, roleTag } from "./parts";
import { openCatDetail } from "./grow-char";
import { openRanking } from "./ranking";
import { renderCafe, catIcon } from "./cafe";

/** 戦力の目安（DPS を見やすい数にしたもの）。 */
const POWER_SCALE = 10;
/** おすすめ戦力は「目安の計算でこのくらいあれば、本物の戦闘でもまず勝てる」倍率（ボットの戦闘で合わせた）。 */
const REC_MARGIN = 2;

/** エンドレスが遊べるようになる、クリアしたステージの通し番号（1-5）。 */
const ENDLESS_UNLOCK = 4;

export function difficultyOf(ratio: number): { label: string; cls: string } {
  if (ratio >= 1.6) return { label: "楽勝", cls: "easy" };
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
  const need = (load.totalHp / load.duration) * POWER_SCALE * REC_MARGIN;
  const mine = estimateDps(lo).total * POWER_SCALE;
  const ratio = need > 0 ? mine / need : 0;
  const diff = difficultyOf(ratio);
  const firstClear = g > save.cleared;
  const rel = relicBonus(save);
  const rw = stage.rewards;
  const boss = stage.index === 10;
  const clears = save.clearCounts[id] ?? 0;

  const party = partyUids(save);
  const hero = heroUid(save);
  const cs = save.cats[hero];
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
  const catSlots: HTMLElement[] = [];
  for (let i = 0; i < PARTY_SIZE; i++) {
    const c = party[i] ? save.cats[party[i]] : undefined;
    catSlots.push(c
      ? h("button", { class: `mn-party-cat ${i === 0 ? "hero" : "mate"}`, "aria-label": i === 0 ? `主人公 ${c.name}` : `相棒 ${c.name}`, onclick: () => openCatDetail(ctx, c.uid) },
        catIcon(c.look, "mn-party-cat-ico"), i === 0 ? h("span", { class: "mn-hero-crown" }, svgIcon(ICONS.crown)) : null)
      : h("button", { class: "mn-party-cat empty", "aria-label": "相棒をえらぶ", onclick: () => ctx.goTab("grow", "char") }, svgIcon(PLUS_ICON, "mn-plus")));
  }
  const partyBox = h("div", { class: "mn-party" },
    h("div", { class: "mn-party-cats" }, catSlots),
    h("button", { class: "mn-party-objs", "aria-label": "オブジェクトを選ぶ", onclick: () => ctx.goTab("grow", "obj") },
      h("span", { class: "mn-party-k" }, "もちもの"), slots));

  const playBtn = h("button", {
    class: `btn btn-play ${unlocked ? "" : "is-off"}`, disabled: !unlocked,
    onclick: () => ctx.play(id),
  }, unlocked ? "プレイ" : "まだ遊べません");

  // エンドレス（1-5 をこえたら）とランキング
  const endlessOpen = save.cleared >= ENDLESS_UNLOCK;
  const exNext = nextEndlessReward(save);
  const modeBtns = h("div", { class: "mn-modes" },
    h("button", {
      class: `btn mn-mode ${endlessOpen ? "" : "is-off"}`, disabled: !endlessOpen,
      onclick: () => ctx.playEndless(),
    }, h("b", null, "エンドレス"), h("small", null, endlessOpen ? `記録 ${save.endlessBest}波` : "1-5 クリアで"),
      endlessOpen && exNext ? h("small", { class: "ex-next" }, `${exNext.wave}波でEX`) : null),
    h("button", { class: "btn mn-mode", onclick: () => openRanking(ctx) }, h("b", null, "ランキング"), h("small", null, "みんなの記録")));

  // ---- まん中: 猫カフェ ----
  const onCatTap = (uid: string) => {
    if (uid === heroUid(ctx.save)) { openCatDetail(ctx, uid); return; }
    openCatBubble(ctx, uid);
  };
  const cafe = renderCafe(ctx, onCatTap);

  const plate = h("button", { class: "mn-plate", onclick: () => openCatDetail(ctx, hero) },
    h("span", { class: "mn-plate-name" }, cs?.name ?? "?"),
    h("span", { class: "mn-plate-sub" },
      h("span", { class: "mn-plate-lv" }, `Lv${cs?.level ?? 1}`),
      roleTag(catRole(save, hero)),
      party.length > 1 ? h("span", { class: "mn-plate-mates" }, `+相棒${party.length - 1}`) : null,
      h("span", { class: "mn-plate-pow" }, "戦力 ", h("b", { class: `pv-${diff.cls}` }, fmt(mine)))));

  return h("div", { class: "tab tab-main" },
    cafe,
    stagePanel,
    plate,
    h("div", { class: "mn-foot" }, partyBox, h("div", { class: "mn-playrow" }, playBtn, modeBtns)));
}

/** ほかの猫をタップ: 名前と、パーティに入れるボタン。 */
function openCatBubble(ctx: Ctx, uid: string): void {
  const c = ctx.save.cats[uid];
  if (!c) return;
  const talk = CAT_TALK[Math.floor(Math.random() * CAT_TALK.length)];
  const m = ctx.modals.open({
    cls: "modal-small modal-catpop",
    closeButton: false,
    render: () => {
      const save = ctx.save;
      const w = mainWazaOf(save, uid);
      const slot = partyUids(save).indexOf(uid);
      return h("div", { class: "catpop" },
        catIcon(c.look, "catpop-ico"),
        h("div", { class: "catpop-name" }, c.name),
        h("div", { class: "catpop-sub" }, roleTag(w.role!), h("b", null, `Lv${c.level}`), slot > 0 ? h("span", { class: "pt-tag mate inline" }, `相棒${slot}`) : null),
        h("div", { class: "catpop-wz" }, rarityPill(w.rarity, "rp-sm"), h("span", null, w.name)),
        h("div", { class: "catpop-talk" }, talk));
    },
    footer: () => {
      const save = ctx.save;
      const party = partyUids(save);
      const slot = party.indexOf(uid);
      const canMate = slot < 0 && party.length < PARTY_SIZE;
      return h("div", { class: "foot-row" },
        h("button", { class: "btn btn-gray", onclick: () => { m.close(); openCatDetail(ctx, uid); } }, "くわしく"),
        h("button", {
          class: "btn btn-green", onclick: () => {
            const r = setParty(ctx.save, canMate ? (party.length as 1 | 2) : 0, uid);
            if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
            m.close(); ctx.commit(); ctx.toast(canMate ? `${c.name}が相棒になりました` : `${c.name}が主人公になりました`);
          },
        }, canMate ? "相棒にする" : "主人公にする"));
    },
  });
}

const CAT_TALK = ["にゃ〜ん（なでて）", "ごはんまだかにゃ？", "ママはぼくが守るにゃ", "ねむいにゃ…", "窓の外、なにかいたにゃ！", "あそんでくれるの？"];
