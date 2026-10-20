// オブジェクト（家にある物・猫のおもちゃ）の定義。
import type { ObjectKind, ResolvedObject } from "../core/types";

export type ObjRarity = "N" | "R" | "SR" | "SSR";

export const OBJ_RARITY_ORDER: ObjRarity[] = ["N", "R", "SR", "SSR"];

/** レベル1の基本ステータス。range は届く半径（マス）。shooter は半径の中のいちばん近い虫をねらう。 */
export type ObjectBase = Omit<ResolvedObject, "id" | "name" | "kind">;

export interface ObjectDef {
  id: string;
  name: string;
  kind: ObjectKind;
  desc: string;
  rarity: ObjRarity;
  /** このステージ（通し番号 1〜100）をクリアすると手に入る。0 なら最初から。 */
  unlockStage: number;
  base: ObjectBase;
}

export const KIND_NAMES: Record<ObjectKind, string> = {
  shooter: "うつ",
  wall: "かべ",
  aoe: "まとめて",
  slow: "おそくする",
  producer: "カリカリ",
  mine: "わな",
};

/** レベルが1上がるごとに atk・maxHp に掛ける倍率。 */
export const OBJ_LEVEL_GROWTH = 1.22;

/** producer の生産は、レベル1つにつき +2%（カリカリはインフレしないので、ゆっくり）。 */
export const OBJ_PRODUCE_PER_LEVEL = 0.02;

/** レアリティごとの、レベルアップに使うお金の倍率。 */
export const OBJ_RARITY_COST: Record<ObjRarity, number> = { N: 1, R: 1.5, SR: 2.5, SSR: 4 };

/** ドロップのしやすさ（かけら）。 */
export const OBJ_RARITY_DROP: Record<ObjRarity, number> = { N: 10, R: 7, SR: 4, SSR: 2 };

/** 次のレベルに必要なかけら（10, 15, 20, …）。 */
export function shardsToNext(level: number): number {
  return 10 + 5 * (level - 1);
}

/** 基本ステータスを作る。block を省くと、壁・砲台・範囲・餌皿は通れない（true）、罠とテープは通れる（false）。 */
const B = (
  kind: ObjectKind,
  o: Partial<ObjectBase> & Pick<ObjectBase, "cost" | "maxHp" | "interval" | "cooldown">,
): ObjectBase => ({
  atk: 0, range: 0, slow: 1, produce: 0, upgradeCost: Math.round(o.cost * 0.8), upgradeMul: 1.5,
  block: kind !== "mine" && kind !== "slow", ...o,
});

export const OBJECTS: ObjectDef[] = [
  {
    id: "wagomu", name: "輪ゴム鉄砲", kind: "shooter", rarity: "N", unlockStage: 0,
    desc: "近くの虫に向かって、輪ゴムをぱちん。",
    base: B("shooter", { cost: 20, maxHp: 10, atk: 2, interval: 1.2, range: 2.5, cooldown: 3 }),
  },
  {
    id: "danboru", name: "段ボールの壁", kind: "wall", rarity: "N", unlockStage: 0,
    desc: "虫は通れないので、よけて遠回りする。猫は中に入りたがる。",
    base: B("wall", { cost: 15, maxHp: 40, interval: 1, cooldown: 5 }),
  },
  {
    id: "esara", name: "猫の餌皿", kind: "producer", rarity: "N", unlockStage: 0,
    desc: "ときどきカリカリが出てくる、ふしぎじゃないお皿。",
    base: B("producer", { cost: 25, maxHp: 15, interval: 5, produce: 5, cooldown: 8, upgradeMul: 1.3 }),
  },
  {
    id: "mizudeppo", name: "水鉄砲", kind: "shooter", rarity: "R", unlockStage: 2,
    desc: "ぴゅっぴゅっと連射。猫はちょっと苦手。",
    base: B("shooter", { cost: 30, maxHp: 10, atk: 1.2, interval: 0.5, range: 2, cooldown: 4 }),
  },
  {
    id: "tape", name: "粘着テープ", kind: "slow", rarity: "R", unlockStage: 4,
    desc: "ぺたぺたで虫がのろのろ。",
    base: B("slow", { cost: 25, maxHp: 25, atk: 0.5, interval: 1, range: 0.5, slow: 0.5, cooldown: 5 }),
  },
  {
    id: "nezumitori", name: "ねずみ捕り", kind: "mine", rarity: "R", unlockStage: 7,
    desc: "ふんだ虫をばちん。1回きり。",
    base: B("mine", { cost: 30, maxHp: 1, atk: 15, interval: 1, range: 0.5, cooldown: 6 }),
  },
  {
    id: "soujiki", name: "掃除機", kind: "aoe", rarity: "SR", unlockStage: 10,
    desc: "まわりの虫をまとめてすいこむ。音で猫がにげる。",
    base: B("aoe", { cost: 50, maxHp: 30, atk: 3, interval: 2, range: 1.2, cooldown: 8 }),
  },
  {
    id: "cushion", name: "ふかふかクッション", kind: "wall", rarity: "SR", unlockStage: 15,
    desc: "大きくて虫は通れない。猫のお気に入りの場所。",
    base: B("wall", { cost: 30, maxHp: 120, interval: 1, cooldown: 6 }),
  },
  {
    id: "kirifuki", name: "霧吹き", kind: "slow", rarity: "SR", unlockStage: 18,
    desc: "しゅっしゅっ。まわりの虫をしっとり遅くする。",
    base: B("slow", { cost: 35, maxHp: 20, atk: 1, interval: 1.2, range: 1.5, slow: 0.4, cooldown: 6, block: true }),
  },
  {
    id: "oyatsu", name: "おやつの袋", kind: "producer", rarity: "SR", unlockStage: 24,
    desc: "かさかさ音がすると、カリカリがたくさん。",
    base: B("producer", { cost: 40, maxHp: 20, interval: 6, produce: 12, cooldown: 10, upgradeMul: 1.3 }),
  },
  {
    id: "senpuki", name: "扇風機", kind: "shooter", rarity: "SSR", unlockStage: 32,
    desc: "強い風で、近くの虫をつぎつぎふきとばす。",
    base: B("shooter", { cost: 60, maxHp: 25, atk: 4, interval: 0.6, range: 3, cooldown: 8 }),
  },
  {
    id: "surippa", name: "ママのスリッパ", kind: "aoe", rarity: "SSR", unlockStage: 42,
    desc: "ママの最終兵器。ぱしーん！",
    base: B("aoe", { cost: 70, maxHp: 30, atk: 14, interval: 2.5, range: 1.4, cooldown: 10 }),
  },
];

export const OBJECT_MAP: Record<string, ObjectDef> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));
