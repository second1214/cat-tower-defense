// スキルツリー（役割ごと・家族で共有）。ちゅ〜るで1レベルずつ取る。
// 1匹で取れば、その役割（メインのわざの役割）で戦う全員に効く。
// ステータスの枝はレベルつき（例: 攻撃 +10% × Lv1〜10）。特殊技能（会心・毒・吸血 など）も同じしくみ。
// 同じステータスの % はツリー全体で足し算（掛け算にすると強くなりすぎるので）。
// 複合効果（ComboId）のノードもある。深い段ほど強い・派手。
// 深い段はコストが高く、家族の一番高いレベル（familyLevel）が足りないと取れない。
import type { CharRole, ComboId } from "../core/types";

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
  role: CharRole;
  name: string;
  /** 1レベルぶんの効果の説明。 */
  desc: string;
  branch: SkillBranch;
  /** 段（0 = 根もと … 11 = いちばん奥）。深いほど高い。 */
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
  /** 画面での位置（マスの列・行）。x: 0〜14（枝ごとに3列）、y: 0〜24（下に行くほど深い）。 */
  pos: { x: number; y: number };
}

/** 段ごとの、取るのに必要な家族のレベル（familyLevel）。 */
export const TIER_MIN_LEVEL = [1, 3, 8, 15, 25, 40, 60, 80, 110, 150, 200, 260];
/** 段が1つ深くなるごとに、コストに掛ける倍率。 */
export const TIER_COST_MUL = 1.6;
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

/** 効果の説明（level を掛けた量）。例: effectText(node, 3) → "攻撃 +30%"。 */
export function effectText(node: SkillNode, level = 1): string {
  return effectsText(node.effects, level);
}

// ---- ツリーの組み立て ----

const S = (stat: SkillStat, per: number): SkillEffect => ({ stat, per });
const C = (combo: ComboId, per: number): SkillEffect => ({ combo, per });

/** 名前の候補（同じステータスが何度も出るときは、順に使い、ひとまわりしたら「・二」などをつける）。 */
const STAT_NAMES: Record<SkillStat, string[]> = {
  atk: ["つめとぎ", "ねこパンチの素振り", "本気モード", "狩りの血", "肉球の一撃"],
  hp: ["よく食べる", "ごはんおかわり", "まんぷく", "ふとっちょ", "大きな体"],
  atkSpd: ["ちょいちょいの練習", "すばやい一撃", "はやわざ", "目にもとまらぬ", "いなずまの手"],
  move: ["おさんぽ", "はしりこみ", "かけっこ", "ダッシュ", "つむじ風"],
  rest: ["ひるね上手", "ねむりが浅い", "早起き", "うたたね"],
  armor: ["ぶあつい毛", "冬毛", "もこもこ", "ふかふかの毛"],
  dodge: ["ひらりとかわす", "しなやかな体", "すりぬけ", "身のこなし"],
  regen: ["毛づくろい", "すぐ治る", "なめて治す"],
  lifesteal: ["ごはんのちから", "おいしい虫", "かりのごほうび"],
  revive: ["ひるねで元気", "ねおきすっきり", "まくらの上で"],
  crit: ["ねらいをさだめる", "会心の一撃", "急所さがし", "するどい目"],
  critMul: ["急所をねらう", "とどめの一撃", "渾身の力"],
  range: ["のびのび", "ながい手", "背のび"],
  poison: ["かみつき", "しつこくかみつく", "とげとげの舌"],
  slow: ["おどかす", "にらみつける", "しっぽで通せんぼ"],
  knockback: ["じゃれつき", "体当たり", "ねこキック"],
  pierce: ["つらぬく", "三連つらぬき", "まっすぐ一直線"],
  aoe: ["ひろがる毛", "だいかいてん", "ごろんごろん"],
  multiHit: ["二段パンチ", "れんぱ", "乱れひっかき"],
  objAtk: ["おもちゃ好き", "おもちゃ名人", "遊びの天才"],
  objHp: ["じょうぶな箱", "ていねいに使う", "箱入り"],
  kibble: ["くいしんぼう", "おやつ探し", "カリカリ集め"],
  aura: ["見守り", "いっしょに遊ぶ", "ママの右腕"],
  repair: ["おかたづけ", "ていねいに直す", "おうちの修理屋"],
};
const SUFFIX = ["", "・二", "・三", "・四", "・五", "・六", "・七", "・八"];

/** 1つのノードの中身（段 t の、ある列）。 */
interface Cell {
  fx: SkillEffect[];
  max: number;
  cost?: number;
}

type ByRole<T> = Record<CharRole, T>;

/** 段が深いほど、1レベルあたりの量を増やす。 */
const k = (t: number) => 1 + 0.2 * t;
const even = (t: number) => t % 2 === 0;

/** 枝ごとの3列（左・真ん中・右）。段 t の中身を返す。 */
function laneCell(role: CharRole, b: SkillBranch, lane: number, t: number): Cell {
  const reach: ByRole<number> = { melee: 0.05, ranged: 0.2, aoe: 0.08, fast: 0.05 };
  const kb: ByRole<number> = { melee: 0.12, ranged: 0.06, aoe: 0.08, fast: 0.08 };
  switch (b) {
    case "atk":
      if (lane === 0) return { fx: [S("atkSpd", 0.015 * k(t))], max: 10 };
      if (lane === 1) return { fx: [S("atk", 0.08 * k(t))], max: 10 };
      return even(t) ? { fx: [S("crit", 0.01)], max: 5 } : { fx: [S("critMul", 0.06 * k(t))], max: 5 };
    case "def":
      if (lane === 0) return even(t) ? { fx: [S("armor", 0.012)], max: 5 } : { fx: [S("dodge", 0.008)], max: 5 };
      if (lane === 1) return { fx: [S("hp", 0.1 * k(t))], max: 10 };
      return [
        { fx: [S("regen", 0.001)], max: 5 },
        { fx: [S("lifesteal", 0.008)], max: 5 },
        { fx: [S("revive", 0.04)], max: 5 },
      ][t % 3];
    case "spd":
      if (lane === 0) return { fx: [S("rest", 0.012)], max: 5 };
      if (lane === 1) return even(t) ? { fx: [S("range", reach[role])], max: 3 } : { fx: [S("move", 0.025 * k(t))], max: 5 };
      return { fx: [S("atkSpd", 0.015 * k(t))], max: 10 };
    case "tech":
      if (lane === 0) return even(t) ? { fx: [S("poison", 0.03 * k(t))], max: 5 } : { fx: [S("slow", 0.015)], max: 5 };
      if (lane === 1) return techCell(role, t);
      return even(t) ? { fx: [S("knockback", kb[role])], max: 5 } : { fx: [S("lifesteal", 0.006)], max: 5 };
    case "support":
      if (lane === 0) return { fx: [S("objAtk", 0.05 * k(t))], max: 10 };
      if (lane === 1) return even(t) ? { fx: [S("kibble", 0.015)], max: 5 } : { fx: [S("aura", 0.03)], max: 5 };
      return even(t) ? { fx: [S("repair", 0.002)], max: 5 } : { fx: [S("objHp", 0.08 * k(t))], max: 5 };
  }
}

/** 技の枝の真ん中の列（役割ごとの得意技）。 */
function techCell(role: CharRole, t: number): Cell {
  switch (role) {
    case "melee":
      if (t === 4 || t === 9) return { fx: [S("multiHit", 1)], max: 1, cost: 30 };
      return even(t) ? { fx: [S("knockback", 0.1)], max: 5 } : { fx: [S("atk", 0.06 * k(t)), S("hp", 0.06 * k(t))], max: 5 };
    case "ranged":
      if (t === 2 || t === 6 || t === 10) return { fx: [S("pierce", 1)], max: 1, cost: 20 };
      return even(t) ? { fx: [S("range", 0.15)], max: 3 } : { fx: [S("critMul", 0.06 * k(t)), S("crit", 0.005)], max: 5 };
    case "aoe":
      if (t === 6) return { fx: [S("multiHit", 1)], max: 1, cost: 30 };
      return even(t) ? { fx: [S("aoe", 0.05)], max: 5 } : { fx: [S("aoe", 0.03), S("atk", 0.06 * k(t))], max: 5 };
    case "fast":
      if (t === 4 || t === 9) return { fx: [S("multiHit", 1)], max: 1, cost: 30 };
      return even(t) ? { fx: [S("move", 0.03), S("dodge", 0.006)], max: 5 } : { fx: [S("atk", 0.06 * k(t)), S("atkSpd", 0.01 * k(t))], max: 5 };
  }
}

/** 複合効果のノード: [段, 複合効果, 1レベルの量, 枝, 名前, 最大レベル]。 */
type ComboRow = [number, ComboId, number, SkillBranch, string, number?];

const COMBO_ROWS: ByRole<ComboRow[]> = {
  melee: [
    [1, "knockSlam", 0.3, "tech", "ぶつけパンチ"],
    [2, "killHeal", 0.01, "def", "いただきます"],
    [3, "lastStand", 0.25, "atk", "ふんばり"],
    [4, "mamaGuard", 0.15, "def", "ママを守る"],
    [5, "multiEcho", 0.4, "atk", "ひびくパンチ"],
    [6, "slowShatter", 0.15, "tech", "にげ足つぶし"],
    [7, "overkill", 0.3, "atk", "あまった力"],
    [8, "knockSlam", 0.8, "tech", "かべドン"],
    [9, "bossHunter", 0.3, "atk", "ボスとのけんか"],
    [10, "lastStand", 0.6, "def", "九つの命"],
    [11, "multiEcho", 0.8, "atk", "町いちばんのけんか"],
    [11, "partyLink", 0.25, "support", "みんなでけんか"],
  ],
  ranged: [
    [1, "pierceGrow", 0.08, "tech", "つらぬくほど強く"],
    [2, "slowShatter", 0.1, "tech", "ねらいうち"],
    [3, "critChain", 1, "atk", "ビリッとひっかき", 2],
    [4, "venomCrit", 0.05, "tech", "毒をねらう"],
    [5, "kibbleFever", 0.03, "support", "カリカリでやる気"],
    [6, "objectSync", 0.1, "support", "おもちゃと息を合わせる"],
    [7, "pierceGrow", 0.2, "tech", "一直線"],
    [8, "bossHunter", 0.3, "atk", "大物ねらい"],
    [9, "critChain", 1, "atk", "いなずまの爪", 3],
    [10, "overkill", 0.5, "atk", "うちぬき"],
    [11, "zapVenom", 0.5, "tech", "ビリビリ毒"],
    [11, "partyLink", 0.25, "support", "うしろから応援"],
  ],
  aoe: [
    [1, "shockwave", 0.2, "tech", "しっぽの風"],
    [2, "poisonBurst", 0.3, "tech", "はじける毒"],
    [3, "zapVenom", 0.15, "tech", "静電気の毛"],
    [4, "slowShatter", 0.12, "atk", "まとめてつぶす"],
    [5, "objectSync", 0.1, "support", "おもちゃのリズム"],
    [6, "mamaGuard", 0.2, "def", "ママのそばの守り神"],
    [7, "poisonBurst", 0.8, "tech", "毒の大はじけ"],
    [8, "shockwave", 0.5, "atk", "大回転のうず"],
    [9, "killHeal", 0.02, "def", "ひなたぼっこ"],
    [10, "overkill", 0.5, "atk", "なだれ"],
    [11, "poisonBurst", 1.5, "tech", "毒の花火"],
    [11, "partyLink", 0.25, "support", "みんなの守り神"],
  ],
  fast: [
    [1, "frenzy", 0.03, "spd", "ノリノリ"],
    [2, "dodgeCounter", 0.3, "def", "よけてパンチ"],
    [3, "wakeUp", 0.7, "spd", "ねおきダッシュ"],
    [4, "kibbleFever", 0.03, "support", "カリカリでダッシュ"],
    [5, "killHeal", 0.01, "def", "走って元気"],
    [6, "multiEcho", 0.3, "atk", "れんぱのひびき"],
    [7, "frenzy", 0.06, "spd", "とまらない"],
    [8, "dodgeCounter", 0.8, "def", "みきりの反撃"],
    [9, "bossHunter", 0.3, "atk", "ボスのまわりをぐるぐる"],
    [10, "overkill", 0.5, "atk", "かけぬけ一閃"],
    [11, "frenzy", 0.1, "spd", "いなずまの大暴れ"],
    [11, "partyLink", 0.25, "support", "みんなでおいかけっこ"],
  ],
};

/** 段の数。 */
export const TIERS = TIER_MIN_LEVEL.length;

function defaultCost(max: number): number {
  if (max >= 10) return 3;
  if (max >= 5) return 6;
  if (max >= 3) return 10;
  return 20;
}
/** 複合効果のノードの基本のちゅ〜る。 */
const COMBO_COST = 15;

function buildTree(role: CharRole): SkillNode[] {
  const id = (key: string) => `${role}.${key}`;
  const nodes: SkillNode[] = [];
  const used = new Set<string>();
  const add = (n: Omit<SkillNode, "id" | "role" | "desc" | "minCharLevel"> & { key: string }) => {
    used.add(`${n.pos.x},${n.pos.y}`);
    const { key, ...rest } = n;
    nodes.push({
      ...rest,
      id: id(key),
      role,
      desc: effectsText(n.effects) + (n.maxLevel > 1 ? "（1レベルごと）" : ""),
      minCharLevel: TIER_MIN_LEVEL[n.tier],
    });
  };

  add({
    key: "root", name: "はじめの一歩", branch: "atk", tier: 0, maxLevel: 1, req: [], baseCost: 2,
    effects: [S("atk", 0.05), S("hp", 0.05)], combo: false, pos: { x: 7, y: 0 },
  });

  // 名前の重なりを数える
  const seen = new Map<string, number>();
  const nameOf = (fx: SkillEffect[]): string => {
    const st = fx[0].stat!;
    const n = seen.get(st) ?? 0;
    seen.set(st, n + 1);
    const list = STAT_NAMES[st];
    return list[n % list.length] + SUFFIX[Math.min(SUFFIX.length - 1, Math.floor(n / list.length))];
  };

  // ふつうのノード: 枝ごとに3列 × 12段。同じ列の1つ前の段が前提
  for (let t = 0; t < TIERS; t++) {
    SKILL_BRANCHES.forEach((b, bi) => {
      for (let lane = 0; lane < 3; lane++) {
        const c = laneCell(role, b, lane, t);
        const prev = t === 0 ? null : laneCell(role, b, lane, t - 1);
        add({
          key: `${b}${lane}_${t}`,
          name: nameOf(c.fx),
          branch: b,
          tier: t,
          maxLevel: c.max,
          req: prev ? [{ id: id(`${b}${lane}_${t - 1}`), lv: Math.min(3, prev.max) }] : [{ id: id("root"), lv: 1 }],
          baseCost: c.cost ?? defaultCost(c.max),
          effects: c.fx,
          combo: false,
          pos: { x: bi * 3 + lane, y: 1 + 2 * t },
        });
      }
    });
  }

  // 複合効果のノード: その段の、同じ枝の真ん中の列が前提。ふつうのノードのすぐ下の行に置く
  COMBO_ROWS[role].forEach(([t, combo, per, b, name, max], i) => {
    const bi = SKILL_BRANCHES.indexOf(b);
    const y = 2 + 2 * t;
    const x = [bi * 3 + 1, bi * 3, bi * 3 + 2].find((cx) => !used.has(`${cx},${y}`))!;
    const mid = laneCell(role, b, 1, t);
    add({
      key: `combo${i + 1}`,
      name,
      branch: b,
      tier: t,
      maxLevel: max ?? 3,
      req: [{ id: id(`${b}1_${t}`), lv: Math.min(3, mid.max) }],
      baseCost: COMBO_COST,
      effects: [C(combo, per)],
      combo: true,
      pos: { x, y },
    });
  });
  return nodes;
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

/** ツリーの大きさ（画面のスクロール用。マスの数）。 */
export const SKILL_TREE_SIZE = { w: 15, h: 2 + 2 * TIERS };

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
