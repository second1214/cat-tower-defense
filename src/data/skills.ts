// スキルツリー（家族みんなで1つ）。ちゅ〜るで1レベルずつ取る。
// みんなの枝（攻撃・体力防御・速さ・技・支援）は、どの猫にも効く。
// 役割の枝（近接・遠距離・範囲・すばやい）は、メインのわざの役割がおなじ猫にだけ効く（node.role）。
// ステータスの枝はレベルつき（例: 攻撃 +10% × Lv1〜10）。特殊技能（会心・毒・吸血 など）も同じしくみ。
// 同じステータスの % はツリー全体で足し算（掛け算にすると強くなりすぎるので）。
// 複合効果（ComboId）のノードもある。深い段ほど強い・派手。
// 深い段はコストが高く、家族の一番高いレベル（familyLevel）が足りないと取れない。
import type { CharRole, ComboId } from "../core/types";
import { ROLE_NAMES } from "./chars";

/** みんなの枝。 */
export type CommonBranch = "atk" | "def" | "spd" | "tech" | "support";
/** 枝: みんなの枝 ＋ 役割の枝（役割の id と同じ）。 */
export type SkillBranch = CommonBranch | CharRole;
export const COMMON_BRANCHES: CommonBranch[] = ["atk", "def", "spd", "tech", "support"];
export const ROLE_BRANCHES: CharRole[] = ["melee", "ranged", "aoe", "fast"];
export const SKILL_BRANCHES: SkillBranch[] = [...COMMON_BRANCHES, ...ROLE_BRANCHES];
export const BRANCH_NAMES: Record<SkillBranch, string> = {
  atk: "攻撃",
  def: "体力・防御",
  spd: "速さ",
  tech: "技",
  support: "支援",
  melee: ROLE_NAMES.melee,
  ranged: ROLE_NAMES.ranged,
  aoe: ROLE_NAMES.aoe,
  fast: ROLE_NAMES.fast,
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

/** 1つの効果。stat（ステータス）か combo（複合効果）のどちらか。per は1レベルあたりの量（% は 0.1 = 10%）。 */
export type SkillEffect =
  | { stat: SkillStat; combo?: undefined; per: number }
  | { combo: ComboId; stat?: undefined; per: number };

export interface SkillReq {
  id: string;
  /** このノードがこのレベル以上なら OK。 */
  lv: number;
}

export interface SkillNode {
  id: string;
  /** 役割の枝のノードなら、その役割（その役割の猫にだけ効く）。みんなの枝は無し。 */
  role?: CharRole;
  name: string;
  /** 1レベルぶんの効果の説明。 */
  desc: string;
  branch: SkillBranch;
  /** 段（0 = 根もと … 12 = いちばん奥）。深いほど高い。 */
  tier: number;
  maxLevel: number;
  /** 先に取っておくスキル（すべて必要）。 */
  req: SkillReq[];
  /** 家族の一番高いレベル（familyLevel）がこれ以上で取れる。 */
  minCharLevel: number;
  /** Lv0 → Lv1 の基本のちゅ〜る（段の倍率を掛ける前）。 */
  baseCost: number;
  effects: SkillEffect[];
  /** 複合効果のノード（画面で目立たせる用）。 */
  combo: boolean;
  /** 画面での位置（マスの列・行）。x: 0〜26（枝ごとに3列）、y: 0〜39（1段に3行。下に行くほど深い）。 */
  pos: { x: number; y: number };
}

/** 段ごとの、取るのに必要な家族のレベル（familyLevel）。 */
export const TIER_MIN_LEVEL = [1, 3, 8, 15, 25, 40, 60, 80, 110, 150, 200, 260, 330];
/** 段が1つ深くなるごとに、コストに掛ける倍率。 */
export const TIER_COST_MUL = 1.6;
/** ノードのレベルが1上がるごとに、次のコストに掛ける倍率。 */
export const LEVEL_COST_MUL = 1.3;

/** level → level+1 に上げるちゅ〜る。 */
export function nodeCost(node: SkillNode, level: number): number {
  return Math.max(1, Math.round(node.baseCost * Math.pow(TIER_COST_MUL, node.tier) * Math.pow(LEVEL_COST_MUL, level)));
}

/** Lv0 から level まで上げるのに使ったちゅ〜るの合計。 */
export function nodeTotalCost(node: SkillNode, level: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(level, node.maxLevel); i++) s += nodeCost(node, i);
  return s;
}

function pct(v: number): string {
  return String(Math.round(v * 1000) / 10);
}
function round2(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export const STAT_TEXT: Record<SkillStat, (v: number) => string> = {
  atk: (v) => `猫の攻撃 +${pct(v)}%`,
  hp: (v) => `猫の体力 +${pct(v)}%`,
  atkSpd: (v) => `猫の攻撃の速さ +${pct(v)}%`,
  move: (v) => `猫の移動の速さ +${pct(v)}%`,
  objAtk: (v) => `オブジェクトの攻撃 +${pct(v)}%`,
  objHp: (v) => `オブジェクトの体力 +${pct(v)}%`,
  rest: (v) => `猫の休けい時間 -${pct(v)}%`,
  armor: (v) => `猫が受けるダメージ -${pct(v)}%`,
  range: (v) => `猫の攻撃が届く距離 +${round2(v)}マス`,
  aoe: (v) => `猫の範囲攻撃 +${round2(v)}マス`,
  crit: (v) => `猫の会心 +${pct(v)}%`,
  critMul: (v) => `猫の会心ダメージ +${pct(v)}%`,
  multiHit: (v) => `猫の連続攻撃 +${round2(v)}回`,
  lifesteal: (v) => `猫が与えたダメージの ${pct(v)}% 回復`,
  regen: (v) => `猫が毎秒 体力の ${pct(v)}% 回復`,
  knockback: (v) => `猫の押しもどし +${round2(v)}マス`,
  poison: (v) => `猫の攻撃に毒 +${pct(v)}%（3秒）`,
  slow: (v) => `猫が当てた虫を ${pct(v)}% おそくする`,
  pierce: (v) => `猫の弾がつらぬく +${round2(v)}匹`,
  kibble: (v) => `倒した虫のカリカリ +${pct(v)}%`,
  aura: (v) => `まわりのオブジェクトの攻撃 +${pct(v)}%`,
  repair: (v) => `オブジェクトを毎秒 ${pct(v)}% 直す`,
  revive: (v) => `猫が休けいから戻る体力 +${pct(v)}%`,
  dodge: (v) => `猫がよける +${pct(v)}%`,
};

/** 複合効果の名前（短い）。 */
export const COMBO_NAMES: Record<ComboId, string> = {
  poisonBurst: "毒のはじけ",
  critChain: "会心の電撃",
  knockSlam: "ぶつけ",
  frenzy: "ノリノリ",
  lastStand: "ふんばり",
  wakeUp: "ねおきダッシュ",
  slowShatter: "おそい虫ねらい",
  pierceGrow: "つらぬくほど強く",
  multiEcho: "れんぞくのひびき",
  kibbleFever: "カリカリでやる気",
  partyLink: "なかよしパワー",
  bossHunter: "ボスの天敵",
  venomCrit: "毒の急所",
  shockwave: "しょうげき波",
  mamaGuard: "ママを守る",
  dodgeCounter: "よけて反撃",
  zapVenom: "ビリビリ毒",
  objectSync: "おもちゃと息を合わせる",
  killHeal: "たおして元気",
  overkill: "あまった力",
};

/** 複合効果の説明（値 v の意味は types.ts の ComboId どおり）。 */
export const COMBO_TEXT: Record<ComboId, (v: number) => string> = {
  poisonBurst: (v) => `毒の虫（猫・オブジェクトどちらの毒でも）が倒れると、まわり1.2マスに爆発（猫の攻撃の ${pct(v)}%）`,
  critChain: (v) => `猫の会心が出ると、近くの虫へ電撃が ${round2(v)}回とぶ（1回 猫の攻撃の 50%）`,
  knockSlam: (v) => `猫が押しもどした虫が、かべや虫にぶつかると 猫の攻撃の ${pct(v)}%`,
  frenzy: (v) => `猫が虫を倒すたび猫の攻撃の速さ +${pct(v)}%（4秒・10重ねまで）`,
  lastStand: (v) => `猫の体力30%以下のとき、猫の攻撃 +${pct(v)}%`,
  wakeUp: (v) => `休けいから戻ったあと ${round2(v)}秒、無敵＋猫の攻撃の速さ2倍`,
  slowShatter: (v) => `おそくなっている虫への猫のダメージ +${pct(v)}%`,
  pierceGrow: (v) => `猫の弾が1匹つらぬくたび、その弾のダメージ +${pct(v)}%`,
  multiEcho: (v) => `猫の連続攻撃の最後の一撃が、半径 ${round2(v)}マスの範囲攻撃に`,
  kibbleFever: (v) => `カリカリが入るたび猫の攻撃 +${pct(v)}%（3秒・10重ねまで）`,
  partyLink: (v) => `ほかの猫と2マス以内なら、猫の攻撃と攻撃の速さ +${pct(v)}%`,
  bossHunter: (v) => `ボスへの猫のダメージ +${pct(v)}%`,
  venomCrit: (v) => `毒がかかった虫への猫の会心 +${pct(v)}%`,
  shockwave: (v) => `猫の範囲攻撃で、当てた虫を ${round2(v)}マス押しもどし、2秒おそくする`,
  mamaGuard: (v) => `ママから3マス以内で、猫の攻撃 +${pct(v)}%・受けるダメージ -${pct(v / 2)}%`,
  dodgeCounter: (v) => `猫がよけたとき、まわり1マスの虫へ反撃（猫の攻撃の ${pct(v)}%）`,
  zapVenom: (v) => `猫の電撃と範囲攻撃に毒をのせる（猫の攻撃の ${pct(v)}%/秒・3秒）`,
  objectSync: (v) => `猫が攻撃するたび、2マス以内のオブジェクトの次の発動が ${round2(v)}秒早まる`,
  killHeal: (v) => `猫が虫を倒すたび、猫の体力の ${pct(v)}% 回復`,
  overkill: (v) => `猫が倒したときの余ったダメージの ${pct(v)}% を、いちばん近い虫へ`,
};

/** 1つの効果の説明（量に mul を掛けて）。 */
export function effectLine(e: SkillEffect, mul = 1): string {
  if (e.combo) return COMBO_TEXT[e.combo](e.per * mul);
  return STAT_TEXT[e.stat](e.per * mul);
}

/** 効果のならびの説明（量に mul を掛けて）。 */
export function effectsText(effects: SkillEffect[], mul = 1): string {
  return effects.map((e) => effectLine(e, mul)).join("・");
}

/** 効果の説明（level を掛けた量）。例: effectText(node, 3) → "猫の攻撃 +30%"。役割の枝なら「近接の猫：攻撃 +30%」。 */
export function effectText(node: SkillNode, level = 1): string {
  if (!node.role) return effectsText(node.effects, level);
  return `${ROLE_NAMES[node.role]}の猫：` + node.effects.map((e) => effectLine(e, level).replace(/^猫(の|が)/, "")).join("・");
}

// ---- ツリーの組み立て ----

const S = (stat: SkillStat, per: number): SkillEffect => ({ stat, per });
const C = (combo: ComboId, per: number): SkillEffect => ({ combo, per });

/** 名前の候補（同じステータスが何度も出るときは、順に使い、ひとまわりしたら「・二」などをつける）。 */
const STAT_NAMES: Record<SkillStat, string[]> = {
  atk: ["つめとぎ", "ねこパンチの素振り", "本気モード", "狩りの血", "肉球の一撃", "しっぽぴーん", "やる気まんまん", "野生のめざめ"],
  hp: ["よく食べる", "ごはんおかわり", "まんぷく", "ふとっちょ", "大きな体", "どっしり", "ねこ鍋", "もちもちボディ"],
  atkSpd: ["ちょいちょいの練習", "すばやい一撃", "はやわざ", "目にもとまらぬ", "いなずまの手", "ねこじゃらし特訓", "てしてし", "高速ふみふみ"],
  move: ["おさんぽ", "はしりこみ", "かけっこ", "ダッシュ", "つむじ風", "夜の運動会", "ろうかダッシュ", "しのび足"],
  rest: ["ひるね上手", "ねむりが浅い", "早起き", "うたたね", "ひだまりのお昼寝", "五分だけ寝る"],
  armor: ["ぶあつい毛", "冬毛", "もこもこ", "ふかふかの毛", "毛玉のよろい", "まるくなる"],
  dodge: ["ひらりとかわす", "しなやかな体", "すりぬけ", "身のこなし", "ねこの身軽さ", "せまい所くぐり"],
  regen: ["毛づくろい", "すぐ治る", "なめて治す", "のどゴロゴロ", "ぬくぬく"],
  lifesteal: ["ごはんのちから", "おいしい虫", "かりのごほうび", "つまみ食い", "おやつタイム"],
  revive: ["ひるねで元気", "ねおきすっきり", "まくらの上で", "おふとんの魔法", "のびーっ"],
  crit: ["ねらいをさだめる", "会心の一撃", "急所さがし", "するどい目", "ひげセンサー", "おしりふりふり"],
  critMul: ["急所をねらう", "とどめの一撃", "渾身の力", "ねこの本気", "ここぞの一撃", "必殺ねこパンチ"],
  range: ["のびのび", "ながい手", "背のび", "遠目がきく", "高い所から"],
  poison: ["かみつき", "しつこくかみつく", "とげとげの舌", "あまがみ", "ひっかき傷"],
  slow: ["おどかす", "にらみつける", "しっぽで通せんぼ", "シャーッ", "毛を逆立てる"],
  knockback: ["じゃれつき", "体当たり", "ねこキック", "けりけり", "おしりアタック"],
  pierce: ["つらぬく", "三連つらぬき", "まっすぐ一直線"],
  aoe: ["ひろがる毛", "だいかいてん", "ごろんごろん", "しっぽの竜巻", "毛玉ばくはつ"],
  multiHit: ["二段パンチ", "れんぱ", "乱れひっかき", "百れつ肉球"],
  objAtk: ["おもちゃ好き", "おもちゃ名人", "遊びの天才", "ねこじゃらし使い", "けりぐるみ名人"],
  objHp: ["じょうぶな箱", "ていねいに使う", "箱入り", "かじらない約束", "ダンボール職人"],
  kibble: ["くいしんぼう", "おやつ探し", "カリカリ集め", "お皿ぴかぴか", "おねだり上手"],
  aura: ["見守り", "いっしょに遊ぶ", "ママの右腕", "お手伝い", "みんなのリーダー"],
  repair: ["おかたづけ", "ていねいに直す", "おうちの修理屋", "つめとぎで直す", "せっせと直す"],
};
const KANJI = ["", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];

/** 1つのノードの中身（段 t の、ある列の、上か下か）。 */
interface Cell {
  fx: SkillEffect[];
  max: number;
  cost?: number;
}

/** 段が深いほど、1レベルあたりの量を増やす。 */
const k = (t: number) => 1 + 0.2 * t;
/** max からレベルの数、の短い書き方。 */
const c10 = (...fx: SkillEffect[]): Cell => ({ fx, max: 10 });
const c5 = (...fx: SkillEffect[]): Cell => ({ fx, max: 5 });
const c3 = (...fx: SkillEffect[]): Cell => ({ fx, max: 3 });
const once = (cost: number, ...fx: SkillEffect[]): Cell => ({ fx, max: 1, cost });

/** 列ごとの「かたち」のならび。段の上・下（r = 2*段 + 上下）で順にまわす。 */
type Pattern = (k: number) => Cell;
const cycle = (list: Pattern[], t: number, r: number): Cell => list[r % list.length](k(t));

/** みんなの枝（5つ）。どの猫にも効く。 */
const COMMON_LANES: Record<CommonBranch, Pattern[][]> = {
  atk: [
    [(q) => c10(S("atkSpd", 0.008 * q)), (q) => c5(S("atk", 0.025 * q), S("atkSpd", 0.005 * q)), (q) => c10(S("atkSpd", 0.009 * q)), (q) => c5(S("critMul", 0.03 * q), S("atkSpd", 0.004 * q))],
    [(q) => c10(S("atk", 0.04 * q)), (q) => c10(S("atk", 0.045 * q)), (q) => c5(S("atk", 0.03 * q), S("hp", 0.03 * q))],
    [() => c5(S("crit", 0.005)), (q) => c5(S("critMul", 0.03 * q)), (q) => c5(S("crit", 0.004), S("critMul", 0.015 * q)), (q) => c5(S("critMul", 0.035 * q))],
  ],
  def: [
    [() => c5(S("armor", 0.006)), () => c5(S("dodge", 0.004)), (q) => c5(S("armor", 0.004), S("hp", 0.03 * q)), () => c5(S("dodge", 0.003), S("move", 0.01))],
    [(q) => c10(S("hp", 0.05 * q)), (q) => c10(S("hp", 0.055 * q)), (q) => c5(S("hp", 0.035 * q), S("armor", 0.002))],
    [() => c5(S("regen", 0.0005)), () => c5(S("lifesteal", 0.004)), () => c5(S("revive", 0.02)), () => c5(S("regen", 0.0003), S("lifesteal", 0.002))],
  ],
  spd: [
    [() => c5(S("rest", 0.006)), () => c5(S("rest", 0.004), S("revive", 0.01)), () => c5(S("rest", 0.007))],
    [(q) => c5(S("move", 0.0125 * q)), (q) => c5(S("move", 0.01 * q), S("dodge", 0.002)), (q) => c5(S("move", 0.014 * q))],
    [(q) => c10(S("atkSpd", 0.0075 * q)), (q) => c10(S("atkSpd", 0.006 * q), S("move", 0.005 * q)), (q) => c10(S("atkSpd", 0.008 * q))],
  ],
  tech: [
    [(q) => c5(S("poison", 0.015 * q)), () => c5(S("slow", 0.0075)), (q) => c5(S("poison", 0.01 * q), S("slow", 0.004)), () => c5(S("slow", 0.006), S("crit", 0.002))],
    [(q) => c5(S("atk", 0.03 * q), S("hp", 0.03 * q)), () => c5(S("lifesteal", 0.003), S("regen", 0.0003)), (q) => c5(S("critMul", 0.03 * q), S("crit", 0.0025))],
    [() => c5(S("knockback", 0.04)), () => c5(S("lifesteal", 0.003)), () => c5(S("knockback", 0.03), S("slow", 0.004))],
  ],
  support: [
    [(q) => c10(S("objAtk", 0.025 * q)), (q) => c10(S("objAtk", 0.02 * q), S("objHp", 0.01 * q)), (q) => c10(S("objAtk", 0.028 * q))],
    [() => c5(S("kibble", 0.0075)), () => c5(S("aura", 0.015)), () => c5(S("kibble", 0.005), S("aura", 0.01))],
    [() => c5(S("repair", 0.001)), (q) => c5(S("objHp", 0.04 * q)), (q) => c5(S("repair", 0.0007), S("objHp", 0.02 * q))],
  ],
};

/** 役割の枝（4つ）。メインのわざの役割がおなじ猫にだけ効く。とくべつな段（[段, 上下]）には、得意技のノードを置く。 */
const ROLE_LANES: Record<CharRole, { lanes: Pattern[][]; special: [number, number, Cell][] }> = {
  melee: {
    lanes: [
      [(q) => c10(S("atk", 0.03 * q)), (q) => c5(S("atk", 0.02 * q), S("hp", 0.02 * q)), () => c5(S("lifesteal", 0.003)), (q) => c10(S("atk", 0.035 * q))],
      [() => c5(S("knockback", 0.05)), (q) => c5(S("armor", 0.005), S("hp", 0.03 * q)), (q) => c5(S("knockback", 0.04), S("atk", 0.02 * q))],
      [(q) => c10(S("hp", 0.05 * q)), () => c5(S("armor", 0.006)), (q) => c5(S("regen", 0.0005), S("hp", 0.02 * q)), () => c5(S("dodge", 0.003), S("armor", 0.003))],
    ],
    special: [[4, 0, once(15, S("multiHit", 1))], [9, 0, once(15, S("multiHit", 1))]],
  },
  ranged: {
    lanes: [
      [(q) => c5(S("critMul", 0.03 * q)), () => c5(S("crit", 0.004)), (q) => c10(S("atk", 0.03 * q)), (q) => c5(S("crit", 0.003), S("critMul", 0.015 * q))],
      [() => c3(S("range", 0.08)), (q) => c5(S("critMul", 0.03 * q), S("crit", 0.0025)), (q) => c3(S("range", 0.06), S("atkSpd", 0.004 * q))],
      [(q) => c10(S("atkSpd", 0.008 * q)), () => c5(S("slow", 0.005)), (q) => c5(S("atkSpd", 0.006 * q), S("range", 0.03)), () => c5(S("knockback", 0.02), S("slow", 0.003))],
    ],
    special: [[2, 0, once(10, S("pierce", 1))], [6, 0, once(10, S("pierce", 1))], [10, 0, once(10, S("pierce", 1))]],
  },
  aoe: {
    lanes: [
      [() => c5(S("aoe", 0.025)), (q) => c10(S("atk", 0.03 * q)), (q) => c5(S("aoe", 0.015), S("atk", 0.02 * q)), (q) => c5(S("poison", 0.015 * q))],
      [() => c5(S("aoe", 0.03)), (q) => c5(S("poison", 0.02 * q), S("slow", 0.004)), () => c5(S("aoe", 0.02), S("armor", 0.003))],
      [(q) => c10(S("hp", 0.04 * q)), () => c5(S("slow", 0.006)), () => c5(S("regen", 0.0004), S("armor", 0.004)), (q) => c5(S("poison", 0.012 * q), S("aoe", 0.01))],
    ],
    special: [[6, 0, once(15, S("multiHit", 1))]],
  },
  fast: {
    lanes: [
      [(q) => c10(S("atkSpd", 0.008 * q)), (q) => c5(S("move", 0.015 * q)), (q) => c5(S("atk", 0.025 * q), S("atkSpd", 0.004 * q)), (q) => c10(S("atkSpd", 0.01 * q))],
      [() => c5(S("dodge", 0.004), S("move", 0.01)), (q) => c5(S("atk", 0.03 * q), S("atkSpd", 0.005 * q)), () => c5(S("dodge", 0.005))],
      [() => c5(S("dodge", 0.004)), () => c5(S("rest", 0.005)), (q) => c5(S("lifesteal", 0.003), S("move", 0.01 * q)), () => c5(S("revive", 0.02), S("rest", 0.003))],
    ],
    special: [[4, 0, once(15, S("multiHit", 1))], [9, 0, once(15, S("multiHit", 1))]],
  },
};

/** 複合効果のノード: [段, 効果（1レベルの量）, 名前, 最大レベル]。1つの枝の1つの段に2つまで。 */
type ComboRow = [number, SkillEffect[], string, number?];

const COMBO_ROWS: Record<SkillBranch, ComboRow[]> = {
  // ---- みんなの枝（控えめ） ----
  atk: [
    [2, [C("bossHunter", 0.1)], "大物きらい"],
    [4, [C("overkill", 0.15)], "あまった力"],
    [6, [C("lastStand", 0.15)], "ねばり腰"],
    [8, [C("bossHunter", 0.2), C("overkill", 0.1)], "ボスたおし"],
    [10, [C("critChain", 1)], "かみなりの爪", 1],
    [12, [C("overkill", 0.4), C("bossHunter", 0.3)], "伝説のけんか猫"],
  ],
  def: [
    [1, [C("killHeal", 0.004)], "ごはんで元気"],
    [3, [C("mamaGuard", 0.06)], "ママのそば"],
    [5, [C("wakeUp", 0.3)], "すっきり起きる"],
    [7, [C("killHeal", 0.008), C("lastStand", 0.1)], "食べてふんばる"],
    [9, [C("mamaGuard", 0.12)], "ママの用心棒"],
    [12, [C("wakeUp", 0.8), C("killHeal", 0.01)], "不死身のねこ"],
  ],
  spd: [
    [2, [C("frenzy", 0.015)], "ノリノリ気分"],
    [4, [C("wakeUp", 0.25)], "とびおき"],
    [6, [C("kibbleFever", 0.015)], "おやつでダッシュ"],
    [8, [C("frenzy", 0.03)], "止まらない足"],
    [10, [C("dodgeCounter", 0.2)], "ひらりと反撃"],
    [12, [C("frenzy", 0.05), C("kibbleFever", 0.02)], "つむじ風の大暴れ"],
  ],
  tech: [
    [1, [C("slowShatter", 0.06)], "にげ足ねらい"],
    [3, [C("venomCrit", 0.03)], "毒のすきま"],
    [5, [C("poisonBurst", 0.15)], "ぷちっと毒"],
    [7, [C("slowShatter", 0.1), C("venomCrit", 0.02)], "じわじわ追いつめ"],
    [9, [C("zapVenom", 0.2)], "しびれ毒"],
    [12, [C("poisonBurst", 0.5), C("slowShatter", 0.15)], "毒のくす玉"],
  ],
  support: [
    [2, [C("kibbleFever", 0.015)], "カリカリのごほうび"],
    [4, [C("objectSync", 0.05)], "いっしょに遊ぶ"],
    [6, [C("partyLink", 0.06)], "なかよしパワー"],
    [8, [C("objectSync", 0.1)], "おもちゃの名コンビ"],
    [10, [C("partyLink", 0.12)], "家族のきずな"],
    [12, [C("objectSync", 0.15), C("partyLink", 0.1), C("kibbleFever", 0.02)], "ねこカフェの看板猫"],
  ],
  // ---- 役割の枝（その役割の猫だけ。強め） ----
  melee: [
    [0, [C("knockSlam", 0.15)], "ぶつけパンチ"],
    [1, [C("killHeal", 0.006), C("lastStand", 0.08)], "いただきます"],
    [2, [C("lastStand", 0.2)], "ふんばり"],
    [3, [C("multiEcho", 0.3)], "ひびくパンチ"],
    [4, [C("knockSlam", 0.4), C("slowShatter", 0.05)], "かべドン"],
    [5, [C("mamaGuard", 0.12)], "ママの前に立つ"],
    [6, [C("overkill", 0.3)], "もう一発"],
    [7, [C("multiEcho", 0.5), C("knockSlam", 0.2)], "どすこい乱れうち"],
    [8, [C("bossHunter", 0.25)], "ボスとのけんか"],
    [9, [C("lastStand", 0.5)], "九つの命"],
    [10, [C("knockSlam", 0.8)], "町内一のぶちかまし"],
    [11, [C("multiEcho", 0.8)], "町いちばんのけんか"],
    [12, [C("partyLink", 0.2), C("bossHunter", 0.2)], "ボス猫の号令"],
  ],
  ranged: [
    [0, [C("pierceGrow", 0.05)], "つらぬくほど強く"],
    [1, [C("slowShatter", 0.08)], "ねらいうち"],
    [2, [C("critChain", 1)], "ビリッとひっかき", 2],
    [3, [C("venomCrit", 0.04)], "毒をねらう"],
    [4, [C("pierceGrow", 0.12), C("overkill", 0.1)], "一直線"],
    [5, [C("kibbleFever", 0.025)], "カリカリでやる気"],
    [6, [C("objectSync", 0.08)], "おもちゃと息を合わせる"],
    [7, [C("critChain", 1), C("venomCrit", 0.02)], "いなずまの爪", 3],
    [8, [C("bossHunter", 0.3)], "大物ねらい"],
    [9, [C("pierceGrow", 0.25)], "千里の一矢"],
    [10, [C("overkill", 0.5)], "うちぬき"],
    [11, [C("zapVenom", 0.4)], "ビリビリ毒"],
    [12, [C("critChain", 2), C("partyLink", 0.15)], "かみなりの雨", 2],
  ],
  aoe: [
    [0, [C("shockwave", 0.15)], "しっぽの風"],
    [1, [C("poisonBurst", 0.25)], "はじける毒"],
    [2, [C("zapVenom", 0.12)], "静電気の毛"],
    [3, [C("slowShatter", 0.1)], "まとめてつぶす"],
    [4, [C("shockwave", 0.3), C("objectSync", 0.05)], "うずまき"],
    [5, [C("mamaGuard", 0.15)], "ママのそばの守り神"],
    [6, [C("poisonBurst", 0.6)], "毒の大はじけ"],
    [7, [C("multiEcho", 0.3)], "ひびく大回転"],
    [8, [C("shockwave", 0.5)], "大回転のうず"],
    [9, [C("killHeal", 0.015)], "ひなたぼっこ"],
    [10, [C("overkill", 0.5)], "なだれ"],
    [11, [C("poisonBurst", 1.2), C("zapVenom", 0.3)], "毒の花火"],
    [12, [C("shockwave", 0.8), C("partyLink", 0.15)], "台風の目"],
  ],
  fast: [
    [0, [C("frenzy", 0.025)], "ノリノリ"],
    [1, [C("dodgeCounter", 0.25)], "よけてパンチ"],
    [2, [C("wakeUp", 0.6)], "ねおきダッシュ"],
    [3, [C("kibbleFever", 0.025)], "カリカリでダッシュ"],
    [4, [C("killHeal", 0.008)], "走って元気"],
    [5, [C("multiEcho", 0.3)], "れんぱのひびき"],
    [6, [C("frenzy", 0.05), C("dodgeCounter", 0.15)], "とまらない"],
    [7, [C("dodgeCounter", 0.6)], "みきりの反撃"],
    [8, [C("bossHunter", 0.3)], "ボスのまわりをぐるぐる"],
    [9, [C("wakeUp", 1.2)], "ねぼすけ返上"],
    [10, [C("overkill", 0.5)], "かけぬけ一閃"],
    [11, [C("frenzy", 0.09)], "いなずまの大暴れ"],
    [12, [C("multiEcho", 0.6), C("frenzy", 0.03), C("partyLink", 0.15)], "みんなでおいかけっこ"],
  ],
};

/** 段の数。 */
export const TIERS = TIER_MIN_LEVEL.length;
/** 1つの段の行の数（上・下のふつうのノード ＋ 複合効果の行）。 */
export const ROWS_PER_TIER = 3;

/** ふつうのノードの基本のちゅ〜る（最大レベルで決まる）。 */
function defaultCost(max: number): number {
  if (max >= 10) return 1.5;
  if (max >= 5) return 3;
  if (max >= 3) return 5;
  return 10;
}
/** 複合効果のノードの基本のちゅ〜る（みんなの枝・役割の枝）。 */
const COMBO_COST_COMMON = 8;
const COMBO_COST_ROLE = 15;

/** 枝の役割（役割の枝なら、その役割）。 */
export function branchRole(b: SkillBranch): CharRole | undefined {
  return (ROLE_BRANCHES as string[]).includes(b) ? (b as CharRole) : undefined;
}

function cellOf(b: SkillBranch, lane: number, sub: number, t: number): Cell {
  const role = branchRole(b);
  const r = 2 * t + sub;
  if (role) {
    const sp = ROLE_LANES[role].special.find(([st, ss]) => lane === 1 && st === t && ss === sub);
    if (sp) return sp[2];
    return cycle(ROLE_LANES[role].lanes[lane], t, r);
  }
  return cycle(COMMON_LANES[b as CommonBranch][lane], t, r);
}

function buildTree(): SkillNode[] {
  const nodes: SkillNode[] = [];
  const used = new Set<string>();
  const add = (n: Omit<SkillNode, "desc" | "minCharLevel">) => {
    used.add(`${n.pos.x},${n.pos.y}`);
    const node: SkillNode = { ...n, desc: "", minCharLevel: TIER_MIN_LEVEL[n.tier] };
    if (!n.role) delete node.role;
    node.desc = effectText(node) + (n.maxLevel > 1 ? "（1レベルごと）" : "");
    nodes.push(node);
  };

  add({
    id: "root", name: "はじめの一歩", branch: "atk", tier: 0, maxLevel: 1, req: [], baseCost: 2,
    effects: [S("atk", 0.05), S("hp", 0.05)], combo: false, pos: { x: 13, y: 0 },
  });

  // 名前の重なりを数える
  const seen = new Map<string, number>();
  const nameOf = (fx: SkillEffect[]): string => {
    const st = fx[0].stat!;
    const n = seen.get(st) ?? 0;
    seen.set(st, n + 1);
    const list = STAT_NAMES[st];
    const round = Math.floor(n / list.length);
    return list[n % list.length] + (round > 0 ? `・${KANJI[Math.min(KANJI.length - 1, round)]}` : "");
  };

  // ふつうのノード: 枝ごとに3列 × 13段 × 上下。同じ列の1つ前が前提
  for (let t = 0; t < TIERS; t++) {
    for (let sub = 0; sub < 2; sub++) {
      SKILL_BRANCHES.forEach((b, bi) => {
        for (let lane = 0; lane < 3; lane++) {
          const c = cellOf(b, lane, sub, t);
          const pt = sub === 0 ? t - 1 : t;
          const ps = sub === 0 ? 1 : 0;
          const prev = pt < 0 ? null : cellOf(b, lane, ps, pt);
          add({
            id: `${b}.${lane}${"ab"[sub]}${t}`,
            role: branchRole(b),
            name: nameOf(c.fx),
            branch: b,
            tier: t,
            maxLevel: c.max,
            req: prev ? [{ id: `${b}.${lane}${"ab"[ps]}${pt}`, lv: Math.min(3, prev.max) }] : [{ id: "root", lv: 1 }],
            baseCost: c.cost ?? defaultCost(c.max),
            effects: c.fx,
            combo: false,
            pos: { x: bi * 3 + lane, y: 1 + ROWS_PER_TIER * t + sub },
          });
        }
      });
    }
  }

  // 複合効果のノード: その段の、同じ枝の真ん中の列（下）が前提。ふつうのノードのすぐ下の行に置く
  for (const b of SKILL_BRANCHES) {
    const bi = SKILL_BRANCHES.indexOf(b);
    const role = branchRole(b);
    COMBO_ROWS[b].forEach(([t, fx, name, max], i) => {
      const y = ROWS_PER_TIER * (t + 1);
      const x = [bi * 3 + 1, bi * 3].find((cx) => !used.has(`${cx},${y}`))!;
      const mid = cellOf(b, 1, 1, t);
      add({
        id: `${b}.combo${i + 1}`,
        role,
        name,
        branch: b,
        tier: t,
        maxLevel: max ?? 3,
        req: [{ id: `${b}.1b${t}`, lv: Math.min(3, mid.max) }],
        baseCost: role ? COMBO_COST_ROLE : COMBO_COST_COMMON,
        effects: fx,
        combo: true,
        pos: { x, y },
      });
    });
  }
  return nodes;
}

/** 家族みんなで1つのスキルツリー。 */
export const SKILL_TREE: SkillNode[] = buildTree();

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(SKILL_TREE.map((n) => [n.id, n]));

/** その猫（メインのわざの役割）に効くノードか。 */
export function nodeAppliesTo(node: SkillNode, role: CharRole): boolean {
  return !node.role || node.role === role;
}

/** ツリーの大きさ（画面のスクロール用。マスの数）。 */
export const SKILL_TREE_SIZE = { w: SKILL_BRANCHES.length * 3, h: 1 + ROWS_PER_TIER * TIERS };
// ---- 補正のまとめ ----

/** スキル（と、わざ）で猫（とオブジェクト）にかかる補正。Mul は掛け算（1 から）、それ以外は足し算（0 から）。 */
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
  combos: Partial<Record<ComboId, number>>;
}

/** ステータスごとの合計（1レベルあたりの量 × レベル を足したもの）と、複合効果の合計。 */
export interface SkillTotals extends Record<SkillStat, number> {
  combos: Partial<Record<ComboId, number>>;
}

export function emptyTotals(): SkillTotals {
  const t = { combos: {} } as SkillTotals;
  for (const key of Object.keys(STAT_TEXT) as SkillStat[]) t[key] = 0;
  return t;
}

/** 効果のならびを、mul 倍して合計に足す。 */
export function addEffects(t: SkillTotals, effects: SkillEffect[], mul: number): void {
  if (!(mul > 0)) return;
  for (const e of effects) {
    if (e.combo) t.combos[e.combo] = (t.combos[e.combo] ?? 0) + e.per * mul;
    else t[e.stat] += e.per * mul;
  }
}

/** level だけ取ったノードの効果を合計に足す。 */
export function addNodeTotals(t: SkillTotals, node: SkillNode, level: number): void {
  addEffects(t, node.effects, Math.min(level, node.maxLevel));
}

export function emptyCharMods(): CharMods {
  return modsFromTotals(emptyTotals());
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
    combos: { ...t.combos },
  };
}
