// 成長 > キャラ（うちの子・家族の一覧・パーティ・くわしく・わざをつける）。
import {
  bondToNext, catPower, catRole, equipWaza, expToNext, heroUid, mainWazaOf, partyUids, removeCat, resolveCat, setParty,
  MAX_CHAR_LEVEL,
} from "../core/progress";
import { fmt } from "../core/num";
import { MAX_CATS, PARTY_SIZE, type CatSave, type SaveData } from "../core/save";
import type { ResolvedChar } from "../core/types";
import { CHAR_MAP, MAX_BOND } from "../data/chars";
import { PERSONALITY_MAP } from "../data/personality";
import { MAIN_WAZAS, MAX_SUBS, RARITY_RANK, SUB_WAZAS, WAZA_MAP, type WazaDef, wazaText } from "../data/waza";
import type { Ctx } from "./ctx";
import { bar, fmtS, h, svgIcon } from "./dom";
import { ICONS, PEN_ICON, PLUS_ICON } from "./icons";
import { catIcon } from "./cafe";
import { bondHearts, rarityPill, roleTag, wazaIcon, wazaStars } from "./parts";
import { openAddCat, openEditCat } from "./cat-form";

const SLOT_NAMES = ["主人公", "相棒1", "相棒2"];

/** パーティの何番目か（いなければ -1）。 */
export function partySlotOf(save: SaveData, uid: string): number {
  return partyUids(save).indexOf(uid);
}

/** 一覧の並び: パーティの順 → レベルの高い順 → 登録の順。 */
function sortedCats(save: SaveData): CatSave[] {
  const party = partyUids(save);
  const order = (c: CatSave) => { const i = party.indexOf(c.uid); return i < 0 ? 9 : i; };
  const num = (c: CatSave) => Number(c.uid.slice(1)) || 0;
  return Object.values(save.cats).sort((a, b) => order(a) - order(b) || b.level - a.level || num(a) - num(b));
}

// ================= 一覧 =================

export function renderCharList(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const cats = sortedCats(save);
  const party = partyUids(save);
  const n = cats.length;

  const slots = [];
  for (let i = 0; i < PARTY_SIZE; i++) {
    const uid = party[i];
    const c = uid ? save.cats[uid] : undefined;
    slots.push(c
      ? h("button", { class: `pt-slot ${i === 0 ? "hero" : "mate"}`, onclick: () => openCatDetail(ctx, c.uid) },
        h("span", { class: "pt-k" }, SLOT_NAMES[i]),
        catIcon(c.look, "pt-ico"),
        h("span", { class: "pt-name" }, c.name),
        h("span", { class: "pt-sub" }, roleTag(catRole(save, c.uid)), h("b", null, `Lv${c.level}`)))
      : h("button", { class: "pt-slot empty", onclick: () => openPartyPicker(ctx, i as 1 | 2) },
        h("span", { class: "pt-k" }, SLOT_NAMES[i]),
        h("span", { class: "pt-plus" }, svgIcon(PLUS_ICON)),
        h("span", { class: "pt-name muted" }, n > party.length ? "相棒をえらぶ" : "猫をふやそう")));
  }

  const cards = cats.map((c) => {
    const slot = party.indexOf(c.uid);
    const w = mainWazaOf(save, c.uid);
    return h("button", { class: `card cat-card ${slot === 0 ? "is-hero" : slot > 0 ? "is-mate" : ""}`, onclick: () => openCatDetail(ctx, c.uid) },
      slot >= 0 ? h("span", { class: `pt-tag ${slot === 0 ? "hero" : "mate"}` }, SLOT_NAMES[slot]) : null,
      roleTag(w.role!, "cc-role"),
      catIcon(c.look, "card-ico"),
      h("div", { class: "card-name" }, c.name),
      h("div", { class: "card-lv" }, `Lv ${c.level}`),
      bondHearts(c.bond, "bond-sm"),
      h("div", { class: `cc-waza wr-${w.rarity}` }, h("span", { class: `cc-wr rp-${w.rarity}` }, w.rarity), h("span", { class: "cc-wn" }, w.name)));
  });

  return h("div", { class: "sub sub-char" },
    h("div", { class: "scroll", dataset: { sk: "chars" } },
      h("div", { class: "panel pt-panel" },
        h("div", { class: "pt-head" },
          h("span", { class: "panel-title" }, "パーティ"),
          h("span", { class: "muted small" }, "主人公はスティックで、相棒は自分で戦うよ")),
        h("div", { class: "pt-slots" }, slots)),
      h("div", { class: "sub-head sub-head-in" },
        h("span", null, "うちの子・家族", h("span", { class: "muted small fam-n" }, ` ${n} / ${MAX_CATS}`)),
        h("button", {
          class: `btn btn-small ${n >= MAX_CATS ? "btn-gray is-off" : "btn-green"} add-cat`, disabled: n >= MAX_CATS,
          onclick: () => openAddCat(ctx, (uid) => openCatDetail(ctx, uid)),
        }, h("span", { class: "add-cat-in" }, svgIcon(PLUS_ICON), "うちの子を追加"))),
      h("div", { class: "grid grid-3 cat-grid" }, cards)));
}

/** 空いている相棒の枠に入れる猫をえらぶ。 */
function openPartyPicker(ctx: Ctx, slot: 1 | 2): void {
  const m = ctx.modals.open({
    title: "相棒をえらぶ",
    cls: "modal-picker",
    render: () => {
      const save = ctx.save;
      const party = partyUids(save);
      const list = sortedCats(save).filter((c) => !party.includes(c.uid));
      if (!list.length) {
        return h("div", { class: "empty-msg" }, "ほかの猫がいません。", h("br"), "「うちの子を追加」で、猫を登録してね。");
      }
      return h("div", { class: "pk-cats" }, list.map((c) => {
        const w = mainWazaOf(save, c.uid);
        return h("button", {
          class: "pk-cat", onclick: () => {
            const r = setParty(ctx.save, slot, c.uid);
            if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
            m.close(); ctx.commit(); ctx.toast(`${c.name}が相棒になりました`);
          },
        },
          catIcon(c.look, "pk-cat-ico"),
          h("span", { class: "pk-cat-main" },
            h("span", { class: "pk-cat-name" }, c.name, h("b", null, ` Lv${c.level}`)),
            h("span", { class: "pk-cat-sub" }, roleTag(w.role!), rarityPill(w.rarity, "rp-sm"), h("span", { class: "pk-cat-wn" }, w.name))),
          h("span", { class: "pk-go" }, "えらぶ"));
      }));
    },
  });
}

// ================= くわしく =================

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

/** わざの枠（メイン・サブ）。 */
function wazaSlot(ctx: Ctx, uid: string, slot: "main" | 0 | 1): HTMLElement {
  const save = ctx.save;
  const c = save.cats[uid];
  const id = slot === "main" ? mainWazaOf(save, uid).id : c.waza.subs[slot];
  const def = id ? WAZA_MAP[id] : undefined;
  const label = slot === "main" ? "メイン" : `サブ${slot + 1}`;
  const open = () => openWazaPicker(ctx, uid, slot);
  if (!def) {
    const locked = slot === 1 && c.waza.subs.length < 1;
    return h("button", { class: `wz-slot empty ${locked ? "dim" : ""}`, onclick: open },
      h("span", { class: "wz-slot-k" }, label),
      h("span", { class: "wz-plus" }, svgIcon(PLUS_ICON)),
      h("span", { class: "wz-empty-t" }, "サブのわざをつける"));
  }
  const lv = save.wazas[def.id]?.level ?? 1;
  return h("button", { class: `wz-slot wr-${def.rarity} ${slot === "main" ? "main" : "wz-subslot"}`, onclick: open },
    h("span", { class: "wz-slot-k" }, label),
    wazaIcon(def),
    h("span", { class: "wz-body" },
      h("span", { class: "wz-line" }, rarityPill(def.rarity, "rp-sm"), h("span", { class: "wz-name" }, def.name), wazaStars(lv)),
      h("span", { class: "wz-eff" }, wazaText(def, lv) || "とくべつな効果なし"),
      slot === "main" && def.role ? h("span", { class: "wz-role" }, roleTag(def.role), h("span", null, "の戦い方")) : null),
    h("span", { class: "wz-change" }, "変える"));
}

export function openCatDetail(ctx: Ctx, uid: string): void {
  if (!ctx.save.cats[uid]) return;
  ctx.modals.open({
    title: "うちの子",
    cls: "modal-tall modal-char modal-cat",
    render: () => {
      const save = ctx.save;
      const c = save.cats[uid];
      if (!c) return h("div", { class: "empty-msg" }, "この猫はもういません");
      const need = expToNext(c.level);
      const slot = partySlotOf(save, uid);
      const isHero = slot === 0;
      const party = partyUids(save);
      const pers = PERSONALITY_MAP[c.personality];
      const preset = c.preset ? CHAR_MAP[c.preset] : undefined;
      const bondMax = c.bond >= MAX_BOND;
      const rc = resolveCat(save, uid);
      const sp = specialRows(rc);

      const pbtn = (label: string, on: boolean, act: () => void, cls = "", off = false) =>
        h("button", { class: `pbtn ${on ? "on" : ""} ${cls}`, disabled: on || off, onclick: act }, label);
      const doParty = (s: 0 | 1 | 2) => {
        const r = setParty(ctx.save, s, uid);
        if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
        ctx.commit();
        const now = partySlotOf(ctx.save, uid);
        ctx.toast(now === 0 ? `${c.name}が主人公になりました` : `${c.name}が相棒になりました`);
      };

      return h("div", { class: "char-detail cat-detail" },
        h("div", { class: "cd-top" },
          h("div", { class: `cd-frame ${isHero ? "fr-hero" : slot > 0 ? "fr-mate" : ""}` }, catIcon(c.look, "cd-ico"),
            slot >= 0 ? h("span", { class: `pt-tag ${isHero ? "hero" : "mate"}` }, SLOT_NAMES[slot]) : null),
          h("div", { class: "cd-info" },
            h("div", { class: "cd-row" },
              h("span", { class: "cd-name" }, c.name),
              h("button", { class: "cd-pen", "aria-label": "プロフィールを変える", onclick: () => openEditCat(ctx, uid) }, svgIcon(PEN_ICON)),
              h("span", { class: "cd-lv" }, `Lv ${c.level}`)),
            h("div", { class: "cd-row" },
              h("span", { class: "pers-pill" }, pers?.name ?? ""),
              roleTag(catRole(save, uid))),
            bar(c.level >= MAX_CHAR_LEVEL ? 1 : c.exp / need, "bar-exp", c.level >= MAX_CHAR_LEVEL ? "MAX" : `経験値 ${fmt(c.exp)} / ${fmt(need)}`),
            h("div", { class: "cd-bond" },
              h("span", { class: "cd-bond-k" }, "なかよし度"),
              bondHearts(c.bond),
              h("span", { class: "cd-bond-n" }, bondMax ? "最大！" : `次まで ${c.bondExp}/${bondToNext(c.bond)}戦`)))),
        h("div", { class: "pbtns" },
          pbtn(isHero ? "主人公" : "主人公にする", isHero, () => doParty(0), "pb-hero"),
          pbtn("相棒1", slot === 1, () => doParty(1), "", isHero && party.length < 2),
          pbtn("相棒2", slot === 2, () => doParty(party.length >= 2 ? 2 : 1), "", (isHero && party.length < 2) || (slot === 1 && party.length < 3)),
          h("button", {
            class: "pbtn pb-off", disabled: slot <= 0,
            onclick: () => { const r = setParty(ctx.save, slot as 1 | 2, null); if (!r.ok) { ctx.toast(r.reason, "ng"); return; } ctx.commit(); ctx.toast("パーティから外しました"); },
          }, "外す")),
        h("div", { class: "cd-scroll" },
          h("div", { class: "panel-title sec-t" }, "わざ", h("span", { class: "muted small" }, "ねこ福袋で覚えたわざを、何匹にでもつけられるよ")),
          h("div", { class: "wz-slots" }, wazaSlot(ctx, uid, "main"), wazaSlot(ctx, uid, 0), wazaSlot(ctx, uid, 1)),
          h("div", { class: "panel-title sec-t" }, "ステータス", h("span", { class: "cd-power" }, "つよさの目安 ", h("b", null, fmt(catPower(save, uid))))),
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
          sp.length ? h("div", null, h("div", { class: "panel-title" }, "特技"), statRows(sp)) : null,
          slot > 0 ? h("div", { class: "muted small cd-note" }, "相棒のときは、攻撃と体力が 60% になります（上は主人公のとき）") : null,
          h("div", { class: "panel-title sec-t" }, "プロフィール"),
          h("div", { class: "cd-passive-box" }, h("b", null, pers?.name ?? ""), h("div", null, pers?.desc ?? "")),
          preset ? h("div", { class: "cd-desc" }, preset.desc) : null,
          h("button", { class: "btn btn-small btn-blue cd-edit", onclick: () => openEditCat(ctx, uid) }, "なまえ・見た目・性格を変える"),
          !isHero ? h("button", {
            class: "btn btn-small btn-gray cd-bye",
            onclick: async () => {
              if (!(await ctx.confirm(`${c.name}とお別れしますか？\nレベルなどは、もとに戻せません。`, "お別れする", true))) return;
              const r = removeCat(ctx.save, uid);
              if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
              ctx.modals.closeTop();
              ctx.commit();
              ctx.toast(`${c.name}、またね`);
            },
          }, "お別れする") : h("div", { class: "muted small cd-note" }, "主人公はお別れできません（先にほかの猫を主人公にしてね）")));
    },
  });
}

// ================= わざをえらぶ =================

function openWazaPicker(ctx: Ctx, uid: string, slot: "main" | 0 | 1): void {
  const isMain = slot === "main";
  const m = ctx.modals.open({
    title: isMain ? "メインのわざ" : `サブのわざ ${slot as number + 1}`,
    cls: "modal-tall modal-picker modal-waza",
    render: () => {
      const save = ctx.save;
      const c = save.cats[uid];
      if (!c) return h("div", { class: "empty-msg" }, "この猫はもういません");
      const all = isMain ? MAIN_WAZAS : SUB_WAZAS;
      const owned = all.filter((w) => save.wazas[w.id])
        .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (save.wazas[b.id].level - save.wazas[a.id].level));
      const cur = isMain ? mainWazaOf(save, uid).id : c.waza.subs[slot as number];
      const other = isMain ? undefined : c.waza.subs[slot === 0 ? 1 : 0];
      const missing = all.length - owned.length;
      const pickOne = (w: WazaDef) => {
        const r = equipWaza(ctx.save, uid, slot, w.id);
        if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
        m.close(); ctx.commit(); ctx.toast(`「${w.name}」をつけました`);
      };
      return h("div", { class: "wp" },
        h("div", { class: "wp-note" }, isMain
          ? "メインのわざで、戦い方（役割）が決まるよ。その役割のスキルツリーが効きます。"
          : `サブのわざは1匹に ${MAX_SUBS} つまで。同じわざは1匹に1つだけ。`),
        !isMain && cur ? h("button", {
          class: "wp-row wp-off", onclick: () => {
            const r = equipWaza(ctx.save, uid, slot, null);
            if (!r.ok) { ctx.toast(r.reason, "ng"); return; }
            m.close(); ctx.commit(); ctx.toast("外しました");
          },
        }, h("span", { class: "wz-ico wz-none" }, svgIcon(ICONS.close)), h("span", { class: "wp-body" }, h("span", { class: "wp-name" }, "外す"))) : null,
        owned.map((w) => {
          const lv = save.wazas[w.id].level;
          const on = w.id === cur;
          const dup = w.id === other;
          return h("button", { class: `wp-row wr-${w.rarity} ${on ? "on" : ""} ${dup ? "dup" : ""}`, disabled: on || dup, onclick: () => pickOne(w) },
            wazaIcon(w),
            h("span", { class: "wp-body" },
              h("span", { class: "wp-line" }, rarityPill(w.rarity, "rp-sm"), h("span", { class: "wp-name" }, w.name), wazaStars(lv)),
              w.role ? h("span", { class: "wp-role" }, roleTag(w.role)) : null,
              h("span", { class: "wp-desc" }, w.desc),
              h("span", { class: "wp-eff" }, wazaText(w, lv))),
            on ? h("span", { class: "wp-st on" }, "つけている") : dup ? h("span", { class: "wp-st" }, "もう1つの枠") : null);
        }),
        missing > 0 ? h("button", { class: "wp-more", onclick: () => ctx.goTab("gacha") },
          h("span", null, `まだ覚えていないわざ `, h("b", null, String(missing)), " こ"),
          h("span", { class: "wp-more-go" }, "ねこ福袋へ")) : null);
    },
  });
}
