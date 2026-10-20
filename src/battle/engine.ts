// 戦闘の計算（DOM 非依存）。描画は別のファイルが state を読んで行う。
//
// v2: 迷路タワーディフェンス。
// 座標はマス単位。x ∈ [0, COLS)、y ∈ [0, ROWS)。y=0 が上（虫が出てくる側）。マス (col, row) の中心は (col + 0.5, row + 0.5)。
// ママは一番下の真ん中のマス（GOAL_COL, GOAL_ROW）にいる。虫はそこへ集まってくる。
//
// 決めごと:
// - 地面の虫は「ママまでの距離」（マスごとの最短距離。8方向、ななめは √2、壁の角はすり抜けない）を下る方へ、
//   マスの中心からマスの中心へなめらかに進む。距離はオブジェクトが増えた・減ったときだけ計算しなおす。
//   虫ごとに少しだけ横へずれた位置を歩く（重なって1匹に見えないように）。
// - 通れないオブジェクト（def.block）は虫の道をふさぐ。通れるもの（罠・テープ）は上を通る。
// - 通れないものは「出口（虫が出てくるマス）からママへの道がなくなる」「いる虫が閉じこめられる」置き方はできない。
//   虫が立っているマスにも置けない。ママのマスにはどのオブジェクトも置けない。
// - 出口: 波の lanes があればその列の一番上のマス（必ず空けておく）。lanes が無い虫は、いま通れる一番上のマスから
//   ばらばらに出る（一番上のマスのうち、少なくとも1つは空けておく）。章 3 以上では、ときどき左右の上の方（0〜2行）から出る。
// - 飛ぶ虫はオブジェクトを無視して、ママへまっすぐ飛ぶ。
// - 虫はオブジェクトをかじらない。猫に触れている間（距離 0.5 未満）は止まって猫をかじる（dodge でよけることがある）。
// - 虫がママに着くと mamaHp が 1（ボスは 3）減る。
// - カリカリは、虫を倒した瞬間に手に入る（drop × global.kibbleMul × (1 + char.kibbleBonus)）。producer も直接増やす。
//   どちらも "kibble" イベント（x, y, value = 量）を出す（描画が数字へ飛ぶ演出に使う）。拾うカリカリは無くなった。
// - shooter: range（半径・マス）以内でいちばん近い虫へ、追いかける弾を撃つ。
//   aoe: 範囲内に虫がいれば、まとめてダメージ。slow: 範囲内の虫すべてにダメージ＋遅くする。mine: 地面の虫が乗ると爆発（1回）。
// - 猫の特殊技能（ResolvedChar）: crit/critMul・multiHit（0.1 秒おきに追加の攻撃）・lifesteal・regen・knockback・poison（3 秒）・
//   slowHit・pierce（ranged の弾だけ）・kibbleBonus・objectAura（猫から 2 マス以内のオブジェクトの攻撃が上がる）・
//   repair（猫のいるマスのオブジェクトを直す）・reviveHp（休けいから戻るときの HP。最低 0.5）・dodge。
// - 内部では 1/60 秒以下に分けて計算する。place / upgrade は step() の最初に 1 回だけ処理する。
//
// v1 からの API の変更:
// - Pickup・pickups・"pickup" イベント・PICKUP_AUTO_TIME を削除。代わりに "kibble" イベント。
// - BugState: nextCol/nextRow（向かっているマス）・offX/offY（横ずれ）・dirX/dirY（向き）・poisonDps/poisonTimer・
//   knockX/knockY/knock（押し戻しの見た目用）を追加。lane は「出てきた列」（横から出た虫は -1）。
// - Projectile: lane を削除。crit・pierce を追加。
// - FloatKind に "crit" | "poison" | "heal" を追加。イベントに "kibble" | "dodge" | "knockback" を追加（"bite" は使わなくなった）。
// - 追加: pathDist(col,row)・flowField・flowVersion・isBlocked(col,row)・wouldSeal(col,row)・placeCheck(i,col,row)・
//   routeFrom(col,row)・spawnCells()・auraActive(o)・GOAL_COL/GOAL_ROW。

import { COLS, ROWS } from "../core/types";
import type {
  BattleInput,
  BattleResult,
  BugDef,
  Loadout,
  ResolvedChar,
  ResolvedObject,
} from "../core/types";

// ---- 調整用の定数 ----
export const GOAL_COL = Math.floor(COLS / 2);
export const GOAL_ROW = ROWS - 1;
export const SPAWN_Y = -0.5;          // 上から出てくる虫の y
export const CAT_TOUCH = 0.5;         // 虫が猫に触れる距離
export const SLOW_TIME = 2;           // slow の効き目の秒数
export const POISON_TIME = 3;         // 毒の秒数
export const POISON_TICK = 0.5;       // 毒のダメージの間隔
export const UPGRADE_COST_GROWTH = 1.5;
export const MINE_RADIUS = 1.5;
export const AURA_RADIUS = 2;         // objectAura が届く距離
export const OBJ_SHOT_SPEED = 8;      // オブジェクトの弾の速さ（マス/秒）
export const HOMING_SHOT_SPEED = 10;  // 猫の弾の速さ
export const MULTI_HIT_GAP = 0.1;     // 連続攻撃の間隔（秒）
export const BUG_SPREAD = 0.15;       // 虫の横ずれの最大
export const SIDE_SPAWN_CHAPTER = 3;  // この章から、左右からも出てくる
export const SIDE_SPAWN_CHANCE = 0.25;
export const FLOAT_LIFE = 0.8;        // ダメージ数字の表示時間
const MAX_SUBSTEP = 1 / 60;
const MAX_FLOATS = 80;
const SQRT2 = Math.SQRT2;

// ---- 描画に渡す状態の型 ----

export type BugMode = "walk" | "bite";

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
  /** 地面の虫が向かっているマス。 */
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
  /** 押し戻された見た目のずれ（knock 秒かけて 0 へ）。 */
  knockX: number;
  knockY: number;
  knock: number;
}

export interface ObjState {
  uid: number;
  slot: number;        // Loadout.objects の添字
  def: ResolvedObject;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  atk: number;
  level: number;       // 戦闘中の強化回数（0 から）
  upgradeCost: number; // 次の強化のカリカリ
  timer: number;       // 攻撃・生産のたまり具合（秒）。interval で発動
  hurt: number;
}

export interface CatState {
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
}

export interface Projectile {
  uid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  splash: number;      // 0 なら単体
  targetUid: number;   // 追いかける相手（-1 ならまっすぐ進む。貫通したあと）
  maxDist: number;
  traveled: number;
  fromCat: boolean;
  crit: boolean;
  pierce: number;      // あと何匹突き抜けられるか
  hitUids: number[];   // もう当たった虫
  kind: string;        // 撃ったもの（"cat" または ObjectKind）
  alive: boolean;
}

export type FloatKind = "bug" | "crit" | "poison" | "cat" | "heal" | "object";

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
  | "shoot"        // オブジェクトが弾を撃った
  | "hit"          // 虫にダメージ（value = ダメージ）
  | "kill"         // 虫を倒した
  | "kibble"       // カリカリが手に入った（value = 量。x, y は出どころ）
  | "aoe"          // 範囲攻撃（value = 半径）
  | "slow"         // slow オブジェクトが効いた（value = 半径）
  | "mine"         // mine が爆発した（value = 半径）
  | "knockback"    // 虫を押し戻した
  | "bite"         // （v2 では出さない。互換のため残す）
  | "objectBroken" // オブジェクトがこわれた
  | "catHit"       // 猫がかじられた（value = ダメージ）
  | "dodge"        // 猫が虫の攻撃をよけた
  | "catDown"      // 猫が休けいに入った
  | "catUp"        // 猫が休けいから戻った
  | "place"        // オブジェクトを置いた（value = slot）
  | "upgrade"      // オブジェクトを強化した（value = 新しいレベル）
  | "produce"      // producer がカリカリを生んだ（value = 量）
  | "mamaHit"      // 虫がママに着いた（value = 減った HP）
  | "win"
  | "lose";

export interface BattleEvent {
  type: BattleEventType;
  x: number;
  y: number;
  value: number;
}

export interface CheckResult {
  ok: boolean;
  reason?: string;     // できない理由（画面に出せる日本語）
}

export interface UpgradeCheck extends CheckResult {
  cost?: number;       // 猫のマスにオブジェクトがあるときの、強化に要るカリカリ
  obj?: ObjState;
}

/** 描画が読むための状態（すべて読み取り専用として扱うこと）。 */
export interface BattleState {
  time: number;
  kibble: number;
  mamaHp: number;
  mamaMaxHp: number;
  kills: number;
  cat: CatState;
  bugs: BugState[];
  objects: ObjState[];
  projectiles: Projectile[];
  floats: FloatText[];
  /** 直前の step() で起きたこと（step のたびに作り直す）。 */
  events: BattleEvent[];
  /** 始まった波の数（0〜waveTotal）。 */
  waveIndex: number;
  waveTotal: number;
  /** Loadout.objects の各枠の、次に置けるまでの残り秒数。 */
  cooldowns: number[];
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
const GOAL_I = GOAL_ROW * COLS + GOAL_COL;

/** 8方向（まっすぐを先に）。 */
const DIRS: readonly [number, number][] = [
  [0, 1], [-1, 0], [1, 0], [0, -1],
  [-1, 1], [1, 1], [-1, -1], [1, -1],
];

const inside = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

/**
 * ママまでの最短距離を out に書く（通れないマス・たどり着けないマスは Infinity）。
 * blocked(i) は通れないマス。ななめは、となりの2マスがどちらも通れるときだけ。
 */
function computeDist(blocked: (i: number) => boolean, out: Float64Array): void {
  out.fill(Infinity);
  if (blocked(GOAL_I)) return;
  const done = new Uint8Array(N);
  out[GOAL_I] = 0;
  for (;;) {
    let u = -1, best = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && out[i] < best) { best = out[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    const uc = u % COLS, ur = (u - uc) / COLS;
    for (const [dx, dy] of DIRS) {
      const c = uc + dx, r = ur + dy;
      if (!inside(c, r)) continue;
      const i = r * COLS + c;
      if (done[i] || blocked(i)) continue;
      if (dx !== 0 && dy !== 0 && (blocked(ur * COLS + c) || blocked(r * COLS + uc))) continue;
      const nd = best + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
      if (nd < out[i]) out[i] = nd;
    }
  }
}

export class Battle {
  readonly loadout: Loadout;
  private readonly s: BattleState;
  private readonly rng: () => number;
  private readonly grid: (ObjState | null)[];
  private readonly terrain = new Uint8Array(N);   // 1 = ステージの障害物（家具）
  private readonly queues: SpawnQueue[];
  private readonly waveAlive: number[];   // 波ごとの、まだ出ていない虫＋生きている虫の数
  private readonly dist = new Float64Array(N);
  private readonly scratch = new Float64Array(N);
  private readonly lanesNeeded: number[];  // 必ず空けておく、一番上のマスの列
  private readonly anyTopNeeded: boolean;  // lanes 無しの虫がいる（一番上のどこか1つは空ける）
  private readonly sideSpawns: boolean;
  private flowVer = 0;
  private pendingHits: number[] = [];      // 連続攻撃の残り待ち時間
  private nextUid = 1;

  constructor(loadout: Loadout, seed = 1) {
    this.loadout = loadout;
    this.rng = mulberry32(seed);
    this.grid = new Array(N).fill(null);
    for (const o of loadout.stage.obstacles ?? []) if (inside(o.col, o.row)) this.terrain[o.row * COLS + o.col] = 1;
    const st = loadout.stage;
    const c = loadout.char;
    this.s = {
      time: 0,
      kibble: st.startKibble + loadout.global.startKibbleAdd,
      mamaHp: loadout.global.mamaHp,
      mamaMaxHp: loadout.global.mamaHp,
      kills: 0,
      cat: {
        x: GOAL_COL + 0.5,
        y: ROWS - 2.5,
        hp: c.maxHp,
        maxHp: c.maxHp,
        resting: false,
        restTimer: 0,
        atkTimer: 0,
        facingX: 0,
        facingY: -1,
        attackAnim: 0,
        hurt: 0,
      },
      bugs: [],
      objects: [],
      projectiles: [],
      floats: [],
      events: [],
      waveIndex: 0,
      waveTotal: st.waves.length,
      cooldowns: loadout.objects.map(() => 0),
      result: null,
    };
    this.queues = [];
    this.waveAlive = st.waves.map(() => 0);
    const lanes = new Set<number>();
    let anyTop = false;
    st.waves.forEach((w, wi) => {
      for (const e of w.bugs) {
        const def = loadout.bugs[e.bug];
        if (!def) throw new Error(`虫の定義がありません: ${e.bug}`);
        const ls = e.lanes && e.lanes.length > 0 ? e.lanes.map((l) => clamp(Math.floor(l), 0, COLS - 1)) : undefined;
        if (ls) { if (!def.fly) ls.forEach((l) => lanes.add(l)); }
        else if (!def.fly) anyTop = true;
        this.queues.push({ wave: wi, def, count: e.count, every: e.every, lanes: ls, start: w.at, spawned: 0 });
        this.waveAlive[wi] += e.count;
      }
    });
    this.lanesNeeded = [...lanes].sort((a, b) => a - b);
    this.anyTopNeeded = anyTop;
    this.sideSpawns = st.chapter >= SIDE_SPAWN_CHAPTER;
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
  get bugs(): readonly BugState[] { return this.s.bugs; }
  get objects(): readonly ObjState[] { return this.s.objects; }
  get projectiles(): readonly Projectile[] { return this.s.projectiles; }
  get floats(): readonly FloatText[] { return this.s.floats; }
  get events(): readonly BattleEvent[] { return this.s.events; }
  get waveIndex(): number { return this.s.waveIndex; }
  get waveTotal(): number { return this.s.waveTotal; }
  get cooldowns(): readonly number[] { return this.s.cooldowns; }
  /** マスごとのママまでの距離（添字 row * COLS + col。通れない・たどり着けないマスは Infinity）。 */
  get flowField(): Readonly<Float64Array> { return this.dist; }
  /** 道が変わるたびに 1 増える（描画のキャッシュ用）。 */
  get flowVersion(): number { return this.flowVer; }

  /** マスのママまでの距離（外・通れないマスは Infinity）。 */
  pathDist(col: number, row: number): number {
    if (!inside(col, row)) return Infinity;
    return this.dist[row * COLS + col];
  }

  /** マスに通れないオブジェクトがあるか。 */
  isBlocked(col: number, row: number): boolean {
    if (this.obstacleAt(col, row)) return true;
    const o = this.objectAt(col, row);
    return !!o && o.hp > 0 && o.def.block;
  }

  /** マスにステージの障害物（家具）があるか。 */
  obstacleAt(col: number, row: number): boolean {
    return inside(col, row) && this.terrain[row * COLS + col] === 1;
  }

  /** ステージの障害物（絵の種類つき）。 */
  get obstacles(): readonly { col: number; row: number; kind: string }[] {
    return this.loadout.stage.obstacles ?? [];
  }

  /** 枠 i の待ち時間の残りの割合（1 = 置いた直後、0 = 置ける）。 */
  cooldownRatio(i: number): number {
    const d = this.loadout.objects[i];
    if (!d || d.cooldown <= 0) return 0;
    return clamp(this.s.cooldowns[i] / d.cooldown, 0, 1);
  }

  /** マス (col, row) のオブジェクト（無ければ null）。 */
  objectAt(col: number, row: number): ObjState | null {
    if (!inside(col, row)) return null;
    return this.grid[row * COLS + col];
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
      if (this.sideSpawns) for (let r = 0; r < 3; r++) { add(0, r); add(COLS - 1, r); }
    }
    return out;
  }

  /** マスからママまでの道（いまの距離で。最初のマスとママのマスを含む）。たどり着けなければ空。 */
  routeFrom(col: number, row: number): Cell[] {
    if (!Number.isFinite(this.pathDist(col, row))) return [];
    const out: Cell[] = [{ col, row }];
    let c = col, r = row, sx = 0, sy = 0;
    for (let k = 0; k < N && !(c === GOAL_COL && r === GOAL_ROW); k++) {
      const n = this.nextStep(c, r, sx, sy);
      if (!n) break;
      sx = n.col - c; sy = n.row - r;
      c = n.col; r = n.row;
      out.push({ col: c, row: r });
    }
    return out;
  }

  /** objectAura が効いているか（猫が近くにいる）。 */
  auraActive(o: ObjState): boolean {
    const ch = this.loadout.char;
    const c = this.s.cat;
    if (!(ch.objectAura > 0) || c.resting) return false;
    return Math.hypot(c.x - (o.col + 0.5), c.y - (o.row + 0.5)) <= AURA_RADIUS;
  }

  /**
   * マスに通れないものを置くと、虫の道がなくなる（出口からママへ行けない・いる虫が閉じこめられる）か。
   * すでに通れないものがあるマスは false。
   */
  wouldSeal(col: number, row: number): boolean {
    if (!inside(col, row)) return false;
    const idx = row * COLS + col;
    if (idx === GOAL_I) return true;
    if (this.isBlocked(col, row)) return false;
    const d = this.scratch;
    computeDist((i) => i === idx || this.blockedIdx(i), d);
    for (const l of this.lanesNeeded) if (!Number.isFinite(d[l])) return true;
    if (this.anyTopNeeded) {
      let any = false;
      for (let c = 0; c < COLS; c++) if (Number.isFinite(d[c])) { any = true; break; }
      if (!any) return true;
    }
    for (const b of this.s.bugs) {
      if (!b.alive || b.def.fly) continue;
      const bc = this.bugCell(b);
      const bi = bc.row * COLS + bc.col;
      if (bi !== idx && !Number.isFinite(d[bi])) return true;
    }
    return false;
  }

  /** 地面の虫がそのマスに立っているか。 */
  private groundBugIn(col: number, row: number): boolean {
    for (const b of this.s.bugs) {
      if (!b.alive || b.def.fly) continue;
      const c = this.bugCell(b);
      if (c.col === col && c.row === row) return true;
    }
    return false;
  }

  /** 枠 i のオブジェクトを (col, row) に置けるか。 */
  placeCheck(i: number, col: number, row: number): CheckResult {
    if (this.s.result) return { ok: false, reason: "戦闘は終わりました" };
    const d = this.loadout.objects[i];
    if (!d) return { ok: false, reason: "そのオブジェクトはありません" };
    if (this.s.cat.resting) return { ok: false, reason: "猫が休けい中です" };
    if (this.s.cooldowns[i] > 0) return { ok: false, reason: "待ち時間中です" };
    if (!inside(col, row)) return { ok: false, reason: "ここには置けません" };
    if (col === GOAL_COL && row === GOAL_ROW) return { ok: false, reason: "ママのところには置けないよ" };
    if (this.obstacleAt(col, row)) return { ok: false, reason: "家具があるので置けないよ" };
    if (this.objectAt(col, row)) return { ok: false, reason: "もう置いてあります" };
    if (d.block) {
      if (this.groundBugIn(col, row)) return { ok: false, reason: "虫がいるので置けないよ" };
      if (this.wouldSeal(col, row)) return { ok: false, reason: "通り道がなくなるよ" };
    }
    if (this.s.kibble < d.cost) return { ok: false, reason: "カリカリが足りません" };
    return { ok: true };
  }

  canPlace(i: number): CheckResult {
    const { col, row } = this.catCell();
    return this.placeCheck(i, col, row);
  }

  canUpgrade(): UpgradeCheck {
    if (this.s.result) return { ok: false, reason: "戦闘は終わりました" };
    const { col, row } = this.catCell();
    const obj = this.objectAt(col, row);
    if (!obj) return { ok: false, reason: "ここにはオブジェクトがありません" };
    if (this.s.cat.resting) return { ok: false, reason: "猫が休けい中です", cost: obj.upgradeCost, obj };
    if (this.s.kibble < obj.upgradeCost) return { ok: false, reason: "カリカリが足りません", cost: obj.upgradeCost, obj };
    return { ok: true, cost: obj.upgradeCost, obj };
  }

  // ---- 進める ----
  step(dt: number, input: BattleInput): void {
    const s = this.s;
    s.events.length = 0;
    if (!(dt > 0)) return;
    if (s.result) {
      this.ageFloats(dt);
      return;
    }
    if (input.place !== null && input.place !== undefined) this.tryPlace(input.place);
    if (input.upgrade) this.tryUpgrade();

    const n = Math.max(1, Math.ceil(dt / MAX_SUBSTEP - 1e-9));
    const h = dt / n;
    for (let k = 0; k < n && !s.result; k++) this.substep(h, input);
  }

  private tryPlace(i: number): void {
    if (!this.canPlace(i).ok) return;
    const d = this.loadout.objects[i];
    const { col, row } = this.catCell();
    const s = this.s;
    s.kibble -= d.cost;
    s.cooldowns[i] = d.cooldown;
    const o: ObjState = {
      uid: this.nextUid++,
      slot: i,
      def: d,
      col,
      row,
      hp: d.maxHp,
      maxHp: d.maxHp,
      atk: d.atk,
      level: 0,
      upgradeCost: d.upgradeCost,
      timer: 0,
      hurt: 0,
    };
    s.objects.push(o);
    this.grid[row * COLS + col] = o;
    if (d.block) this.recomputeFlow();
    this.emit("place", col + 0.5, row + 0.5, i);
  }

  private tryUpgrade(): void {
    const chk = this.canUpgrade();
    if (!chk.ok || !chk.obj) return;
    const o = chk.obj;
    const mul = o.def.upgradeMul;
    this.s.kibble -= o.upgradeCost;
    o.atk *= mul;
    o.maxHp *= mul;
    o.hp = o.maxHp;
    o.level++;
    o.upgradeCost *= UPGRADE_COST_GROWTH;
    this.emit("upgrade", o.col + 0.5, o.row + 0.5, o.level);
  }

  private substep(h: number, input: BattleInput): void {
    const s = this.s;
    s.time += h;
    const g = this.loadout.global;
    s.kibble += this.loadout.stage.kibblePerSec * g.kibbleMul * h;
    for (let i = 0; i < s.cooldowns.length; i++) {
      if (s.cooldowns[i] > 0) s.cooldowns[i] = Math.max(0, s.cooldowns[i] - h);
    }

    this.updateSpawns();
    this.updateCat(h, input);
    this.updateObjects(h);
    this.updateProjectiles(h);
    this.updateBugs(h);
    this.ageFloats(h);
    this.compact();
    this.checkEnd();
  }

  // ---- 道 ----
  private blockedIdx(i: number): boolean {
    if (this.terrain[i] === 1) return true;
    const o = this.grid[i];
    return !!o && o.hp > 0 && o.def.block;
  }

  private recomputeFlow(): void {
    computeDist((i) => this.blockedIdx(i), this.dist);
    this.flowVer++;
    // 向かっていたマスがふさがった虫は、いまいるマスの中心へ戻ってから選びなおす
    for (const b of this.s.bugs) {
      if (!b.alive || b.def.fly) continue;
      if (this.blockedIdx(b.nextRow * COLS + b.nextCol)) {
        const c = this.bugCell(b);
        b.nextCol = c.col; b.nextRow = c.row;
        b.stepX = 0; b.stepY = 0;
      }
    }
  }

  /** (col, row) から次に進むマス。同じ長さならまっすぐ（sx, sy）を選ぶ。行けなければ null。 */
  private nextStep(col: number, row: number, sx: number, sy: number): Cell | null {
    const d = this.dist;
    let best: Cell | null = null, bv = Infinity, straight = false;
    for (const [dx, dy] of DIRS) {
      const c = col + dx, r = row + dy;
      if (!inside(c, r)) continue;
      const i = r * COLS + c;
      if (!Number.isFinite(d[i])) continue;
      if (dx !== 0 && dy !== 0 && (this.blockedIdx(row * COLS + c) || this.blockedIdx(r * COLS + col))) continue;
      const v = d[i] + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
      const isStraight = dx === sx && dy === sy;
      if (v < bv - 1e-6 || (Math.abs(v - bv) <= 1e-6 && isStraight && !straight)) {
        bv = v; best = { col: c, row: r }; straight = isStraight;
      }
    }
    return best;
  }

  /** 押し戻すときに下がるマス（来た向きの逆を優先。ママから遠くなるマスだけ）。 */
  private upstream(col: number, row: number, sx: number, sy: number): Cell | null {
    const d = this.dist;
    const here = d[row * COLS + col];
    let best: Cell | null = null, bv = -Infinity;
    for (const [dx, dy] of DIRS) {
      const c = col + dx, r = row + dy;
      if (!inside(c, r)) continue;
      const v = d[r * COLS + c];
      if (!Number.isFinite(v) || !(v > here + 1e-6)) continue;
      if (dx !== 0 && dy !== 0 && (this.blockedIdx(row * COLS + c) || this.blockedIdx(r * COLS + col))) continue;
      const score = (dx === -sx && dy === -sy ? 100 : 0) + v - (dx !== 0 && dy !== 0 ? 0.3 : 0);
      if (score > bv) { bv = score; best = { col: c, row: r }; }
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
        this.spawnBug(q.def, lane, q.wave);
      }
    }
  }

  private pickSpawn(lane: number, fly: boolean): { col: number; row: number; side: -1 | 0 | 1 } {
    if (lane >= 0 && (fly || Number.isFinite(this.dist[lane]))) return { col: lane, row: 0, side: 0 };
    if (!fly && this.sideSpawns && this.rng() < SIDE_SPAWN_CHANCE) {
      const side: Cell[] = [];
      for (let r = 0; r < 3; r++) {
        if (Number.isFinite(this.dist[r * COLS])) side.push({ col: 0, row: r });
        if (Number.isFinite(this.dist[r * COLS + COLS - 1])) side.push({ col: COLS - 1, row: r });
      }
      if (side.length > 0) {
        const c = side[Math.min(side.length - 1, Math.floor(this.rng() * side.length))];
        return { col: c.col, row: c.row, side: c.col === 0 ? -1 : 1 };
      }
    }
    const top: number[] = [];
    for (let c = 0; c < COLS; c++) if (fly || Number.isFinite(this.dist[c])) top.push(c);
    if (top.length === 0) return { col: GOAL_COL, row: 0, side: 0 };
    return { col: top[Math.min(top.length - 1, Math.floor(this.rng() * top.length))], row: 0, side: 0 };
  }

  private spawnBug(def: BugDef, lane: number, wave: number): void {
    const st = this.loadout.stage;
    const hp = def.hp * st.hpMul;
    const sp = this.pickSpawn(lane, !!def.fly);
    const offX = (this.rng() * 2 - 1) * BUG_SPREAD;
    const offY = (this.rng() * 2 - 1) * BUG_SPREAD;
    const x = sp.side === 0 ? sp.col + 0.5 + offX : sp.side < 0 ? -0.5 : COLS + 0.5;
    const y = sp.side === 0 ? SPAWN_Y : sp.row + 0.5 + offY;
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
      knockX: 0,
      knockY: 0,
      knock: 0,
    };
    this.s.bugs.push(b);
    this.emit("spawn", b.x, b.y, 0);
  }

  // ---- 猫 ----
  private updateCat(h: number, input: BattleInput): void {
    const c = this.s.cat;
    const ch = this.loadout.char;
    if (c.hurt > 0) c.hurt -= h;
    if (c.attackAnim > 0) c.attackAnim -= h;
    if (c.resting) {
      this.pendingHits.length = 0;
      c.restTimer -= h;
      if (c.restTimer <= 0) {
        c.resting = false;
        c.restTimer = 0;
        c.hp = c.maxHp * clamp(ch.reviveHp || 0, 0.5, 1);
        c.atkTimer = 0;
        this.emit("catUp", c.x, c.y, 0);
      }
      return;
    }
    // 自動回復
    if (ch.regen > 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * ch.regen * h);
    // 移動
    let mx = input.move.x || 0;
    let my = input.move.y || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.01) { c.facingX = mx; c.facingY = my; }
    c.x = clamp(c.x + mx * ch.moveSpeed * h, CAT_MARGIN, COLS - CAT_MARGIN);
    c.y = clamp(c.y + my * ch.moveSpeed * h, CAT_MARGIN, ROWS - CAT_MARGIN);

    // 修理
    if (ch.repair > 0) {
      const cc = this.catCell();
      const o = this.objectAt(cc.col, cc.row);
      if (o && o.hp > 0 && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * ch.repair * h);
    }

    // 連続攻撃の残り
    if (this.pendingHits.length > 0) {
      let w = 0;
      for (let i = 0; i < this.pendingHits.length; i++) {
        const t = this.pendingHits[i] - h;
        if (t > 0) { this.pendingHits[w++] = t; continue; }
        const tg = this.nearestBug(c.x, c.y, ch.range);
        if (tg) { c.attackAnim = 0.15; this.catStrike(ch, tg); }
      }
      this.pendingHits.length = w;
    }

    // 攻撃
    if (c.atkTimer > 0) c.atkTimer -= h;
    if (c.atkTimer <= 0) {
      const t = this.nearestBug(c.x, c.y, ch.range);
      if (t) {
        c.atkTimer = ch.atkInterval;
        c.attackAnim = 0.15;
        const dx = t.x - c.x, dy = t.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        c.facingX = dx / d; c.facingY = dy / d;
        this.emit("catAttack", c.x, c.y, 0);
        this.catStrike(ch, t);
        // 連続攻撃（端数は確率で）
        const mh = Math.max(0, ch.multiHit || 0);
        const extra = Math.floor(mh) + (this.rng() < mh % 1 ? 1 : 0);
        for (let k = 1; k <= extra; k++) this.pendingHits.push(MULTI_HIT_GAP * k);
      } else {
        c.atkTimer = 0;
      }
    }
  }

  private catStrike(ch: ResolvedChar, t: BugState): void {
    const c = this.s.cat;
    const crit = ch.crit > 0 && this.rng() < ch.crit;
    const dmg = ch.atk * (crit ? Math.max(1, ch.critMul || 1) : 1);
    if (ch.role === "ranged") {
      this.addProjectile(c.x, c.y, t.uid, dmg, ch.aoe, ch.range + 3, true, "cat", crit, Math.max(0, Math.floor(ch.pierce || 0)));
    } else if (ch.role === "aoe") {
      const r = ch.aoe > 0 ? ch.aoe : 1;
      this.catHitArea(t.x, t.y, r, dmg, crit);
      this.emit("aoe", t.x, t.y, r);
    } else if (ch.aoe > 0) {
      this.catHitArea(t.x, t.y, ch.aoe, dmg, crit);
    } else {
      this.catHit(t, dmg, crit);
    }
  }

  private catHitArea(x: number, y: number, r: number, dmg: number, crit: boolean): void {
    for (const b of this.bugsInRadius(x, y, r)) this.catHit(b, dmg, crit);
  }

  /** 猫の攻撃が虫に当たった（会心・吸血・毒・減速・押し戻し）。 */
  private catHit(b: BugState, dmg: number, crit: boolean): void {
    if (!b.alive) return;
    const ch = this.loadout.char;
    const dealt = this.damageBug(b, dmg, crit ? "crit" : "bug");
    const c = this.s.cat;
    if (ch.lifesteal > 0 && dealt > 0 && !c.resting && c.hp < c.maxHp) {
      const heal = Math.min(c.maxHp - c.hp, dealt * ch.lifesteal);
      c.hp += heal;
      if (heal >= c.maxHp * 0.02) this.addFloat(heal, c.x, c.y - 0.5, "heal");
    }
    if (!b.alive) return;
    if (ch.poison > 0) {
      b.poisonDps = Math.max(b.poisonTimer > 0 ? b.poisonDps : 0, ch.atk * ch.poison);
      b.poisonTimer = POISON_TIME;
    }
    if (ch.slowHit > 0 && ch.slowHit < 1) {
      b.slowMul = Math.min(b.slowMul, ch.slowHit);
      b.slowTimer = SLOW_TIME;
    }
    if (ch.knockback > 0) this.knockBack(b, ch.knockback * (b.def.boss ? 0.5 : 1));
  }

  private damageCat(dmg: number): void {
    const c = this.s.cat;
    if (c.resting) return;
    const ch = this.loadout.char;
    if (ch.dodge > 0 && this.rng() < ch.dodge) {
      this.emit("dodge", c.x, c.y, 0);
      return;
    }
    const v = dmg * ch.armor;
    c.hp -= v;
    c.hurt = 0.15;
    this.addFloat(v, c.x, c.y - 0.3, "cat");
    this.emit("catHit", c.x, c.y, v);
    if (c.hp <= 0) {
      c.hp = 0;
      c.resting = true;
      c.restTimer = ch.restTime;
      this.emit("catDown", c.x, c.y, 0);
    }
  }

  // ---- オブジェクト ----
  private objAtk(o: ObjState): number {
    return this.auraActive(o) ? o.atk * (1 + this.loadout.char.objectAura) : o.atk;
  }

  private updateObjects(h: number): void {
    for (const o of this.s.objects) {
      if (o.hp <= 0) continue;
      if (o.hurt > 0) o.hurt -= h;
      const d = o.def;
      const cx = o.col + 0.5, cy = o.row + 0.5;
      switch (d.kind) {
        case "wall":
          break;
        case "mine": {
          for (const b of this.s.bugs) {
            if (!b.alive || b.def.fly || b.y < 0) continue;
            const c = this.bugCell(b);
            if (c.col === o.col && c.row === o.row) {
              this.damageArea(cx, cy, MINE_RADIUS, this.objAtk(o));
              this.emit("mine", cx, cy, MINE_RADIUS);
              this.removeObject(o, false);
              break;
            }
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
            }
          }
          break;
        }
        case "aoe": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, d.range)) {
            o.timer = 0;
            this.damageArea(cx, cy, d.range, this.objAtk(o));
            this.emit("aoe", cx, cy, d.range);
          }
          break;
        }
        case "slow": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, d.range)) {
            o.timer = 0;
            const atk = this.objAtk(o);
            for (const b of this.bugsInRadius(cx, cy, d.range)) {
              if (d.slow < 1) { b.slowMul = Math.min(b.slowMul, d.slow); b.slowTimer = SLOW_TIME; }
              if (atk > 0) this.damageBug(b, atk, "bug");
            }
            this.emit("slow", cx, cy, d.range);
          }
          break;
        }
        case "shooter": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval) {
            const t = this.nearestBug(cx, cy, d.range);
            if (t) {
              o.timer = 0;
              this.addProjectile(cx, cy, t.uid, this.objAtk(o), 0, d.range + 2, false, d.kind, false, 0);
              this.emit("shoot", cx, cy, 0);
            }
          }
          break;
        }
      }
    }
  }

  private removeObject(o: ObjState, broken: boolean): void {
    o.hp = 0;
    const i = o.row * COLS + o.col;
    if (this.grid[i] === o) this.grid[i] = null;
    if (o.def.block) this.recomputeFlow();
    if (broken) this.emit("objectBroken", o.col + 0.5, o.row + 0.5, 0);
  }

  // ---- 弾 ----
  private addProjectile(x: number, y: number, targetUid: number, dmg: number, splash: number, maxDist: number,
    fromCat: boolean, kind: string, crit: boolean, pierce: number): void {
    this.s.projectiles.push({
      uid: this.nextUid++, x, y, vx: 0, vy: 0, dmg, splash, targetUid,
      maxDist, traveled: 0, fromCat, crit, pierce, hitUids: [], kind, alive: true,
    });
  }

  private updateProjectiles(h: number): void {
    for (const p of this.s.projectiles) {
      if (!p.alive) continue;
      if (p.targetUid >= 0) {
        // 追いかける弾
        const t = this.findBug(p.targetUid);
        if (!t) {
          // 相手がいなくなった: 貫通する弾はまっすぐ進みつづける。それ以外は消える
          if (p.pierce > 0 && (p.vx !== 0 || p.vy !== 0)) { p.targetUid = -1; continue; }
          p.alive = false;
          continue;
        }
        const dx = t.x - p.x, dy = t.y - p.y;
        const d = Math.hypot(dx, dy);
        const speed = p.fromCat ? HOMING_SHOT_SPEED : OBJ_SHOT_SPEED;
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
      } else {
        // 貫通したあと、まっすぐ進む弾
        p.x += p.vx * h; p.y += p.vy * h;
        p.traveled += Math.hypot(p.vx, p.vy) * h;
        for (const b of this.s.bugs) {
          if (!b.alive || p.hitUids.includes(b.uid)) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < 0.4) { this.projectileHit(p, b); if (!p.alive) break; }
        }
        if (p.traveled > p.maxDist || p.x < -1 || p.x > COLS + 1 || p.y < -1.5 || p.y > ROWS + 1) p.alive = false;
      }
    }
  }

  private projectileHit(p: Projectile, t: BugState): void {
    p.hitUids.push(t.uid);
    if (p.fromCat) {
      if (p.splash > 0) {
        this.catHitArea(t.x, t.y, p.splash, p.dmg, p.crit);
        this.emit("aoe", t.x, t.y, p.splash);
      } else {
        this.catHit(t, p.dmg, p.crit);
      }
    } else if (p.splash > 0) {
      this.damageArea(t.x, t.y, p.splash, p.dmg);
      this.emit("aoe", t.x, t.y, p.splash);
    } else {
      this.damageBug(t, p.dmg, "bug");
    }
    if (p.pierce > 0) {
      p.pierce--;
      p.targetUid = -1;
      if (p.vx === 0 && p.vy === 0) p.vy = -HOMING_SHOT_SPEED;
    } else {
      p.alive = false;
    }
  }

  // ---- 虫 ----
  private updateBugs(h: number): void {
    const s = this.s;
    const c = s.cat;
    for (const b of s.bugs) {
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
        while (b.poisonTick >= POISON_TICK - 1e-9 && b.alive) {
          b.poisonTick -= POISON_TICK;
          this.damageBug(b, b.poisonDps * POISON_TICK, "poison");
        }
        if (b.poisonTimer <= 0) { b.poisonTimer = 0; b.poisonDps = 0; b.poisonTick = 0; }
        if (!b.alive) continue;
      }
      const touchCat = !c.resting && Math.hypot(c.x - b.x, c.y - b.y) < CAT_TOUCH;
      if (touchCat) {
        if (b.mode !== "bite") { b.mode = "bite"; b.atkTimer = 0; }
        b.atkTimer += h;
        if (b.atkTimer >= b.def.atkInterval) {
          b.atkTimer -= b.def.atkInterval;
          this.damageCat(b.atk);
        }
        continue;
      }
      b.mode = "walk";
      const step = b.speed * b.slowMul * h;
      if (b.def.fly) this.moveFly(b, step);
      else this.moveGround(b, step);
    }
  }

  private moveFly(b: BugState, step: number): void {
    const tx = GOAL_COL + 0.5, ty = GOAL_ROW + 0.5;
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    if (d <= step + 0.05) { this.reachMama(b); return; }
    b.dirX = dx / d; b.dirY = dy / d;
    b.x += b.dirX * step; b.y += b.dirY * step;
  }

  private moveGround(b: BugState, step: number): void {
    let rem = step;
    for (let k = 0; k < 6 && rem > 1e-9; k++) {
      const goal = b.nextCol === GOAL_COL && b.nextRow === GOAL_ROW;
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
      const n = this.nextStep(b.nextCol, b.nextRow, b.stepX, b.stepY);
      if (!n) {
        // ありえないはず（閉じこめる置き方はできない）。念のためママへまっすぐ向かう
        b.nextCol = GOAL_COL; b.nextRow = GOAL_ROW;
        continue;
      }
      b.stepX = n.col - b.nextCol; b.stepY = n.row - b.nextRow;
      b.nextCol = n.col; b.nextRow = n.row;
    }
  }

  private reachMama(b: BugState): void {
    const s = this.s;
    const dmg = b.def.boss ? 3 : 1;
    s.mamaHp = Math.max(0, s.mamaHp - dmg);
    b.alive = false;
    this.waveAlive[b.wave]--;
    this.emit("mamaHit", GOAL_COL + 0.5, GOAL_ROW + 0.5, dmg);
  }

  /** 虫を amount マスぶん押し戻す（地面の虫は道を逆に、飛ぶ虫はママから遠ざかる向きに）。 */
  private knockBack(b: BugState, amount: number): void {
    if (!(amount > 0) || b.y < 0) return;
    const x0 = b.x, y0 = b.y;
    if (b.def.fly) {
      let dx = b.x - (GOAL_COL + 0.5), dy = b.y - (GOAL_ROW + 0.5);
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      b.x = clamp(b.x + dx * amount, 0.2, COLS - 0.2);
      b.y = clamp(b.y + dy * amount, 0, ROWS - 0.2);
    } else {
      let amt = amount;
      let sx = b.stepX, sy = b.stepY;
      for (let k = 0; k < 24 && amt > 1e-6; k++) {
        const cur = this.bugCell(b);
        const up = this.upstream(cur.col, cur.row, sx, sy);
        if (!up) break;
        sx = cur.col - up.col; sy = cur.row - up.row;
        const tx = up.col + 0.5 + b.offX, ty = up.row + 0.5 + b.offY;
        const dx = tx - b.x, dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        if (d <= amt) { b.x = tx; b.y = ty; amt -= d; }
        else { b.x += (dx / d) * amt; b.y += (dy / d) * amt; amt = 0; }
      }
      const c = this.bugCell(b);
      b.nextCol = c.col; b.nextRow = c.row;
      b.stepX = sx; b.stepY = sy;
    }
    if (b.x !== x0 || b.y !== y0) {
      b.knockX = x0 - b.x; b.knockY = y0 - b.y; b.knock = 0.15;
      this.emit("knockback", b.x, b.y, Math.hypot(b.knockX, b.knockY));
    }
  }

  /** 虫にダメージ。実際に減った HP を返す。倒したらカリカリがすぐ手に入る。 */
  private damageBug(b: BugState, dmg: number, kind: FloatKind): number {
    if (!b.alive || !(dmg > 0)) return 0;
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
      const drop = b.def.drop * this.loadout.global.kibbleMul * (1 + (this.loadout.char.kibbleBonus || 0));
      const kx = clamp(b.x, 0.2, COLS - 0.2), ky = clamp(b.y, 0.2, ROWS - 0.2);
      if (drop > 0) {
        this.s.kibble += drop;
        this.emit("kibble", kx, ky, drop);
      }
      this.emit("kill", kx, ky, 0);
    }
    return dealt;
  }

  private bugsInRadius(x: number, y: number, r: number): BugState[] {
    const r2 = r * r;
    const out: BugState[] = [];
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy <= r2) out.push(b);
    }
    return out;
  }

  private damageArea(x: number, y: number, r: number, dmg: number): void {
    for (const b of this.bugsInRadius(x, y, r)) this.damageBug(b, dmg, "bug");
  }

  private nearestBug(x: number, y: number, range: number): BugState | null {
    let best: BugState | null = null;
    let bd = range * range;
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      const dx = b.x - x, dy = b.y - y;
      const d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = b; }
    }
    return best;
  }

  private findBug(uid: number): BugState | null {
    for (const b of this.s.bugs) if (b.uid === uid) return b.alive ? b : null;
    return null;
  }

  // ---- 表示用 ----
  private addFloat(value: number, x: number, y: number, kind: FloatKind): void {
    const f = this.s.floats;
    if (f.length >= MAX_FLOATS) f.shift();
    f.push({ value, x, y, age: 0, kind });
  }

  private ageFloats(h: number): void {
    const f = this.s.floats;
    let w = 0;
    for (let i = 0; i < f.length; i++) {
      const it = f[i];
      it.age += h;
      if (it.age < FLOAT_LIFE) f[w++] = it;
    }
    f.length = w;
  }

  private emit(type: BattleEventType, x: number, y: number, value: number): void {
    this.s.events.push({ type, x, y, value });
  }

  /** 死んだ虫・消えた弾・こわれたオブジェクトを配列から取り除く（その場で詰める）。 */
  private compact(): void {
    const s = this.s;
    compactBy(s.bugs, (b) => b.alive);
    compactBy(s.projectiles, (p) => p.alive);
    compactBy(s.objects, (o) => o.hp > 0);
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
      this.emit("lose", GOAL_COL + 0.5, ROWS, 0);
      return;
    }
    if (s.waveIndex < s.waveTotal) return;
    for (const q of this.queues) if (q.spawned < q.count) return;
    if (s.bugs.length > 0) return;
    s.result = { win: true, stageId: this.loadout.stage.id, kills: s.kills, time: s.time, wavesCleared: s.waveTotal };
    this.emit("win", COLS / 2, ROWS / 2, 0);
  }
}

function compactBy<T>(arr: T[], keep: (v: T) => boolean): void {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (keep(v)) arr[w++] = v;
  }
  arr.length = w;
}

/** 何もしない入力（テストや待ち時間用）。 */
export function idleInput(): BattleInput {
  return { move: { x: 0, y: 0 }, place: null, upgrade: false };
}
