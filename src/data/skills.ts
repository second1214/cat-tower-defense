// スキルツリー（役割ごと）。ちゅ〜るで1レベルずつ取る。
// ステータスの枝はレベルつき（例: 攻撃 +10% × Lv1〜10）。特殊技能（会心・毒・吸血 など）も同じしくみ。
// 同じステータスの % はツリー全体で足し算（掛け算にすると強くなりすぎるので）。
// 深い段はコストが高く、猫のレベルが足りないと取れない。いちばん奥は、レアリティの高い猫だけ。
import type { CharRole } from "../core/types";
import { type CharRarity } from "./chars";

export type SkillBranch = "atk" | "def" | "spd" | "tech" | "support";
export const SKILL_BRANCHES: SkillBranch[] = ["atk", "def", "spd", "tech", "support"];
export const BRANCH_NAMES: Record<SkillBranch, string> = {
  atk: "攻撃",
  def: "体力・防御",
  spd: "速さ",
  tech: "技",
  support: "支援",
};

/** スキルでのびるもの。 */
export type SkillStat =
  // 割合でのびる（同じものはノードをまたいで足し算。攻撃 +100% と +150% なら ×3.5）
  | "atk" | "hp" | "atkSpd" | "move" | "objAtk" | "objHp"
  // 割合で減らす（休けい時間・受けるダメージ）
  | "rest" | "armor"
  // そのまま足す
  | "range" | "aoe" | "crit" | "critMul" | "multiHit" | "lifesteal" | "regen" | "knockback" | "poison" | "slow"
  | "pierce" | "kibble" | "aura" | "repair" | "revive" | "dodge";

export interface SkillEffect {
  stat: SkillStat;
  /** 1レベルあたりの量（% は 0.1 = 10%）。 */
  per: number;
}

export interface SkillReq {
  id: string;
  /** このノードがこのレベル以上なら OK。 */
  lv: number;
}

export interface SkillNode {
  id: string;
  role: CharRole;
  name: string;
  /** 1レベルぶんの効果の説明。 */
  desc: string;
  branch: SkillBranch;
  /** 段（0 = 根もと … 7 = いちばん奥）。深いほど高い。 */
  tier: number;
  maxLevel: number;
  /** 先に取っておくスキル（すべて必要）。 */
  req: SkillReq[];
  /** 猫のレベルがこれ以上で取れる。 */
  minCharLevel: number;
  /** この猫のレアリティ以上で取れる（なければ誰でも）。 */
  minRarity?: CharRarity;
  /** Lv0 → Lv1 の基本のちゅ〜る（段の倍率を掛ける前）。 */
  baseCost: number;
  effects: SkillEffect[];
  /** 画面での位置（マスの列・段）。x: 0〜14（枝ごとに3列）、y: 0〜16（下に行くほど深い）。 */
  pos: { x: number; y: number };
}

/** 段ごとの、取るのに必要な猫のレベル。 */
export const TIER_MIN_LEVEL = [1, 3, 8, 15, 25, 40, 60, 80];
/** 段が1つ深くなるごとに、コストに掛ける倍率。 */
export const TIER_COST_MUL = 1.8;
/** ノードのレベルが1上がるごとに、次のコストに掛ける倍率。 */
export const LEVEL_COST_MUL = 1.3;

/** level → level+1 に上げるちゅ〜る。 */
export function nodeCost(node: SkillNode, level: number): number {
  return Math.round(node.baseCost * Math.pow(TIER_COST_MUL, node.tier) * Math.pow(LEVEL_COST_MUL, level));
}

/** Lv0 から level まで上げるのに使ったちゅ〜るの合計。 */
export function nodeTotalCost(node: SkillNode, level: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(level, node.maxLevel); i++) s += nodeCost(node, i);
  return s;
}

const STAT_TEXT: Record<SkillStat, (v: number) => string> = {
  atk: (v) => `攻撃 +${pct(v)}%`,
  hp: (v) => `体力 +${pct(v)}%`,
  atkSpd: (v) => `攻撃の速さ +${pct(v)}%`,
  move: (v) => `移動の速さ +${pct(v)}%`,
  objAtk: (v) => `オブジェクトの攻撃 +${pct(v)}%`,
  objHp: (v) => `オブジェクトの体力 +${pct(v)}%`,
  rest: (v) => `休けい時間 -${pct(v)}%`,
  armor: (v) => `受けるダメージ -${pct(v)}%`,
  range: (v) => `届く距離 +${round2(v)}マス`,
  aoe: (v) => `範囲 +${round2(v)}マス`,
  crit: (v) => `会心 +${pct(v)}%`,
  critMul: (v) => `会心ダメージ +${pct(v)}%`,
  multiHit: (v) => `連続攻撃 +${v}回`,
  lifesteal: (v) => `与えたダメージの ${pct(v)}% 回復`,
  regen: (v) => `毎秒 体力の ${pct(v)}% 回復`,
  knockback: (v) => `押しもどし +${round2(v)}マス`,
  poison: (v) => `毒 +${pct(v)}%（3秒）`,
  slow: (v) => `虫を ${pct(v)}% おそくする`,
  pierce: (v) => `つらぬく +${v}匹`,
  kibble: (v) => `カリカリ +${pct(v)}%`,
  aura: (v) => `まわりのオブジェクトの攻撃 +${pct(v)}%`,
  repair: (v) => `オブジェクトを毎秒 ${pct(v)}% 直す`,
  revive: (v) => `休けいから戻る体力 +${pct(v)}%`,
  dodge: (v) => `よける +${pct(v)}%`,
};

function pct(v: number): string {
  return String(Math.round(v * 1000) / 10);
}
function round2(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** 効果の説明（level を掛けた量）。例: effectText(node, 3) → "攻撃 +30%"。 */
export function effectText(node: SkillNode, level = 1): string {
  return node.effects.map((e) => STAT_TEXT[e.stat](e.per * level)).join("・");
}

// ---- ツリーの組み立て ----

type Fx = [SkillStat, number][];
interface Row {
  k: string;
  b: SkillBranch;
  t: number;
  x: number;
  dy?: number;
  name: string;
  fx: Fx;
  max: number;
  req: [string, number][];
  rar?: CharRarity;
  cost?: number;
}

/** 役割ごとに数字を変えたいところ。 */
type ByRole<T> = Record<CharRole, T>;

function rowsFor(role: CharRole): Row[] {
  const reach: ByRole<number> = { melee: 0.05, ranged: 0.2, aoe: 0.08, fast: 0.05 };
  const kb: ByRole<number> = { melee: 0.15, ranged: 0.08, aoe: 0.1, fast: 0.1 };
  const rows: Row[] = [
    { k: "root", b: "atk", t: 0, x: 7, dy: -1, name: "はじめの一歩", fx: [["atk", 0.05], ["hp", 0.05]], max: 1, req: [], cost: 2 },

    // ===== 攻撃 =====
    { k: "atk1", b: "atk", t: 0, x: 1, name: "つめとぎ", fx: [["atk", 0.1]], max: 10, req: [["root", 1]] },
    { k: "aspd1", b: "atk", t: 1, x: 0, name: "ちょいちょいの練習", fx: [["atkSpd", 0.03]], max: 10, req: [["atk1", 3]] },
    { k: "crit1", b: "atk", t: 1, x: 2, name: "ねらいをさだめる", fx: [["crit", 0.02]], max: 5, req: [["atk1", 3]] },
    { k: "atk2", b: "atk", t: 2, x: 1, name: "つめとぎ・二", fx: [["atk", 0.15]], max: 10, req: [["atk1", 5]] },
    { k: "critm1", b: "atk", t: 2, x: 2, name: "急所をねらう", fx: [["critMul", 0.1]], max: 5, req: [["crit1", 3]] },
    { k: "aspd2", b: "atk", t: 3, x: 0, name: "すばやい一撃", fx: [["atkSpd", 0.04]], max: 10, req: [["aspd1", 5]] },
    { k: "honki", b: "atk", t: 3, x: 1, name: "本気モード", fx: [["atk", 0.1], ["crit", 0.01]], max: 5, req: [["atk2", 3]] },
    { k: "atk3", b: "atk", t: 4, x: 1, name: "つめとぎ・三", fx: [["atk", 0.2]], max: 10, req: [["atk2", 5]] },
    { k: "crit2", b: "atk", t: 5, x: 2, name: "会心の一撃", fx: [["crit", 0.03]], max: 5, req: [["critm1", 3], ["atk3", 1]] },
    { k: "atk4", b: "atk", t: 6, x: 1, name: "つめとぎ・極", fx: [["atk", 0.3]], max: 10, req: [["atk3", 5]] },
    { k: "atkcap", b: "atk", t: 7, x: 0, name: "ひっさつ肉球", fx: [["atk", 0.5]], max: 3, req: [["atk4", 5]], rar: "SR" },
    { k: "critcap", b: "atk", t: 7, x: 2, name: "伝説の一撃", fx: [["crit", 0.05], ["critMul", 0.3]], max: 1, req: [["crit2", 3], ["atk4", 1]], rar: "SSR" },

    // ===== 体力・防御 =====
    { k: "hp1", b: "def", t: 0, x: 4, name: "よく食べる", fx: [["hp", 0.1]], max: 10, req: [["root", 1]] },
    { k: "armor1", b: "def", t: 1, x: 3, name: "ぶあつい毛", fx: [["armor", 0.02]], max: 10, req: [["hp1", 3]] },
    { k: "regen1", b: "def", t: 1, x: 5, name: "毛づくろい", fx: [["regen", 0.002]], max: 5, req: [["hp1", 3]] },
    { k: "hp2", b: "def", t: 2, x: 4, name: "よく食べる・二", fx: [["hp", 0.15]], max: 10, req: [["hp1", 5]] },
    { k: "dodge1", b: "def", t: 2, x: 3, name: "ひらりとかわす", fx: [["dodge", 0.02]], max: 5, req: [["armor1", 3]] },
    { k: "steal1", b: "def", t: 3, x: 5, name: "ごはんのちから", fx: [["lifesteal", 0.02]], max: 5, req: [["regen1", 3]] },
    { k: "revive1", b: "def", t: 3, x: 4, name: "ひるねで元気", fx: [["revive", 0.1]], max: 5, req: [["hp2", 3]] },
    { k: "hp3", b: "def", t: 4, x: 4, name: "よく食べる・三", fx: [["hp", 0.2]], max: 10, req: [["hp2", 5]] },
    { k: "armor2", b: "def", t: 4, x: 3, name: "冬毛", fx: [["armor", 0.02]], max: 10, req: [["armor1", 5]] },
    { k: "regen2", b: "def", t: 5, x: 5, name: "すぐ治る", fx: [["regen", 0.003]], max: 5, req: [["steal1", 2]] },
    { k: "hp4", b: "def", t: 6, x: 4, name: "よく食べる・極", fx: [["hp", 0.3]], max: 10, req: [["hp3", 5]] },
    { k: "defcap", b: "def", t: 7, x: 4, name: "九つの命", fx: [["hp", 0.5], ["armor", 0.05]], max: 3, req: [["hp4", 5], ["armor2", 3]], rar: "SR" },

    // ===== 速さ =====
    { k: "move1", b: "spd", t: 0, x: 7, name: "おさんぽ", fx: [["move", 0.03]], max: 10, req: [["root", 1]] },
    { k: "rest1", b: "spd", t: 1, x: 6, name: "ひるね上手", fx: [["rest", 0.04]], max: 5, req: [["move1", 3]] },
    { k: "aspd3", b: "spd", t: 1, x: 8, name: "はやわざ", fx: [["atkSpd", 0.03]], max: 10, req: [["move1", 3]] },
    { k: "reach1", b: "spd", t: 2, x: 7, name: "のびのび", fx: [["range", reach[role]]], max: 5, req: [["move1", 5]] },
    { k: "rest2", b: "spd", t: 3, x: 6, name: "ねむりが浅い", fx: [["rest", 0.05]], max: 5, req: [["rest1", 3]] },
    { k: "move2", b: "spd", t: 3, x: 8, name: "はしりこみ", fx: [["move", 0.04]], max: 10, req: [["move1", 5]] },
    { k: "aspd4", b: "spd", t: 4, x: 8, name: "はやわざ・二", fx: [["atkSpd", 0.04]], max: 10, req: [["aspd3", 5]] },
    { k: "reach2", b: "spd", t: 5, x: 7, name: "ながい手", fx: [["range", reach[role]]], max: 5, req: [["reach1", 3]] },
    { k: "rest3", b: "spd", t: 6, x: 6, name: "早起き", fx: [["rest", 0.06]], max: 5, req: [["rest2", 3]] },
    { k: "aspd5", b: "spd", t: 6, x: 8, name: "はやわざ・極", fx: [["atkSpd", 0.05]], max: 10, req: [["aspd4", 5]] },
    { k: "spdcap", b: "spd", t: 7, x: 7, name: "つむじ風", fx: [["move", 0.1], ["atkSpd", 0.1]], max: 3, req: [["aspd5", 5], ["move2", 5]], rar: "SR" },

    // ===== 技（共通） =====
    { k: "kb1", b: "tech", t: 0, x: 10, name: "じゃれつき", fx: [["knockback", kb[role]]], max: 5, req: [["root", 1]] },
    { k: "poison1", b: "tech", t: 1, x: 9, name: "かみつき", fx: [["poison", 0.05]], max: 5, req: [["kb1", 2]] },
    { k: "slow1", b: "tech", t: 1, x: 11, name: "おどかす", fx: [["slow", 0.03]], max: 5, req: [["kb1", 2]] },
    { k: "poison2", b: "tech", t: 3, x: 9, name: "しつこくかみつく", fx: [["poison", 0.08]], max: 5, req: [["poison1", 3]] },
    { k: "slow2", b: "tech", t: 3, x: 11, name: "にらみつける", fx: [["slow", 0.04]], max: 5, req: [["slow1", 3]] },
    { k: "steal2", b: "tech", t: 5, x: 9, name: "おいしい虫", fx: [["lifesteal", 0.02]], max: 5, req: [["poison2", 3]] },
    { k: "slow3", b: "tech", t: 5, x: 11, name: "しっぽで通せんぼ", fx: [["slow", 0.04], ["knockback", 0.05]], max: 5, req: [["slow2", 3]] },

    // ===== 支援（オブジェクト・カリカリ） =====
    { k: "kibble1", b: "support", t: 0, x: 13, name: "くいしんぼう", fx: [["kibble", 0.03]], max: 10, req: [["root", 1]] },
    { k: "obj1", b: "support", t: 1, x: 12, name: "おもちゃ好き", fx: [["objAtk", 0.05]], max: 10, req: [["kibble1", 3]] },
    { k: "repair1", b: "support", t: 1, x: 14, name: "おかたづけ", fx: [["repair", 0.005]], max: 5, req: [["kibble1", 3]] },
    { k: "aura1", b: "support", t: 2, x: 13, name: "見守り", fx: [["aura", 0.04]], max: 5, req: [["obj1", 3]] },
    { k: "obj2", b: "support", t: 3, x: 12, name: "おもちゃ好き・二", fx: [["objAtk", 0.08]], max: 10, req: [["obj1", 5]] },
    { k: "repair2", b: "support", t: 3, x: 14, name: "ていねいに直す", fx: [["repair", 0.008]], max: 5, req: [["repair1", 3]] },
    { k: "kibble2", b: "support", t: 4, x: 13, name: "くいしんぼう・二", fx: [["kibble", 0.04]], max: 10, req: [["kibble1", 10]] },
    { k: "objhp1", b: "support", t: 4, x: 14, name: "じょうぶな箱", fx: [["objHp", 0.1]], max: 10, req: [["repair2", 1]] },
    { k: "aura2", b: "support", t: 5, x: 12, name: "見守り・二", fx: [["aura", 0.06]], max: 5, req: [["aura1", 3], ["obj2", 3]] },
    { k: "obj3", b: "support", t: 6, x: 13, name: "おもちゃ好き・極", fx: [["objAtk", 0.12]], max: 10, req: [["obj2", 5]] },
    { k: "supcap", b: "support", t: 7, x: 13, name: "ママの右腕", fx: [["objAtk", 0.2], ["aura", 0.05]], max: 3, req: [["obj3", 5]], rar: "SR" },
  ];

  // ===== 技（役割ごとの得意技） =====
  const tech: ByRole<Row[]> = {
    melee: [
      { k: "kb2", b: "tech", t: 2, x: 10, name: "体当たり", fx: [["knockback", 0.15]], max: 5, req: [["kb1", 3]] },
      { k: "multi1", b: "tech", t: 4, x: 10, name: "二段パンチ", fx: [["multiHit", 1]], max: 1, req: [["kb2", 3]], rar: "SR", cost: 30 },
      { k: "guard", b: "tech", t: 6, x: 10, name: "ボスの貫禄", fx: [["atk", 0.2], ["hp", 0.2]], max: 5, req: [["kb2", 5]], rar: "SR" },
      { k: "techcap", b: "tech", t: 7, x: 10, name: "町いちばんのけんか", fx: [["multiHit", 1]], max: 1, req: [["guard", 3]], rar: "UR", cost: 30 },
    ],
    ranged: [
      { k: "pierce1", b: "tech", t: 2, x: 10, name: "つらぬく", fx: [["pierce", 1]], max: 2, req: [["kb1", 3]], cost: 10 },
      { k: "aim", b: "tech", t: 4, x: 10, name: "ねらいすまし", fx: [["critMul", 0.15], ["crit", 0.01]], max: 5, req: [["pierce1", 1]] },
      { k: "pierce2", b: "tech", t: 6, x: 10, name: "三連つらぬき", fx: [["pierce", 1]], max: 1, req: [["aim", 3]], rar: "SR", cost: 20 },
      { k: "techcap", b: "tech", t: 7, x: 10, name: "名ハンター", fx: [["atk", 0.4], ["objAtk", 0.15]], max: 3, req: [["pierce2", 1]], rar: "SSR" },
    ],
    aoe: [
      { k: "wide1", b: "tech", t: 2, x: 10, name: "ひろがる毛", fx: [["aoe", 0.08]], max: 5, req: [["kb1", 3]] },
      { k: "spin", b: "tech", t: 4, x: 10, name: "だいかいてん", fx: [["aoe", 0.06], ["atk", 0.1]], max: 5, req: [["wide1", 3]] },
      { k: "roll", b: "tech", t: 6, x: 10, name: "ごろんごろん", fx: [["slow", 0.05], ["knockback", 0.1]], max: 5, req: [["spin", 3]], rar: "SR" },
      { k: "techcap", b: "tech", t: 7, x: 10, name: "おうちの守り神", fx: [["aoe", 0.3], ["aura", 0.1]], max: 1, req: [["roll", 3]], rar: "SSR", cost: 20 },
    ],
    fast: [
      { k: "dash", b: "tech", t: 2, x: 10, name: "かけぬけ", fx: [["move", 0.05], ["dodge", 0.02]], max: 5, req: [["kb1", 3]] },
      { k: "multi1", b: "tech", t: 4, x: 10, name: "れんぱ", fx: [["multiHit", 1]], max: 1, req: [["dash", 3]], cost: 30 },
      { k: "patrol", b: "tech", t: 6, x: 10, name: "家じゅうパトロール", fx: [["atk", 0.3], ["move", 0.1]], max: 3, req: [["multi1", 1]], rar: "SR" },
      { k: "techcap", b: "tech", t: 7, x: 10, name: "いなずまパンチ", fx: [["multiHit", 1]], max: 1, req: [["patrol", 3]], rar: "SSR", cost: 30 },
    ],
  };
  return [...rows, ...tech[role]];
}

function defaultCost(max: number): number {
  if (max >= 10) return 3;
  if (max >= 5) return 6;
  return 12;
}

function buildTree(role: CharRole): SkillNode[] {
  const id = (k: string) => `${role}.${k}`;
  return rowsFor(role).map((r) => ({
    id: id(r.k),
    role,
    name: r.name,
    desc: r.fx.map(([s, v]) => STAT_TEXT[s](v)).join("・") + (r.max > 1 ? "（1レベルごと）" : ""),
    branch: r.b,
    tier: r.t,
    maxLevel: r.max,
    req: r.req.map(([k, lv]) => ({ id: id(k), lv })),
    minCharLevel: TIER_MIN_LEVEL[r.t],
    minRarity: r.rar,
    baseCost: r.cost ?? defaultCost(r.max),
    effects: r.fx.map(([stat, per]) => ({ stat, per })),
    pos: { x: r.x, y: Math.max(0, 1 + r.t * 2 + (r.dy ?? 0)) },
  }));
}

export const SKILL_TREES: Record<CharRole, SkillNode[]> = {
  melee: buildTree("melee"),
  ranged: buildTree("ranged"),
  aoe: buildTree("aoe"),
  fast: buildTree("fast"),
};

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(
  Object.values(SKILL_TREES).flat().map((n) => [n.id, n]),
);

/** ツリーの大きさ（画面のスクロール用）。 */
export const SKILL_TREE_SIZE = { w: 15, h: 17 };

// ---- 補正のまとめ ----

/** スキルで猫（とオブジェクト）にかかる補正。Mul は掛け算（1 から）、それ以外は足し算（0 から）。 */
export interface CharMods {
  atkMul: number;
  hpMul: number;
  intervalMul: number;  // 攻撃の間隔に掛ける（小さいほど速い）
  moveMul: number;
  restMul: number;      // 休けい時間に掛ける
  armorMul: number;     // 受けるダメージに掛ける
  objAtkMul: number;    // 置いたオブジェクトの攻撃に掛ける
  objHpMul: number;     // 置いたオブジェクトの体力に掛ける
  range: number;
  aoe: number;
  crit: number;
  critMul: number;
  multiHit: number;
  lifesteal: number;
  regen: number;
  knockback: number;
  poison: number;
  slow: number;         // 虫の速さから引く割合
  pierce: number;
  kibbleBonus: number;
  objectAura: number;
  repair: number;
  reviveHp: number;
  dodge: number;
}

export function emptyCharMods(): CharMods {
  return {
    atkMul: 1, hpMul: 1, intervalMul: 1, moveMul: 1, restMul: 1, armorMul: 1, objAtkMul: 1, objHpMul: 1,
    range: 0, aoe: 0, crit: 0, critMul: 0, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slow: 0,
    pierce: 0, kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 0, dodge: 0,
  };
}

/** ステータスごとの合計（1レベルあたりの量 × レベル を足したもの）。 */
export type SkillTotals = Record<SkillStat, number>;

export function emptyTotals(): SkillTotals {
  const t = {} as SkillTotals;
  for (const k of Object.keys(STAT_TEXT) as SkillStat[]) t[k] = 0;
  return t;
}

/** level だけ取ったノードの効果を合計に足す。 */
export function addNodeTotals(t: SkillTotals, node: SkillNode, level: number): void {
  const L = Math.min(level, node.maxLevel);
  if (L <= 0) return;
  for (const e of node.effects) t[e.stat] += e.per * L;
}

/** 合計から補正を作る。 */
export function modsFromTotals(t: SkillTotals): CharMods {
  return {
    atkMul: 1 + t.atk,
    hpMul: 1 + t.hp,
    intervalMul: 1 / (1 + t.atkSpd),
    moveMul: 1 + t.move,
    restMul: Math.max(0.2, 1 - t.rest),
    armorMul: Math.max(0.3, 1 - t.armor),
    objAtkMul: 1 + t.objAtk,
    objHpMul: 1 + t.objHp,
    range: t.range,
    aoe: t.aoe,
    crit: t.crit,
    critMul: t.critMul,
    multiHit: t.multiHit,
    lifesteal: t.lifesteal,
    regen: t.regen,
    knockback: t.knockback,
    poison: t.poison,
    slow: t.slow,
    pierce: t.pierce,
    kibbleBonus: t.kibble,
    objectAura: t.aura,
    repair: t.repair,
    reviveHp: t.revive,
    dodge: t.dodge,
  };
}

/** 古いセーブ（v1）のスキル id（例: "melee_atk2"）を、新しいツリーのノードに読みかえる。 */
export function legacySkillId(oldId: string): string | null {
  const m = /^(melee|ranged|aoe|fast)_(atk|hp|spd|special)(\d*)$/.exec(oldId);
  if (!m) return null;
  const role = m[1] as CharRole;
  const table: Record<string, string[]> = {
    atk: ["atk1", "aspd1", "atk2", "honki"],
    hp: ["hp1", "armor1", "hp2"],
    spd: ["move1", "rest1", "reach1"],
    special: ["kb1"],
  };
  const list = table[m[2]];
  const i = m[3] ? Number(m[3]) - 1 : 0;
  const k = list[i];
  return k ? `${role}.${k}` : null;
}
