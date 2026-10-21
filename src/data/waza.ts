// わざ（ねこ福袋で引く）。レアリティは N〜UR。
// メインのわざ（1匹に1つ・必須）: 戦い方（role）・基本の形・倍率・特技を決める。
// サブのわざ（1匹に2つまで）: 特殊効果（スキルと同じステータス）や複合効果（ComboId）。
// わざは「覚えたもの」: 持っていれば何匹にでも同時につけられる。かぶったらレベル +1（最大5、1つにつき効果 +20%）。
import type { CharRole, Rarity, ResolvedChar } from "../core/types";
import { type SkillEffect, type SkillStat, effectsText } from "./skills";

export const RARITIES: Rarity[] = ["N", "R", "SR", "SSR", "UR"];
/** レアリティの順番（N = 0 … UR = 4）。 */
export const RARITY_RANK: Record<Rarity, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4 };
/** メインのわざのレアリティで、基本の体力・攻撃に掛ける倍率。 */
export const RARITY_MUL: Record<Rarity, number> = { N: 1, R: 1.2, SR: 1.45, SSR: 1.75, UR: 2.1 };

/** レベル1の基本ステータス（倍率・なかよし度を掛ける前）。 */
export type CharBase = Omit<ResolvedChar, "id" | "name" | "look" | "role" | "companion" | "combos">;

/** 特殊技能はなし（0）の基本形。 */
export const SPECIAL0: Pick<CharBase,
  "crit" | "critMul" | "multiHit" | "lifesteal" | "regen" | "knockback" | "poison" | "slowHit" | "pierce" | "kibbleBonus" |
  "objectAura" | "repair" | "reviveHp" | "dodge"> = {
  crit: 0, critMul: 1.5, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slowHit: 1, pierce: 0,
  kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 0.5, dodge: 0,
};

/** 基本の形（メインのわざで変えられるところ）。 */
export type CharShape = Pick<CharBase, "maxHp" | "atk" | "atkInterval" | "range" | "aoe" | "moveSpeed" | "restTime" | "armor">;

/** 役割ごとの基本の形。 */
export const ROLE_BASE: Record<CharRole, CharShape> = {
  melee: { maxHp: 30, atk: 2, atkInterval: 0.8, range: 0.9, aoe: 0, moveSpeed: 2.5, restTime: 5, armor: 1 },
  ranged: { maxHp: 18, atk: 1.5, atkInterval: 1.0, range: 3, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 1 },
  aoe: { maxHp: 22, atk: 1.2, atkInterval: 1.3, range: 1.2, aoe: 1.0, moveSpeed: 2.2, restTime: 5, armor: 1 },
  fast: { maxHp: 20, atk: 1.3, atkInterval: 0.6, range: 0.9, aoe: 0, moveSpeed: 3.6, restTime: 4, armor: 1 },
};

/** 猫のレベルが1上がるごとに、基本の体力・攻撃に掛ける倍率（どの猫も同じ）。 */
export const CHAR_GROWTH = { hp: 1.12, atk: 1.12 };

export type WazaSlot = "main" | "sub";

export interface WazaDef {
  id: string;
  name: string;
  rarity: Rarity;
  slot: WazaSlot;
  /** メインのわざだけ: 戦い方。 */
  role?: CharRole;
  desc: string;
  /** メインのわざだけ: 役割の基本の形を上書きするところ（レベルでは変わらない）。 */
  shape?: Partial<CharShape>;
  /** 特技（ステータス・複合効果）。わざのレベルで量が ×(1 + 0.2 × (レベル - 1)) になる。 */
  effects: SkillEffect[];
}

/** わざのレベルの上限。 */
export const MAX_WAZA_LEVEL = 5;
/** わざのレベル1つにつき、効果 +20%。 */
export const WAZA_LEVEL_STEP = 0.2;
/** 1匹につけられるサブのわざの数。 */
export const MAX_SUBS = 2;

/** わざのレベルで効果に掛ける倍率。 */
export function wazaLevelMul(level: number): number {
  const L = Math.min(MAX_WAZA_LEVEL, Math.max(1, Math.floor(level)));
  return 1 + WAZA_LEVEL_STEP * (L - 1);
}

type Fx = [SkillStat | `combo:${string}`, number][];

function fx(list: Fx): SkillEffect[] {
  return list.map(([k, per]) => k.startsWith("combo:")
    ? { combo: k.slice(6) as NonNullable<SkillEffect["combo"]>, per }
    : { stat: k as SkillStat, per });
}

function main(id: string, name: string, rarity: Rarity, role: CharRole, desc: string, effects: Fx, shape: Partial<CharShape> = {}): WazaDef {
  return { id, name, rarity, slot: "main", role, desc, shape, effects: fx(effects) };
}
function sub(id: string, name: string, rarity: Rarity, desc: string, effects: Fx): WazaDef {
  return { id, name, rarity, slot: "sub", desc, effects: fx(effects) };
}

export const WAZAS: WazaDef[] = [
  // ======== メイン（近接） ========
  main("nekopunch", "ねこパンチ", "N", "melee", "近くの虫をねこパンチ。当てた虫を少し押しもどす", [["knockback", 0.3]]),
  main("norasodachi", "のら育ち", "N", "melee", "たくましい体。毎秒 体力の 1% 回復", [["regen", 0.01]], { maxHp: 32 }),
  main("dossiri", "どっしり", "R", "melee", "かじられてもへっちゃら。受けるダメージ -15%・押しもどし", [["armor", 0.15], ["knockback", 0.5]], { maxHp: 34 }),
  main("karinomeijin", "狩りの名人", "SR", "melee", "狩りが大好き。会心 10%・会心ダメージ ×2", [["crit", 0.1], ["critMul", 0.5]]),
  main("yaseinokan", "野生のかん", "SSR", "melee", "野生の血がさわぐ。会心 20%・会心ダメージ ×2・ボスに強い",
    [["crit", 0.2], ["critMul", 0.5], ["combo:bossHunter", 0.2]]),
  main("machinoboss", "町のボス", "UR", "melee", "町いちばんのけんか。吸血・会心・大きく押しもどし、ぶつけてダメージ",
    [["lifesteal", 0.1], ["crit", 0.1], ["knockback", 1], ["combo:knockSlam", 0.5], ["combo:lastStand", 0.3]], { maxHp: 36 }),
  // ======== メイン（遠距離） ========
  main("choichoi", "ちょいちょい", "N", "ranged", "離れたところから、ちょいちょい。当てた虫が少しおそくなる", [["slow", 0.1]]),
  main("neraiuchi", "ねらいうち", "R", "ranged", "じっと狙って、遠くまで届き、虫を1匹つらぬく",
    [["pierce", 1]], { range: 3.5, atkInterval: 1.15, atk: 1.8 }),
  main("jiwajiwa", "じわじわ", "R", "ranged", "引っかき傷がじわじわ効く。毒（攻撃の 20%/秒）", [["poison", 0.2]]),
  main("yokutoorukoe", "よく通る声", "SR", "ranged", "虫を 2 割おそくする・射程 +0.5", [["slow", 0.2]], { range: 3.5 }),
  main("kihin", "気品", "SSR", "ranged", "気品のある一撃。虫を2匹つらぬき、毒・つらぬくほど強く",
    [["pierce", 2], ["poison", 0.3], ["combo:pierceGrow", 0.15]], { range: 3.5 }),
  main("toshinokou", "年の功", "UR", "ranged", "なんでも知っている。オブジェクト +30%・カリカリ +20%・元気に復活・おもちゃと息を合わせる",
    [["aura", 0.3], ["kibble", 0.2], ["revive", 0.3], ["combo:objectSync", 0.2]]),
  // ======== メイン（範囲） ========
  main("fuwafuwa", "ふわふわ", "N", "aoe", "しっぽをぶんぶん、まとめてはらう。虫の攻撃を 5% よける", [["dodge", 0.05]]),
  main("mimamori", "見守り", "R", "aoe", "ごろんと転がってまとめてつぶす。まわりのオブジェクトの攻撃 +10%", [["aura", 0.1]], { aoe: 1.1 }),
  main("ookinakarada", "大きな体", "SR", "aoe", "ゆったり構えて範囲も広い。範囲 +0.3・毎秒 体力の 1% 回復", [["regen", 0.01]], { aoe: 1.3, maxHp: 30 }),
  main("iyashi", "癒やし", "SSR", "aoe", "いるだけで場がなごむ。まわりのオブジェクト +20%・オブジェクトを直す・ママを守る",
    [["aura", 0.2], ["repair", 0.02], ["combo:mamaGuard", 0.2]], { aoe: 1.2 }),
  main("daikaiten", "ねこじゃらし大回転", "UR", "aoe", "ぐるぐる回って、まわりの虫をふきとばす。しょうげき波・ビリビリ毒",
    [["knockback", 0.3], ["slow", 0.1], ["combo:shockwave", 0.5], ["combo:zapVenom", 0.2]], { aoe: 1.4 }),
  // ======== メイン（すばやい） ========
  main("yorunome", "夜の目", "N", "fast", "足が速く、暗いところでも目がきく。会心 5%", [["crit", 0.05]]),
  main("sodachizakari", "育ちざかり", "R", "fast", "走りまわる元気な子。与えたダメージの 5% だけ回復",
    [["lifesteal", 0.05]], { moveSpeed: 3.9, atkInterval: 0.55 }),
  main("chokomaka", "ちょこまか", "SR", "fast", "ちょこまか動いて当たらない。虫の攻撃を 15% よける", [["dodge", 0.15]], { moveSpeed: 3.8 }),
  main("oyatsusagashi", "おやつ探し", "SR", "fast", "おやつのありかを知っている。倒した虫のカリカリ +15%", [["kibble", 0.15]]),
  main("inazumadash", "いなずまダッシュ", "SSR", "fast", "いなずまのように走る。よける・倒すたびノリノリ・よけて反撃",
    [["dodge", 0.08], ["combo:frenzy", 0.05], ["combo:dodgeCounter", 0.5]], { moveSpeed: 4, atkInterval: 0.5 }),
  main("kageboushi", "かげぼうし", "UR", "fast", "影のように速い。連続攻撃 +1・よける・ノリノリ・ねおきダッシュ",
    [["multiHit", 1], ["dodge", 0.1], ["combo:frenzy", 0.08], ["combo:wakeUp", 1.5]], { moveSpeed: 4.2, atkInterval: 0.5 }),

  // ======== サブ ========
  sub("kakurenbo", "かくれんぼ", "N", "さっと隠れる。よける +5%", [["dodge", 0.05]]),
  sub("oyatsunojikan", "おやつの時間", "N", "カリカリ +8%", [["kibble", 0.08]]),
  sub("kezukuroi", "毛づくろい", "N", "毎秒 体力の 0.5% 回復", [["regen", 0.005]]),
  sub("tsumetogi", "つめとぎ", "N", "会心 +3%・攻撃 +5%", [["crit", 0.03], ["atk", 0.05]]),
  sub("shinobiashi", "しのび足", "R", "移動の速さ +10%・よける +3%", [["move", 0.1], ["dodge", 0.03]]),
  sub("omochaban", "おもちゃ番", "R", "まわりのオブジェクトの攻撃 +10%・おもちゃと息を合わせる",
    [["aura", 0.1], ["combo:objectSync", 0.1]]),
  sub("neokidash", "寝起きダッシュ", "R", "休けいから戻ったあと無敵＋攻撃の速さ2倍・戻る体力 +10%",
    [["combo:wakeUp", 2], ["revive", 0.1]]),
  sub("gochisousama", "ごちそうさま", "R", "倒すたび回復・与えたダメージの 2% 回復",
    [["combo:killHeal", 0.02], ["lifesteal", 0.02]]),
  sub("bilibili", "会心ビリビリ", "SR", "会心 +5%・会心で電撃", [["crit", 0.05], ["combo:critChain", 1]]),
  sub("dokunoshippo", "毒のしっぽ", "SR", "毒 +15%・毒の虫への会心 +10%", [["poison", 0.15], ["combo:venomCrit", 0.1]]),
  sub("nakayoshitouch", "なかよしタッチ", "SR", "ほかの猫の近くで攻撃・攻撃の速さ +15%", [["combo:partyLink", 0.15]]),
  sub("mamanosoba", "ママのそばで", "SR", "ママの近くで攻撃 +30%・受けるダメージ -5%",
    [["combo:mamaGuard", 0.3], ["armor", 0.05]]),
  sub("bossnotenteki", "ボスの天敵", "SSR", "ボスへのダメージ +50%・会心 +5%", [["combo:bossHunter", 0.5], ["crit", 0.05]]),
  sub("amattachikara", "あまった力", "SSR", "倒したときの余ったダメージを、となりの虫へ", [["combo:overkill", 0.6], ["atk", 0.05]]),
  sub("fumikomi", "ふみこみ衝撃", "SSR", "押しもどし +0.3・ぶつけてダメージ・範囲でしょうげき波",
    [["knockback", 0.3], ["combo:knockSlam", 1], ["combo:shockwave", 0.3]]),
  sub("inazumanodoku", "いなずまの毒", "UR", "会心 +10%・会心で電撃2回・電撃と範囲に毒",
    [["crit", 0.1], ["combo:critChain", 2], ["combo:zapVenom", 0.5]]),
  sub("ooabare", "大暴れ", "UR", "連続攻撃 +1・倒すたびノリノリ・カリカリでやる気・最後の一撃が範囲に",
    [["multiHit", 1], ["combo:frenzy", 0.08], ["combo:kibbleFever", 0.08], ["combo:multiEcho", 1]]),
];

export const WAZA_MAP: Record<string, WazaDef> = Object.fromEntries(WAZAS.map((w) => [w.id, w]));
export const MAIN_WAZAS = WAZAS.filter((w) => w.slot === "main");
export const SUB_WAZAS = WAZAS.filter((w) => w.slot === "sub");

/** はじめから持っているわざ（近接の「ねこパンチ」と、遠距離の「ちょいちょい」）。 */
export const STARTER_WAZAS = ["nekopunch", "choichoi"];
/** 新しくお迎えした・登録した猫のメインのわざ（はじめ）。 */
export const DEFAULT_MAIN_WAZA = "nekopunch";

/** わざの効果の説明（レベルを掛けた量）。 */
export function wazaText(def: WazaDef, level = 1): string {
  return effectsText(def.effects, wazaLevelMul(level));
}
