// オブジェクト（家にある物・猫のおもちゃ）の定義。
// 盤面は 14×18 のマス。オブジェクトには大きさ（w×h マス）がある。置くときは左上のマスを指定する。
// range は、オブジェクトの真ん中から測った半径（マス）。
import type { ObjectKind, ResolvedObject } from "../core/types";

/** EX はエンドレスでだけ手に入る（虹色。手に入れたあとは、ストーリーでもかけらが落ちる）。 */
export type ObjRarity = "N" | "R" | "SR" | "SSR" | "EX";

export const OBJ_RARITY_ORDER: ObjRarity[] = ["N", "R", "SR", "SSR", "EX"];

/** レベル1の基本ステータス。range は届く半径（マス）。shooter は半径の中のいちばん近い虫をねらう。 */
export type ObjectBase = Omit<ResolvedObject, "id" | "name" | "kind" | "perks">;

/** 特殊効果でかわる数値。 */
export type PerkStat =
  | "atk" | "interval" | "range" | "maxHp" | "slow" | "produce"
  | "multishot" | "spread" | "pierce" | "splash" | "chain" | "chainRange"
  | "poison" | "poisonSpread" | "knockback" | "crit" | "critMul";

/** 特殊効果1つぶんの変化。add は足す、mul は掛ける（両方あれば add のあと mul）。 */
export interface PerkEffect {
  stat: PerkStat;
  add?: number;
  mul?: number;
}

/** オブジェクトのレベルで解放される特殊効果。 */
export interface ObjectPerk {
  level: number;
  id: string;
  name: string;
  desc: string;
  effects: PerkEffect[];
}

export interface ObjectDef {
  id: string;
  name: string;
  kind: ObjectKind;
  desc: string;
  rarity: ObjRarity;
  /** このステージ（通し番号 1〜100）をクリアすると手に入る。0 なら最初から。 */
  unlockStage: number;
  base: ObjectBase;
  /** レベルで解放される特殊効果（レベルの小さい順）。 */
  perks: ObjectPerk[];
  /** 攻撃に掛けるならし（同じレベルなら、レアリティが高いほど強くなるように。N 1・R 1.5・SR 2.2・SSR 3.2・EX 4.5 倍くらい。おそくする物はその半分）。なければ 1。 */
  power?: number;
}

export const KIND_NAMES: Record<ObjectKind, string> = {
  shooter: "うつ",
  wall: "かべ",
  aoe: "まとめて",
  slow: "おそくする",
  producer: "カリカリ",
  mine: "わな",
  zap: "でんき",
  poison: "どく",
  buff: "つよくする",
};

/** 特殊効果が解放されるレベルの目安。 */
export const PERK_LEVELS = [3, 6, 10, 15, 20, 30, 40, 50];

/** レベルが1上がるごとに atk・maxHp に掛ける倍率。 */
export const OBJ_LEVEL_GROWTH = 1.25;

/** producer の生産は、レベル1つにつき +2%（カリカリはインフレしないので、ゆっくり）。 */
export const OBJ_PRODUCE_PER_LEVEL = 0.02;

/** レアリティごとの、レベルアップに使うお金の倍率。 */
export const OBJ_RARITY_COST: Record<ObjRarity, number> = { N: 1, R: 1.5, SR: 2.5, SSR: 4, EX: 6 };
/** ドロップのしやすさ（かけら）。 */
/** レアリティが低いものばかり育って、高いものが弱いままにならないように、ほぼ同じ（少しだけ高いものが出やすい）。 */
export const OBJ_RARITY_DROP: Record<ObjRarity, number> = { N: 1, R: 1.05, SR: 1.1, SSR: 1.2, EX: 1.2 };

/** ストーリーでは手に入らない（エンドレスで手に入れる）オブジェクトの unlockStage。 */
export const EX_ONLY = 99999;

/** 次のレベルに必要なかけら（10, 15, 20, …）。 */
export function shardsToNext(level: number): number {
  return 10 + 5 * (level - 1);
}

/** 基本ステータスを作る。block を省くと、罠・テープ以外は通れない（true）。特殊効果の数値はふつう 0。 */
const B = (
  kind: ObjectKind,
  o: Partial<ObjectBase> & Pick<ObjectBase, "cost" | "maxHp" | "interval">,
): ObjectBase => ({
  atk: 0, range: 0, slow: 1, produce: 0, cooldown: 0, upgradeCost: Math.round(o.cost * 0.8), upgradeMul: 1.35,
  block: kind !== "mine" && kind !== "slow", w: 1, h: 1,
  multishot: 0, spread: 0, pierce: 0, splash: 0, chain: 0, chainRange: 0, poison: 0, poisonSpread: 0,
  knockback: 0, crit: 0, critMul: 1.5,
  ...o,
});

// 特殊効果を書くための短い道具
const add = (stat: PerkStat, v: number): PerkEffect => ({ stat, add: v });
const mul = (stat: PerkStat, v: number): PerkEffect => ({ stat, mul: v });
const P = (level: number, id: string, name: string, desc: string, ...effects: PerkEffect[]): ObjectPerk =>
  ({ level, id, name, desc, effects });

export const OBJECTS: ObjectDef[] = [
  {
    id: "wagomu", name: "輪ゴム鉄砲", kind: "shooter", rarity: "N", unlockStage: 0,
    desc: "近くの虫に向かって、輪ゴムをぱちん。レベルが上がると何本もまとめて撃てる。",
    base: B("shooter", { cost: 30, maxHp: 12, atk: 2, interval: 1.0, range: 4, w: 2, h: 2 }),
    perks: [
      P(3, "rapid", "連射", "引き金が軽くなる。間隔 -15%", mul("interval", 0.85)),
      P(6, "spread", "拡散", "輪ゴムを3本まとめて。弾 +2", add("multishot", 2), add("spread", 0.5)),
      P(10, "pierce", "貫通", "太い輪ゴムで、虫を1匹つらぬく", add("pierce", 1)),
      P(15, "crit", "会心", "ねらいすまして。会心 15%", add("crit", 0.15)),
      P(20, "spread2", "拡散+", "5本まとめて。弾 +2", add("multishot", 2), add("spread", 0.2)),
      P(30, "burst", "爆ぜる", "当たった輪ゴムがはじけて、まわりの虫にも", add("splash", 0.8)),
      P(40, "rapid2", "連射+", "目にもとまらぬ早撃ち。間隔 -20%", mul("interval", 0.8)),
      P(50, "crit2", "会心+", "会心 +15%・会心の倍率 +1", add("crit", 0.15), add("critMul", 1)),
    ],
  },
  {
    id: "danboru", name: "段ボールの壁", kind: "wall", rarity: "N", unlockStage: 0,
    desc: "虫は通れないので、よけて遠回りする。猫は中に入りたがる。",
    base: B("wall", { cost: 8, maxHp: 40, interval: 1 }),
    perks: [
      P(3, "tape", "ガムテープ補強", "体力 ×1.5", mul("maxHp", 1.5)),
      P(10, "double", "二重段ボール", "体力 ×2", mul("maxHp", 2)),
      P(20, "triple", "三重段ボール", "体力 ×2", mul("maxHp", 2)),
      P(30, "heavy", "本入り段ボール", "中に古い本をつめた。体力 ×2", mul("maxHp", 2)),
      P(50, "fortress", "段ボールの城", "猫の自信作。体力 ×3", mul("maxHp", 3)),
    ],
  },
  {
    id: "esara", name: "猫の餌皿", kind: "producer", rarity: "N", unlockStage: 0,
    desc: "ときどきカリカリが出てくる、ふしぎじゃないお皿。",
    base: B("producer", { cost: 25, maxHp: 15, interval: 5, produce: 5, upgradeMul: 1.3 }),
    perks: [
      P(5, "big", "大盛り", "生産 ×1.25", mul("produce", 1.25)),
      P(15, "auto", "自動給餌器", "間隔 -10%", mul("interval", 0.9)),
      P(25, "big2", "特盛り", "生産 ×1.25", mul("produce", 1.25)),
      P(40, "auto2", "タイマーつき", "間隔 -10%", mul("interval", 0.9)),
      P(60, "big3", "ごちそう", "生産 ×1.3", mul("produce", 1.3)),
    ],
  },
  {
    id: "mizudeppo", name: "水鉄砲", kind: "shooter", rarity: "R", unlockStage: 2,
    power: 1.89,
    desc: "ぴゅっぴゅっと連射。水の勢いで虫をおしもどす。猫はちょっと苦手。",
    base: B("shooter", { cost: 25, maxHp: 10, atk: 1.2, interval: 0.5, range: 3.5 }),
    perks: [
      P(3, "rapid", "連射", "間隔 -15%", mul("interval", 0.85)),
      P(6, "pressure", "水圧", "当たった虫を 0.3 マスおしもどす", add("knockback", 0.3)),
      P(10, "pierce", "貫通", "水がつきぬけて、うしろの虫にも", add("pierce", 1)),
      P(15, "shower", "シャワー", "ノズルを広げる。弾 +1", add("multishot", 1), add("spread", 0.4)),
      P(20, "rapid2", "連射+", "間隔 -20%", mul("interval", 0.8)),
      P(30, "pierce2", "貫通+", "さらに2匹つらぬく", add("pierce", 2)),
      P(40, "shower2", "シャワー+", "弾 +2", add("multishot", 2), add("spread", 0.3)),
      P(50, "jet", "ジェット水流", "攻撃 ×1.5・おしもどし +0.3", mul("atk", 1.5), add("knockback", 0.3)),
    ],
  },
  {
    id: "tape", name: "粘着テープ", kind: "slow", rarity: "R", unlockStage: 4,
    power: 5.56,
    desc: "床にはったテープ。ぺたぺたで虫がのろのろ。上は通れる。",
    base: B("slow", { cost: 12, maxHp: 25, atk: 0.5, interval: 1, range: 0.6, slow: 0.5 }),
    perks: [
      P(3, "sticky", "強い粘着", "もっと遅くなる（速さ ×0.8）", mul("slow", 0.8)),
      P(6, "wide", "幅広テープ", "範囲 +0.3", add("range", 0.3)),
      P(10, "repellent", "防虫剤入り", "くっついた虫に毒", add("poison", 0.5)),
      P(15, "sticky2", "強力粘着", "速さ ×0.8", mul("slow", 0.8)),
      P(20, "hard", "布テープ", "攻撃 ×1.5", mul("atk", 1.5)),
      P(30, "repellent2", "防虫剤たっぷり", "毒 +0.5", add("poison", 0.5)),
      P(40, "wide2", "ぐるぐる巻き", "範囲 +0.3・速さ ×0.85", add("range", 0.3), mul("slow", 0.85)),
      P(50, "spread", "におい移り", "毒で倒れた虫から、まわりの虫に毒がうつる", add("poisonSpread", 0.8)),
    ],
  },
  {
    id: "shitajiki", name: "静電気の下敷き", kind: "zap", rarity: "R", unlockStage: 5,
    power: 2.09,
    desc: "髪の毛でこすった下敷き。ぱちっ！近くの虫から虫へ、静電気が飛びうつる。",
    base: B("zap", { cost: 35, maxHp: 10, atk: 2, interval: 1.4, range: 3, chain: 2, chainRange: 1.8 }),
    perks: [
      P(3, "chain", "連鎖+1", "静電気がもう1匹へ飛びうつる", add("chain", 1)),
      P(6, "rub", "よくこする", "攻撃 ×1.3", mul("atk", 1.3)),
      P(10, "reach", "射程", "届く距離 +1", add("range", 1)),
      P(15, "chain2", "連鎖+1", "飛びうつる数 +1・距離 +0.5", add("chain", 1), add("chainRange", 0.5)),
      P(20, "dry", "冬の乾燥", "ぱちぱち。間隔 -15%", mul("interval", 0.85)),
      P(30, "chain3", "連鎖+2", "飛びうつる数 +2", add("chain", 2)),
      P(40, "crit", "びりっ", "会心 20%・会心の倍率 +1", add("crit", 0.2), add("critMul", 1)),
      P(50, "chain4", "大放電", "飛びうつる数 +2・距離 +0.5", add("chain", 2), add("chainRange", 0.5)),
    ],
  },
  {
    id: "nezumitori", name: "ねずみ捕り", kind: "mine", rarity: "R", unlockStage: 7,
    power: 1.25,
    desc: "ふんだ虫をばちん。1回きり。",
    base: B("mine", { cost: 20, maxHp: 1, atk: 15, interval: 1, range: 0.6 }),
    perks: [
      P(3, "spring", "強いバネ", "攻撃 ×1.3", mul("atk", 1.3)),
      P(6, "blast", "範囲ばちん", "まわり 0.8 マスの虫もまきこむ", add("splash", 0.8)),
      P(10, "crit", "会心", "会心 20%・会心の倍率 +0.5", add("crit", 0.2), add("critMul", 0.5)),
      P(15, "blast2", "範囲ばちん+", "まきこむ範囲 +0.5", add("splash", 0.5)),
      P(20, "spring2", "鋼のバネ", "攻撃 ×1.5", mul("atk", 1.5)),
      P(30, "bounce", "はねとばし", "まきこんだ虫を 0.5 マスおしもどす", add("knockback", 0.5)),
      P(40, "blast3", "特大ねずみ捕り", "まきこむ範囲 +0.7", add("splash", 0.7)),
      P(50, "crit2", "会心+", "会心 +20%・会心の倍率 +1", add("crit", 0.2), add("critMul", 1)),
    ],
  },
  {
    id: "soujiki", name: "掃除機", kind: "aoe", rarity: "SR", unlockStage: 10,
    power: 2.89,
    desc: "まわりの虫をまとめてすいこむ。音で猫がにげる。",
    base: B("aoe", { cost: 60, maxHp: 35, atk: 3, interval: 2, range: 2.2, w: 2, h: 2 }),
    perks: [
      P(3, "wide", "範囲拡大", "長いノズル。範囲 +0.4", add("range", 0.4)),
      P(6, "suck", "吸い込み", "すいよせられて、虫が遅くなる（速さ ×0.7）", mul("slow", 0.7)),
      P(10, "turbo", "強モード", "攻撃 ×1.3", mul("atk", 1.3)),
      P(15, "exhaust", "排気", "当たった虫を 0.5 マスおしもどす", add("knockback", 0.5)),
      P(20, "wide2", "範囲拡大+", "範囲 +0.4", add("range", 0.4)),
      P(30, "cyclone", "サイクロン", "間隔 -20%", mul("interval", 0.8)),
      P(40, "suck2", "吸い込み+", "速さ ×0.7", mul("slow", 0.7)),
      P(50, "max", "最強モード", "攻撃 ×1.5・範囲 +0.4", mul("atk", 1.5), add("range", 0.4)),
    ],
  },
  {
    id: "katorisenko", name: "蚊取り線香", kind: "poison", rarity: "R", unlockStage: 13,
    power: 1.72,
    desc: "うずまきのけむりで、まわりの虫に毒がじわじわ。夏のにおい。",
    base: B("poison", { cost: 35, maxHp: 12, atk: 0.6, interval: 1.5, range: 2.2, poison: 1 }),
    perks: [
      P(3, "strong", "毒強化", "毒 +0.3", add("poison", 0.3)),
      P(6, "wide", "範囲", "けむりが広がる。範囲 +0.4", add("range", 0.4)),
      P(10, "spread", "伝染", "毒で倒れた虫から、まわり 1 マスの虫に毒がうつる", add("poisonSpread", 1)),
      P(15, "double", "2本立て", "間隔 -20%", mul("interval", 0.8)),
      P(20, "strong2", "毒強化+", "毒 +0.5", add("poison", 0.5)),
      P(30, "spread2", "伝染+", "うつる範囲 +0.5", add("poisonSpread", 0.5)),
      P(40, "wide2", "大うずまき", "範囲 +0.5", add("range", 0.5)),
      P(50, "strong3", "猛毒", "毒 +1", add("poison", 1)),
    ],
  },
  {
    id: "cushion", name: "ふかふかクッション", kind: "wall", rarity: "SR", unlockStage: 15,
    desc: "横長で虫は通れない。猫のお気に入りの場所。",
    base: B("wall", { cost: 18, maxHp: 120, interval: 1, w: 2, h: 1 }),
    perks: [
      P(3, "fluffy", "ふかふか", "体力 ×1.5", mul("maxHp", 1.5)),
      P(10, "thick", "ぶあつい", "体力 ×2", mul("maxHp", 2)),
      P(20, "lowres", "低反発", "体力 ×2", mul("maxHp", 2)),
      P(30, "beads", "ビーズクッション", "体力 ×2", mul("maxHp", 2)),
      P(50, "throne", "猫の玉座", "体力 ×3", mul("maxHp", 3)),
    ],
  },
  {
    id: "kirifuki", name: "霧吹き", kind: "slow", rarity: "SR", unlockStage: 18,
    power: 2.52,
    desc: "しゅっしゅっ。まわりの虫をしっとり遅くする。",
    base: B("slow", { cost: 35, maxHp: 20, atk: 1, interval: 1.2, range: 2, slow: 0.4, block: true }),
    perks: [
      P(3, "wide", "広がる霧", "範囲 +0.4", add("range", 0.4)),
      P(6, "wet", "しっとり", "速さ ×0.85", mul("slow", 0.85)),
      P(10, "mint", "ハッカ水", "虫のきらいなハッカ。毒 +0.4", add("poison", 0.4)),
      P(15, "rapid", "連続しゅっしゅっ", "間隔 -15%", mul("interval", 0.85)),
      P(20, "wide2", "広がる霧+", "範囲 +0.4", add("range", 0.4)),
      P(30, "wet2", "びしょびしょ", "速さ ×0.85", mul("slow", 0.85)),
      P(40, "mint2", "濃いハッカ水", "毒 +0.6", add("poison", 0.6)),
      P(50, "spread", "におい移り", "毒で倒れた虫から、まわりの虫に毒がうつる", add("poisonSpread", 0.8)),
    ],
  },
  {
    id: "oyatsu", name: "おやつの袋", kind: "producer", rarity: "SR", unlockStage: 24,
    desc: "かさかさ音がすると、カリカリがたくさん。",
    base: B("producer", { cost: 40, maxHp: 20, interval: 6, produce: 12, upgradeMul: 1.3 }),
    perks: [
      P(5, "big", "大袋", "生産 ×1.25", mul("produce", 1.25)),
      P(15, "rustle", "かさかさ", "間隔 -10%", mul("interval", 0.9)),
      P(25, "big2", "徳用袋", "生産 ×1.25", mul("produce", 1.25)),
      P(40, "rustle2", "かさかさ+", "間隔 -10%", mul("interval", 0.9)),
      P(60, "big3", "箱買い", "生産 ×1.3", mul("produce", 1.3)),
    ],
  },
  {
    id: "moufu", name: "フリース毛布", kind: "zap", rarity: "SR", unlockStage: 28,
    power: 1.7,
    desc: "床に広げた毛布。上を通る虫にぱちぱち静電気。上は通れる。",
    base: B("zap", {
      cost: 60, maxHp: 30, atk: 3, interval: 1.6, range: 2.5, chain: 4, chainRange: 1.5, w: 2, h: 2, block: false,
    }),
    perks: [
      P(3, "chain", "連鎖+1", "飛びうつる数 +1", add("chain", 1)),
      P(6, "reach", "射程", "届く距離 +0.5", add("range", 0.5)),
      P(10, "chain2", "連鎖+2", "飛びうつる数 +2", add("chain", 2)),
      P(15, "rub", "こすれあう", "攻撃 ×1.3", mul("atk", 1.3)),
      P(20, "dry", "冬の乾燥", "間隔 -15%", mul("interval", 0.85)),
      P(30, "chain3", "連鎖+2", "飛びうつる数 +2・距離 +0.5", add("chain", 2), add("chainRange", 0.5)),
      P(40, "reach2", "射程+", "届く距離 +0.5", add("range", 0.5)),
      P(50, "chain4", "大放電", "飛びうつる数 +3", add("chain", 3)),
    ],
  },
  {
    id: "senpuki", name: "扇風機", kind: "shooter", rarity: "SSR", unlockStage: 32,
    power: 0.74,
    desc: "強い風で、虫をまとめてふきとばす。",
    base: B("shooter", { cost: 70, maxHp: 25, atk: 4, interval: 0.6, range: 4.5, pierce: 1, knockback: 0.3, w: 2, h: 2 }),
    perks: [
      P(3, "gust", "強風", "おしもどし +0.3", add("knockback", 0.3)),
      P(6, "swing", "首ふり", "風を広くとばす。弾 +2", add("multishot", 2), add("spread", 0.9)),
      P(10, "high", "「強」", "間隔 -15%", mul("interval", 0.85)),
      P(15, "through", "突風", "風がつきぬける。貫通 +2", add("pierce", 2)),
      P(20, "swing2", "首ふり+", "弾 +2", add("multishot", 2)),
      P(30, "turbo", "ターボ", "攻撃 ×1.5", mul("atk", 1.5)),
      P(40, "typhoon", "台風なみ", "おしもどし +0.5・貫通 +2", add("knockback", 0.5), add("pierce", 2)),
      P(50, "high2", "「強」+", "間隔 -25%", mul("interval", 0.75)),
    ],
  },
  {
    id: "spray", name: "防虫スプレー", kind: "poison", rarity: "SSR", unlockStage: 38,
    power: 0.43,
    desc: "しゅーっ。ママの必需品。かかった虫から、まわりの虫へ毒がうつる。",
    base: B("poison", { cost: 55, maxHp: 15, atk: 2, interval: 1.2, range: 3, poison: 1.5, poisonSpread: 1 }),
    perks: [
      P(3, "strong", "毒強化", "毒 +0.4", add("poison", 0.4)),
      P(6, "spread", "伝染", "うつる範囲 +0.5", add("poisonSpread", 0.5)),
      P(10, "nozzle", "拡散ノズル", "範囲 +0.5", add("range", 0.5)),
      P(15, "rapid", "連続噴射", "間隔 -15%", mul("interval", 0.85)),
      P(20, "spread2", "伝染+", "うつる範囲 +0.5", add("poisonSpread", 0.5)),
      P(30, "strong2", "強力タイプ", "毒 +0.8", add("poison", 0.8)),
      P(40, "nozzle2", "ワイドノズル", "範囲 +0.5", add("range", 0.5)),
      P(50, "pro", "業務用", "毒 +1・うつる範囲 +0.5", add("poison", 1), add("poisonSpread", 0.5)),
    ],
  },
  {
    id: "surippa", name: "ママのスリッパ", kind: "aoe", rarity: "SSR", unlockStage: 42,
    power: 1.22,
    desc: "ママの最終兵器。左右そろってぱしーん！",
    base: B("aoe", { cost: 80, maxHp: 30, atk: 14, interval: 2.5, range: 1.8, crit: 0.1, critMul: 2, w: 2, h: 1 }),
    perks: [
      P(3, "crit", "会心", "会心 +10%", add("crit", 0.1)),
      P(6, "wide", "大ぶり", "範囲 +0.3", add("range", 0.3)),
      P(10, "knock", "はたき飛ばし", "当たった虫を 0.5 マスおしもどす", add("knockback", 0.5)),
      P(15, "combo", "連打", "間隔 -15%", mul("interval", 0.85)),
      P(20, "critMul", "会心+", "会心の倍率 +1", add("critMul", 1)),
      P(30, "wide2", "大ぶり+", "範囲 +0.4", add("range", 0.4)),
      P(40, "combo2", "往復ビンタ", "間隔 -20%", mul("interval", 0.8)),
      P(50, "final", "本気のママ", "会心 +15%・会心の倍率 +1", add("crit", 0.15), add("critMul", 1)),
    ],
  },
  {
    id: "dengen", name: "電源タップ", kind: "buff", rarity: "R", unlockStage: 8,
    desc: "まわりの家電やおもちゃに電気をおくって、攻撃と速さを上げる。自分は攻撃しない。いちばん強い1つだけが効く。",
    base: B("buff", { cost: 35, maxHp: 50, atk: 0, interval: 1, range: 1.5, produce: 0.2, slow: 0.9 }),
    perks: [
      P(3, "wide", "延長コード", "とどく範囲 +0.5", add("range", 0.5)),
      P(6, "power", "たこ足", "攻撃の上乗せ +10%", add("produce", 0.1)),
      P(10, "fast", "高速充電", "速さ ×1.1", mul("slow", 0.92)),
      P(15, "wide2", "長い延長コード", "とどく範囲 +0.5", add("range", 0.5)),
      P(20, "power2", "大容量", "攻撃の上乗せ +15%", add("produce", 0.15)),
      P(30, "fast2", "急速充電", "速さ ×1.15", mul("slow", 0.88)),
      P(40, "power3", "業務用", "攻撃の上乗せ +20%", add("produce", 0.2)),
      P(50, "max", "フル充電", "とどく範囲 +1・攻撃の上乗せ +20%", add("range", 1), add("produce", 0.2)),
    ],
  },
  // ======== エンドレスでだけ手に入る（EX）。unlockStage はストーリーでは来ない数 ========
  {
    id: "laser", name: "レーザーポインター", kind: "shooter", rarity: "EX", unlockStage: EX_ONLY,
    power: 0.36,
    desc: "赤い点がビュンビュン走る。光は虫をまっすぐつらぬく。",
    base: B("shooter", { cost: 45, maxHp: 14, atk: 2.2, interval: 0.3, range: 6, pierce: 4 }),
    perks: [
      P(3, "focus", "しぼる", "攻撃 ×1.3", mul("atk", 1.3)),
      P(6, "twin", "ふたつの点", "光線 +1（ちがう虫をねらう）", add("multishot", 1)),
      P(10, "through", "どこまでも", "貫通 +4", add("pierce", 4)),
      P(15, "crit", "急所を照らす", "会心 15%・×2.5", add("crit", 0.15), add("critMul", 2.5)),
      P(20, "fast", "高速点滅", "間隔 -25%", mul("interval", 0.75)),
      P(30, "prism", "プリズム", "光線 +2（ちがう虫をねらう）", add("multishot", 2)),
      P(40, "max", "最大出力", "攻撃 ×1.6", mul("atk", 1.6)),
      P(50, "rainbow", "虹の光", "貫通 +8・会心 +15%", add("pierce", 8), add("crit", 0.15)),
    ],
  },
  {
    id: "hotcarpet", name: "ホットカーペット", kind: "poison", rarity: "EX", unlockStage: EX_ONLY,
    power: 0.76,
    desc: "上を通る虫はぽかぽか…じわじわ。倒れた虫から熱がうつる。虫は上を通れる。",
    base: B("poison", { cost: 40, maxHp: 60, atk: 1.6, interval: 0.8, range: 1.2, poison: 0.8, poisonSpread: 1.2, slow: 0.8, block: false, w: 2, h: 2 }),
    perks: [
      P(3, "warm", "あったか", "毒 +40%", add("poison", 0.4)),
      P(6, "wide", "ひろがる熱", "範囲 +0.4・うつる距離 +0.5", add("range", 0.4), add("poisonSpread", 0.5)),
      P(10, "slow", "とろける", "虫を 0.8 倍の速さに", mul("slow", 0.8)),
      P(15, "hot", "「強」", "攻撃 ×1.5", mul("atk", 1.5)),
      P(20, "spread", "熱がめぐる", "うつる距離 +0.8", add("poisonSpread", 0.8)),
      P(30, "hotter", "ぽかぽか+", "毒 +80%", add("poison", 0.8)),
      P(40, "max", "最高温度", "攻撃 ×1.6", mul("atk", 1.6)),
      P(50, "sauna", "サウナ", "範囲 +0.6・攻撃 ×1.5", add("range", 0.6), mul("atk", 1.5)),
    ],
  },
  {
    id: "robot", name: "お掃除ロボ", kind: "aoe", rarity: "EX", unlockStage: EX_ONLY,
    power: 1.69,
    desc: "ウィーン。まわりの虫をまとめて吸いこみ、はじきとばす。",
    base: B("aoe", { cost: 60, maxHp: 45, atk: 4, interval: 1.1, range: 2.2, knockback: 0.5, w: 2, h: 2 }),
    perks: [
      P(3, "turbo", "ターボ", "攻撃 ×1.3", mul("atk", 1.3)),
      P(6, "wide", "広い掃除", "範囲 +0.4", add("range", 0.4)),
      P(10, "push", "はじく", "おしもどし +0.5", add("knockback", 0.5)),
      P(15, "fast", "時短モード", "間隔 -20%", mul("interval", 0.8)),
      P(20, "crit", "しつこい汚れ", "会心 15%・×2", add("crit", 0.15), add("critMul", 2)),
      P(30, "wide2", "全部屋モード", "範囲 +0.6", add("range", 0.6)),
      P(40, "max", "強力吸引", "攻撃 ×1.7", mul("atk", 1.7)),
      P(50, "storm", "竜巻", "おしもどし +0.8・攻撃 ×1.4", add("knockback", 0.8), mul("atk", 1.4)),
    ],
  },
  {
    id: "seijouki", name: "空気清浄機", kind: "zap", rarity: "EX", unlockStage: EX_ONLY,
    power: 0.69,
    desc: "プラズマでお部屋まるごときれいに。電気が虫から虫へどこまでも飛ぶ。",
    base: B("zap", { cost: 70, maxHp: 40, atk: 3.5, interval: 0.9, range: 3.5, chain: 6, chainRange: 2.4, w: 2, h: 2 }),
    perks: [
      P(3, "chain", "つながる", "電撃 +3匹", add("chain", 3)),
      P(6, "far", "遠くまで", "飛ぶ距離 +0.6", add("chainRange", 0.6)),
      P(10, "power", "プラズマ", "攻撃 ×1.4", mul("atk", 1.4)),
      P(15, "chain2", "部屋じゅう", "電撃 +5匹", add("chain", 5)),
      P(20, "fast", "自動運転", "間隔 -20%", mul("interval", 0.8)),
      P(30, "crit", "イオン", "会心 15%・×2.5", add("crit", 0.15), add("critMul", 2.5)),
      P(40, "max", "フルパワー", "攻撃 ×1.7", mul("atk", 1.7)),
      P(50, "storm", "いなずま", "電撃 +8匹・飛ぶ距離 +1", add("chain", 8), add("chainRange", 1)),
    ],
  },
];

export const OBJECT_MAP: Record<string, ObjectDef> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));
