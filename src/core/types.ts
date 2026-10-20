// ゲーム全体で共有する型（成長・データ・戦闘・画面の約束ごと）。ここを変えるときは全体に影響する。
//
// 舞台: 虫嫌いのママを、猫が虫から守る。縦画面。下の真ん中にママ。虫は上の端（ときどき左右の上の方）から出て、
// ママに向かって集まるように進む（マスの上を最短の道で。通れないオブジェクトはよけて回り込む）。ボスがママに着いたら即負け。
// 盤面は COLS 列 × ROWS 行のマス。猫はスティックで自由に動いて戦う。オブジェクトはカードを盤面へドラッグして置き、置いたものをタップして強化する。
// 通れないオブジェクト（block）で道をふさいで遠回りさせ、そのあいだに倒す。ただし虫の道を完全にふさぐ置き方はできない。
// 数値はインフレ系（最初はダメージ1、最終的には 1e30 以上）。数値は number（double）のまま扱い、表示だけ fmt() で 10A・100J のようにする。

export const COLS = 14;
export const ROWS = 18;

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
  /** 特殊技能（スキルツリーで取る）。0 なら効果なし。 */
  crit: number;         // 会心の確率（0〜1）
  critMul: number;      // 会心のダメージ倍率（2 なら2倍。crit が 0 なら使わない）
  multiHit: number;     // 1回の攻撃で追加で叩く回数（連続攻撃）
  lifesteal: number;    // 与えたダメージのうち HP に戻る割合
  regen: number;        // 毎秒、最大 HP のこの割合だけ回復
  knockback: number;    // 当てた虫を押し戻すマス数
  poison: number;       // 当てた虫に、攻撃力のこの割合を毎秒ダメージ（3秒）
  slowHit: number;      // 当てた虫の速さに掛ける倍率（1 で効果なし。0.7 なら3割遅く）
  pierce: number;       // 遠距離の弾が突き抜ける数
  kibbleBonus: number;  // 倒した虫のカリカリに掛ける倍率の上乗せ（0.2 で +20%）
  objectAura: number;   // 猫のまわり2マスのオブジェクトの攻撃に掛ける上乗せ（0.2 で +20%）
  repair: number;       // 猫がいるマスのオブジェクトを毎秒、最大 HP のこの割合だけ直す
  reviveHp: number;     // 休けいから戻るときの HP の割合（1 で満タン。最低 0.5）
  dodge: number;        // 虫の攻撃をよける確率
}

/** オブジェクトの種類。 */
export type ObjectKind =
  | "shooter"   // 上の列（虫が来る方）へ弾を撃つ
  | "wall"      // 虫を足止めする（HP が高い）
  | "aoe"       // まわりのマスにまとめてダメージ
  | "slow"      // 当てた虫を遅くする
  | "producer"  // カリカリを生む
  | "mine"      // 踏んだ虫に大ダメージ（1回きり）
  | "zap"       // 電撃: 当たった虫から近くの虫へ次々に飛び移る（chain）
  | "poison";   // 毒: 範囲の虫に毒。倒れた虫の毒がまわりにうつる（poisonSpread）

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
  cooldown: number;     // 使わない（置いたあとの待ち時間は廃止。常に 0）
  upgradeCost: number;  // 戦闘中の強化1回のカリカリ（強化するたびに増える）
  upgradeMul: number;   // 戦闘中の強化1回で atk・maxHp に掛ける倍率
  block: boolean;       // true: 虫は上を通れず、よけて回り込む（壁・砲台など）。false: 上を通れる（罠・テープなど）
  w: number;            // 大きさ（マス）。置くときは左上のマスを指定し、w×h マスをしめる（輪ゴム鉄砲は 2×2 など）
  h: number;
  /** レベルで解放される特殊効果（0 なら効果なし）。perks は表示用の解放ずみの名前。 */
  multishot: number;    // 1回に撃つ弾の追加数（拡散。spread の角度に広がる）
  spread: number;       // 拡散の角度（ラジアン）
  pierce: number;       // 弾が突き抜ける数
  splash: number;       // 当たった所のまわりへの範囲ダメージの半径（マス）
  chain: number;        // 電撃が飛び移る数
  chainRange: number;   // 電撃が飛び移れる距離（マス）
  poison: number;       // 当てた虫に、攻撃力のこの割合を毎秒ダメージ（3秒）
  poisonSpread: number; // 毒で倒れた虫から、まわりこのマス数の虫へ毒がうつる
  knockback: number;    // 当てた虫を押し戻すマス数
  crit: number;         // 会心の確率
  critMul: number;      // 会心の倍率
  perks: string[];
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
  fly?: boolean;        // 使わない（障害物を無視する虫は無し）
  drop: number;         // 倒したときに落とすカリカリ
}

/** ステージの1つの波。 */
export interface WaveDef {
  at: number;                      // 開始からの秒数
  bugs: { bug: string; count: number; every: number; lanes?: number[] }[];   // every: 何秒おきに出すか。lanes: 出てくる上の端の列（なければ、ばらばら）
}

/** ステージに最初からある障害物（家具など）。虫も通れず、オブジェクトも置けない。 */
export interface Obstacle {
  col: number;
  row: number;
  kind: string;         // 絵の種類（"table" "plant" "shelf" "sofa" "basket" など）
  w?: number;           // 大きさ（マス。なければ 1）
  h?: number;
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
  obstacles?: Obstacle[]; // 最初からある障害物（家具）
  kibblePerSec: number; // 自然に増えるカリカリ（今は 0。カリカリは虫を倒すと、すぐに手に入る）
  rewards: StageRewards;
}

/** ステージクリアでもらえるもの（目安。実際の抽選は core 側）。 */
export interface StageRewards {
  exp: number;          // 猫の経験値
  coins: number;        // 成長に使うお金
  relicPoints: number;  // レリックの解放に使う
  churu: number;        // ちゅ〜る（スキルを取る・譲渡会で猫をお迎えする、に使う）
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
