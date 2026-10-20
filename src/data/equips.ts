// 装備（頭・首・胴体）と、装備につく補正（アフィックス）。
import type { ObjectKind } from "../core/types";
import { type Rng, pick, pickWeighted, randRange } from "../core/rng";

export type EquipSlot = "head" | "neck" | "body";
export const EQUIP_SLOTS: EquipSlot[] = ["head", "neck", "body"];
export const SLOT_NAMES: Record<EquipSlot, string> = { head: "頭", neck: "首", body: "胴体" };

/** 0..4 = N, R, SR, SSR, UR */
export type EquipRarity = 0 | 1 | 2 | 3 | 4;
export const MAX_EQUIP_RARITY = 4;
export const EQUIP_RARITY_NAMES = ["N", "R", "SR", "SSR", "UR"] as const;

/** 基本ステータスに掛けるレアリティの倍率。 */
export const EQUIP_RARITY_MUL = [1, 3, 10, 30, 100];
/** 強くなる系の補正（攻撃%・体力%・生産%）に掛ける倍率。 */
export const AFFIX_BIG_MUL = [1, 2, 4, 8, 16];
/** 間隔・コスト・移動など、上限のある補正に掛ける倍率。 */
export const AFFIX_SMALL_MUL = [1, 1.3, 1.6, 2, 2.5];

export interface EquipDef {
  id: string;
  name: string;
  slot: EquipSlot;
  desc: string;
  /** 猫の攻撃・体力への補正（N のとき。+0.15 なら +15%）。レアリティ倍率を掛けて使う。 */
  base: { atk: number; hp: number };
}

export const EQUIPS: EquipDef[] = [
  { id: "mugiwara", name: "麦わら帽子", slot: "head", desc: "夏のおさんぽに。", base: { atk: 0.15, hp: 0.1 } },
  { id: "knit", name: "ニット帽", slot: "head", desc: "耳までぽかぽか。", base: { atk: 0.08, hp: 0.2 } },
  { id: "katyusha", name: "リボンのカチューシャ", slot: "head", desc: "ママがつけてくれた。", base: { atk: 0.12, hp: 0.14 } },
  { id: "kubiwa", name: "首輪", slot: "neck", desc: "名前入りのタグつき。", base: { atk: 0.1, hp: 0.15 } },
  { id: "suzu", name: "鈴", slot: "neck", desc: "ちりんちりん。どこにいるかすぐわかる。", base: { atk: 0.18, hp: 0.05 } },
  { id: "ribbon", name: "リボン", slot: "neck", desc: "おめかし用。", base: { atk: 0.12, hp: 0.12 } },
  { id: "bandana", name: "バンダナ", slot: "neck", desc: "ちょっとワイルド。", base: { atk: 0.16, hp: 0.08 } },
  { id: "haramaki", name: "腹巻き", slot: "body", desc: "おなかを冷やさない。", base: { atk: 0.05, hp: 0.25 } },
  { id: "sweater", name: "セーター", slot: "body", desc: "毛糸でもこもこ。", base: { atk: 0.1, hp: 0.2 } },
  { id: "harness", name: "ハーネス", slot: "body", desc: "おでかけの準備ばっちり。", base: { atk: 0.15, hp: 0.1 } },
];

export const EQUIP_MAP: Record<string, EquipDef> = Object.fromEntries(EQUIPS.map((e) => [e.id, e]));

// ---- 補正（アフィックス） ----

export type AffixStat =
  | "objAtk"       // オブジェクトの攻撃 +%（kind があればその種類だけ）
  | "objInterval"  // オブジェクトの間隔 -%
  | "objCost"      // 置くカリカリ -%
  | "objHp"        // オブジェクトの体力 +%
  | "produce"      // producer の生産 +%
  | "charAtk"      // 猫の攻撃 +%
  | "charHp"       // 猫の体力 +%
  | "charMove";    // 猫の移動 +%

export interface AffixDef {
  id: string;
  stat: AffixStat;
  kind?: ObjectKind;
  /** 表示用。{v} が数値（%）になる。 */
  label: string;
  min: number;
  max: number;
  scale: "big" | "small";
  weight: number;
}

export const AFFIXES: AffixDef[] = [
  { id: "objAtk", stat: "objAtk", label: "全オブジェクトの攻撃 +{v}%", min: 0.08, max: 0.15, scale: "big", weight: 10 },
  { id: "objAtk_shooter", stat: "objAtk", kind: "shooter", label: "うつ物の攻撃 +{v}%", min: 0.15, max: 0.3, scale: "big", weight: 6 },
  { id: "objAtk_aoe", stat: "objAtk", kind: "aoe", label: "まとめて系の攻撃 +{v}%", min: 0.15, max: 0.3, scale: "big", weight: 5 },
  { id: "objAtk_mine", stat: "objAtk", kind: "mine", label: "わなの攻撃 +{v}%", min: 0.2, max: 0.4, scale: "big", weight: 4 },
  { id: "objAtk_slow", stat: "objAtk", kind: "slow", label: "おそくする物の攻撃 +{v}%", min: 0.2, max: 0.4, scale: "big", weight: 3 },
  { id: "objInterval", stat: "objInterval", label: "オブジェクトの間隔 -{v}%", min: 0.03, max: 0.06, scale: "small", weight: 6 },
  { id: "objInterval_shooter", stat: "objInterval", kind: "shooter", label: "うつ物の間隔 -{v}%", min: 0.05, max: 0.1, scale: "small", weight: 4 },
  { id: "objCost", stat: "objCost", label: "置くカリカリ -{v}%", min: 0.03, max: 0.06, scale: "small", weight: 6 },
  { id: "objHp", stat: "objHp", label: "オブジェクトの体力 +{v}%", min: 0.1, max: 0.2, scale: "big", weight: 6 },
  { id: "produce", stat: "produce", label: "カリカリの生産 +{v}%", min: 0.1, max: 0.2, scale: "big", weight: 5 },
  { id: "charAtk", stat: "charAtk", label: "猫の攻撃 +{v}%", min: 0.08, max: 0.15, scale: "big", weight: 10 },
  { id: "charHp", stat: "charHp", label: "猫の体力 +{v}%", min: 0.1, max: 0.2, scale: "big", weight: 8 },
  { id: "charMove", stat: "charMove", label: "猫の移動 +{v}%", min: 0.03, max: 0.06, scale: "small", weight: 5 },
];

export const AFFIX_MAP: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** 装備についている補正1つ。value は割合（0.12 = 12%）。 */
export interface EquipAffix {
  id: string;
  value: number;
}

/** 手持ちの装備1つ。 */
export interface EquipItem {
  uid: string;
  defId: string;
  slot: EquipSlot;
  rarity: EquipRarity;
  affixes: EquipAffix[];
}

/** レアリティごとの補正の数（rarity+1、最大5）。 */
export function affixCount(rarity: number): number {
  return Math.min(5, rarity + 1);
}

/** 補正を1つ抽選する（同じ id は重ならないように）。 */
export function rollAffix(rng: Rng, rarity: number, exclude: string[] = []): EquipAffix {
  const pool = AFFIXES.filter((a) => !exclude.includes(a.id));
  const a = pickWeighted(rng, pool.length ? pool : AFFIXES, (x) => x.weight);
  const mul = (a.scale === "big" ? AFFIX_BIG_MUL : AFFIX_SMALL_MUL)[rarity] ?? 1;
  const v = randRange(rng, a.min, a.max) * mul;
  return { id: a.id, value: Math.round(v * 1000) / 1000 };
}

/** 装備を1つ作る（defId を省くとその枠からランダム）。uid は呼ぶ側が決める。 */
export function rollEquip(rng: Rng, uid: string, rarity: EquipRarity, slot?: EquipSlot, defId?: string): EquipItem {
  const s = slot ?? (defId ? EQUIP_MAP[defId].slot : pick(rng, EQUIP_SLOTS));
  const def = defId ? EQUIP_MAP[defId] : pick(rng, EQUIPS.filter((e) => e.slot === s));
  const affixes: EquipAffix[] = [];
  for (let i = 0; i < affixCount(rarity); i++) {
    affixes.push(rollAffix(rng, rarity, affixes.map((x) => x.id)));
  }
  return { uid, defId: def.id, slot: def.slot, rarity, affixes };
}

/** 補正の表示用の文字。 */
export function affixText(a: EquipAffix): string {
  const def = AFFIX_MAP[a.id];
  if (!def) return "？";
  const pct = Math.round(a.value * 1000) / 10;
  return def.label.replace("{v}", String(pct));
}

/** 装備の基本ステータス（攻撃・体力の % 補正）。 */
export function equipBaseStats(item: EquipItem): { atk: number; hp: number } {
  const def = EQUIP_MAP[item.defId];
  if (!def) return { atk: 0, hp: 0 };
  const m = EQUIP_RARITY_MUL[item.rarity] ?? 1;
  return { atk: def.base.atk * m, hp: def.base.hp * m };
}
