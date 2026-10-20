// ゲーム全体で共有する型（成長・データ・戦闘・画面の約束ごと）。ここを変えるときは全体に影響する。
//
// 舞台: 虫嫌いのママを、猫が虫から守る。縦画面。下にママ、上から虫が列（レーン）をまっすぐ下りてくる。
// 盤面は COLS 列 × ROWS 行のマス。猫はスティックで自由に動き、自分のいるマスにオブジェクトを置く・強化する。
// 数値はインフレ系（最初はダメージ1、最終的には 1e30 以上）。数値は number（double）のまま扱い、表示だけ fmt() で 10A・100J のようにする。

export const COLS = 5;
export const ROWS = 9;

/** 猫の戦い方の個性。 */
export type CharRole = "melee" | "ranged" | "aoe" | "fast";

/** 戦闘で使う、計算ずみの猫の強さ（成長・スキル・装備・レリックをすべて掛けたあと）。 */
export interface ResolvedChar {
  id: string;
  name: string;
  role: CharRole;
  maxHp: number;
  atk: number;          // 1回の攻撃のダメージ
  atkInterval: number;  // 攻撃の間隔（秒）
  range: number;        // 攻撃が届く距離（マス）。近接は 0.9 くらい
  aoe: number;          // 範囲攻撃の半径（マス）。0 なら単体
  moveSpeed: number;    // 移動の速さ（マス/秒）
  restTime: number;     // HP が 0 になってから動けるようになるまでの秒数
  armor: number;        // 受けるダメージの倍率（0.8 なら 20% 軽減）
  pickupRange: number;  // カリカリを拾える距離（マス）
}

/** オブジェクトの種類。 */
export type ObjectKind =
  | "shooter"   // 上の列（虫が来る方）へ弾を撃つ
  | "wall"      // 虫を足止めする（HP が高い）
  | "aoe"       // まわりのマスにまとめてダメージ
  | "slow"      // 当てた虫を遅くする
  | "producer"  // カリカリを生む
  | "mine";     // 踏んだ虫に大ダメージ（1回きり）

/** 戦闘で使う、計算ずみのオブジェクトの強さ（レベル・装備の補正・レリックを掛けたあと）。 */
export interface ResolvedObject {
  id: string;
  name: string;
  kind: ObjectKind;
  cost: number;         // 置くのに使うカリカリ
  maxHp: number;
  atk: number;          // 1回の攻撃のダメージ（producer は 0）
  interval: number;     // 攻撃（producer は生産）の間隔（秒）
  range: number;        // 届く距離（マス）。shooter は前方の行数、aoe は半径
  slow: number;         // slow: 速さに掛ける倍率（0.5 で半分）。それ以外は 1
  produce: number;      // producer: 1回に生むカリカリ
  cooldown: number;     // 置いたあと、同じものを次に置けるまでの秒数
  upgradeCost: number;  // 戦闘中の強化1回のカリカリ（強化するたびに増える）
  upgradeMul: number;   // 戦闘中の強化1回で atk・maxHp に掛ける倍率
}

/** 虫の種類（ステージで使う）。 */
export interface BugDef {
  id: string;
  name: string;
  hp: number;           // 基本の体力（ステージ倍率を掛ける前）
  atk: number;          // オブジェクト・猫をかじる1回のダメージ（基本）
  speed: number;        // 下りてくる速さ（マス/秒）
  atkInterval: number;
  boss?: boolean;
  fly?: boolean;        // 飛ぶ虫は壁を越える
  drop: number;         // 倒したときに落とすカリカリ
}

/** ステージの1つの波。 */
export interface WaveDef {
  at: number;                      // 開始からの秒数
  bugs: { bug: string; count: number; every: number; lanes?: number[] }[];   // every: 何秒おきに出すか
}

/** ステージ（章-番号）。 */
export interface StageDef {
  id: string;           // "1-1" など
  chapter: number;
  index: number;
  name: string;
  hpMul: number;        // 虫の体力の倍率（インフレ）
  atkMul: number;       // 虫の攻撃の倍率
  waves: WaveDef[];
  startKibble: number;
  kibblePerSec: number; // 自然に増えるカリカリ
  rewards: StageRewards;
}

/** ステージクリアでもらえるもの（目安。実際の抽選は core 側）。 */
export interface StageRewards {
  exp: number;          // 猫の経験値
  coins: number;        // 成長に使うお金
  relicPoints: number;  // レリックの解放に使う
  equipDrops: number;   // 装備が落ちる数
  objectDrops: number;  // オブジェクト（合成用のかけら）が落ちる数
}

/** 戦闘を始めるのに必要なもの。 */
export interface Loadout {
  char: ResolvedChar;
  objects: ResolvedObject[];   // 持っていくオブジェクト（最大5）
  stage: StageDef;
  bugs: Record<string, BugDef>;
  /** レリックなどで盤面全体にかかる効果。 */
  global: { kibbleMul: number; startKibbleAdd: number; mamaHp: number };
}

/** 戦闘の結果。 */
export interface BattleResult {
  win: boolean;
  stageId: string;
  kills: number;
  time: number;
  wavesCleared: number;
}

/** 戦闘への入力（1コマぶん）。 */
export interface BattleInput {
  move: { x: number; y: number };   // スティック（長さ 0〜1。y は下が＋）
  place: number | null;             // このコマで置くオブジェクトの番号（Loadout.objects の添字）
  upgrade: boolean;                 // このコマで、猫のいるマスのオブジェクトを強化する
}
