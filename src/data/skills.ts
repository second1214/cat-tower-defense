// スキル盤（家族みんなで1つ）。FF10 のスフィア盤のような、1まいの大きな盤。ちゅ〜るで1レベルずつ取る。
// 盤のノードは、どの猫にも効く（役割ごとの枝はない）。つらぬく・連続攻撃・範囲なども、使える猫に効くふつうのノード。
// 形: まん中に「はじめの一歩」。そのまわりに輪が9本（0〜8）。5つの地方（攻撃・体力防御・速さ・技・支援）が、まん中から外へ広がる。
//   ・偶数の輪（0・2・4・6・8）は1周つながっていて、となりの地方へ歩いていける。
//   ・奇数の輪（1・3・5・7）は地方ごとに切れていて、切れ目の両はしに「宝」（複合効果）がある。
//   ・輪と輪のあいだは「ねこドア」（錠）を通る。ねこドアは家族の一番高いレベル（familyLevel）が足りないと開けられない。
//     偶数の輪から奇数の輪へは地方のまん中の道、奇数の輪から偶数の輪へは左右の道（ジグザグに進む）。
//   ・偶数の輪（2・4・6）の外がわに、つき出た「宝」。輪8の外には、3本の道の先に大きな「宝」。
// 取れるのは、線でつながったノードのどれかを Lv1 以上にしてから（はじめの一歩は、はじめから取れる）。
// 同じステータスの % は盤全体で足し算（掛け算にすると強くなりすぎるので）。外の輪ほどコストが高く、量も多い。
import type { ComboId } from "../core/types";

/** 地方（盤の5つの区分け）。 */
export type SkillRegion = "atk" | "def" | "spd" | "tech" | "support";
export const SKILL_REGIONS: SkillRegion[] = ["atk", "def", "spd", "tech", "support"];
export const REGION_NAMES: Record<SkillRegion, string> = {
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

/** ノードの種類。root = はじめの一歩、gate = ねこドア（錠）、combo = 宝（複合効果）。 */
export type SkillKind = "root" | "normal" | "gate" | "combo";

export interface SkillNode {
  id: string;
  name: string;
  /** 1レベルぶんの効果の説明。 */
  desc: string;
  /** どの地方か（色・アイコン）。はじめの一歩は atk。 */
  region: SkillRegion;
  kind: SkillKind;
  /** 輪（0 = まん中の輪 … 8 = いちばん外の輪、9 = 外の宝の道。はじめの一歩は -1）。 */
  ring: number;
  /** 段（0〜12）。コストと量の倍率。外の輪ほど深い。 */
  tier: number;
  maxLevel: number;
  /** 線でつながったノード（どれか1つが Lv1 以上なら取れる）。 */
  links: string[];
  /** 家族の一番高いレベル（familyLevel）がこれ以上で取れる（ねこドアだけ 2 以上）。 */
  minCharLevel: number;
  /** Lv0 → Lv1 の基本のちゅ〜る（段の倍率を掛ける前）。 */
  baseCost: number;
  effects: SkillEffect[];
  /** 複合効果のノード（宝）。 */
  combo: boolean;
  /** ねこドア（錠）。 */
  gate: boolean;
  /** 盤の上の位置（まん中が 0,0。y は下が +）。 */
  pos: { x: number; y: number };
  /** はじめの一歩から何歩か（線の数）。 */
  steps: number;
}

/** 段ごとの、ねこドアを開けるのに必要な家族のレベル（familyLevel）。 */
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
  // 1% より小さいときは、小数2けたまで
  return Math.abs(v) < 0.01 ? String(Math.round(v * 10000) / 100) : String(Math.round(v * 1000) / 10);
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

/** 効果の説明（level を掛けた量）。例: effectText(node, 3) → "猫の攻撃 +30%"。 */
export function effectText(node: SkillNode, level = 1): string {
  return effectsText(node.effects, level);
}

// ---- 盤の組み立て ----

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
/** ねこドア（錠）の名前（地方ごと）。 */
const GATE_NAMES: Record<SkillRegion, string> = {
  atk: "赤いねこドア", def: "緑のねこドア", spd: "青いねこドア", tech: "紫のねこドア", support: "黄色いねこドア",
};

/** ステータスごとの、ふつうのノード（最大レベル max）の1レベルの量。scale なら外の輪ほど増える。 */
const STAT_DEF: Record<SkillStat, { per: number; max: number; scale: boolean }> = {
  atk: { per: 0.032, max: 10, scale: true },
  hp: { per: 0.04, max: 10, scale: true },
  atkSpd: { per: 0.006, max: 10, scale: true },
  move: { per: 0.0125, max: 5, scale: true },
  objAtk: { per: 0.025, max: 10, scale: true },
  objHp: { per: 0.04, max: 5, scale: true },
  critMul: { per: 0.03, max: 5, scale: true },
  poison: { per: 0.015, max: 5, scale: true },
  rest: { per: 0.006, max: 5, scale: false },
  armor: { per: 0.006, max: 5, scale: false },
  range: { per: 0.08, max: 3, scale: false },
  aoe: { per: 0.025, max: 5, scale: false },
  crit: { per: 0.005, max: 5, scale: false },
  lifesteal: { per: 0.0025, max: 5, scale: false },
  regen: { per: 0.0005, max: 5, scale: false },
  knockback: { per: 0.03, max: 5, scale: false },
  slow: { per: 0.0075, max: 5, scale: false },
  kibble: { per: 0.0075, max: 5, scale: false },
  aura: { per: 0.015, max: 5, scale: false },
  repair: { per: 0.001, max: 5, scale: false },
  revive: { per: 0.02, max: 5, scale: false },
  dodge: { per: 0.003, max: 5, scale: false },
  multiHit: { per: 1, max: 1, scale: false },
  pierce: { per: 1, max: 1, scale: false },
};
/** 盤のノードは全部の猫に効くので、前の（役割ごとの）ツリーより1つあたり少し控えめ。 */
const VALUE_MUL = 0.7;
/** 段が深いほど、1レベルあたりの量を増やす。 */
const k = (t: number) => 1 + 0.2 * t;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** stat を最大レベル max のノードにしたときの1レベルの量（share = 1 で、ふつうの1ノードぶん）。 */
function statPer(st: SkillStat, max: number, t: number, share = 1): number {
  const d = STAT_DEF[st];
  return r5(d.per * (d.max / max) * share * (d.scale ? k(t) : 1) * VALUE_MUL);
}

interface Cell { fx: SkillEffect[]; max: number; cost?: number }
const single = (st: SkillStat, t: number): Cell => ({ fx: [S(st, statPer(st, STAT_DEF[st].max, t))], max: STAT_DEF[st].max });
/** みじかいノード（最大レベルが少ないかわりに、1レベルが大きい）。 */
const short = (st: SkillStat, t: number): Cell => {
  const d = STAT_DEF[st].max;
  const max = d >= 10 ? 5 : d >= 5 ? 3 : 2;
  return { fx: [S(st, statPer(st, max, t, 0.9))], max };
};
/** 2つのステータスが少しずつのびるノード。 */
const pair = (a: SkillStat, b: SkillStat, t: number, share = 0.6): Cell => {
  const max = Math.min(STAT_DEF[a].max, STAT_DEF[b].max);
  return { fx: [S(a, statPer(a, max, t, share)), S(b, statPer(b, max, t, share))], max };
};
/** 道（輪と輪をつなぐ道が通るところ）のノード。ふつうより少し大きい。 */
const road = (st: SkillStat, t: number): Cell => ({ fx: [S(st, statPer(st, STAT_DEF[st].max, t, 1.25))], max: STAT_DEF[st].max });
const once = (cost: number, ...fx: SkillEffect[]): Cell => ({ fx, max: 1, cost });

/** 地方ごとのステータス。main（地方の顔。道の上・輪の上）と sub（2つのびるノードの2つめ）。 */
const POOLS: Record<SkillRegion, { main: SkillStat[]; sub: SkillStat[] }> = {
  atk: { main: ["atk", "critMul", "atkSpd", "crit", "knockback", "lifesteal"], sub: ["atkSpd", "hp", "critMul", "crit", "lifesteal", "move", "atk"] },
  def: { main: ["hp", "armor", "dodge", "regen", "revive", "lifesteal"], sub: ["armor", "lifesteal", "revive", "regen", "hp", "dodge", "move"] },
  spd: { main: ["atkSpd", "move", "rest", "dodge", "revive", "atk"], sub: ["rest", "atk", "move", "dodge", "atkSpd", "lifesteal", "revive"] },
  tech: { main: ["poison", "slow", "crit", "critMul", "aoe", "knockback"], sub: ["critMul", "lifesteal", "poison", "slow", "atk", "range", "aoe"] },
  support: { main: ["objAtk", "objHp", "kibble", "aura", "repair", "hp"], sub: ["objHp", "kibble", "aura", "repair", "objAtk", "hp", "atk"] },
};

/** 輪の上の、道と道のあいだのノード（j = その地方・その輪で何番め）。かたちを順にまわして、かぶらないようにする。 */
function arcCell(region: SkillRegion, ring: number, j: number, t: number): Cell {
  const { main, sub } = POOLS[region];
  const a = main[(j + Math.floor(j / 6) + ring * 2) % main.length];
  const v = (j + ring) % 3;
  if (v === 0) return single(a, t);
  if (v === 1) return short(a, t);
  let b = sub[(j * 3 + ring) % sub.length];
  if (b === a) b = sub[(j * 3 + ring + 1) % sub.length];
  return pair(a, b, t);
}

/** 地方のさかいめのノード（2つの地方のステータスがまざる）。 */
function borderCell(region: SkillRegion, other: SkillRegion, ring: number, j: number, t: number): Cell {
  const a = POOLS[region].main[(j + ring) % 6];
  let b = POOLS[other].main[(j * 2 + ring + 1) % 6];
  if (b === a) b = POOLS[other].main[(j * 2 + ring + 2) % 6];
  return pair(a, b, t, 0.65);
}

/** 複合効果の宝: [前のツリーでの段（ならべる順）, 効果（1レベルの量）, 名前, 最大レベル]。地方ごとに 17。 */
type ComboRow = [number, SkillEffect[], string, number?];
const REGION_COMBOS: Record<SkillRegion, ComboRow[]> = {
  atk: [
    [0, [C("pierceGrow", 0.05)], "つらぬくほど強く"],
    [1, [C("slowShatter", 0.08)], "ねらいうち"],
    [2, [C("bossHunter", 0.1)], "大物きらい"],
    [2, [C("critChain", 1)], "ビリッとひっかき", 1],
    [3, [C("venomCrit", 0.04)], "毒をねらう"],
    [4, [C("overkill", 0.15)], "あまった力"],
    [4, [C("pierceGrow", 0.12), C("overkill", 0.1)], "一直線"],
    [6, [C("lastStand", 0.15)], "ねばり腰"],
    [7, [C("critChain", 1), C("venomCrit", 0.02)], "いなずまの爪", 2],
    [8, [C("bossHunter", 0.2), C("overkill", 0.1)], "ボスたおし"],
    [8, [C("bossHunter", 0.3)], "大物ねらい"],
    [9, [C("pierceGrow", 0.25)], "千里の一矢"],
    [10, [C("critChain", 1)], "かみなりの爪", 3],
    [10, [C("overkill", 0.5)], "うちぬき"],
    [11, [C("zapVenom", 0.4)], "ビリビリ毒"],
    [12, [C("overkill", 0.6), C("bossHunter", 0.3)], "伝説のけんか猫"],
    [12, [C("critChain", 2), C("partyLink", 0.15)], "かみなりの雨", 2],
  ],
  def: [
    [0, [C("knockSlam", 0.15)], "ぶつけパンチ"],
    [1, [C("killHeal", 0.004)], "ごはんで元気"],
    [1, [C("killHeal", 0.006), C("lastStand", 0.08)], "いただきます"],
    [2, [C("lastStand", 0.2)], "ふんばり"],
    [3, [C("mamaGuard", 0.06)], "ママのそば"],
    [3, [C("multiEcho", 0.3)], "ひびくパンチ"],
    [4, [C("knockSlam", 0.4), C("slowShatter", 0.05)], "かべドン"],
    [5, [C("wakeUp", 0.3)], "すっきり起きる"],
    [6, [C("overkill", 0.3)], "もう一発"],
    [7, [C("killHeal", 0.008), C("lastStand", 0.1)], "食べてふんばる"],
    [7, [C("multiEcho", 0.5), C("knockSlam", 0.2)], "どすこい乱れうち"],
    [8, [C("bossHunter", 0.25)], "ボスとのけんか"],
    [9, [C("mamaGuard", 0.12)], "ママの用心棒"],
    [9, [C("lastStand", 0.5)], "九つの命"],
    [10, [C("knockSlam", 0.8)], "町内一のぶちかまし"],
    [11, [C("multiEcho", 0.8)], "町いちばんのけんか"],
    [12, [C("wakeUp", 0.8), C("killHeal", 0.01)], "不死身のねこ"],
  ],
  spd: [
    [0, [C("frenzy", 0.015)], "ノリノリ"],
    [1, [C("dodgeCounter", 0.15)], "よけてパンチ"],
    [2, [C("frenzy", 0.02)], "ノリノリ気分"],
    [2, [C("wakeUp", 0.6)], "ねおきダッシュ"],
    [4, [C("wakeUp", 0.7)], "とびおき"],
    [4, [C("killHeal", 0.008)], "走って元気"],
    [5, [C("multiEcho", 0.3)], "れんぱのひびき"],
    [6, [C("kibbleFever", 0.015)], "おやつでダッシュ"],
    [6, [C("frenzy", 0.05), C("dodgeCounter", 0.15)], "とまらない"],
    [7, [C("dodgeCounter", 0.6)], "みきりの反撃"],
    [8, [C("frenzy", 0.06)], "止まらない足"],
    [8, [C("bossHunter", 0.3)], "ボスのまわりをぐるぐる"],
    [9, [C("wakeUp", 1.2)], "ねぼすけ返上"],
    [10, [C("dodgeCounter", 0.7)], "ひらりと反撃"],
    [10, [C("overkill", 0.5)], "かけぬけ一閃"],
    [11, [C("frenzy", 0.09)], "いなずまの大暴れ"],
    [12, [C("frenzy", 0.1), C("kibbleFever", 0.02)], "つむじ風の大暴れ"],
  ],
  tech: [
    [0, [C("shockwave", 0.15)], "しっぽの風"],
    [1, [C("slowShatter", 0.06)], "にげ足ねらい"],
    [1, [C("poisonBurst", 0.25)], "はじける毒"],
    [2, [C("zapVenom", 0.12)], "静電気の毛"],
    [3, [C("venomCrit", 0.03)], "毒のすきま"],
    [3, [C("slowShatter", 0.1)], "まとめてつぶす"],
    [4, [C("shockwave", 0.3), C("objectSync", 0.05)], "うずまき"],
    [5, [C("poisonBurst", 0.3)], "ぷちっと毒"],
    [6, [C("poisonBurst", 0.6)], "毒の大はじけ"],
    [7, [C("slowShatter", 0.12), C("venomCrit", 0.02)], "じわじわ追いつめ"],
    [7, [C("multiEcho", 0.3)], "ひびく大回転"],
    [8, [C("shockwave", 0.5)], "大回転のうず"],
    [9, [C("zapVenom", 0.2)], "しびれ毒"],
    [10, [C("overkill", 0.5)], "なだれ"],
    [11, [C("poisonBurst", 1.2), C("zapVenom", 0.3)], "毒の花火"],
    [11, [C("venomCrit", 0.05), C("slowShatter", 0.1)], "毒とわなの名人"],
    [12, [C("poisonBurst", 1.5), C("slowShatter", 0.15)], "毒のくす玉"],
  ],
  support: [
    [1, [C("partyLink", 0.03)], "みんなでおやつ"],
    [2, [C("kibbleFever", 0.015)], "カリカリのごほうび"],
    [3, [C("kibbleFever", 0.025)], "カリカリでダッシュ"],
    [4, [C("objectSync", 0.05)], "いっしょに遊ぶ"],
    [5, [C("kibbleFever", 0.03)], "カリカリでやる気"],
    [5, [C("mamaGuard", 0.12)], "ママの前に立つ"],
    [5, [C("mamaGuard", 0.15)], "ママのそばの守り神"],
    [6, [C("partyLink", 0.06)], "なかよしパワー"],
    [6, [C("objectSync", 0.08)], "おもちゃと息を合わせる"],
    [7, [C("objectSync", 0.09), C("kibbleFever", 0.01)], "おもちゃ箱のひみつ"],
    [8, [C("objectSync", 0.1)], "おもちゃの名コンビ"],
    [9, [C("killHeal", 0.015)], "ひなたぼっこ"],
    [10, [C("partyLink", 0.12)], "家族のきずな"],
    [12, [C("objectSync", 0.15), C("partyLink", 0.1), C("kibbleFever", 0.02)], "ねこカフェの看板猫"],
    [12, [C("partyLink", 0.2), C("bossHunter", 0.2)], "ボス猫の号令"],
    [12, [C("multiEcho", 0.6), C("frenzy", 0.03), C("partyLink", 0.15)], "みんなでおいかけっこ"],
    [12, [C("shockwave", 0.8), C("partyLink", 0.15)], "台風の目"],
  ],
};

/** 輪の半径（盤の上の距離）。0 がまん中の輪。 */
export const RING_R = [140, 310, 480, 650, 820, 990, 1160, 1330, 1500];
/** 輪ごとの段（コストと量）。外の輪ほど深い。 */
const RING_TIER = [0, 1, 2, 3, 4, 6, 8, 10, 11];
/** 輪8の外の、宝の道の段。 */
const OUTER_TIER = 12;
/** 地方のまん中から、左右の道までの角度（度）。 */
const LANE_DEG = 22;
/** 輪の上のノードのあいだ（だいたい）。 */
const STEP = 68;
/** 地方のまん中の向き（度。-90 = 上）。攻撃が上で、時計まわりに 体力防御・速さ・技・支援。 */
export function regionDeg(ri: number): number {
  return -90 + 72 * ri;
}
const RAD = Math.PI / 180;
const polar = (r: number, deg: number) => ({ x: Math.round(r * Math.cos(deg * RAD)), y: Math.round(r * Math.sin(deg * RAD)) });

function defaultCost(max: number): number {
  if (max >= 10) return 1.5;
  if (max >= 5) return 3;
  if (max >= 3) return 5;
  if (max >= 2) return 7;
  return 10;
}
const GATE_COST = 8;
const COMBO_COST = 10;

interface Draft {
  id: string;
  region: SkillRegion;
  kind: SkillKind;
  ring: number;
  tier: number;
  cell: Cell;
  pos: { x: number; y: number };
  minCharLevel: number;
  links: string[];
  name?: string;
  /** 宝にする場所。 */
  slot?: boolean;
}

function buildBoard(): SkillNode[] {
  const drafts = new Map<string, Draft>();
  const add = (d: Omit<Draft, "links" | "minCharLevel"> & { minCharLevel?: number }): Draft => {
    const x: Draft = { minCharLevel: 1, ...d, links: [] };
    drafts.set(x.id, x);
    return x;
  };
  const link = (a: string, b: string) => {
    const A = drafts.get(a)!, B = drafts.get(b)!;
    if (!A.links.includes(b)) A.links.push(b);
    if (!B.links.includes(a)) B.links.push(a);
  };
  const R = SKILL_REGIONS;

  add({ id: "root", region: "atk", kind: "root", ring: -1, tier: 0, pos: { x: 0, y: 0 }, cell: { fx: [S("atk", 0.05), S("hp", 0.05)], max: 1, cost: 2 }, name: "はじめの一歩" });

  // 輪（ring）。lanes[k][地方][0,1,2] = 左・まん中・右の道が通るノード
  const lanes: string[][][] = [];
  const ringNodes: Draft[][] = [];
  for (let k = 0; k < RING_R.length; k++) {
    const rad = RING_R[k], t = RING_TIER[k], odd = k % 2 === 1;
    const nIn = Math.max(0, Math.round((rad * LANE_DEG * RAD) / STEP) - 1);
    let nB = Math.max(0, Math.round((rad * (72 - 2 * LANE_DEG) * RAD) / STEP) - 1);
    if (odd) nB = Math.max(2, nB + (nB % 2)); // 切れ目の左右に同じ数
    const order: { d: Draft; cut?: boolean }[] = [];
    lanes[k] = [];
    R.forEach((reg, ri) => {
      const base = regionDeg(ri);
      const next = R[(ri + 1) % R.length];
      let j = 0;
      const ids: string[] = [];
      const laneAt = (li: number) => {
        const st = POOLS[reg].main[li === 1 ? 0 : (li + k) % 6];
        const d = add({ id: `${reg}.r${k}.${"lcr"[li]}`, region: reg, kind: "normal", ring: k, tier: t, pos: polar(rad, base + (li - 1) * LANE_DEG), cell: road(st, t) });
        ids.push(d.id);
        order.push({ d });
      };
      const arc = (from: number, n: number, tag: string) => {
        for (let i = 0; i < n; i++) {
          const deg = from + (LANE_DEG * (i + 1)) / (n + 1);
          order.push({ d: add({ id: `${reg}.r${k}.${tag}${i}`, region: reg, kind: "normal", ring: k, tier: t, pos: polar(rad, deg), cell: arcCell(reg, k, j++, t) }) });
        }
      };
      laneAt(0);
      arc(base - LANE_DEG, nIn, "a");
      laneAt(1);
      arc(base, nIn, "b");
      laneAt(2);
      // 地方のさかいめ（前半はこの地方、後半はとなりの地方）
      const span = 72 - 2 * LANE_DEG;
      for (let i = 0; i < nB; i++) {
        const deg = base + LANE_DEG + (span * (i + 1)) / (nB + 1);
        const mine = i < nB / 2;
        const reg2 = mine ? reg : next;
        const d = add({
          id: `${reg2}.r${k}.${mine ? "e" : "w"}${mine ? i : nB - 1 - i}`, region: reg2, kind: "normal", ring: k, tier: t, pos: polar(rad, deg),
          cell: borderCell(reg2, mine ? next : reg, k, mine ? i : nB - 1 - i, t),
        });
        // 奇数の輪は、さかいめのまん中で切れる。切れ目の両はしが宝
        const cutHere = odd && i === nB / 2 - 1;
        if (odd && (i === nB / 2 - 1 || i === nB / 2)) d.slot = true;
        order.push({ d, cut: cutHere });
      }
      lanes[k][ri] = ids;
    });
    for (let i = 0; i < order.length; i++) {
      if (order[i].cut) continue;
      link(order[i].d.id, order[(i + 1) % order.length].d.id);
    }
    ringNodes[k] = order.map((o) => o.d);
  }

  // まん中から輪0へ
  R.forEach((_, ri) => link("root", lanes[0][ri][1]));

  // 輪と輪のあいだ: ねこドア。偶数の輪 → 奇数の輪はまん中の道、奇数 → 偶数は左右の道
  for (let k = 0; k + 1 < RING_R.length; k++) {
    const t = RING_TIER[k + 1];
    const mid = (RING_R[k] + RING_R[k + 1]) / 2;
    R.forEach((reg, ri) => {
      for (const li of k % 2 === 0 ? [1] : [0, 2]) {
        const g = add({
          id: `${reg}.g${k}${"lcr"[li]}`, region: reg, kind: "gate", ring: k, tier: t, pos: polar(mid, regionDeg(ri) + (li - 1) * LANE_DEG),
          cell: once(GATE_COST, S(POOLS[reg].main[0], statPer(POOLS[reg].main[0], 1, t, 0.2)), S(POOLS[reg].sub[li], statPer(POOLS[reg].sub[li], 1, t, 0.2))),
          minCharLevel: TIER_MIN_LEVEL[t], name: GATE_NAMES[reg],
        });
        link(lanes[k][ri][li], g.id);
        link(g.id, lanes[k + 1][ri][li]);
      }
    });
  }

  // 偶数の輪（2・4・6）の外がわに、つき出た宝
  for (const k of [2, 4, 6]) {
    R.forEach((reg, ri) => {
      for (const side of [-1, 1]) {
        const deg = regionDeg(ri) + side * LANE_DEG / 2;
        const p = add({ id: `${reg}.p${k}${side < 0 ? "l" : "r"}`, region: reg, kind: "normal", ring: k, tier: RING_TIER[k], pos: polar(RING_R[k] + 62, deg), cell: single("atk", 0), slot: true });
        // いちばん近い輪のノードにつなぐ
        const near = ringNodes[k].filter((d) => d.region === reg && d.kind === "normal" && !d.slot)
          .sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.y - p.pos.y) - Math.hypot(b.pos.x - p.pos.x, b.pos.y - p.pos.y))[0];
        link(near.id, p.id);
      }
    });
  }

  // 輪8の外: 3本の宝の道（まん中は長い）。入口はねこドア
  const last = RING_R.length - 1;
  R.forEach((reg, ri) => {
    for (const li of [0, 1, 2]) {
      const deg = regionDeg(ri) + (li - 1) * LANE_DEG;
      const len = li === 1 ? 4 : 3;
      let prev = lanes[last][ri][li];
      for (let i = 0; i < len; i++) {
        const rad = RING_R[last] + 80 * (i + 1) + (i === len - 1 ? 8 : 0);
        const kind: SkillKind = i === 0 ? "gate" : "normal";
        const st = POOLS[reg].main[(li * 2 + i) % 6];
        const d = add({
          id: `${reg}.o${"lcr"[li]}${i}`, region: reg, kind, ring: last + 1, tier: OUTER_TIER, pos: polar(rad, deg),
          cell: kind === "gate" ? once(GATE_COST, S(POOLS[reg].main[0], statPer(POOLS[reg].main[0], 1, OUTER_TIER, 0.2)), S(POOLS[reg].sub[li + 3], statPer(POOLS[reg].sub[li + 3], 1, OUTER_TIER, 0.2)))
            : i % 2 ? single(st, OUTER_TIER) : pair(st, POOLS[reg].sub[(li + i) % 7] === st ? POOLS[reg].sub[(li + i + 1) % 7] : POOLS[reg].sub[(li + i) % 7], OUTER_TIER),
          minCharLevel: kind === "gate" ? TIER_MIN_LEVEL[OUTER_TIER] : 1, name: kind === "gate" ? GATE_NAMES[reg] : undefined,
          slot: i === len - 1,
        });
        link(prev, d.id);
        prev = d.id;
      }
    }
  });

  // つらぬく・連続攻撃（1回だけのとくべつなノード。使える猫に効く）
  const special = (id: string, cell: Cell) => { drafts.get(id)!.cell = cell; };
  special("tech.r2.l", once(10, S("pierce", 1)));
  special("tech.r5.r", once(10, S("pierce", 1)));
  special("tech.r8.c", once(10, S("pierce", 1)));
  special("atk.r4.c", once(15, S("multiHit", 1)));
  special("spd.r7.c", once(15, S("multiHit", 1)));

  // はじめの一歩から何歩か（線をたどる）
  const steps = new Map<string, number>([["root", 0]]);
  const queue = ["root"];
  while (queue.length) {
    const id = queue.shift()!;
    for (const nb of drafts.get(id)!.links) if (!steps.has(nb)) { steps.set(nb, steps.get(id)! + 1); queue.push(nb); }
  }

  // 宝: 地方ごとに、浅い場所から順に、前のツリーの浅い段の複合効果を置く。同じ複合効果は、奥ほど強く
  for (const reg of R) {
    const slots = [...drafts.values()].filter((d) => d.region === reg && d.slot)
      .sort((a, b) => a.tier - b.tier || steps.get(a.id)! - steps.get(b.id)! || (a.id < b.id ? -1 : 1));
    const rows = [...REGION_COMBOS[reg]].sort((a, b) => a[0] - b[0]);
    if (rows.length !== slots.length) throw new Error(`宝の数が合わない: ${reg} ${rows.length}/${slots.length}`);
    const best = new Map<ComboId, number>();
    slots.forEach((d, i) => {
      const [, fx, name, max = 3] = rows[i];
      const out = fx.map((e) => {
        const prev = best.get(e.combo!) ?? 0;
        let per = e.per;
        if (per * max <= prev) per = Math.ceil((prev * 1.15 / max) * 1000) / 1000;
        best.set(e.combo!, per * max);
        return C(e.combo!, per);
      });
      d.kind = "combo";
      d.cell = { fx: out, max, cost: COMBO_COST };
      d.name = name;
    });
  }

  // 名前（はじめの一歩から近い順。同じステータスが何度も出るときは「・二」などをつける）
  const list = [...drafts.values()].sort((a, b) => steps.get(a.id)! - steps.get(b.id)!);
  const seen = new Map<string, number>();
  const nodes: SkillNode[] = list.map((d) => {
    let name = d.name;
    if (!name) {
      const st = d.cell.fx[0].stat!;
      const n = seen.get(st) ?? 0;
      seen.set(st, n + 1);
      const names = STAT_NAMES[st];
      const round = Math.floor(n / names.length);
      name = names[n % names.length] + (round > 0 ? `・${KANJI[Math.min(KANJI.length - 1, round)]}` : "");
    }
    const node: SkillNode = {
      id: d.id, name, desc: "", region: d.region, kind: d.kind, ring: d.ring, tier: d.tier, maxLevel: d.cell.max,
      links: d.links, minCharLevel: d.minCharLevel, baseCost: d.cell.cost ?? defaultCost(d.cell.max), effects: d.cell.fx,
      combo: d.kind === "combo", gate: d.kind === "gate", pos: d.pos, steps: steps.get(d.id) ?? -1,
    };
    node.desc = effectText(node) + (node.maxLevel > 1 ? "（1レベルごと）" : "");
    return node;
  });
  return nodes;
}

/** 家族みんなで1つのスキル盤（はじめの一歩から近い順）。 */
export const SKILL_TREE: SkillNode[] = buildBoard();

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(SKILL_TREE.map((n) => [n.id, n]));

/** 盤の線（つながり）。1本につき1つ（[a, b]）。 */
export const SKILL_LINKS: [string, string][] = (() => {
  const out: [string, string][] = [];
  for (const n of SKILL_TREE) for (const m of n.links) if (n.id < m) out.push([n.id, m]);
  return out;
})();

/** 盤の大きさ（ノードの位置のはし）。 */
export const SKILL_BOARD = {
  minX: Math.min(...SKILL_TREE.map((n) => n.pos.x)),
  maxX: Math.max(...SKILL_TREE.map((n) => n.pos.x)),
  minY: Math.min(...SKILL_TREE.map((n) => n.pos.y)),
  maxY: Math.max(...SKILL_TREE.map((n) => n.pos.y)),
};

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
