// 戦闘の計算（DOM 非依存）。描画は別のファイルが state を読んで行う。
//
// v3: 大きな盤面（14列 × 18行）の迷路タワーディフェンス。
// 座標はマス単位。x ∈ [0, COLS)、y ∈ [0, ROWS)。y=0 が上（虫が出てくる側）。マス (col, row) の中心は (col + 0.5, row + 0.5)。
// ママは一番下の真ん中の 2×2 マス（列 GOAL_COL〜GOAL_COL+1、行 GOAL_ROW〜GOAL_ROW+1）。虫はそこへ集まってくる。
//
// 決めごと:
// - 虫はすべて地面を歩く（飛ぶ虫・障害物を無視する虫は無し。def.fly は無視する）。
//   「ママまでの距離」（マスごとの最短距離。8方向、ななめは √2、壁の角はすり抜けない）を下る方へ、
//   マスの中心からマスの中心へなめらかに進む。距離はオブジェクトが増えた・減ったときだけ計算しなおす。
// - オブジェクトには大きさ（w×h マス）がある。置くときは左上のマス（アンカー）を指定する。
//   盤面の外・家具・ほかのオブジェクト・ママのマスに重なる置き方はできない。
// - 通れないオブジェクト（def.block）は、しめるマスすべてで虫の道をふさぐ。
//   「出口からママへの道がなくなる」「いる虫が閉じこめられる」置き方はできない（wouldSeal）。
// - 虫がいるマスにも置ける。通れないものの下にいた虫は、近くの空いた（ママへ行ける）マスへ押し出す（"push" イベント）。
// - 置いたあとの待ち時間は無し（def.cooldown は使わない）。カリカリがあればいくつでも置ける。
// - 強化は置いたオブジェクトを指定して行う（upgrade(obj)）。猫の位置とは関係ない。
// - 出口: 波の lanes があればその列の一番上のマス（必ず空けておく）。lanes が無い虫は、いま通れる一番上のマスから
//   ばらばらに出る（一番上のマスのうち、少なくとも1つは空けておく）。章 3 以上では、ときどき左右の上の方（0〜SIDE_SPAWN_ROWS-1 行）から出る。
// - 虫は猫に触れている間（距離 0.5 未満）は止まって猫をかじる（dodge でよけることがある）。オブジェクトもかじる（v5 を見る）。
// - 虫がママに着くと mamaHp が 1 減る。ボスが着いたら、その場で負け（mamaHp = 0）。
// - カリカリは、虫を倒した瞬間に手に入る（drop × global.kibbleMul × (1 + char.kibbleBonus)）。producer も直接増やす。
// - オブジェクトの種類:
//   shooter: range 以内のいちばん近い虫へ弾を撃つ。multishot で扇形に追加の弾（spread の角度）。
//   aoe: 範囲内に虫がいれば、まとめてダメージ（slow < 1 なら当てた虫も遅くする）。slow: 範囲内の虫にダメージ＋遅くする。mine: 虫が乗ると爆発（1回）。
//   zap: いちばん近い虫に電撃。当たった虫から chainRange 以内の、まだ当たっていない一番近い虫へ chain 回飛び移る。
//   poison: 範囲内の虫すべてに毒（毎秒 atk × (poison || 1)、3 秒。かかり直すと時間が戻る）。
//   producer: カリカリを生む。wall: ふさぐだけ。
// - range は、しめるマスの中心からの半径（マス）。
// - オブジェクトの特殊効果（どの種類の攻撃にも効く）: pierce（弾が突き抜ける）・splash（当たった所のまわりにも）・
//   poison（当てた虫に毒）・poisonSpread（毒で倒れた虫のまわりの虫へ毒がうつる。うつった虫が倒れると、さらにうつる）・
//   knockback（押し戻す。ボスは半分）・crit/critMul（会心）。
// - 猫の特殊技能（ResolvedChar）は v2 と同じ。
// - 内部では 1/60 秒以下に分けて計算する。虫の近さを調べるときは、マスごとの入れ物（spatial hash）を使う。
//   たくさんの虫（〜400）・弾でも重くならないよう、毎コマの new をできるだけしない（弾・数字・イベントは使い回す）。
//
// v2 からの API の変更:
// - GOAL_W/GOAL_H/GOAL_X/GOAL_Y を追加（ママは 2×2）。isGoal(col,row) を追加。
// - 置く: place(i, col, row)（すぐ置く。CheckResult を返す）・placeCheck(i, col, row)（col,row は左上のマス）・
//   anchorAt(i, x, y)（盤面の点を中心にしたときの左上のマス）・footprint(i)・canAfford(i)。
// - 強化: upgrade(obj | uid)・upgradeCheck(obj)。canUpgrade()・canPlace()・cooldowns・cooldownRatio() は削除。
//   BattleInput.place / upgrade はまだ使える（猫のいるマスに置く・猫のいるマスのオブジェクトを強化）が、画面では使わない。
// - wouldSeal(col, row, w = 1, h = 1)。objectByUid(uid)。obstacles は w,h つき。
// - ObjState: w・h・cx・cy（中心）を追加。BugState: poisonSpread・mark を追加。
// - Projectile: target（追いかける虫。null ならまっすぐ）・src（撃ったオブジェクト）を追加。
// - BattleEvent: x2・y2 を追加（"zap" の電撃の終わり・"push" の元の位置）。
//   イベントに "push" | "zap" | "splash" | "poisonCloud" | "poisonSpread" を追加。
// - events の中身（イベントの入れ物）は使い回すので、次の step() のあとまで持っておかないこと（必要ならコピーする）。
//   step() の外（place・upgrade）で起きたイベントは、次の step() の events にも残る。
//
// v4（相棒・複合効果）:
// - 猫は cats 配列（[0] = 主人公、[1]〜 = 相棒。Loadout.companions の順）。cat は cats[0] と同じ（互換のため残す）。
//   どの猫も同じ攻撃のしくみ（役割・特殊技能・複合効果）で戦い、HP 0 で休けい・restTime で復活する。虫はどの猫にもかじりつく。
// - 相棒は AI で動く（v5 で、主人公についていくのをやめて自分で歩き回るようにした。下の v5 を見る）。
// - 複合効果（ResolvedChar.combos。意味は core/types.ts の ComboId）はすべての猫に効く。
//   「攻撃 +v」は足し算でまとめる（攻撃力 × (1 + lastStand + kibbleFever×重ね + partyLink + mamaGuard)）。
//   「攻撃の速さ」は間隔を (1 + frenzy×重ね + partyLink) で割る（wakeUp 中はさらに半分）。
//   slowShatter・bossHunter は、その猫が与えるすべてのダメージ（毒・爆発・電撃も）に掛ける。
//   「範囲攻撃」は、猫の範囲の当たり（aoe の猫・aoe > 0・弾の splash・multiEcho）。shockwave と zapVenom が効く。
//   「虫を倒すたび」（frenzy・killHeal・overkill）は、その猫の攻撃（猫の毒・爆発・電撃・反撃・overkill も含む）で倒したとき。
//   kibbleFever は、だれが倒しても（producer でも）カリカリが入るたび。
//   poisonBurst は、毒がかかった虫が（だれに倒されても）倒れたとき、poisonBurst を持つ猫のうち いちばん強い猫が爆発させる。
//   爆発・overkill はつながる（倒れた虫がさらに爆発する）ので、順番待ちの列（fxQ）で1つずつ処理する。
// - objectAura・kibbleBonus は、いちばん大きい猫の値を使う（足し算はしない）。
//
// v5（置くあいだは止まる・相棒は歩き回る・オブジェクトの耐久）:
// - setHold(true) のあいだ、step() は何も進めない（虫・猫・オブジェクト・弾・出てくる時間すべて止まる）。
//   イベントの入れかえ（place・upgrade のイベントを渡す）と、ダメージの数字が消えていくのだけは進む。画面は置くあいだ・強化の窓を出すあいだに使う。
// - 相棒は主人公にくっつかず、自分で歩き回る（猫らしく、ときどき座る・毛づくろいする。CatState.idle）。
//   歩く先は、虫が多い所・虫の道の上・ほかの猫やオブジェクトが守っていない所を好む（主人公から COMPANION_ROAM マス以内、出口の近くは少しさける）。
//   自分から COMPANION_SIGHT マス以内の虫を見つけると追いかけて戦う。COMPANION_GIVEUP マスより離れたらあきらめる。
//   partyLink は、たまたま近くにいるときだけ効く。
// - 虫はオブジェクトもかじる:
//   ・通れるオブジェクト（block = false。mine は除く）の上を歩く虫は、止まらずに 攻撃力×WEAR_MUL を atkInterval ごとに与える（すり減る）。
//   ・かじる虫（def.chew > 0。ボスは chew が最低 1）は、別の道（chewFlowField）を使う。通れないオブジェクトのマスも、
//     CHEW_COST 歩ぶん遠いだけで通れるものとして数える（家具は通れない）。次のマスに通れないオブジェクトがあれば、
//     止まって 攻撃力×chew を atkInterval ごとに与え、こわれたら進む（BugState.chewObj・mode "chew"）。
//   ・HP が 0 になったオブジェクトは消える（"objectBroken"）。ダメージのたびに "objectHit"。
// - catResist: 猫から（主人公・相棒。猫の毒・爆発・電撃・反撃・弾・overkill も）のダメージに def.catResist を掛ける。
//   ダメージの数字は "resist"（灰色）になり、虫ごとにときどき "resist" イベント（「かたい」の表示用）。
// - pack: def.pack > 1 の虫は、1回に pack 匹が横にならんで出る（となりの列・行。波の虫の数も pack 倍）。

import { COLS, ROWS } from "../core/types";
import type {
  BattleInput,
  BattleResult,
  BugDef,
  ComboId,
  Loadout,
  ResolvedChar,
  ResolvedObject,
} from "../core/types";

// ---- 調整用の定数 ----
export const GOAL_W = 2;
export const GOAL_H = 2;
export const GOAL_COL = Math.floor(COLS / 2) - 1;
export const GOAL_ROW = ROWS - GOAL_H;
/** ママの中心。 */
export const GOAL_X = GOAL_COL + GOAL_W / 2;
export const GOAL_Y = GOAL_ROW + GOAL_H / 2;
export const SPAWN_Y = -0.5;          // 上から出てくる虫の y
export const CAT_TOUCH = 0.5;         // 虫が猫に触れる距離
export const SLOW_TIME = 2;           // slow の効き目の秒数
export const POISON_TIME = 3;         // 毒の秒数
export const POISON_TICK = 0.5;       // 毒のダメージの間隔
export const UPGRADE_COST_GROWTH = 1.5;
export const MINE_RADIUS = 1.5;
export const AURA_RADIUS = 2;         // objectAura が届く距離
export const OBJ_SHOT_SPEED = 9;      // オブジェクトの弾の速さ（マス/秒）
export const HOMING_SHOT_SPEED = 10;  // 猫の弾の速さ
export const SHOT_HIT_R = 0.4;        // まっすぐ進む弾が虫に当たる距離
export const DEFAULT_SPREAD = 0.45;   // multishot があって spread が 0 のときの扇の角度
export const MULTI_HIT_GAP = 0.1;     // 連続攻撃の間隔（秒）
export const BUG_SPREAD = 0.22;       // 虫の横ずれの最大
export const SIDE_SPAWN_CHAPTER = 3;  // この章から、左右からも出てくる
export const SIDE_SPAWN_CHANCE = 0.25;
export const SIDE_SPAWN_ROWS = 6;     // 左右から出るときの行（0〜5。src/data/stages.ts と同じ）
export const FLOAT_LIFE = 0.8;        // ダメージ数字の表示時間
export const KNOCK_TIME = 0.15;       // 押し戻し・押し出しの見た目の秒数
const MAX_SUBSTEP = 1 / 60;
const MAX_FLOATS = 90;
const MAX_EVENTS = 2500;              // 1 回の step で出すイベントの上限（"hit" などの細かいものから捨てる）
const EVENT_POOL = 8192;
const SQRT2 = Math.SQRT2;

// ---- オブジェクトの耐久 ----
/** 通れるオブジェクトの上を歩く虫が与えるダメージの倍率（攻撃力 × これ を atkInterval ごと）。 */
export const WEAR_MUL = 0.5;
/** かじる虫の道で、通れないオブジェクトのマスに入るときに足す長さ（歩数）。 */
export const CHEW_COST = 6;
/** 同じ虫の「かたい」イベントの間隔（秒）。 */
const RESIST_HINT_GAP = 2.5;

// ---- 相棒・複合効果 ----
/** 相棒が自分で見つけて戦いに行く虫の距離（相棒から。マス）。 */
export const COMPANION_SIGHT = 3.5;
/** 互換のため残す（= COMPANION_SIGHT）。 */
export const COMPANION_LEASH = COMPANION_SIGHT;
/** 追いかけている虫がこれより離れたら、あきらめる（マス）。 */
export const COMPANION_GIVEUP = 5;
/** 相棒が主人公から離れてよい距離の目安（マス）。これより遠いと戻ってくる。 */
export const COMPANION_ROAM = 7;
/** 相棒が歩く先にしない、上の端の行（虫の出口のそば）。左右の端もこのマス数はさける。 */
const ROAM_EDGE_TOP = 2.5;
const ROAM_EDGE_SIDE = 1.1;
/** 相棒が狙う虫を選びなおす間隔（秒）。 */
const COMPANION_RETARGET = 0.25;
/** 相棒の初めの位置（主人公からのずれ。マス）。 */
export const COMPANION_SLOTS: readonly [number, number][] = [[-1.0, 0.7], [1.0, 0.7], [0, 1.2], [-1.6, -0.3], [1.6, -0.3]];
const CATCH_UP = 1.3;                 // 離れすぎたときの速さの倍率
const STROLL = 0.6;                   // ぶらぶら歩くときの速さの倍率
const IDLE_MIN = 1;                   // 座る・毛づくろいの秒数（IDLE_MIN〜IDLE_MAX）
const IDLE_MAX = 3;
const IDLE_CHANCE = 0.65;             // 歩く先に着いたとき、ひと休みする確率
const WANDER_TIMEOUT = 6;             // 歩く先へ、これだけかかったら選びなおす（秒）
const WANDER_TRIES = 10;              // 歩く先の候補の数
export const LAST_STAND_HP = 0.3;
export const FRENZY_TIME = 4;
export const FRENZY_MAX = 10;
export const FEVER_TIME = 3;
export const FEVER_MAX = 10;
export const PARTY_LINK_R = 2;
export const MAMA_GUARD_R = 3;
export const BURST_RADIUS = 1.2;
export const CRIT_CHAIN_R = 2;
export const CRIT_CHAIN_MUL = 0.5;
export const SHOCK_SLOW = 0.7;
export const COUNTER_R = 1;
export const SYNC_R = 2;
const SLAM_BUMP_R = 0.5;              // 押しもどした虫が、ほかの虫にぶつかったとみなす距離
const OVERKILL_RANGE = 6;             // 余ったダメージが飛ぶ距離
const MAX_CHAIN = 800;                // 1回の連鎖（爆発・overkill）の上限

// ---- 描画に渡す状態の型 ----

/** walk: 歩く / bite: 猫をかじる / chew: 行く手のオブジェクトをかじる。 */
export type BugMode = "walk" | "bite" | "chew";

export interface BugState {
  uid: number;
  def: BugDef;
  wave: number;        // どの波の虫か（添字）
  lane: number;        // 出てきた列（左右から出た虫は -1）
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  speed: number;       // 基本の速さ（slow を掛ける前）
  slowMul: number;     // 今かかっている slow の倍率（1 なら無し）
  slowTimer: number;
  atkTimer: number;
  mode: BugMode;
  hurt: number;        // 攻撃を受けてからの残り表示時間（点滅用）
  alive: boolean;
  /** 向かっているマス。 */
  nextCol: number;
  nextRow: number;
  /** 最後に進んだマスの向き（-1/0/1。道が同じ長さのとき、まっすぐを選ぶため）。 */
  stepX: number;
  stepY: number;
  /** 歩く位置の横ずれ（マス）。 */
  offX: number;
  offY: number;
  /** 進んでいる向き（長さ 1。描画用）。 */
  dirX: number;
  dirY: number;
  poisonDps: number;
  poisonTimer: number;
  poisonTick: number;
  /** 毒で倒れたとき、まわりこのマス数の虫へ毒がうつる（0 ならうつらない）。 */
  poisonSpread: number;
  /** 押し戻された見た目のずれ（knock 秒かけて 0 へ）。 */
  knockX: number;
  knockY: number;
  knock: number;
  /** 内部用（電撃がもう当たったかの印）。 */
  mark: number;
  /** 毒をかけた猫（cats の添字。オブジェクトの毒・毒なしは -1）。 */
  poisonSrc: number;
  /** かじる強さ（def.chew。ボスは最低 1。0 ならかじらない虫）。 */
  chew: number;
  /** 猫からのダメージの倍率（def.catResist。なければ 1）。 */
  resist: number;
  /** いまかじっている、行く手のオブジェクト（無ければ null）。 */
  chewObj: ObjState | null;
  /** 通れるオブジェクトの上で、すり減らすまでのたまり具合（秒）。 */
  wear: number;
  /** 内部用（「かたい」イベントを最後に出した時刻）。 */
  resistAt: number;
}

export interface ObjState {
  uid: number;
  slot: number;        // Loadout.objects の添字
  def: ResolvedObject;
  col: number;         // 左上のマス
  row: number;
  w: number;           // しめるマスの数（横・縦）
  h: number;
  cx: number;          // 中心（マス座標）
  cy: number;
  hp: number;
  maxHp: number;
  atk: number;
  level: number;       // 戦闘中の強化回数（0 から）
  upgradeCost: number; // 次の強化のカリカリ
  timer: number;       // 攻撃・生産のたまり具合（秒）。interval で発動
  hurt: number;
}

export interface CatState {
  index: number;       // cats の添字（0 = 主人公）
  char: ResolvedChar;  // この猫の強さ（絵は char.look）
  companion: boolean;  // 相棒（AI で動く）か
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  resting: boolean;
  restTimer: number;   // 休けいの残り秒数
  atkTimer: number;    // 次の攻撃までの秒数
  facingX: number;     // 最後に動いた・攻撃した向き（描画用）
  facingY: number;
  attackAnim: number;  // 攻撃してからの残り表示時間
  hurt: number;
  moving: boolean;     // 直前のコマで動いたか（描画用）
  /** 複合効果の状態（描画にも使う）。 */
  frenzy: number;      // frenzy の重ね（0〜FRENZY_MAX）
  frenzyTimer: number;
  fever: number;       // kibbleFever の重ね（0〜FEVER_MAX）
  feverTimer: number;
  wakeUp: number;      // wakeUp の残り秒数（無敵＋攻撃の速さ2倍）
  linked: boolean;     // partyLink が効いている（ほかの猫が近い）
  guarded: boolean;    // ママの近く（mamaGuard が効く位置）
  desperate: boolean;  // 体力が LAST_STAND_HP 以下（lastStand が効く）
  /** 相棒がひと休みしているときのしぐさ（"sit" 座る・"groom" 毛づくろい。動いている・主人公は "none"）。 */
  idle: CatIdle;
}

export type CatIdle = "none" | "sit" | "groom";

/** 猫ごとの内部の状態（描画には出さない）。 */
interface CatRt {
  pend: number[];      // 連続攻撃の残り待ち時間
  pendLast: boolean[]; // その一撃が連続攻撃の最後か（multiEcho）
  target: BugState | null; // 相棒が狙っている虫
  retarget: number;
  /** 相棒の歩く先（マス座標）と、そこへ向かっている時間。 */
  wx: number;
  wy: number;
  wanderT: number;
  hasGoal: boolean;
  /** ひと休みの残り秒数（0 なら歩く）。 */
  idleT: number;
}

export interface Projectile {
  uid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  splash: number;      // 0 なら単体
  /** 追いかける虫（null ならまっすぐ進む）。 */
  target: BugState | null;
  targetUid: number;   // target の uid（-1 ならまっすぐ）
  maxDist: number;
  traveled: number;
  fromCat: boolean;
  crit: boolean;
  pierce: number;      // あと何匹突き抜けられるか
  hitUids: number[];   // もう当たった虫
  kind: string;        // 撃ったもの（"cat" または ObjectKind）
  /** 撃ったオブジェクト（猫の弾は null）。 */
  src: ObjState | null;
  /** 撃った猫（オブジェクトの弾は null）。 */
  owner: CatState | null;
  /** 1匹つらぬくたびに増えるダメージ（pierceGrow）。 */
  grow: number;
  alive: boolean;
}

/** resist: catResist で減った猫のダメージ（灰色）。object: オブジェクトが受けたダメージ。 */
export type FloatKind = "bug" | "crit" | "poison" | "cat" | "heal" | "object" | "resist";

export interface FloatText {
  value: number;
  x: number;
  y: number;
  age: number;
  kind: FloatKind;     // 誰が受けたダメージか（heal は猫の回復）
}

export type BattleEventType =
  | "wave"         // 波が始まった（value = 波の番号 1〜）
  | "spawn"        // 虫が出た
  | "catAttack"    // 猫が攻撃した
  | "shoot"        // オブジェクトが弾を撃った（value = 弾の数）
  | "hit"          // 虫にダメージ（value = ダメージ）
  | "kill"         // 虫を倒した
  | "kibble"       // カリカリが手に入った（value = 量。x, y は出どころ）
  | "aoe"          // 範囲攻撃（value = 半径）
  | "splash"       // 弾・電撃が当たった所のまわりへの範囲ダメージ（value = 半径）
  | "slow"         // slow オブジェクトが効いた（value = 半径）
  | "mine"         // mine が爆発した（value = 半径）
  | "zap"          // 電撃（x, y → x2, y2 の1本。value = 何本目か 0〜）
  | "poisonCloud"  // poison オブジェクトが毒をまいた（value = 半径）
  | "poisonSpread" // 毒で倒れた虫から、まわりへ毒がうつった（value = 半径）
  | "knockback"    // 虫を押し戻した
  | "push"         // 置いたオブジェクトの下の虫を押し出した（x, y = 新しい位置、x2, y2 = 元の位置）
  | "bite"         // （使わない。互換のため残す）
  | "objectBroken" // オブジェクトがこわれた（x, y は中心。value = 大きさ max(w, h)）
  | "objectHit"    // 虫がオブジェクトをかじった（value = ダメージ。x, y はかじった虫、x2, y2 はオブジェクトの中心）
  | "resist"       // 猫の攻撃が「かたい」虫に減らされた（x, y は虫。同じ虫ではときどきだけ）
  | "catHit"       // 猫がかじられた（value = ダメージ）
  | "dodge"        // 猫が虫の攻撃をよけた
  | "catDown"      // 猫が休けいに入った
  | "catUp"        // 猫が休けいから戻った
  | "place"        // オブジェクトを置いた（value = slot。x, y は中心）
  | "upgrade"      // オブジェクトを強化した（value = 新しいレベル）
  | "produce"      // producer がカリカリを生んだ（value = 量）
  | "mamaHit"      // 虫がママに着いた（value = 減った HP）
  // v4: 複合効果（猫の電撃 critChain は "zap" を使う）
  | "poisonBurst"  // 毒の虫が倒れて爆発（value = 半径）
  | "slam"         // 押しもどした虫が、かべ・虫にぶつかった（knockSlam）
  | "shockwave"    // 範囲攻撃の衝撃波（value = 半径）
  | "counter"      // よけて反撃（value = 半径。x, y は猫）
  | "echo"         // 連続攻撃の最後の一撃が範囲攻撃に（value = 半径）
  | "overkill"     // 余ったダメージが次の虫へ（x, y → x2, y2）
  | "wakeUp"       // 休けいから戻って、無敵＋速い（value = 秒数。x, y は猫）
  | "objectSync"   // 猫の攻撃で、近くのオブジェクトの次の発動が早まった（x, y はオブジェクトの中心）
  | "win"
  | "lose";

export interface BattleEvent {
  type: BattleEventType;
  x: number;
  y: number;
  value: number;
  x2: number;
  y2: number;
}

export interface CheckResult {
  ok: boolean;
  reason?: string;     // できない理由（画面に出せる日本語）
}

export interface UpgradeCheck extends CheckResult {
  cost?: number;       // 強化に要るカリカリ
  obj?: ObjState;
}

/** 描画が読むための状態（すべて読み取り専用として扱うこと）。 */
export interface BattleState {
  time: number;
  kibble: number;
  mamaHp: number;
  mamaMaxHp: number;
  kills: number;
  /** 主人公（= cats[0]）。 */
  cat: CatState;
  /** 戦っている猫すべて（[0] = 主人公、[1]〜 = 相棒）。 */
  cats: CatState[];
  bugs: BugState[];
  objects: ObjState[];
  projectiles: Projectile[];
  floats: FloatText[];
  /** 直前の step() で起きたこと（＋そのあと step の外で起きたこと）。 */
  events: BattleEvent[];
  /** 始まった波の数（0〜waveTotal）。 */
  waveIndex: number;
  waveTotal: number;
  result: BattleResult | null;
}

export interface Cell { col: number; row: number }

// ---- 乱数（mulberry32） ----
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SpawnQueue {
  wave: number;
  def: BugDef;
  count: number;
  every: number;
  lanes: number[] | undefined;
  start: number;
  spawned: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const CAT_MARGIN = 0.3;
const N = COLS * ROWS;

/** 8方向（まっすぐを先に）。 */
const DX = [0, -1, 1, 0, -1, 1, -1, 1];
const DY = [1, 0, 0, -1, 1, 1, -1, -1];

const inside = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/** ママのマスか。 */
export function isGoal(col: number, row: number): boolean {
  return col >= GOAL_COL && col < GOAL_COL + GOAL_W && row >= GOAL_ROW && row < GOAL_ROW + GOAL_H;
}

const GOAL_CELLS: number[] = [];
for (let r = GOAL_ROW; r < GOAL_ROW + GOAL_H; r++) for (let c = GOAL_COL; c < GOAL_COL + GOAL_W; c++) GOAL_CELLS.push(r * COLS + c);
const GOAL_MASK = new Uint8Array(N);
for (const i of GOAL_CELLS) GOAL_MASK[i] = 1;

/** オブジェクトの大きさ（1〜4 マス。足りない値は 1）。 */
function sizeOf(d: ResolvedObject): { w: number; h: number } {
  return { w: clamp(Math.floor(d.w || 1), 1, 4), h: clamp(Math.floor(d.h || 1), 1, 4) };
}

// ---- spatial hash（マスごとの入れ物。盤面のまわり 2 マスまで） ----
const HP = 2;
const HW = COLS + HP * 2;
const HH = ROWS + HP * 2;

export class Battle {
  readonly loadout: Loadout;
  private readonly s: BattleState;
  private readonly rng: () => number;
  private readonly grid: (ObjState | null)[];
  private readonly terrain = new Uint8Array(N);   // 1 = ステージの障害物（家具）
  private readonly blockMask = new Uint8Array(N); // 1 = 通れない（家具・通れないオブジェクト）
  private readonly queues: SpawnQueue[];
  private readonly waveAlive: number[];   // 波ごとの、まだ出ていない虫＋生きている虫の数
  private readonly dist = new Float64Array(N);
  private readonly chewDist = new Float64Array(N); // かじる虫の道（通れないオブジェクトも遠回りとして通れる）
  private readonly done = new Uint8Array(N);
  private readonly routeMask = new Uint8Array(N);  // 虫の道の上のマス（相棒の歩く先えらび用）
  private routeVer = -1;
  private readonly chewers: boolean;       // かじる虫が出るステージか
  private hold = false;                    // true のあいだ step() は進めない
  private readonly sealMask = new Uint8Array(N);
  private readonly reach = new Uint8Array(N);
  private readonly bfsQ = new Int32Array(N);
  private readonly lanesNeeded: number[];  // 必ず空けておく、一番上のマスの列
  private readonly anyTopNeeded: boolean;  // lanes 無しの虫がいる（一番上のどこか1つは空ける）
  private readonly sideSpawns: boolean;
  private flowVer = 0;
  private readonly rt: CatRt[] = [];       // 猫ごとの内部の状態（cats と同じ順）
  private readonly kibbleBonus: number;    // いちばん大きい猫の kibbleBonus
  private readonly burstCat: CatState | null; // poisonBurst で爆発させる猫
  private readonly feverCats: CatState[];  // kibbleFever を持つ猫
  private curCat: CatState | null = null;  // いま攻撃している猫（倒したのがだれかを数える）
  private readonly fxQ: number[] = [];     // 連鎖の順番待ち（種類, x, y, ダメージ, 猫の添字 の5つずつ）
  private draining = false;
  private aiX = 0;                         // 相棒の AI が決めた動き
  private aiY = 0;
  private aiMul = 1;
  private nextUid = 1;
  private markId = 1;
  // spatial hash
  private readonly binHead = new Int32Array(HW * HH);
  private binNext = new Int32Array(512);
  private hashed = 0;                      // hash に入っている虫の数（s.bugs の先頭から）
  private qbuf = new Int32Array(1024);
  private qtop = 0;
  // 使い回し
  private readonly projPool: Projectile[] = [];
  private readonly floatPool: FloatText[] = [];
  private floatRoll = 0;
  private readonly evPool: BattleEvent[] = [];
  private evCursor = 0;
  private stepEnd = 0;                     // 直前の step() が終わったときの events の長さ
  private inStep = false;

  constructor(loadout: Loadout, seed = 1) {
    this.loadout = loadout;
    this.rng = mulberry32(seed);
    this.grid = new Array(N).fill(null);
    for (const o of loadout.stage.obstacles ?? []) {
      const w = Math.max(1, Math.floor(o.w ?? 1)), h = Math.max(1, Math.floor(o.h ?? 1));
      for (let r = o.row; r < o.row + h; r++) for (let c = o.col; c < o.col + w; c++) {
        if (inside(c, r) && !isGoal(c, r)) { this.terrain[r * COLS + c] = 1; this.blockMask[r * COLS + c] = 1; }
      }
    }
    const st = loadout.stage;
    const chars = [loadout.char, ...(loadout.companions ?? [])];
    const cats: CatState[] = chars.map((ch, i) => {
      const slot = i === 0 ? [0, 0] : COMPANION_SLOTS[(i - 1) % COMPANION_SLOTS.length];
      this.rt.push({ pend: [], pendLast: [], target: null, retarget: 0, wx: 0, wy: 0, wanderT: 0, hasGoal: false, idleT: 0 });
      return {
        index: i,
        char: ch,
        companion: i > 0,
        x: clamp(GOAL_X + slot[0], CAT_MARGIN, COLS - CAT_MARGIN),
        y: clamp(GOAL_ROW - 0.6 + slot[1], CAT_MARGIN, ROWS - CAT_MARGIN),
        hp: ch.maxHp,
        maxHp: ch.maxHp,
        resting: false,
        restTimer: 0,
        atkTimer: 0,
        facingX: 0,
        facingY: -1,
        attackAnim: 0,
        hurt: 0,
        moving: false,
        frenzy: 0,
        frenzyTimer: 0,
        fever: 0,
        feverTimer: 0,
        wakeUp: 0,
        linked: false,
        guarded: false,
        desperate: false,
        idle: "none",
      };
    });
    this.kibbleBonus = Math.max(0, ...chars.map((ch) => ch.kibbleBonus || 0));
    let burst: CatState | null = null;
    for (const c of cats) if (combo(c, "poisonBurst") > 0 && (!burst || c.char.atk * combo(c, "poisonBurst") > burst.char.atk * combo(burst, "poisonBurst"))) burst = c;
    this.burstCat = burst;
    this.feverCats = cats.filter((c) => combo(c, "kibbleFever") > 0);
    this.s = {
      time: 0,
      kibble: st.startKibble + loadout.global.startKibbleAdd,
      mamaHp: loadout.global.mamaHp,
      mamaMaxHp: loadout.global.mamaHp,
      kills: 0,
      cat: cats[0],
      cats,
      bugs: [],
      objects: [],
      projectiles: [],
      floats: [],
      events: [],
      waveIndex: 0,
      waveTotal: st.waves.length,
      result: null,
    };
    this.queues = [];
    this.waveAlive = st.waves.map(() => 0);
    const lanes = new Set<number>();
    let anyTop = false;
    let chewers = false;
    st.waves.forEach((w, wi) => {
      for (const e of w.bugs) {
        const def = loadout.bugs[e.bug];
        if (!def) throw new Error(`虫の定義がありません: ${e.bug}`);
        const ls = e.lanes && e.lanes.length > 0 ? e.lanes.map((l) => clamp(Math.floor(l), 0, COLS - 1)) : undefined;
        if (ls) ls.forEach((l) => lanes.add(l));
        else anyTop = true;
        this.queues.push({ wave: wi, def, count: e.count, every: e.every, lanes: ls, start: w.at, spawned: 0 });
        this.waveAlive[wi] += e.count * packOf(def);
        if (chewOf(def) > 0) chewers = true;
      }
    });
    this.chewers = chewers;
    this.lanesNeeded = [...lanes].sort((a, b) => a - b);
    this.anyTopNeeded = anyTop || lanes.size === 0;
    this.sideSpawns = st.chapter >= SIDE_SPAWN_CHAPTER;
    for (let i = 0; i < 256; i++) this.evPool.push({ type: "hit", x: 0, y: 0, value: 0, x2: 0, y2: 0 });
    this.recomputeFlow();
  }

  // ---- 読み取り用 ----
  get state(): Readonly<BattleState> { return this.s; }
  get result(): BattleResult | null { return this.s.result; }
  get time(): number { return this.s.time; }
  get kibble(): number { return this.s.kibble; }
  get mamaHp(): number { return this.s.mamaHp; }
  get mamaMaxHp(): number { return this.s.mamaMaxHp; }
  get kills(): number { return this.s.kills; }
  get cat(): Readonly<CatState> { return this.s.cat; }
  /** 戦っている猫すべて（[0] = 主人公、[1]〜 = 相棒）。 */
  get cats(): readonly Readonly<CatState>[] { return this.s.cats; }
  get bugs(): readonly BugState[] { return this.s.bugs; }
  get objects(): readonly ObjState[] { return this.s.objects; }
  get projectiles(): readonly Projectile[] { return this.s.projectiles; }
  get floats(): readonly FloatText[] { return this.s.floats; }
  get events(): readonly BattleEvent[] { return this.s.events; }
  get waveIndex(): number { return this.s.waveIndex; }
  get waveTotal(): number { return this.s.waveTotal; }
  /** 章 3 以上で、左右の上の方からも出てくるか。 */
  get hasSideSpawns(): boolean { return this.sideSpawns; }
  /** マスごとのママまでの距離（添字 row * COLS + col。通れない・たどり着けないマスは Infinity）。 */
  get flowField(): Readonly<Float64Array> { return this.dist; }
  /** 道が変わるたびに 1 増える（描画のキャッシュ用）。 */
  get flowVersion(): number { return this.flowVer; }
  /** かじる虫の、マスごとのママまでの距離（通れないオブジェクトのマスは CHEW_COST 遠い。家具は Infinity）。 */
  get chewFlowField(): Readonly<Float64Array> { return this.chewDist; }
  /** このステージに、かじる虫（chew > 0 かボス）が出るか。 */
  get hasChewers(): boolean { return this.chewers; }
  /** step() を止めているか（setHold）。 */
  get held(): boolean { return this.hold; }

  /**
   * true のあいだ step() は戦闘を進めない（虫・猫・オブジェクト・弾・出てくる時間が止まる）。
   * 画面は、カードを持っている・選んでいる・強化の窓を出しているあいだに使う。place・upgrade はそのまま使える。
   */
  setHold(on: boolean): void { this.hold = !!on; }

  /** かじる虫の、マスのママまでの距離。 */
  chewPathDist(col: number, row: number): number {
    if (!inside(col, row)) return Infinity;
    return this.chewDist[row * COLS + col];
  }

  /** マスのママまでの距離（外・通れないマスは Infinity）。 */
  pathDist(col: number, row: number): number {
    if (!inside(col, row)) return Infinity;
    return this.dist[row * COLS + col];
  }

  /** マスが通れないか（家具・通れないオブジェクト）。 */
  isBlocked(col: number, row: number): boolean {
    return inside(col, row) && this.blockMask[row * COLS + col] === 1;
  }

  /** マスにステージの障害物（家具）があるか。 */
  obstacleAt(col: number, row: number): boolean {
    return inside(col, row) && this.terrain[row * COLS + col] === 1;
  }

  /** ステージの障害物（絵の種類・大きさつき）。 */
  get obstacles(): readonly { col: number; row: number; kind: string; w?: number; h?: number }[] {
    return this.loadout.stage.obstacles ?? [];
  }

  /** マス (col, row) のオブジェクト（無ければ null。大きいオブジェクトはしめるどのマスでも返す）。 */
  objectAt(col: number, row: number): ObjState | null {
    if (!inside(col, row)) return null;
    return this.grid[row * COLS + col];
  }

  objectByUid(uid: number): ObjState | null {
    for (const o of this.s.objects) if (o.uid === uid && o.hp > 0) return o;
    return null;
  }

  /** 猫のいるマス。 */
  catCell(): Cell {
    const c = this.s.cat;
    return { col: clamp(Math.floor(c.x), 0, COLS - 1), row: clamp(Math.floor(c.y), 0, ROWS - 1) };
  }

  /** 虫のいるマス（盤面の外にいるときは、いちばん近い盤面のマス）。 */
  bugCell(b: BugState): Cell {
    return { col: clamp(Math.floor(b.x), 0, COLS - 1), row: clamp(Math.floor(b.y), 0, ROWS - 1) };
  }

  /** 枠 i のオブジェクトの大きさ。 */
  footprint(i: number): { w: number; h: number } {
    const d = this.loadout.objects[i];
    return d ? sizeOf(d) : { w: 1, h: 1 };
  }

  /** 盤面の点 (x, y) を中心にして枠 i を置くときの、左上のマス（盤面の中に収める）。 */
  anchorAt(i: number, x: number, y: number): Cell {
    const { w, h } = this.footprint(i);
    return {
      col: clamp(Math.round(x - w / 2), 0, COLS - w),
      row: clamp(Math.round(y - h / 2), 0, ROWS - h),
    };
  }

  /** カリカリが足りるか。 */
  canAfford(i: number): boolean {
    const d = this.loadout.objects[i];
    return !!d && this.s.kibble >= d.cost;
  }

  /** 虫が出てくるかもしれないマス（必ず空けるマス＋いま通れる一番上のマス＋章 3 からは左右の上のほう）。 */
  spawnCells(): Cell[] {
    const out: Cell[] = [];
    const seen = new Set<number>();
    const add = (col: number, row: number) => {
      const i = row * COLS + col;
      if (seen.has(i) || !Number.isFinite(this.dist[i])) return;
      seen.add(i);
      out.push({ col, row });
    };
    for (const l of this.lanesNeeded) add(l, 0);
    if (this.anyTopNeeded) {
      for (let c = 0; c < COLS; c++) add(c, 0);
      if (this.sideSpawns) for (let r = 0; r < SIDE_SPAWN_ROWS; r++) { add(0, r); add(COLS - 1, r); }
    }
    return out;
  }

  /** マスからママまでの道（いまの距離で。最初のマスとママのマスを含む）。たどり着けなければ空。chew なら、かじる虫の道。 */
  routeFrom(col: number, row: number, chew = false): Cell[] {
    if (!Number.isFinite(chew ? this.chewPathDist(col, row) : this.pathDist(col, row))) return [];
    const out: Cell[] = [{ col, row }];
    let c = col, r = row, sx = 0, sy = 0;
    for (let k = 0; k < N && !isGoal(c, r); k++) {
      const n = this.nextStep(c, r, sx, sy, chew);
      if (n < 0) break;
      const nc = n % COLS, nr = (n - nc) / COLS;
      sx = nc - c; sy = nr - r;
      c = nc; r = nr;
      out.push({ col: c, row: r });
    }
    return out;
  }

  /** objectAura が効いているか（猫が近くにいる）。 */
  auraActive(o: ObjState): boolean {
    return this.auraBonus(o) > 0;
  }

  /** オブジェクトにかかる objectAura（近くにいる猫のうち、いちばん大きい値）。 */
  auraBonus(o: ObjState): number {
    let best = 0;
    const cats = this.s.cats;
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      const a = c.char.objectAura || 0;
      if (!(a > best) || c.resting) continue;
      if (Math.hypot(c.x - o.cx, c.y - o.cy) <= AURA_RADIUS + Math.max(o.w, o.h) / 2 - 0.5) best = a;
    }
    return best;
  }

  /**
   * 左上 (col, row)・大きさ w×h の通れないものを置くと、虫の道がなくなる（出口からママへ行けない・いる虫が閉じこめられる）か。
   * しめるマスにいる虫は押し出されるので数えない。ママのマスに重なるときは true。
   */
  wouldSeal(col: number, row: number, w = 1, h = 1): boolean {
    const m = this.sealMask;
    m.set(this.blockMask);
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      if (!inside(c, r)) continue;
      if (isGoal(c, r)) return true;
      m[r * COLS + c] = 1;
    }
    // ママから 4 方向にたどれるマス（ななめは、となりの2マスが空いているときだけなので、4 方向で足りる）
    const reach = this.reach;
    reach.fill(0);
    const q = this.bfsQ;
    let qh = 0, qt = 0;
    for (const g of GOAL_CELLS) { reach[g] = 1; q[qt++] = g; }
    while (qh < qt) {
      const u = q[qh++];
      const uc = u % COLS, ur = (u - uc) / COLS;
      for (let k = 0; k < 4; k++) {
        const c = uc + DX[k], r = ur + DY[k];
        if (!inside(c, r)) continue;
        const i = r * COLS + c;
        if (reach[i] || m[i]) continue;
        reach[i] = 1;
        q[qt++] = i;
      }
    }
    for (const l of this.lanesNeeded) if (!reach[l]) return true;
    if (this.anyTopNeeded) {
      let any = false;
      for (let c = 0; c < COLS; c++) if (reach[c]) { any = true; break; }
      if (!any) return true;
    }
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      const bi = clamp(Math.floor(b.y), 0, ROWS - 1) * COLS + clamp(Math.floor(b.x), 0, COLS - 1);
      if (m[bi] && !this.blockMask[bi]) continue; // 押し出される虫
      if (!reach[bi]) return true;
    }
    return false;
  }

  /** 枠 i のオブジェクトを、左上 (col, row) に置けるか。 */
  placeCheck(i: number, col: number, row: number): CheckResult {
    if (this.s.result) return { ok: false, reason: "戦闘は終わりました" };
    const d = this.loadout.objects[i];
    if (!d) return { ok: false, reason: "そのオブジェクトはありません" };
    const { w, h } = sizeOf(d);
    if (!inside(col, row) || !inside(col + w - 1, row + h - 1)) return { ok: false, reason: "盤面からはみ出すよ" };
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      if (isGoal(c, r)) return { ok: false, reason: "ママのところには置けないよ" };
      if (this.terrain[r * COLS + c]) return { ok: false, reason: "家具があるので置けないよ" };
      if (this.grid[r * COLS + c]) return { ok: false, reason: "もう置いてあります" };
    }
    if (d.block && this.wouldSeal(col, row, w, h)) return { ok: false, reason: "通り道がなくなるよ" };
    if (this.s.kibble < d.cost) return { ok: false, reason: "カリカリが足りません" };
    return { ok: true };
  }

  /** 枠 i のオブジェクトを、左上 (col, row) にすぐ置く。置けたかどうか（と理由）を返す。 */
  place(i: number, col: number, row: number): CheckResult {
    const chk = this.placeCheck(i, col, row);
    if (!chk.ok) return chk;
    const d = this.loadout.objects[i];
    const { w, h } = sizeOf(d);
    const s = this.s;
    s.kibble -= d.cost;
    const o: ObjState = {
      uid: this.nextUid++,
      slot: i,
      def: d,
      col,
      row,
      w,
      h,
      cx: col + w / 2,
      cy: row + h / 2,
      hp: d.maxHp,
      maxHp: d.maxHp,
      atk: d.atk,
      level: 0,
      upgradeCost: d.upgradeCost,
      // 攻撃するものは置いた直後から撃てる（producer は interval 待つ）
      timer: d.kind === "producer" ? 0 : d.interval,
      hurt: 0,
    };
    s.objects.push(o);
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      this.grid[r * COLS + c] = o;
      if (d.block) this.blockMask[r * COLS + c] = 1;
    }
    if (d.block) {
      this.recomputeFlow();
      this.pushOut(o);
    }
    this.emit("place", o.cx, o.cy, i);
    return { ok: true };
  }

  /** 置いたオブジェクトを強化できるか。 */
  upgradeCheck(o: ObjState | null | undefined): UpgradeCheck {
    if (this.s.result) return { ok: false, reason: "戦闘は終わりました" };
    if (!o || o.hp <= 0) return { ok: false, reason: "オブジェクトがありません" };
    if (this.s.kibble < o.upgradeCost) return { ok: false, reason: "カリカリが足りません", cost: o.upgradeCost, obj: o };
    return { ok: true, cost: o.upgradeCost, obj: o };
  }

  /** 置いたオブジェクトを強化する（すぐ）。 */
  upgrade(target: ObjState | number): UpgradeCheck {
    const o = typeof target === "number" ? this.objectByUid(target) : target;
    const chk = this.upgradeCheck(o);
    if (!chk.ok || !o) return chk;
    const mul = o.def.upgradeMul;
    this.s.kibble -= o.upgradeCost;
    o.atk *= mul;
    o.maxHp *= mul;
    o.hp = o.maxHp;
    o.level++;
    o.upgradeCost *= UPGRADE_COST_GROWTH;
    this.emit("upgrade", o.cx, o.cy, o.level);
    return { ok: true, cost: chk.cost, obj: o };
  }

  // ---- 進める ----
  step(dt: number, input: BattleInput): void {
    const s = this.s;
    // step の外（place・upgrade）で起きたイベントは残す
    const ev = s.events;
    const keep = ev.length - this.stepEnd;
    if (keep > 0) for (let k = 0; k < keep; k++) ev[k] = ev[this.stepEnd + k];
    ev.length = Math.max(0, keep);
    this.inStep = true;
    try {
      if (!(dt > 0)) return;
      if (s.result || this.hold) {
        // 終わったあと・止めているあいだは、ダメージの数字が消えていくだけ
        this.ageFloats(dt);
        return;
      }
      if (input.place !== null && input.place !== undefined) {
        const c = s.cats[0];
        const a = this.anchorAt(input.place, c.x, c.y);
        this.place(input.place, a.col, a.row);
      }
      if (input.upgrade) {
        const cc = this.catCell();
        const o = this.objectAt(cc.col, cc.row);
        if (o) this.upgrade(o);
      }
      const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP - 1e-9));
      const h = dt / n;
      for (let k = 0; k < n && !s.result; k++) this.substep(h, input);
    } finally {
      this.inStep = false;
      this.stepEnd = ev.length;
    }
  }

  private substep(h: number, input: BattleInput): void {
    const s = this.s;
    s.time += h;
    const g = this.loadout.global;
    s.kibble += this.loadout.stage.kibblePerSec * g.kibbleMul * h;

    this.updateSpawns();
    this.buildHash();
    this.updateCats(h, input);
    this.updateObjects(h);
    this.updateProjectiles(h);
    this.updateBugs(h);
    this.ageFloats(h);
    this.compact();
    this.checkEnd();
  }

  // ---- 道 ----
  private recomputeFlow(): void {
    this.dijkstra(this.dist, false);
    this.dijkstra(this.chewDist, true);
    this.flowVer++;
    const blocked = this.blockMask;
    // 向かっていたマスがふさがった虫は、いまいるマスの中心へ戻ってから選びなおす
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      if (blocked[b.nextRow * COLS + b.nextCol]) {
        b.nextCol = clamp(Math.floor(b.x), 0, COLS - 1);
        b.nextRow = clamp(Math.floor(b.y), 0, ROWS - 1);
        b.stepX = 0; b.stepY = 0;
      }
    }
  }

  /**
   * ママからの距離をダイクストラで（マスが少ない（252）ので素朴なもので十分）。
   * chew なら、通れないオブジェクトのマスも「入るのに CHEW_COST 余分にかかる」として通れる（家具は通れない）。
   * ななめは、となりの2マスがどちらも空いているときだけ（かじる道でも同じ）。
   */
  private dijkstra(out: Float64Array, chew: boolean): void {
    const done = this.done, blocked = this.blockMask, terrain = this.terrain;
    out.fill(Infinity);
    done.fill(0);
    for (const g of GOAL_CELLS) out[g] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && out[i] < best) { best = out[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      // u に入るときの余分（虫は i → u と進む）
      const extra = chew && blocked[u] ? CHEW_COST : 0;
      const uc = u % COLS, ur = (u - uc) / COLS;
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dy = DY[k];
        const c = uc + dx, r = ur + dy;
        if (!inside(c, r)) continue;
        const i = r * COLS + c;
        if (done[i]) continue;
        if (chew ? terrain[i] : blocked[i]) continue;
        const diag = dx !== 0 && dy !== 0;
        if (diag) {
          if (blocked[ur * COLS + c] || blocked[r * COLS + uc]) continue;
          // かじる道で、オブジェクトのマスへ（から）のななめは使わない（まっすぐ入ってかじる）
          if (chew && (blocked[u] || blocked[i])) continue;
        }
        const nd = best + extra + (diag ? SQRT2 : 1);
        if (nd < out[i]) out[i] = nd;
      }
    }
  }

  /** 虫の道の上のマス（出口からママまで。相棒の歩く先えらび用）。道が変わったときだけ作りなおす。 */
  private routeCells(): Uint8Array {
    if (this.routeVer === this.flowVer) return this.routeMask;
    this.routeVer = this.flowVer;
    const m = this.routeMask;
    m.fill(0);
    for (const sc of this.spawnCells()) {
      let c = sc.col, r = sc.row, sx = 0, sy = 0;
      for (let k = 0; k < N && !isGoal(c, r); k++) {
        const i = r * COLS + c;
        if (m[i] && k > 0) break;
        m[i] = 1;
        const n = this.nextStep(c, r, sx, sy);
        if (n < 0) break;
        const nc = n % COLS, nr = (n - nc) / COLS;
        sx = nc - c; sy = nr - r;
        c = nc; r = nr;
      }
    }
    return m;
  }

  /** 置いたオブジェクトの下にいる虫を、いちばん近い空いた（ママへ行ける）マスへ押し出す。 */
  private pushOut(o: ObjState): void {
    const d = this.dist;
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      const bc = clamp(Math.floor(b.x), 0, COLS - 1), br = clamp(Math.floor(b.y), 0, ROWS - 1);
      if (this.grid[br * COLS + bc] !== o) continue;
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (!Number.isFinite(d[i]) || GOAL_MASK[i]) continue;
        const c = i % COLS, r = (i - c) / COLS;
        const dx = c + 0.5 - b.x, dy = r + 0.5 - b.y;
        const dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best < 0) continue;
      const c = best % COLS, r = (best - c) / COLS;
      const x0 = b.x, y0 = b.y;
      b.x = c + 0.5 + b.offX;
      b.y = r + 0.5 + b.offY;
      b.nextCol = c; b.nextRow = r;
      b.stepX = 0; b.stepY = 0;
      b.chewObj = null;
      b.knockX = x0 - b.x; b.knockY = y0 - b.y; b.knock = KNOCK_TIME;
      this.emit("push", b.x, b.y, 0, x0, y0);
    }
  }

  /** (col, row) から次に進むマスの添字。同じ長さならまっすぐ（sx, sy）を選ぶ。行けなければ -1。chew なら、かじる虫の道で。 */
  private nextStep(col: number, row: number, sx: number, sy: number, chew = false): number {
    const d = chew ? this.chewDist : this.dist, blocked = this.blockMask;
    let best = -1, bv = Infinity, straight = false;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k];
      const c = col + dx, r = row + dy;
      if (!inside(c, r)) continue;
      const i = r * COLS + c;
      const di = d[i];
      if (di === Infinity) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag && (blocked[row * COLS + c] || blocked[r * COLS + col] || (chew && blocked[i]))) continue;
      const v = di + (diag ? SQRT2 : 1) + (chew && blocked[i] ? CHEW_COST : 0);
      const isStraight = dx === sx && dy === sy;
      if (v < bv - 1e-6 || (Math.abs(v - bv) <= 1e-6 && isStraight && !straight)) {
        bv = v; best = i; straight = isStraight;
      }
    }
    return best;
  }

  /** 押し戻すときに下がるマスの添字（来た向きの逆を優先。ママから遠くなるマスだけ）。無ければ -1。 */
  private upstream(col: number, row: number, sx: number, sy: number): number {
    const d = this.dist, blocked = this.blockMask;
    const here = d[row * COLS + col];
    let best = -1, bv = -Infinity;
    for (let k = 0; k < 8; k++) {
      const dx = DX[k], dy = DY[k];
      const c = col + dx, r = row + dy;
      if (!inside(c, r)) continue;
      const v = d[r * COLS + c];
      if (!Number.isFinite(v) || !(v > here + 1e-6)) continue;
      const diag = dx !== 0 && dy !== 0;
      if (diag && (blocked[row * COLS + c] || blocked[r * COLS + col])) continue;
      const score = (dx === -sx && dy === -sy ? 100 : 0) + v - (diag ? 0.3 : 0);
      if (score > bv) { bv = score; best = r * COLS + c; }
    }
    return best;
  }

  // ---- 虫が出る ----
  private updateSpawns(): void {
    const s = this.s;
    const waves = this.loadout.stage.waves;
    while (s.waveIndex < waves.length && s.time >= waves[s.waveIndex].at) {
      s.waveIndex++;
      this.emit("wave", COLS / 2, 0, s.waveIndex);
    }
    for (const q of this.queues) {
      while (q.spawned < q.count && s.time >= q.start + q.spawned * q.every) {
        const lane = q.lanes ? q.lanes[q.spawned % q.lanes.length] : -1;
        q.spawned++;
        this.spawnPack(q.def, lane, q.wave);
      }
    }
  }

  private pickSpawn(lane: number): { col: number; row: number; side: -1 | 0 | 1 } {
    const d = this.dist;
    if (lane >= 0 && Number.isFinite(d[lane])) return { col: lane, row: 0, side: 0 };
    if (this.sideSpawns && this.rng() < SIDE_SPAWN_CHANCE) {
      let n = 0;
      for (let r = 0; r < SIDE_SPAWN_ROWS; r++) {
        if (Number.isFinite(d[r * COLS])) n++;
        if (Number.isFinite(d[r * COLS + COLS - 1])) n++;
      }
      if (n > 0) {
        let k = Math.min(n - 1, Math.floor(this.rng() * n));
        for (let r = 0; r < SIDE_SPAWN_ROWS; r++) {
          if (Number.isFinite(d[r * COLS]) && k-- === 0) return { col: 0, row: r, side: -1 };
          if (Number.isFinite(d[r * COLS + COLS - 1]) && k-- === 0) return { col: COLS - 1, row: r, side: 1 };
        }
      }
    }
    let n = 0;
    for (let c = 0; c < COLS; c++) if (Number.isFinite(d[c])) n++;
    if (n === 0) return { col: GOAL_COL, row: 0, side: 0 };
    let k = Math.min(n - 1, Math.floor(this.rng() * n));
    for (let c = 0; c < COLS; c++) if (Number.isFinite(d[c]) && k-- === 0) return { col: c, row: 0, side: 0 };
    return { col: GOAL_COL, row: 0, side: 0 };
  }

  /** 虫を出す（pack > 1 なら、となりの列・行に横ならびで pack 匹）。 */
  private spawnPack(def: BugDef, lane: number, wave: number): void {
    const n = packOf(def);
    const sp = this.pickSpawn(lane);
    if (n <= 1) { this.spawnBug(def, sp, wave); return; }
    const d = this.dist;
    // 0, +1, -1, +2, -2 … の順に、出られるマスへ。足りなければ同じマスに少しずらして重ねる
    const used: number[] = [];
    for (let j = 0; used.length < n && j < 2 * Math.max(COLS, ROWS); j++) {
      const off = j === 0 ? 0 : (j % 2 === 1 ? 1 : -1) * Math.ceil(j / 2);
      const col = sp.side === 0 ? sp.col + off : sp.col;
      const row = sp.side === 0 ? sp.row : sp.row + off;
      if (!inside(col, row)) continue;
      if (sp.side !== 0 && row >= SIDE_SPAWN_ROWS + 2) continue;
      if (!Number.isFinite(d[row * COLS + col])) continue;
      used.push(row * COLS + col);
    }
    if (used.length === 0) used.push(sp.row * COLS + sp.col);
    for (let k = 0; k < n; k++) {
      const i = used[k % used.length];
      const col = i % COLS, row = (i - col) / COLS;
      this.spawnBug(def, { col, row, side: sp.side }, wave, k >= used.length ? 0.28 * (1 + Math.floor(k / used.length)) : 0);
    }
  }

  private spawnBug(def: BugDef, sp: { col: number; row: number; side: -1 | 0 | 1 }, wave: number, back = 0): void {
    const st = this.loadout.stage;
    const hp = def.hp * st.hpMul;
    const offX = (this.rng() * 2 - 1) * BUG_SPREAD;
    const offY = (this.rng() * 2 - 1) * BUG_SPREAD;
    // back: 同じマスに重なるときは、少しうしろ（外側）から出す
    const x = sp.side === 0 ? sp.col + 0.5 + offX : sp.side < 0 ? -0.5 - back : COLS + 0.5 + back;
    const y = sp.side === 0 ? SPAWN_Y - back : sp.row + 0.5 + offY;
    const b: BugState = {
      uid: this.nextUid++,
      def,
      wave,
      lane: sp.side === 0 ? sp.col : -1,
      x,
      y,
      hp,
      maxHp: hp,
      atk: def.atk * st.atkMul,
      speed: def.speed,
      slowMul: 1,
      slowTimer: 0,
      atkTimer: 0,
      mode: "walk",
      hurt: 0,
      alive: true,
      nextCol: sp.col,
      nextRow: sp.row,
      stepX: sp.side === 0 ? 0 : -sp.side,
      stepY: sp.side === 0 ? 1 : 0,
      offX,
      offY,
      dirX: sp.side === 0 ? 0 : -sp.side,
      dirY: sp.side === 0 ? 1 : 0,
      poisonDps: 0,
      poisonTimer: 0,
      poisonTick: 0,
      poisonSpread: 0,
      knockX: 0,
      knockY: 0,
      knock: 0,
      mark: 0,
      poisonSrc: -1,
      chew: chewOf(def),
      resist: resistOf(def),
      chewObj: null,
      wear: 0,
      resistAt: -99,
    };
    this.s.bugs.push(b);
    this.emit("spawn", b.x, b.y, 0);
  }

  // ---- spatial hash ----
  private buildHash(): void {
    const bugs = this.s.bugs;
    const n = bugs.length;
    if (this.binNext.length < n) this.binNext = new Int32Array(Math.max(n, this.binNext.length * 2));
    const head = this.binHead, next = this.binNext;
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const b = bugs[i];
      if (!b.alive) continue;
      const bi = binOf(b.x, b.y);
      next[i] = head[bi];
      head[bi] = i;
    }
    this.hashed = n;
  }

  /** (x, y) から半径 r 以内の生きている虫の添字を qbuf[qtop…] に足して、数を返す（qtop も進む）。使い終わったら qtop を戻すこと。 */
  private queryBugs(x: number, y: number, r: number): number {
    const bugs = this.s.bugs;
    const r2 = r * r;
    const c0 = clamp(Math.floor(x - r) + HP, 0, HW - 1), c1 = clamp(Math.floor(x + r) + HP, 0, HW - 1);
    const r0 = clamp(Math.floor(y - r) + HP, 0, HH - 1), r1 = clamp(Math.floor(y + r) + HP, 0, HH - 1);
    const head = this.binHead, next = this.binNext;
    let n = 0;
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        for (let i = head[rr * HW + cc]; i >= 0; i = next[i]) {
          const b = bugs[i];
          if (!b.alive) continue;
          const dx = b.x - x, dy = b.y - y;
          if (dx * dx + dy * dy > r2) continue;
          if (this.qtop >= this.qbuf.length) {
            const nb = new Int32Array(this.qbuf.length * 2);
            nb.set(this.qbuf);
            this.qbuf = nb;
          }
          this.qbuf[this.qtop++] = i;
          n++;
        }
      }
    }
    return n;
  }

  /** いちばん近い生きている虫（range 以内。mark が skipMark の虫はとばす）。 */
  private nearestBug(x: number, y: number, range: number, skipMark = -1): BugState | null {
    const bugs = this.s.bugs;
    let best: BugState | null = null;
    let bd = range * range;
    const c0 = clamp(Math.floor(x - range) + HP, 0, HW - 1), c1 = clamp(Math.floor(x + range) + HP, 0, HW - 1);
    const r0 = clamp(Math.floor(y - range) + HP, 0, HH - 1), r1 = clamp(Math.floor(y + range) + HP, 0, HH - 1);
    const head = this.binHead, next = this.binNext;
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        for (let i = head[rr * HW + cc]; i >= 0; i = next[i]) {
          const b = bugs[i];
          if (!b.alive || b.mark === skipMark) continue;
          const dx = b.x - x, dy = b.y - y;
          const d = dx * dx + dy * dy;
          if (d <= bd) { bd = d; best = b; }
        }
      }
    }
    return best;
  }

  // ---- 猫 ----
  private updateCats(h: number, input: BattleInput): void {
    const cats = this.s.cats;
    // 複合効果の状態（重ねの時間・ママの近く・体力が少ない・ほかの猫が近い）
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      if (c.frenzyTimer > 0) { c.frenzyTimer -= h; if (c.frenzyTimer <= 0) { c.frenzyTimer = 0; c.frenzy = 0; } }
      if (c.feverTimer > 0) { c.feverTimer -= h; if (c.feverTimer <= 0) { c.feverTimer = 0; c.fever = 0; } }
      if (c.wakeUp > 0) c.wakeUp = Math.max(0, c.wakeUp - h);
      c.desperate = !c.resting && c.hp <= c.maxHp * LAST_STAND_HP;
      const gx = c.x - GOAL_X, gy = c.y - GOAL_Y;
      c.guarded = !c.resting && gx * gx + gy * gy <= MAMA_GUARD_R * MAMA_GUARD_R;
      c.linked = false;
    }
    for (let i = 0; i < cats.length; i++) {
      const a = cats[i];
      if (a.resting) continue;
      for (let j = i + 1; j < cats.length; j++) {
        const b = cats[j];
        if (b.resting) continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy <= PARTY_LINK_R * PARTY_LINK_R) { a.linked = true; b.linked = true; }
      }
    }
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      if (i === 0) {
        this.aiX = input.move.x || 0;
        this.aiY = input.move.y || 0;
        this.aiMul = 1;
      } else if (!c.resting) {
        this.companionSteer(c, this.rt[i], h);
      } else {
        c.idle = "none";
        this.rt[i].idleT = 0;
        this.rt[i].hasGoal = false;
      }
      this.updateCat(c, this.rt[i], h);
    }
  }

  /**
   * 相棒の動き（aiX・aiY・aiMul に入れる）。自分から見える虫と戦うか、自分で歩き回る（ときどき座る・毛づくろい）。
   * 主人公から COMPANION_ROAM マスより離れたら、少し急いで戻ってくる。
   */
  private companionSteer(c: CatState, rt: CatRt, h: number): void {
    const p = this.s.cats[0];
    const ch = c.char;
    rt.retarget -= h;
    let t = rt.target;
    if (t && (!t.alive || this.giveUp(c, p, t))) t = null;
    if (!t || rt.retarget <= 0) {
      rt.retarget = COMPANION_RETARGET;
      const nt = this.companionTarget(c, p);
      if (nt) t = nt;
    }
    rt.target = t;
    this.aiMul = 1;
    const pdx = c.x - p.x, pdy = c.y - p.y;
    const fromP = Math.hypot(pdx, pdy);
    if (t) {
      // 戦う（ひと休みはやめる）
      c.idle = "none";
      rt.idleT = 0;
      rt.hasGoal = false;
      this.steerTo(c, t.x, t.y, Math.max(0.2, ch.range * 0.75), h);
      return;
    }
    // ひと休み（座る・毛づくろい）。主人公が遠くへ行ったら切り上げる
    if (rt.idleT > 0) {
      rt.idleT -= h;
      if (fromP <= COMPANION_ROAM + 0.5) { this.aiX = 0; this.aiY = 0; return; }
      rt.idleT = 0;
    }
    c.idle = "none";
    rt.wanderT += h;
    if (!rt.hasGoal || rt.wanderT > WANDER_TIMEOUT || Math.hypot(rt.wx - p.x, rt.wy - p.y) > COMPANION_ROAM) this.pickWander(c, rt, p);
    const far = fromP > COMPANION_ROAM;
    this.aiMul = far ? CATCH_UP : STROLL;
    if (this.steerTo(c, rt.wx, rt.wy, 0.15, h)) {
      // 着いた: ひと休みするか、次の場所へ
      rt.hasGoal = false;
      if (this.rng() < IDLE_CHANCE) {
        rt.idleT = IDLE_MIN + this.rng() * (IDLE_MAX - IDLE_MIN);
        c.idle = this.rng() < 0.5 ? "sit" : "groom";
      }
    }
  }

  /** (tx, ty) へ向かう動きを aiX・aiY に入れる。stop 以内なら止まって true。 */
  private steerTo(c: CatState, tx: number, ty: number, stop: number, h: number): boolean {
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop) { this.aiX = 0; this.aiY = 0; return true; }
    // 行きすぎないように（1コマで進める分より近ければ、ゆっくり）
    const k = Math.min(1, (d - stop) / Math.max(1e-6, c.char.moveSpeed * this.aiMul * h));
    this.aiX = (dx / d) * k;
    this.aiY = (dy / d) * k;
    return false;
  }

  /** 追いかけるのをやめるか（相棒から遠すぎる・主人公から遠すぎる）。 */
  private giveUp(c: CatState, p: CatState, t: BugState): boolean {
    const dx = t.x - c.x, dy = t.y - c.y;
    const g = Math.max(COMPANION_GIVEUP, c.char.range + 1.5);
    if (dx * dx + dy * dy > g * g) return true;
    const px = t.x - p.x, py = t.y - p.y;
    return px * px + py * py > (COMPANION_ROAM + 1) * (COMPANION_ROAM + 1);
  }

  /** 相棒から COMPANION_SIGHT（射程が長い猫は 射程+0.8）以内の虫のうち、いちばん近い虫（主人公から遠すぎる虫・まだ穴の中の虫はとばす）。 */
  private companionTarget(c: CatState, p: CatState): BugState | null {
    const start = this.qtop;
    const n = this.queryBugs(c.x, c.y, Math.max(COMPANION_SIGHT, c.char.range + 0.8));
    const lim = (COMPANION_ROAM + 1) * (COMPANION_ROAM + 1);
    let best: BugState | null = null, bd = Infinity;
    for (let k = start; k < start + n; k++) {
      const b = this.s.bugs[this.qbuf[k]];
      if (b.y < 0) continue;
      const px = b.x - p.x, py = b.y - p.y;
      if (px * px + py * py > lim) continue;
      const dx = b.x - c.x, dy = b.y - c.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    this.qtop = start;
    return best;
  }

  /**
   * 相棒の次の歩く先を選ぶ。主人公のまわり（COMPANION_ROAM 以内）からいくつか候補を出して、
   * 虫が多い・虫の道の上・ほかの猫やオブジェクトが守っていない所ほど高い点。出口のそばは少しさける。気まぐれも少し。
   */
  private pickWander(c: CatState, rt: CatRt, p: CatState): void {
    const route = this.routeCells();
    const cats = this.s.cats, objs = this.s.objects, bugs = this.s.bugs;
    const reach = COMPANION_ROAM - 1.2;
    let bx = p.x, by = p.y, best = -Infinity;
    for (let k = 0; k < WANDER_TRIES; k++) {
      let x: number, y: number;
      if (k % 3 === 2 && bugs.length > 0) {
        // 虫のそば（候補の 1/3）
        const b = bugs[Math.floor(this.rng() * bugs.length)];
        x = b.x + (this.rng() - 0.5) * 2;
        y = b.y + 0.5 + this.rng() * 1.5;
      } else {
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * reach;
        x = p.x + Math.cos(a) * r;
        y = p.y + Math.sin(a) * r;
      }
      x = clamp(x, ROAM_EDGE_SIDE, COLS - ROAM_EDGE_SIDE);
      y = clamp(y, ROAM_EDGE_TOP, ROWS - CAT_MARGIN - 0.2);
      const px = x - p.x, py = y - p.y;
      if (px * px + py * py > COMPANION_ROAM * COMPANION_ROAM) {
        const d = Math.hypot(px, py), m = reach / d;
        x = p.x + px * m; y = p.y + py * m;
        x = clamp(x, ROAM_EDGE_SIDE, COLS - ROAM_EDGE_SIDE);
        y = clamp(y, ROAM_EDGE_TOP, ROWS - CAT_MARGIN - 0.2);
      }
      let score = this.rng() * 0.6;
      // 虫が多い
      const start = this.qtop;
      const nb = this.queryBugs(x, y, 3);
      this.qtop = start;
      score += 1.6 * Math.min(nb, 8) / 8;
      // 虫の道の上
      const ci = clamp(Math.floor(y), 0, ROWS - 1) * COLS + clamp(Math.floor(x), 0, COLS - 1);
      if (route[ci]) score += 0.8;
      // ほかの猫から離れている（守りが手うすな所）
      let near = 4;
      for (let i = 0; i < cats.length; i++) {
        const o = cats[i];
        if (o === c || o.resting) continue;
        near = Math.min(near, Math.hypot(o.x - x, o.y - y));
        const ort = this.rt[i];
        if (o.companion && ort.hasGoal) near = Math.min(near, Math.hypot(ort.wx - x, ort.wy - y));
      }
      score += 0.3 * near;
      // オブジェクトが届く所は、もう守られている
      let cov = 0;
      for (let i = 0; i < objs.length && cov < 2; i++) {
        const o = objs[i];
        if (o.hp <= 0 || !(o.def.range > 0) || o.def.kind === "wall" || o.def.kind === "producer") continue;
        if (Math.hypot(o.cx - x, o.cy - y) <= o.def.range) cov++;
      }
      score -= 0.4 * cov;
      // 遠すぎる所へは行きたがらない・出口のそばはさける
      score -= 0.08 * Math.hypot(x - c.x, y - c.y);
      if (y < ROAM_EDGE_TOP + 1.5) score -= 0.5;
      if (this.sideSpawns && y < SIDE_SPAWN_ROWS + 1 && (x < 2 || x > COLS - 2)) score -= 0.5;
      if (score > best) { best = score; bx = x; by = y; }
    }
    rt.wx = bx; rt.wy = by;
    rt.wanderT = 0;
    rt.hasGoal = true;
  }

  /** 1匹の猫を進める（移動は aiX・aiY・aiMul。主人公はスティックの入力）。 */
  private updateCat(c: CatState, rt: CatRt, h: number): void {
    const ch = c.char;
    if (c.hurt > 0) c.hurt -= h;
    if (c.attackAnim > 0) c.attackAnim -= h;
    c.moving = false;
    if (c.resting) {
      rt.pend.length = 0;
      rt.pendLast.length = 0;
      rt.target = null;
      c.restTimer -= h;
      if (c.restTimer <= 0) {
        c.resting = false;
        c.restTimer = 0;
        c.hp = c.maxHp * clamp(ch.reviveHp || 0, 0.5, 1);
        c.atkTimer = 0;
        this.emit("catUp", c.x, c.y, 0);
        const wu = combo(c, "wakeUp");
        if (wu > 0) {
          c.wakeUp = wu;
          this.emit("wakeUp", c.x, c.y, wu);
        }
      }
      return;
    }
    // 自動回復
    if (ch.regen > 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * ch.regen * h);
    // 移動
    let mx = this.aiX;
    let my = this.aiY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.01) { c.facingX = mx; c.facingY = my; c.moving = true; }
    const sp = ch.moveSpeed * this.aiMul * h;
    c.x = clamp(c.x + mx * sp, CAT_MARGIN, COLS - CAT_MARGIN);
    c.y = clamp(c.y + my * sp, CAT_MARGIN, ROWS - CAT_MARGIN);

    // 修理
    if (ch.repair > 0) {
      const o = this.grid[clamp(Math.floor(c.y), 0, ROWS - 1) * COLS + clamp(Math.floor(c.x), 0, COLS - 1)];
      if (o && o.hp > 0 && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * ch.repair * h);
    }

    // 連続攻撃の残り
    const pend = rt.pend, pl = rt.pendLast;
    if (pend.length > 0) {
      let w = 0;
      for (let i = 0; i < pend.length; i++) {
        const t = pend[i] - h;
        if (t > 0) { pend[w] = t; pl[w] = pl[i]; w++; continue; }
        const tg = this.nearestBug(c.x, c.y, ch.range);
        if (tg && !c.resting) { c.attackAnim = 0.15; this.catStrike(c, tg, pl[i]); }
      }
      pend.length = w;
      pl.length = w;
    }

    // 攻撃
    if (c.atkTimer > 0) c.atkTimer -= h;
    if (c.atkTimer <= 0) {
      const t = this.nearestBug(c.x, c.y, ch.range);
      if (t) {
        c.atkTimer = ch.atkInterval / this.catSpeed(c);
        c.attackAnim = 0.15;
        const dx = t.x - c.x, dy = t.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        c.facingX = dx / d; c.facingY = dy / d;
        this.emit("catAttack", c.x, c.y, c.index);
        this.objectSync(c);
        // 連続攻撃（端数は確率で）
        const mh = Math.max(0, ch.multiHit || 0);
        const extra = Math.floor(mh) + (this.rng() < mh % 1 ? 1 : 0);
        for (let k = 1; k <= extra; k++) { pend.push(MULTI_HIT_GAP * k); pl.push(k === extra); }
        this.catStrike(c, t, false);
      } else {
        c.atkTimer = 0;
      }
    }
  }

  /** 今の攻撃力（lastStand・kibbleFever・partyLink・mamaGuard の上乗せつき）。 */
  catPower(c: Readonly<CatState>): number {
    let bonus = 0;
    if (c.desperate) bonus += combo(c, "lastStand");
    if (c.fever > 0) bonus += c.fever * combo(c, "kibbleFever");
    if (c.linked) bonus += combo(c, "partyLink");
    if (c.guarded) bonus += combo(c, "mamaGuard");
    return c.char.atk * (1 + bonus);
  }

  /** 攻撃の速さの倍率（frenzy・partyLink・wakeUp）。間隔をこれで割る。 */
  catSpeed(c: Readonly<CatState>): number {
    let m = 1 + c.frenzy * combo(c, "frenzy") + (c.linked ? combo(c, "partyLink") : 0);
    if (c.wakeUp > 0) m *= 2;
    return m > 0.05 ? m : 0.05;
  }

  /** 相手の虫による倍率（slowShatter・bossHunter）。 */
  private vsMul(c: CatState, b: BugState): number {
    let m = 1;
    if (b.slowMul < 1) m *= 1 + combo(c, "slowShatter");
    if (b.def.boss) m *= 1 + combo(c, "bossHunter");
    return m;
  }

  /** 1回の攻撃（echo: 連続攻撃の最後の一撃で、multiEcho の範囲攻撃になる）。 */
  private catStrike(c: CatState, t: BugState, echo: boolean): void {
    const ch = c.char;
    const prev = this.curCat;
    this.curCat = c;
    let rate = ch.crit || 0;
    if (t.poisonDps > 0) rate += combo(c, "venomCrit");
    const crit = rate > 0 && this.rng() < rate;
    const base = this.catPower(c);
    const dmg = base * (crit ? Math.max(1, ch.critMul || 1) : 1);
    const echoR = echo ? combo(c, "multiEcho") : 0;
    const tx = t.x, ty = t.y;
    if (ch.role === "ranged") {
      const pg = combo(c, "pierceGrow");
      this.addProjectile(c.x, c.y, 0, 0, t, dmg, Math.max(ch.aoe || 0, echoR), ch.range + 3, null, "cat", crit,
        Math.max(0, Math.floor(ch.pierce || 0)), c, pg > 0 ? dmg * pg : 0);
    } else if (ch.role === "aoe") {
      const r = Math.max(ch.aoe > 0 ? ch.aoe : 1, echoR);
      this.catHitArea(c, tx, ty, r, dmg, crit);
      this.emit("aoe", tx, ty, r);
    } else if (ch.aoe > 0 || echoR > 0) {
      this.catHitArea(c, tx, ty, Math.max(ch.aoe || 0, echoR), dmg, crit);
    } else {
      this.catHit(c, t, dmg, crit, false);
    }
    if (echoR > 0 && ch.role !== "ranged") this.emit("echo", tx, ty, echoR);
    if (crit && ch.role !== "ranged") this.critChain(c, tx, ty, t);
    this.curCat = prev;
  }

  /** 猫の範囲攻撃（shockwave・zapVenom が効く）。 */
  private catHitArea(c: CatState, x: number, y: number, r: number, dmg: number, crit: boolean): void {
    const start = this.qtop;
    const n = this.queryBugs(x, y, r);
    for (let k = start; k < start + n; k++) this.catHit(c, this.s.bugs[this.qbuf[k]], dmg, crit, true);
    this.qtop = start;
    if (combo(c, "shockwave") > 0) this.emit("shockwave", x, y, r);
  }

  /** 猫の攻撃が虫に当たった（会心・吸血・毒・減速・押し戻し・複合効果）。 */
  private catHit(c: CatState, b: BugState, dmg: number, crit: boolean, area: boolean): void {
    if (!b.alive) return;
    const ch = c.char;
    const prev = this.curCat;
    this.curCat = c;
    const dealt = this.damageBug(b, dmg * this.vsMul(c, b), crit ? "crit" : "bug");
    if (ch.lifesteal > 0 && dealt > 0 && !c.resting && c.hp < c.maxHp) {
      const heal = Math.min(c.maxHp - c.hp, dealt * ch.lifesteal);
      c.hp += heal;
      if (heal >= c.maxHp * 0.02) this.addFloat(heal, c.x, c.y - 0.5, "heal");
    }
    if (b.alive) {
      if (ch.poison > 0) this.applyPoison(b, this.catPower(c) * ch.poison, 0, c.index);
      const zv = area ? combo(c, "zapVenom") : 0;
      if (zv > 0) this.applyPoison(b, this.catPower(c) * zv, 0, c.index);
      if (ch.slowHit > 0 && ch.slowHit < 1) {
        b.slowMul = Math.min(b.slowMul, ch.slowHit);
        b.slowTimer = Math.max(b.slowTimer, SLOW_TIME);
      }
      let kb = ch.knockback || 0;
      const sw = area ? combo(c, "shockwave") : 0;
      if (sw > 0) {
        kb += sw;
        b.slowMul = Math.min(b.slowMul, SHOCK_SLOW);
        b.slowTimer = Math.max(b.slowTimer, SLOW_TIME);
      }
      if (kb > 0) this.catKnock(c, b, kb * (b.def.boss ? 0.5 : 1));
    }
    this.curCat = prev;
  }

  /** 猫が虫を押し戻す（knockSlam: かべ・家具・オブジェクト・ほかの虫にぶつかるとダメージ）。 */
  private catKnock(c: CatState, b: BugState, amount: number): void {
    const left = this.knockBack(b, amount);
    const slam = combo(c, "knockSlam");
    if (!(slam > 0) || !b.alive || left < 0 || !this.inStep) return;
    const mark = this.markId++;
    b.mark = mark;
    const other = this.nearestBug(b.x, b.y, SLAM_BUMP_R, mark);
    if (left <= 0.05 && !other) return;
    const d = this.catPower(c) * slam;
    this.emit("slam", b.x, b.y, other ? 1 : 0);
    this.damageBug(b, d * this.vsMul(c, b), "crit");
    if (other) this.damageBug(other, d * this.vsMul(c, other), "bug");
  }

  /** critChain: 会心が出たとき、近くの虫へ電撃が v 回とぶ（zapVenom なら毒も）。 */
  private critChain(c: CatState, x: number, y: number, first: BugState | null): void {
    const v = combo(c, "critChain");
    if (!(v > 0) || !this.inStep) return;
    const n = Math.floor(v) + (this.rng() < v % 1 ? 1 : 0);
    if (n <= 0) return;
    const mark = this.markId++;
    if (first) first.mark = mark;
    const dmg = this.catPower(c) * CRIT_CHAIN_MUL;
    const venom = combo(c, "zapVenom");
    let px = x, py = y;
    for (let k = 0; k < n; k++) {
      const t = this.nearestBug(px, py, CRIT_CHAIN_R, mark);
      if (!t) break;
      t.mark = mark;
      const bx = t.x, by = t.y;
      this.emit("zap", px, py, k, bx, by);
      this.damageBug(t, dmg * this.vsMul(c, t), "bug");
      if (venom > 0 && t.alive) this.applyPoison(t, this.catPower(c) * venom, 0, c.index);
      px = bx; py = by;
    }
  }

  /** objectSync: 猫が攻撃するたび、近くのオブジェクトの次の発動を v 秒早める。 */
  private objectSync(c: CatState): void {
    const v = combo(c, "objectSync");
    if (!(v > 0)) return;
    const objs = this.s.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (o.hp <= 0 || o.def.kind === "wall" || o.def.kind === "mine") continue;
      if (Math.hypot(c.x - o.cx, c.y - o.cy) > SYNC_R + Math.max(o.w, o.h) / 2 - 0.5) continue;
      const before = o.timer;
      o.timer += v;
      if (before < o.def.interval) this.emit("objectSync", o.cx, o.cy, v);
    }
  }

  /** 猫が虫を倒した（frenzy・killHeal・overkill）。 */
  private onCatKill(c: CatState, b: BugState, overflow: number): void {
    const fr = combo(c, "frenzy");
    if (fr > 0) {
      c.frenzy = Math.min(FRENZY_MAX, c.frenzy + 1);
      c.frenzyTimer = FRENZY_TIME;
    }
    const kh = combo(c, "killHeal");
    if (kh > 0 && !c.resting && c.hp < c.maxHp) {
      const heal = Math.min(c.maxHp - c.hp, c.maxHp * kh);
      c.hp += heal;
      if (heal >= c.maxHp * 0.05) this.addFloat(heal, c.x, c.y - 0.5, "heal");
    }
    const ok = combo(c, "overkill");
    if (ok > 0 && overflow > 0) this.fxQ.push(1, b.x, b.y, overflow * ok, c.index);
  }

  /** カリカリが入った（kibbleFever）。 */
  private onKibble(): void {
    const fc = this.feverCats;
    for (let i = 0; i < fc.length; i++) {
      const c = fc[i];
      if (c.resting) continue;
      c.fever = Math.min(FEVER_MAX, c.fever + 1);
      c.feverTimer = FEVER_TIME;
    }
  }

  /** 連鎖（毒の爆発・overkill）を順番に処理する。処理中に増えた分も続けて処理する。 */
  private drainFx(): void {
    if (this.draining) return;
    const q = this.fxQ;
    if (!this.inStep) { q.length = 0; return; }
    this.draining = true;
    const prev = this.curCat;
    const cats = this.s.cats;
    let count = 0;
    for (let i = 0; i < q.length && count < MAX_CHAIN; i += 5, count++) {
      const kind = q[i], x = q[i + 1], y = q[i + 2], dmg = q[i + 3];
      const c = cats[q[i + 4]];
      this.curCat = c;
      if (kind === 0) {
        // 毒の爆発
        this.emit("poisonBurst", x, y, BURST_RADIUS);
        const start = this.qtop;
        const n = this.queryBugs(x, y, BURST_RADIUS);
        for (let k = start; k < start + n; k++) {
          const b = this.s.bugs[this.qbuf[k]];
          this.damageBug(b, dmg * this.vsMul(c, b), "bug");
        }
        this.qtop = start;
      } else {
        // 余ったダメージを、いちばん近い虫へ
        const t = this.nearestBug(x, y, OVERKILL_RANGE);
        if (t) {
          this.emit("overkill", x, y, dmg, t.x, t.y);
          this.damageBug(t, dmg, "crit");
        }
      }
    }
    q.length = 0;
    this.curCat = prev;
    this.draining = false;
  }

  private damageCat(c: CatState, dmg: number): void {
    if (c.resting || c.wakeUp > 0) return;
    const ch = c.char;
    if (ch.dodge > 0 && this.rng() < ch.dodge) {
      this.emit("dodge", c.x, c.y, 0);
      const dc = combo(c, "dodgeCounter");
      if (dc > 0 && this.inStep) {
        const prev = this.curCat;
        this.curCat = c;
        const d = this.catPower(c) * dc;
        this.emit("counter", c.x, c.y, COUNTER_R);
        const start = this.qtop;
        const n = this.queryBugs(c.x, c.y, COUNTER_R);
        for (let k = start; k < start + n; k++) {
          const b = this.s.bugs[this.qbuf[k]];
          this.damageBug(b, d * this.vsMul(c, b), "crit");
        }
        this.qtop = start;
        this.curCat = prev;
      }
      return;
    }
    let v = dmg * ch.armor;
    if (c.guarded) {
      const mg = combo(c, "mamaGuard");
      if (mg > 0) v *= Math.max(0, 1 - mg / 2);
    }
    c.hp -= v;
    c.hurt = 0.15;
    this.addFloat(v, c.x, c.y - 0.3, "cat");
    this.emit("catHit", c.x, c.y, v);
    if (c.hp <= 0) {
      c.hp = 0;
      c.resting = true;
      c.restTimer = ch.restTime;
      c.desperate = false;
      c.linked = false;
      this.emit("catDown", c.x, c.y, 0);
    }
  }

  // ---- オブジェクト ----
  private objAtk(o: ObjState): number {
    return o.atk * (1 + this.auraBonus(o));
  }

  /** 会心の判定（当たるたびに）。 */
  private rollCrit(d: ResolvedObject): boolean {
    return (d.crit || 0) > 0 && this.rng() < d.crit;
  }

  private critMul(d: ResolvedObject): number {
    return Math.max(1, d.critMul || 1);
  }

  /** オブジェクトの攻撃が虫に当たった（ダメージ＋毒・押し戻し）。 */
  private objHit(o: ObjState, b: BugState, dmg: number, crit: boolean, base: number): void {
    if (!b.alive) return;
    const d = o.def;
    this.damageBug(b, dmg, crit ? "crit" : "bug");
    if (!b.alive) return;
    if ((d.poison || 0) > 0) this.applyPoison(b, base * d.poison, d.poisonSpread || 0);
    if ((d.knockback || 0) > 0) this.knockBack(b, d.knockback * (b.def.boss ? 0.5 : 1));
  }

  /** 当たった所のまわりへの範囲ダメージ（except はもう当たった虫）。 */
  private splashAt(o: ObjState, x: number, y: number, r: number, dmg: number, crit: boolean, base: number, except: BugState | null): void {
    const start = this.qtop;
    const n = this.queryBugs(x, y, r);
    for (let k = start; k < start + n; k++) {
      const b = this.s.bugs[this.qbuf[k]];
      if (b !== except) this.objHit(o, b, dmg, crit, base);
    }
    this.qtop = start;
    this.emit("splash", x, y, r);
  }

  /** 毒をかける（強い方の毒が残る。時間は戻る）。 */
  private applyPoison(b: BugState, dps: number, spread: number, src = -1): void {
    if (!b.alive || !(dps > 0)) return;
    const active = b.poisonTimer > 0;
    if (!active || dps >= b.poisonDps) b.poisonSrc = src;
    b.poisonDps = Math.max(active ? b.poisonDps : 0, dps);
    b.poisonSpread = Math.max(active ? b.poisonSpread : 0, spread);
    b.poisonTimer = POISON_TIME;
  }

  private updateObjects(h: number): void {
    const objs = this.s.objects;
    for (let oi = 0; oi < objs.length; oi++) {
      const o = objs[oi];
      if (o.hp <= 0) continue;
      if (o.hurt > 0) o.hurt -= h;
      const d = o.def;
      const cx = o.cx, cy = o.cy;
      // range はしめるマスの中心からの半径
      const range = d.range || 0;
      switch (d.kind) {
        case "wall":
          break;
        case "mine": {
          let hit = false;
          for (let r = o.row; r < o.row + o.h && !hit; r++) {
            for (let c = o.col; c < o.col + o.w && !hit; c++) {
              const bi = binOf(c + 0.5, r + 0.5);
              for (let i = this.binHead[bi]; i >= 0; i = this.binNext[i]) {
                const b = this.s.bugs[i];
                if (b.alive && b.y >= 0 && Math.floor(b.x) === c && Math.floor(b.y) === r) { hit = true; break; }
              }
            }
          }
          if (hit) {
            const rad = Math.max(MINE_RADIUS, d.splash || 0);
            const base = this.objAtk(o);
            const crit = this.rollCrit(d);
            this.areaHit(o, cx, cy, rad, crit ? base * this.critMul(d) : base, crit, base);
            this.emit("mine", cx, cy, rad);
            this.removeObject(o, false);
          }
          break;
        }
        case "producer": {
          o.timer += h;
          if (d.interval > 0 && o.timer >= d.interval) {
            o.timer -= d.interval;
            const v = d.produce * this.loadout.global.kibbleMul;
            if (v > 0) {
              this.s.kibble += v;
              this.emit("produce", cx, cy, v);
              this.emit("kibble", cx, cy, v);
              this.onKibble();
            }
          }
          break;
        }
        case "aoe": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, range)) {
            o.timer = 0;
            const base = this.objAtk(o);
            const crit = this.rollCrit(d);
            const start = this.qtop;
            const n = this.queryBugs(cx, cy, range);
            const dmg = crit ? base * this.critMul(d) : base;
            for (let k = start; k < start + n; k++) {
              const b = this.s.bugs[this.qbuf[k]];
              // slow < 1 の aoe（吸い込み）は、当てた虫も遅くする
              if (d.slow < 1) { b.slowMul = Math.min(b.slowMul, d.slow); b.slowTimer = SLOW_TIME; }
              this.objHit(o, b, dmg, crit, base);
            }
            this.qtop = start;
            this.emit("aoe", cx, cy, range);
          }
          break;
        }
        case "slow": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, range)) {
            o.timer = 0;
            const base = this.objAtk(o);
            const start = this.qtop;
            const n = this.queryBugs(cx, cy, range);
            for (let k = start; k < start + n; k++) {
              const b = this.s.bugs[this.qbuf[k]];
              if (d.slow < 1) { b.slowMul = Math.min(b.slowMul, d.slow); b.slowTimer = SLOW_TIME; }
              if (base > 0) {
                const crit = this.rollCrit(d);
                this.objHit(o, b, crit ? base * this.critMul(d) : base, crit, base);
              }
            }
            this.qtop = start;
            this.emit("slow", cx, cy, range);
          }
          break;
        }
        case "poison": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, range)) {
            o.timer = 0;
            const dps = this.objAtk(o) * ((d.poison || 0) > 0 ? d.poison : 1);
            const start = this.qtop;
            const n = this.queryBugs(cx, cy, range);
            for (let k = start; k < start + n; k++) {
              const b = this.s.bugs[this.qbuf[k]];
              this.applyPoison(b, dps, d.poisonSpread || 0);
              if ((d.knockback || 0) > 0) this.knockBack(b, d.knockback * (b.def.boss ? 0.5 : 1));
            }
            this.qtop = start;
            this.emit("poisonCloud", cx, cy, range);
          }
          break;
        }
        case "zap": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval) {
            const t = this.nearestBug(cx, cy, range);
            if (t) {
              o.timer = 0;
              this.zap(o, t);
            }
          }
          break;
        }
        case "shooter":
        default: {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval) {
            const t = this.nearestBug(cx, cy, range);
            if (t) {
              o.timer = 0;
              this.fire(o, t, range);
            }
          }
          break;
        }
      }
    }
  }

  /** 範囲の虫すべてに当てる（aoe・mine）。 */
  private areaHit(o: ObjState, x: number, y: number, r: number, dmg: number, crit: boolean, base: number): void {
    const start = this.qtop;
    const n = this.queryBugs(x, y, r);
    for (let k = start; k < start + n; k++) this.objHit(o, this.s.bugs[this.qbuf[k]], dmg, crit, base);
    this.qtop = start;
  }

  /** shooter が撃つ（multishot なら扇形に）。 */
  private fire(o: ObjState, t: BugState, range: number): void {
    const d = o.def;
    const ms = Math.max(0, d.multishot || 0);
    const n = 1 + Math.floor(ms) + (this.rng() < ms % 1 ? 1 : 0);
    const spread = n > 1 ? ((d.spread || 0) > 0 ? d.spread : DEFAULT_SPREAD) : 0;
    const base = this.objAtk(o);
    const ang0 = Math.atan2(t.y - o.cy, t.x - o.cx);
    const mid = n % 2 === 1 ? (n - 1) / 2 : -1;
    const pierce = Math.max(0, Math.floor(d.pierce || 0));
    // 弾は中心から少し前に出す（大きいオブジェクトの絵の中から出ないように）
    const lead = (Math.max(o.w, o.h) - 1) * 0.35;
    for (let k = 0; k < n; k++) {
      const ang = n > 1 ? ang0 + spread * (k / (n - 1) - 0.5) : ang0;
      const crit = this.rollCrit(d);
      const vx = Math.cos(ang) * OBJ_SHOT_SPEED, vy = Math.sin(ang) * OBJ_SHOT_SPEED;
      this.addProjectile(o.cx + Math.cos(ang) * lead, o.cy + Math.sin(ang) * lead, vx, vy, k === mid ? t : null,
        crit ? base * this.critMul(d) : base, d.splash || 0, range + 2.5, o, d.kind, crit, pierce);
    }
    this.emit("shoot", o.cx, o.cy, n);
  }

  /** 電撃: 当たった虫から、まだ当たっていない近くの虫へ chain 回まで飛び移る。 */
  private zap(o: ObjState, first: BugState): void {
    const d = o.def;
    const mark = this.markId++;
    const base = this.objAtk(o);
    const jumps = Math.max(0, Math.floor(d.chain || 0));
    const cr = (d.chainRange || 0) > 0 ? d.chainRange : 2;
    let px = o.cx, py = o.cy;
    let cur: BugState | null = first;
    for (let k = 0; k <= jumps && cur; k++) {
      cur.mark = mark;
      const bx: number = cur.x, by: number = cur.y;
      this.emit("zap", px, py, k, bx, by);
      const crit = this.rollCrit(d);
      const dmg = crit ? base * this.critMul(d) : base;
      this.objHit(o, cur, dmg, crit, base);
      if ((d.splash || 0) > 0) this.splashAt(o, bx, by, d.splash, dmg, crit, base, cur);
      px = bx; py = by;
      cur = k < jumps ? this.nearestBug(bx, by, cr, mark) : null;
    }
  }

  private removeObject(o: ObjState, broken: boolean): void {
    o.hp = 0;
    let changed = false;
    for (let r = o.row; r < o.row + o.h; r++) for (let c = o.col; c < o.col + o.w; c++) {
      const i = r * COLS + c;
      if (this.grid[i] === o) {
        this.grid[i] = null;
        if (o.def.block && !this.terrain[i]) { this.blockMask[i] = 0; changed = true; }
      }
    }
    if (changed) this.recomputeFlow();
    if (broken) this.emit("objectBroken", o.cx, o.cy, Math.max(o.w, o.h));
  }

  // ---- 弾 ----
  private addProjectile(x: number, y: number, vx: number, vy: number, target: BugState | null, dmg: number, splash: number,
    maxDist: number, src: ObjState | null, kind: string, crit: boolean, pierce: number, owner: CatState | null = null, grow = 0): void {
    let p = this.projPool.pop();
    if (!p) {
      p = {
        uid: 0, x: 0, y: 0, vx: 0, vy: 0, dmg: 0, splash: 0, target: null, targetUid: -1, maxDist: 0, traveled: 0,
        fromCat: false, crit: false, pierce: 0, hitUids: [], kind: "", src: null, owner: null, grow: 0, alive: true,
      };
    }
    p.uid = this.nextUid++;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.dmg = dmg; p.splash = splash;
    p.target = target; p.targetUid = target ? target.uid : -1;
    p.maxDist = maxDist; p.traveled = 0;
    p.fromCat = src === null && kind === "cat";
    p.crit = crit; p.pierce = pierce;
    p.hitUids.length = 0;
    p.kind = kind; p.src = src; p.owner = owner; p.grow = grow; p.alive = true;
    this.s.projectiles.push(p);
  }

  private updateProjectiles(h: number): void {
    const ps = this.s.projectiles;
    for (let pi = 0; pi < ps.length; pi++) {
      const p = ps[pi];
      if (!p.alive) continue;
      const speed = p.fromCat ? HOMING_SHOT_SPEED : OBJ_SHOT_SPEED;
      const t = p.target;
      if (t && t.alive) {
        // 追いかける弾
        const dx = t.x - p.x, dy = t.y - p.y;
        const d = Math.hypot(dx, dy);
        const stepLen = speed * h;
        if (d > 1e-9) { p.vx = (dx / d) * speed; p.vy = (dy / d) * speed; }
        if (d <= stepLen + 0.2) {
          p.x = t.x; p.y = t.y;
          this.projectileHit(p, t);
          continue;
        }
        p.x += p.vx * h; p.y += p.vy * h;
        p.traveled += stepLen;
        if (p.traveled > p.maxDist) p.alive = false;
        continue;
      }
      if (t) { p.target = null; p.targetUid = -1; }
      if (p.vx === 0 && p.vy === 0) { p.alive = false; continue; }
      // まっすぐ進む弾（扇形の弾・相手がいなくなった弾・貫通したあと）
      p.x += p.vx * h; p.y += p.vy * h;
      p.traveled += Math.hypot(p.vx, p.vy) * h;
      this.straightHits(p);
      if (p.traveled > p.maxDist || p.x < -1 || p.x > COLS + 1 || p.y < -1.5 || p.y > ROWS + 1) p.alive = false;
    }
  }

  /** まっすぐ進む弾が、近くの虫に当たったか（まわり 3×3 の入れ物だけ見る）。 */
  private straightHits(p: Projectile): void {
    const bugs = this.s.bugs;
    const head = this.binHead, next = this.binNext;
    const pc = clamp(Math.floor(p.x) + HP, 0, HW - 1), pr = clamp(Math.floor(p.y) + HP, 0, HH - 1);
    const r2 = SHOT_HIT_R * SHOT_HIT_R;
    for (let rr = Math.max(0, pr - 1); rr <= Math.min(HH - 1, pr + 1); rr++) {
      for (let cc = Math.max(0, pc - 1); cc <= Math.min(HW - 1, pc + 1); cc++) {
        for (let i = head[rr * HW + cc]; i >= 0; i = next[i]) {
          const b = bugs[i];
          if (!b.alive) continue;
          const dx = b.x - p.x, dy = b.y - p.y;
          if (dx * dx + dy * dy > r2) continue;
          if (p.hitUids.includes(b.uid)) continue;
          this.projectileHit(p, b);
          if (!p.alive) return;
        }
      }
    }
  }

  private projectileHit(p: Projectile, t: BugState): void {
    p.hitUids.push(t.uid);
    const tx = t.x, ty = t.y;
    if (p.fromCat || !p.src) {
      const c = p.owner ?? this.s.cats[0];
      const prev = this.curCat;
      this.curCat = c;
      if (p.splash > 0) {
        this.catHitArea(c, tx, ty, p.splash, p.dmg, p.crit);
        this.emit("aoe", tx, ty, p.splash);
      } else {
        this.catHit(c, t, p.dmg, p.crit, false);
      }
      if (p.crit && p.hitUids.length === 1) this.critChain(c, tx, ty, t);
      this.curCat = prev;
      if (p.pierce > 0 && p.grow > 0) p.dmg += p.grow;
    } else {
      const o = p.src;
      const base = p.crit ? p.dmg / this.critMul(o.def) : p.dmg;
      this.objHit(o, t, p.dmg, p.crit, base);
      if (p.splash > 0) this.splashAt(o, tx, ty, p.splash, p.dmg, p.crit, base, t);
    }
    if (p.pierce > 0) {
      p.pierce--;
      p.target = null;
      p.targetUid = -1;
      if (p.vx === 0 && p.vy === 0) p.vy = -OBJ_SHOT_SPEED;
    } else {
      p.alive = false;
    }
  }

  // ---- 虫 ----
  private updateBugs(h: number): void {
    const s = this.s;
    const cats = s.cats;
    const bugs = s.bugs;
    for (let bi = 0; bi < bugs.length; bi++) {
      const b = bugs[bi];
      if (!b.alive) continue;
      if (b.hurt > 0) b.hurt -= h;
      if (b.knock > 0) b.knock = Math.max(0, b.knock - h);
      if (b.slowTimer > 0) {
        b.slowTimer -= h;
        if (b.slowTimer <= 0) { b.slowTimer = 0; b.slowMul = 1; }
      }
      if (b.poisonTimer > 0) {
        b.poisonTimer -= h;
        b.poisonTick += h;
        if (b.poisonTick >= POISON_TICK - 1e-9) {
          // 猫の毒は、その猫が倒したことにする（slowShatter・bossHunter も効く）
          const pc = b.poisonSrc >= 0 ? s.cats[b.poisonSrc] ?? null : null;
          const mul = pc ? this.vsMul(pc, b) : 1;
          this.curCat = pc;
          while (b.poisonTick >= POISON_TICK - 1e-9 && b.alive) {
            b.poisonTick -= POISON_TICK;
            this.damageBug(b, b.poisonDps * POISON_TICK * mul, "poison");
          }
          this.curCat = null;
        }
        if (b.alive && b.poisonTimer <= 0) { b.poisonTimer = 0; b.poisonDps = 0; b.poisonTick = 0; b.poisonSpread = 0; b.poisonSrc = -1; }
        if (!b.alive) continue;
      }
      // 触れている猫（主人公・相棒のどれか）をかじる
      let bit: CatState | null = null;
      for (let ci = 0; ci < cats.length; ci++) {
        const c = cats[ci];
        if (c.resting) continue;
        const dx = c.x - b.x, dy = c.y - b.y;
        if (dx * dx + dy * dy < CAT_TOUCH * CAT_TOUCH) { bit = c; break; }
      }
      if (bit) {
        if (b.mode !== "bite") { b.mode = "bite"; b.atkTimer = 0; }
        b.atkTimer += h;
        if (b.atkTimer >= b.def.atkInterval) {
          b.atkTimer -= b.def.atkInterval;
          this.damageCat(bit, b.atk);
        }
        continue;
      }
      // 行く手のオブジェクトをかじる（かじる虫）
      const co = b.chewObj;
      if (co) {
        if (co.hp > 0) {
          if (b.mode !== "chew") { b.mode = "chew"; b.atkTimer = 0; }
          b.atkTimer += h;
          if (b.atkTimer >= b.def.atkInterval) {
            b.atkTimer -= b.def.atkInterval;
            this.damageObject(co, b.atk * b.chew, b);
          }
          if (co.hp > 0) continue;
        }
        b.chewObj = null;
      }
      b.mode = "walk";
      this.moveGround(b, b.speed * b.slowMul * h);
      if (s.result) return;
      if (!b.alive) continue;
      // 通れるオブジェクトの上を歩くと、すり減らす（止まらない）
      if (b.y >= 0 && b.x >= 0 && b.x < COLS) {
        const o = this.grid[clamp(Math.floor(b.y), 0, ROWS - 1) * COLS + clamp(Math.floor(b.x), 0, COLS - 1)];
        if (o && o.hp > 0 && !o.def.block && o.def.kind !== "mine") {
          b.wear += h;
          if (b.wear >= b.def.atkInterval) {
            b.wear -= b.def.atkInterval;
            this.damageObject(o, b.atk * WEAR_MUL, b);
          }
        } else if (b.wear > 0) {
          b.wear = 0;
        }
      }
    }
  }

  /** オブジェクトが虫にかじられた。HP が 0 になったら消える（"objectBroken"）。 */
  private damageObject(o: ObjState, dmg: number, by: BugState | null): void {
    if (o.hp <= 0 || !(dmg > 0)) return;
    o.hp -= dmg;
    o.hurt = 0.15;
    this.addFloat(dmg, o.cx, o.cy - 0.2, "object");
    this.emit("objectHit", by ? by.x : o.cx, by ? by.y : o.cy, dmg, o.cx, o.cy);
    if (o.hp <= 0) this.removeObject(o, true);
  }

  private moveGround(b: BugState, step: number): void {
    let rem = step;
    for (let k = 0; k < 6 && rem > 1e-9; k++) {
      const goal = GOAL_MASK[b.nextRow * COLS + b.nextCol] === 1;
      const tx = b.nextCol + 0.5 + (goal ? 0 : b.offX);
      const ty = b.nextRow + 0.5 + (goal ? 0 : b.offY);
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      if (d > rem) {
        b.dirX = dx / d; b.dirY = dy / d;
        b.x += b.dirX * rem; b.y += b.dirY * rem;
        return;
      }
      b.x = tx; b.y = ty;
      rem -= d;
      if (goal) { this.reachMama(b); return; }
      const chew = b.chew > 0;
      const n = this.nextStep(b.nextCol, b.nextRow, b.stepX, b.stepY, chew);
      if (chew && n >= 0) {
        // 次のマスに通れないオブジェクト: 止まってかじる
        const o = this.grid[n];
        if (o && o.hp > 0 && o.def.block) {
          b.chewObj = o;
          const nc = n % COLS, nr = (n - nc) / COLS;
          const dx = nc - b.nextCol, dy = nr - b.nextRow, l = Math.hypot(dx, dy) || 1;
          b.dirX = dx / l; b.dirY = dy / l;
          return;
        }
      }
      if (n < 0) {
        // ありえないはず（閉じこめる置き方はできない）。念のためママへまっすぐ向かう
        b.nextCol = GOAL_COL; b.nextRow = GOAL_ROW;
        continue;
      }
      const nc = n % COLS, nr = (n - nc) / COLS;
      b.stepX = nc - b.nextCol; b.stepY = nr - b.nextRow;
      b.nextCol = nc; b.nextRow = nr;
    }
  }

  private reachMama(b: BugState): void {
    const s = this.s;
    const dmg = b.def.boss ? s.mamaHp : Math.min(1, s.mamaHp);
    s.mamaHp = b.def.boss ? 0 : Math.max(0, s.mamaHp - 1);
    b.alive = false;
    this.waveAlive[b.wave]--;
    this.emit("mamaHit", GOAL_X, GOAL_Y - 0.5, dmg);
  }

  /** 虫を amount マスぶん押し戻す（道を逆に）。押し戻せなかった残り（かべ・家具などに当たった）を返す。押し戻さなかったときは -1。 */
  private knockBack(b: BugState, amount: number): number {
    if (!(amount > 0) || b.y < 0) return -1;
    const x0 = b.x, y0 = b.y;
    let amt = amount;
    let sx = b.stepX, sy = b.stepY;
    for (let k = 0; k < 24 && amt > 1e-6; k++) {
      const cc = clamp(Math.floor(b.x), 0, COLS - 1), cr = clamp(Math.floor(b.y), 0, ROWS - 1);
      const up = this.upstream(cc, cr, sx, sy);
      if (up < 0) break;
      const uc = up % COLS, ur = (up - uc) / COLS;
      sx = cc - uc; sy = cr - ur;
      const tx = uc + 0.5 + b.offX, ty = ur + 0.5 + b.offY;
      const dx = tx - b.x, dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      if (d <= amt) { b.x = tx; b.y = ty; amt -= d; }
      else { b.x += (dx / d) * amt; b.y += (dy / d) * amt; amt = 0; }
    }
    b.nextCol = clamp(Math.floor(b.x), 0, COLS - 1);
    b.nextRow = clamp(Math.floor(b.y), 0, ROWS - 1);
    b.stepX = sx; b.stepY = sy;
    if (b.x !== x0 || b.y !== y0) {
      b.chewObj = null;
      b.knockX = x0 - b.x; b.knockY = y0 - b.y; b.knock = KNOCK_TIME;
      this.emit("knockback", b.x, b.y, Math.hypot(b.knockX, b.knockY));
    }
    return amt;
  }

  /**
   * 虫にダメージ。実際に減った HP を返す。倒したらカリカリがすぐ手に入る。毒で倒れたら、まわりに毒がうつる。
   * 猫の攻撃（curCat があるとき）には、虫の catResist を掛ける。
   */
  private damageBug(b: BugState, dmg: number, kind: FloatKind): number {
    if (!b.alive || !(dmg > 0)) return 0;
    if (this.curCat && b.resist !== 1) {
      dmg *= b.resist;
      if (b.resist < 1) {
        if (kind !== "crit") kind = "resist";
        if (this.s.time - b.resistAt >= RESIST_HINT_GAP) { b.resistAt = this.s.time; this.emit("resist", b.x, b.y, b.resist); }
      }
      if (!(dmg > 0)) return 0;
    }
    const before = b.hp;
    const dealt = Math.min(dmg, b.hp);
    b.hp -= dmg;
    b.hurt = 0.12;
    this.addFloat(dmg, b.x, b.y - 0.3, kind);
    this.emit("hit", b.x, b.y, dmg);
    if (b.hp <= 0) {
      b.alive = false;
      b.hp = 0;
      this.s.kills++;
      this.waveAlive[b.wave]--;
      const drop = b.def.drop * this.loadout.global.kibbleMul * (1 + this.kibbleBonus);
      const kx = clamp(b.x, 0.2, COLS - 0.2), ky = clamp(b.y, 0.2, ROWS - 0.2);
      if (drop > 0) {
        this.s.kibble += drop;
        this.emit("kibble", kx, ky, drop);
        if (this.feverCats.length > 0) this.onKibble();
      }
      this.emit("kill", kx, ky, 0);
      const c = this.curCat;
      if (c) this.onCatKill(c, b, dmg - before);
      const bc = this.burstCat;
      if (bc && b.poisonDps > 0) this.fxQ.push(0, b.x, b.y, this.catPower(bc) * combo(bc, "poisonBurst"), bc.index);
      if (b.poisonTimer > 0 && b.poisonSpread > 0 && b.poisonDps > 0) this.spreadPoison(b);
      if (this.fxQ.length > 0) this.drainFx();
    }
    return dealt;
  }

  /** 毒で倒れた虫から、まわりの虫へ毒がうつる。 */
  private spreadPoison(b: BugState): void {
    const r = b.poisonSpread;
    const start = this.qtop;
    const n = this.inStep ? this.queryBugs(b.x, b.y, r) : 0;
    for (let k = start; k < start + n; k++) {
      const o = this.s.bugs[this.qbuf[k]];
      if (o !== b) this.applyPoison(o, b.poisonDps, r);
    }
    this.qtop = start;
    this.emit("poisonSpread", b.x, b.y, r);
  }

  // ---- 表示用 ----
  private addFloat(value: number, x: number, y: number, kind: FloatKind): void {
    const f = this.s.floats;
    let it: FloatText;
    if (f.length >= MAX_FLOATS) {
      if (kind === "poison" || kind === "bug") {
        // いっぱいのときは、細かい数字は出さない（会心などは古いものを上書き）
        return;
      }
      it = f[this.floatRoll++ % f.length];
    } else {
      if (kind === "poison" && f.length > MAX_FLOATS / 2) return;
      it = this.floatPool.pop() ?? { value: 0, x: 0, y: 0, age: 0, kind: "bug" };
      f.push(it);
    }
    it.value = value; it.x = x; it.y = y; it.age = 0; it.kind = kind;
  }

  private ageFloats(h: number): void {
    const f = this.s.floats;
    let w = 0;
    for (let i = 0; i < f.length; i++) {
      const it = f[i];
      it.age += h;
      if (it.age < FLOAT_LIFE) f[w++] = it;
      else this.floatPool.push(it);
    }
    f.length = w;
  }

  private emit(type: BattleEventType, x: number, y: number, value: number, x2 = 0, y2 = 0): void {
    const ev = this.s.events;
    if (ev.length >= MAX_EVENTS && (type === "hit" || type === "spawn" || type === "kibble" || type === "kill" || type === "shoot" || type === "knockback"
      || type === "objectSync" || type === "slam" || type === "overkill" || type === "zap")) return;
    let e = this.evPool[this.evCursor];
    if (!e) { e = { type, x, y, value, x2, y2 }; this.evPool[this.evCursor] = e; }
    this.evCursor = (this.evCursor + 1) % EVENT_POOL;
    e.type = type; e.x = x; e.y = y; e.value = value; e.x2 = x2; e.y2 = y2;
    ev.push(e);
  }

  /** 死んだ虫・消えた弾・こわれたオブジェクトを配列から取り除く（その場で詰める）。 */
  private compact(): void {
    const s = this.s;
    const bugs = s.bugs;
    let w = 0;
    for (let i = 0; i < bugs.length; i++) if (bugs[i].alive) bugs[w++] = bugs[i];
    bugs.length = w;
    const ps = s.projectiles;
    w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.alive) ps[w++] = p;
      else { p.target = null; p.src = null; p.owner = null; this.projPool.push(p); }
    }
    ps.length = w;
    const os = s.objects;
    w = 0;
    for (let i = 0; i < os.length; i++) if (os[i].hp > 0) os[w++] = os[i];
    os.length = w;
    this.hashed = 0;
  }

  private wavesCleared(): number {
    let n = 0;
    for (let i = 0; i < this.waveAlive.length; i++) {
      if (i < this.s.waveIndex && this.waveAlive[i] <= 0) n++;
    }
    return n;
  }

  private checkEnd(): void {
    const s = this.s;
    if (s.mamaHp <= 0) {
      s.result = { win: false, stageId: this.loadout.stage.id, kills: s.kills, time: s.time, wavesCleared: this.wavesCleared() };
      this.emit("lose", GOAL_X, GOAL_Y, 0);
      return;
    }
    if (s.waveIndex < s.waveTotal) return;
    for (const q of this.queues) if (q.spawned < q.count) return;
    if (s.bugs.length > 0) return;
    s.result = { win: true, stageId: this.loadout.stage.id, kills: s.kills, time: s.time, wavesCleared: s.waveTotal };
    this.emit("win", COLS / 2, ROWS / 2, 0);
  }
}

/** 虫の群れの数（1 以上）。 */
function packOf(def: BugDef): number {
  const p = Math.floor(def.pack ?? 1);
  return p > 1 ? Math.min(p, 12) : 1;
}

/** 虫のかじる強さ（ボスは最低 1）。 */
function chewOf(def: BugDef): number {
  const c = def.chew ?? 0;
  return Math.max(c > 0 ? c : 0, def.boss ? 1 : 0);
}

/** 猫からのダメージの倍率（0〜。なければ 1）。 */
function resistOf(def: BugDef): number {
  const r = def.catResist;
  return r !== undefined && r >= 0 && Number.isFinite(r) ? r : 1;
}

/** 猫の複合効果の値（無ければ 0）。 */
function combo(c: Readonly<CatState>, id: ComboId): number {
  const v = c.char.combos?.[id];
  return v !== undefined && v > 0 ? v : 0;
}

/** 盤面の座標 → spatial hash の入れ物の番号。 */
function binOf(x: number, y: number): number {
  const c = clamp(Math.floor(x) + HP, 0, HW - 1);
  const r = clamp(Math.floor(y) + HP, 0, HH - 1);
  return r * HW + c;
}

/** 何もしない入力（テストや待ち時間用）。 */
export function idleInput(): BattleInput {
  return { move: { x: 0, y: 0 }, place: null, upgrade: false };
}
