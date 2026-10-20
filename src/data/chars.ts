// 猫の定義（譲渡会会場でお迎えする猫たち）。スキルツリーは skills.ts。
import type { CharRole, ResolvedChar } from "../core/types";

/** 猫のレアリティ（譲渡会会場で出やすさがちがう）。 */
export type CharRarity = "N" | "R" | "SR" | "SSR" | "UR";
export const CHAR_RARITIES: CharRarity[] = ["N", "R", "SR", "SSR", "UR"];
/** レアリティの順番（N = 0 … UR = 4）。 */
export const RARITY_RANK: Record<CharRarity, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };

/** レアリティごとに、基本の体力・攻撃に掛ける倍率。 */
export const CHAR_RARITY_MUL: Record<CharRarity, number> = { N: 1, R: 1.2, SR: 1.45, SSR: 1.75, UR: 2.1 };

/** レベル1の基本ステータス（レアリティ倍率・なかよし度を掛ける前）。特殊技能は「その猫らしさ」（はじめから持っている）。 */
export type CharBase = Omit<ResolvedChar, "id" | "name" | "role">;

export interface CharDef {
  id: string;
  name: string;
  role: CharRole;
  rarity: CharRarity;
  desc: string;
  /** その猫らしさ（はじめから持っている特技）。中身は base の特殊技能。 */
  passive: { name: string; desc: string };
  base: CharBase;
  /** 1レベルごとに掛ける倍率。 */
  growth: { hp: number; atk: number };
}

export const ROLE_NAMES: Record<CharRole, string> = {
  melee: "近接",
  ranged: "遠距離",
  aoe: "範囲",
  fast: "すばやい",
};

const G = { hp: 1.12, atk: 1.12 };

/** 特殊技能はなし（0）の基本形。 */
const SPECIAL0 = {
  crit: 0, critMul: 1.5, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slowHit: 1, pierce: 0,
  kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 0.5, dodge: 0,
};

/** 役割ごとの基本の形。 */
const ROLE_BASE: Record<CharRole, Pick<CharBase, "maxHp" | "atk" | "atkInterval" | "range" | "aoe" | "moveSpeed" | "restTime" | "armor">> = {
  melee: { maxHp: 30, atk: 2, atkInterval: 0.8, range: 0.9, aoe: 0, moveSpeed: 2.5, restTime: 5, armor: 1 },
  ranged: { maxHp: 18, atk: 1.5, atkInterval: 1.0, range: 3, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 1 },
  aoe: { maxHp: 22, atk: 1.2, atkInterval: 1.3, range: 1.2, aoe: 1.0, moveSpeed: 2.2, restTime: 5, armor: 1 },
  fast: { maxHp: 20, atk: 1.3, atkInterval: 0.6, range: 0.9, aoe: 0, moveSpeed: 3.6, restTime: 4, armor: 1 },
};

function cat(
  id: string, name: string, role: CharRole, rarity: CharRarity, desc: string,
  passive: [string, string], over: Partial<CharBase> = {},
): CharDef {
  return {
    id, name, role, rarity, desc,
    passive: { name: passive[0], desc: passive[1] },
    base: { ...ROLE_BASE[role], ...SPECIAL0, ...over },
    growth: G,
  };
}

export const CHARS: CharDef[] = [
  // ---- N ----
  cat("chatora", "ちゃとら", "melee", "N", "体が大きくてがんじょう。近くの虫をねこパンチ。",
    ["ねこパンチ", "当てた虫を少し押しもどす"], { knockback: 0.3 }),
  cat("mike", "みけ", "ranged", "N", "離れたところから、ちょいちょいと手を出す。",
    ["ちょいちょい", "当てた虫が少しおそくなる"], { slowHit: 0.9 }),
  cat("kuro", "くろ", "fast", "N", "足がとても速い。暗いところでも目がきく。",
    ["夜の目", "会心 5%"], { crit: 0.05 }),
  cat("shiro", "しろ", "aoe", "N", "しっぽをぶんぶん。まわりの虫をまとめてはらう。",
    ["ふわふわ", "虫の攻撃を 5% よける"], { dodge: 0.05 }),
  cat("kijitora", "きじとら", "melee", "N", "元のら猫。たくましくて、けがをしてもすぐ治る。",
    ["のら育ち", "毎秒 体力の 1% 回復"], { regen: 0.01, maxHp: 32 }),
  // ---- R ----
  cat("hachiware", "はちわれ", "melee", "R", "どっしり構えて、かじられてもへっちゃら。",
    ["どっしり", "受けるダメージ -15%・押しもどし"], { armor: 0.85, knockback: 0.5, maxHp: 34 }),
  cat("sabatora", "さばとら", "ranged", "R", "じっと狙って、遠くの虫にぴしっ。",
    ["ねらいうち", "遠くまで届き、虫を1匹つらぬく"], { pierce: 1, range: 3.5, atkInterval: 1.15, atk: 1.8 }),
  cat("komugi", "こむぎ", "fast", "R", "家じゅうを走りまわる元気な子ねこ。",
    ["育ちざかり", "与えたダメージの 5% だけ回復"], { lifesteal: 0.05, moveSpeed: 3.9, atkInterval: 0.55 }),
  cat("omochi", "おもち", "aoe", "R", "もふもふの長い毛。ごろんと転がって虫をまとめてつぶす。",
    ["見守り", "まわりのオブジェクトの攻撃 +10%"], { objectAura: 0.1, aoe: 1.1 }),
  cat("sabi", "さび", "ranged", "R", "まだら模様のおっとりさん。引っかき傷がじわじわ効く。",
    ["じわじわ", "当てた虫に毒（攻撃の 20%/秒）"], { poison: 0.2 }),
  // ---- SR ----
  cat("leo", "レオ", "melee", "SR", "アメリカンショートヘアの男の子。狩りが大好き。",
    ["狩りの名人", "会心 10%・会心ダメージ ×2"], { crit: 0.1, critMul: 2 }),
  cat("luna", "ルナ", "ranged", "SR", "シャムの女の子。よく通る声でおしゃべり。",
    ["よく通る声", "虫を 2 割おそくする・射程 +0.5"], { slowHit: 0.8, range: 3.5 }),
  cat("chibi", "ちび", "fast", "SR", "あしの短いマンチカン。ちょこまか動いて当たらない。",
    ["ちょこまか", "虫の攻撃を 15% よける"], { dodge: 0.15, moveSpeed: 3.8 }),
  cat("kuma", "くま", "aoe", "SR", "メインクーンの大きな子。ゆったり構えて、範囲も広い。",
    ["大きな体", "範囲 +0.3・毎秒 体力の 1% 回復"], { aoe: 1.3, regen: 0.01, maxHp: 30 }),
  cat("sora", "そら", "fast", "SR", "ロシアンブルー。おやつのありかを知っている。",
    ["おやつ探し", "倒した虫のカリカリ +15%"], { kibbleBonus: 0.15 }),
  // ---- SSR ----
  cat("purin", "プリン", "aoe", "SSR", "ラグドールのおっとりさん。いるだけで場がなごむ。",
    ["癒やし", "まわりのオブジェクト +20%・オブジェクトを直す"], { objectAura: 0.2, repair: 0.02, aoe: 1.2 }),
  cat("kotetsu", "こてつ", "melee", "SSR", "ベンガルの男の子。野生の血がさわぐ。",
    ["野生のかん", "会心 20%・会心ダメージ ×2"], { crit: 0.2, critMul: 2 }),
  cat("hime", "ひめ", "ranged", "SSR", "ペルシャのお姫さま。気品のある一撃。",
    ["気品", "虫を2匹つらぬき、毒（30%/秒）"], { pierce: 2, poison: 0.3, range: 3.5 }),
  // ---- UR ----
  cat("taisho", "大将", "melee", "UR", "ご近所のボス猫。けんかの強さは町いちばん。",
    ["町のボス", "吸血 10%・会心 10%・大きく押しもどす"], { lifesteal: 0.1, crit: 0.1, knockback: 1, maxHp: 36 }),
  cat("tama", "たま", "ranged", "UR", "長生きのおばあちゃん猫。なんでも知っている。",
    ["年の功", "オブジェクト +30%・カリカリ +20%・元気に復活"], { objectAura: 0.3, kibbleBonus: 0.2, reviveHp: 0.8 }),
];

export const CHAR_MAP: Record<string, CharDef> = Object.fromEntries(CHARS.map((c) => [c.id, c]));

/** はじめから家にいる猫。 */
export const STARTER_CHARS = ["chatora", "mike"];

/** なかよし度の上限。 */
export const MAX_BOND = 5;
/** なかよし度1つにつき、基本の体力・攻撃 +20%。 */
export const BOND_STAT_PER = 0.2;
