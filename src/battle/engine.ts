// 戦闘の計算（DOM 非依存）。描画は別のファイルが state を読んで行う。
//
// 座標はマス単位。x ∈ [0, COLS)、y ∈ [0, ROWS)。y=0 が上（虫が出てくる側）、y が ROWS 以上でママに着いた扱い。
// 虫は自分の列（レーン）の中央 x = lane + 0.5 を、y が増える向きにまっすぐ下りてくる。
// オブジェクトはマス (col, row) に置かれ、中心は (col + 0.5, row + 0.5)。
//
// 決めごと（仕様で選べたところ）:
// - producer は、生んだカリカリを自分のマスに「拾えるカリカリ」として落とす（猫が拾う。拾わなくても 8 秒で自動回収）。
// - global.kibbleMul は、時間で増える分・虫が落とす分・producer が生む分のすべてに掛かる。
// - 虫は猫に触れている間（距離 0.5 未満）は止まって猫をかじる（休けい中の猫は無視）。オブジェクトのほうが優先。
// - mine は虫を止めない。飛ばない虫が mine のマスに入ると爆発し、中心から 1.5 マス以内の虫すべてにダメージ。
// - 猫の ranged は、狙った虫を追いかける弾を撃つ（aoe > 0 なら当たった所のまわりにもダメージ）。
// - 内部では 1/60 秒以下に分けて計算する。place / upgrade は step() の最初に 1 回だけ処理する。

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
export const SPAWN_Y = -0.5;          // 虫が出てくる y
export const BUG_FRONT = 0.4;         // 虫の中心から前（下）の端までの長さ
export const CAT_TOUCH = 0.5;         // 虫が猫に触れる距離
export const SLOW_TIME = 2;           // slow の効き目の秒数
export const PICKUP_AUTO_TIME = 8;    // 拾わなくても自動で回収されるまでの秒数
export const UPGRADE_COST_GROWTH = 1.5;
export const MINE_RADIUS = 1.5;
export const LANE_SHOT_SPEED = 8;     // オブジェクトの弾の速さ（マス/秒）
export const HOMING_SHOT_SPEED = 10;  // 猫の弾の速さ
export const FLOAT_LIFE = 0.8;        // ダメージ数字の表示時間
const MAX_SUBSTEP = 1 / 60;
const MAX_FLOATS = 80;

// ---- 描画に渡す状態の型 ----

export type BugMode = "walk" | "bite";

export interface BugState {
  uid: number;
  def: BugDef;
  wave: number;        // どの波の虫か（添字）
  lane: number;
  x: number;           // lane + 0.5
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
  slow: number;        // 1 なら slow 無し
  splash: number;      // 0 なら単体
  lane: number;        // レーンの弾なら列番号、追いかける弾なら -1
  targetUid: number;   // 追いかける弾の相手（レーンの弾は -1）
  maxDist: number;
  traveled: number;
  fromCat: boolean;
  kind: string;        // 撃ったもの（"cat" または ObjectKind）
  alive: boolean;
}

export interface Pickup {
  uid: number;
  x: number;
  y: number;
  value: number;
  age: number;
  alive: boolean;
}

export type FloatKind = "bug" | "cat" | "object";

export interface FloatText {
  value: number;
  x: number;
  y: number;
  age: number;
  kind: FloatKind;     // 誰が受けたダメージか
}

export type BattleEventType =
  | "wave"         // 波が始まった（value = 波の番号 1〜）
  | "spawn"        // 虫が出た
  | "catAttack"    // 猫が攻撃した
  | "shoot"        // オブジェクトが弾を撃った
  | "hit"          // 虫にダメージ（value = ダメージ）
  | "kill"         // 虫を倒した
  | "aoe"          // 範囲攻撃（value = 半径）
  | "mine"         // mine が爆発した（value = 半径）
  | "bite"         // 虫がオブジェクトをかじった（value = ダメージ）
  | "objectBroken" // オブジェクトがこわれた
  | "catHit"       // 猫がかじられた（value = ダメージ）
  | "catDown"      // 猫が休けいに入った
  | "catUp"        // 猫が休けいから戻った
  | "place"        // オブジェクトを置いた（value = slot）
  | "upgrade"      // オブジェクトを強化した（value = 新しいレベル）
  | "produce"      // producer がカリカリを生んだ（value = 量）
  | "pickup"       // カリカリを拾った（value = 量）
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
  pickups: Pickup[];
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

export class Battle {
  readonly loadout: Loadout;
  private readonly s: BattleState;
  private readonly rng: () => number;
  private readonly grid: (ObjState | null)[];
  private readonly queues: SpawnQueue[];
  private readonly waveAlive: number[];   // 波ごとの、まだ出ていない虫＋生きている虫の数
  private nextUid = 1;

  constructor(loadout: Loadout, seed = 1) {
    this.loadout = loadout;
    this.rng = mulberry32(seed);
    this.grid = new Array(COLS * ROWS).fill(null);
    const st = loadout.stage;
    const c = loadout.char;
    this.s = {
      time: 0,
      kibble: st.startKibble + loadout.global.startKibbleAdd,
      mamaHp: loadout.global.mamaHp,
      mamaMaxHp: loadout.global.mamaHp,
      kills: 0,
      cat: {
        x: COLS / 2,
        y: ROWS - 1.5,
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
      pickups: [],
      floats: [],
      events: [],
      waveIndex: 0,
      waveTotal: st.waves.length,
      cooldowns: loadout.objects.map(() => 0),
      result: null,
    };
    this.queues = [];
    this.waveAlive = st.waves.map(() => 0);
    st.waves.forEach((w, wi) => {
      for (const e of w.bugs) {
        const def = loadout.bugs[e.bug];
        if (!def) throw new Error(`虫の定義がありません: ${e.bug}`);
        this.queues.push({
          wave: wi,
          def,
          count: e.count,
          every: e.every,
          lanes: e.lanes && e.lanes.length > 0 ? e.lanes : undefined,
          start: w.at,
          spawned: 0,
        });
        this.waveAlive[wi] += e.count;
      }
    });
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
  get pickups(): readonly Pickup[] { return this.s.pickups; }
  get floats(): readonly FloatText[] { return this.s.floats; }
  get events(): readonly BattleEvent[] { return this.s.events; }
  get waveIndex(): number { return this.s.waveIndex; }
  get waveTotal(): number { return this.s.waveTotal; }
  get cooldowns(): readonly number[] { return this.s.cooldowns; }

  /** 枠 i の待ち時間の残りの割合（1 = 置いた直後、0 = 置ける）。 */
  cooldownRatio(i: number): number {
    const d = this.loadout.objects[i];
    if (!d || d.cooldown <= 0) return 0;
    return clamp(this.s.cooldowns[i] / d.cooldown, 0, 1);
  }

  /** マス (col, row) のオブジェクト（無ければ null）。 */
  objectAt(col: number, row: number): ObjState | null {
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return this.grid[row * COLS + col];
  }

  /** 猫のいるマス。 */
  catCell(): { col: number; row: number } {
    const c = this.s.cat;
    return {
      col: clamp(Math.floor(c.x), 0, COLS - 1),
      row: clamp(Math.floor(c.y), 0, ROWS - 1),
    };
  }

  canPlace(i: number): CheckResult {
    if (this.s.result) return { ok: false, reason: "戦闘は終わりました" };
    const d = this.loadout.objects[i];
    if (!d) return { ok: false, reason: "そのオブジェクトはありません" };
    if (this.s.cat.resting) return { ok: false, reason: "猫が休けい中です" };
    if (this.s.cooldowns[i] > 0) return { ok: false, reason: "待ち時間中です" };
    const { col, row } = this.catCell();
    if (this.objectAt(col, row)) return { ok: false, reason: "もう置いてあります" };
    if (this.s.kibble < d.cost) return { ok: false, reason: "カリカリが足りません" };
    return { ok: true };
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
    this.updatePickups(h);
    this.ageFloats(h);
    this.compact();
    this.checkEnd();
  }

  private updateSpawns(): void {
    const s = this.s;
    const waves = this.loadout.stage.waves;
    while (s.waveIndex < waves.length && s.time >= waves[s.waveIndex].at) {
      s.waveIndex++;
      this.emit("wave", COLS / 2, 0, s.waveIndex);
    }
    for (const q of this.queues) {
      while (q.spawned < q.count && s.time >= q.start + q.spawned * q.every) {
        const lane = q.lanes
          ? clamp(Math.floor(q.lanes[q.spawned % q.lanes.length]), 0, COLS - 1)
          : Math.min(COLS - 1, Math.floor(this.rng() * COLS));
        q.spawned++;
        this.spawnBug(q.def, lane, q.wave);
      }
    }
  }

  private spawnBug(def: BugDef, lane: number, wave: number): void {
    const st = this.loadout.stage;
    const hp = def.hp * st.hpMul;
    const b: BugState = {
      uid: this.nextUid++,
      def,
      wave,
      lane,
      x: lane + 0.5,
      y: SPAWN_Y,
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
      c.restTimer -= h;
      if (c.restTimer <= 0) {
        c.resting = false;
        c.restTimer = 0;
        c.hp = c.maxHp;
        c.atkTimer = 0;
        this.emit("catUp", c.x, c.y, 0);
      }
      return;
    }
    // 移動
    let mx = input.move.x || 0;
    let my = input.move.y || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.01) { c.facingX = mx; c.facingY = my; }
    c.x = clamp(c.x + mx * ch.moveSpeed * h, CAT_MARGIN, COLS - CAT_MARGIN);
    c.y = clamp(c.y + my * ch.moveSpeed * h, CAT_MARGIN, ROWS - CAT_MARGIN);

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
      } else {
        c.atkTimer = 0;
      }
    }
  }

  private catStrike(ch: ResolvedChar, t: BugState): void {
    const c = this.s.cat;
    if (ch.role === "ranged") {
      this.addProjectile(c.x, c.y, 0, 0, ch.atk, 1, ch.aoe, -1, t.uid, ch.range + 3, true, "cat");
    } else if (ch.role === "aoe") {
      const r = ch.aoe > 0 ? ch.aoe : 1;
      this.damageArea(t.x, t.y, r, ch.atk);
      this.emit("aoe", t.x, t.y, r);
    } else {
      if (ch.aoe > 0) {
        this.damageArea(t.x, t.y, ch.aoe, ch.atk);
      } else {
        this.damageBug(t, ch.atk);
      }
    }
  }

  private damageCat(dmg: number): void {
    const c = this.s.cat;
    if (c.resting) return;
    const v = dmg * this.loadout.char.armor;
    c.hp -= v;
    c.hurt = 0.15;
    this.addFloat(v, c.x, c.y - 0.3, "cat");
    this.emit("catHit", c.x, c.y, v);
    if (c.hp <= 0) {
      c.hp = 0;
      c.resting = true;
      c.restTimer = this.loadout.char.restTime;
      this.emit("catDown", c.x, c.y, 0);
    }
  }

  // ---- オブジェクト ----
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
            if (b.alive && !b.def.fly && b.lane === o.col && b.y >= 0 && Math.floor(b.y) === o.row) {
              this.damageArea(cx, cy, MINE_RADIUS, o.atk);
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
              this.addPickup(cx, cy, v);
              this.emit("produce", cx, cy, v);
            }
          }
          break;
        }
        case "aoe": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.nearestBug(cx, cy, d.range)) {
            o.timer = 0;
            this.damageArea(cx, cy, d.range, o.atk);
            this.emit("aoe", cx, cy, d.range);
          }
          break;
        }
        case "shooter":
        case "slow": {
          o.timer = Math.min(o.timer + h, d.interval);
          if (o.timer >= d.interval && this.laneTarget(o.col, o.row, d.range)) {
            o.timer = 0;
            this.addProjectile(cx, cy, 0, -LANE_SHOT_SPEED, o.atk, d.kind === "slow" ? d.slow : 1, 0,
              o.col, -1, d.range + 0.5, false, d.kind);
            this.emit("shoot", cx, cy, 0);
          }
          break;
        }
      }
    }
  }

  /** レーン col の、row より上（前方）range 行以内にいる一番近い虫。 */
  private laneTarget(col: number, row: number, range: number): BugState | null {
    const top = row + 0.5 - range - 0.5;
    const bottom = row + 1;
    let best: BugState | null = null;
    for (const b of this.s.bugs) {
      if (!b.alive || b.lane !== col) continue;
      if (b.y < top || b.y >= bottom) continue;
      if (!best || b.y > best.y) best = b;
    }
    return best;
  }

  private damageObject(o: ObjState, dmg: number): void {
    o.hp -= dmg;
    o.hurt = 0.15;
    this.addFloat(dmg, o.col + 0.5, o.row + 0.3, "object");
    if (o.hp <= 0) this.removeObject(o, true);
  }

  private removeObject(o: ObjState, broken: boolean): void {
    o.hp = 0;
    if (this.grid[o.row * COLS + o.col] === o) this.grid[o.row * COLS + o.col] = null;
    if (broken) this.emit("objectBroken", o.col + 0.5, o.row + 0.5, 0);
  }

  // ---- 弾 ----
  private addProjectile(x: number, y: number, vx: number, vy: number, dmg: number, slow: number, splash: number,
    lane: number, targetUid: number, maxDist: number, fromCat: boolean, kind: string): void {
    this.s.projectiles.push({
      uid: this.nextUid++, x, y, vx, vy, dmg, slow, splash, lane, targetUid,
      maxDist, traveled: 0, fromCat, kind, alive: true,
    });
  }

  private updateProjectiles(h: number): void {
    for (const p of this.s.projectiles) {
      if (!p.alive) continue;
      if (p.targetUid >= 0) {
        // 追いかける弾
        const t = this.findBug(p.targetUid);
        if (!t) { p.alive = false; continue; }
        const dx = t.x - p.x, dy = t.y - p.y;
        const d = Math.hypot(dx, dy);
        const stepLen = HOMING_SHOT_SPEED * h;
        if (d <= stepLen + 0.2) {
          p.x = t.x; p.y = t.y;
          this.projectileHit(p, t);
          continue;
        }
        p.vx = (dx / d) * HOMING_SHOT_SPEED;
        p.vy = (dy / d) * HOMING_SHOT_SPEED;
        p.x += p.vx * h; p.y += p.vy * h;
        p.traveled += stepLen;
        if (p.traveled > p.maxDist) p.alive = false;
      } else {
        // レーンをまっすぐ進む弾
        p.x += p.vx * h; p.y += p.vy * h;
        p.traveled += Math.hypot(p.vx, p.vy) * h;
        let hit: BugState | null = null;
        for (const b of this.s.bugs) {
          if (b.alive && b.lane === p.lane && Math.abs(b.y - p.y) < 0.45) {
            if (!hit || b.y > hit.y) hit = b;
          }
        }
        if (hit) { this.projectileHit(p, hit); continue; }
        if (p.traveled > p.maxDist || p.y < SPAWN_Y - 1 || p.y > ROWS + 1) p.alive = false;
      }
    }
  }

  private projectileHit(p: Projectile, t: BugState): void {
    p.alive = false;
    if (p.slow < 1) {
      t.slowMul = Math.min(t.slowMul, p.slow);
      t.slowTimer = SLOW_TIME;
    }
    if (p.splash > 0) {
      this.damageArea(t.x, t.y, p.splash, p.dmg);
      this.emit("aoe", t.x, t.y, p.splash);
    } else {
      this.damageBug(t, p.dmg);
    }
  }

  // ---- 虫 ----
  private updateBugs(h: number): void {
    const s = this.s;
    const c = s.cat;
    for (const b of s.bugs) {
      if (!b.alive) continue;
      if (b.hurt > 0) b.hurt -= h;
      if (b.slowTimer > 0) {
        b.slowTimer -= h;
        if (b.slowTimer <= 0) { b.slowTimer = 0; b.slowMul = 1; }
      }
      const v = b.speed * b.slowMul;
      // 前のマスにオブジェクトがあるか（飛ぶ虫と mine は無視）
      let blocker: ObjState | null = null;
      if (!b.def.fly) {
        const frontRow = Math.floor(b.y + BUG_FRONT + v * h);
        const o = this.objectAt(b.lane, frontRow);
        if (o && o.hp > 0 && o.def.kind !== "mine") blocker = o;
      }
      const touchCat = !c.resting && Math.hypot(c.x - b.x, c.y - b.y) < CAT_TOUCH;
      if (blocker || touchCat) {
        if (b.mode !== "bite") { b.mode = "bite"; b.atkTimer = 0; }
        b.atkTimer += h;
        if (b.atkTimer >= b.def.atkInterval) {
          b.atkTimer -= b.def.atkInterval;
          if (blocker) {
            this.damageObject(blocker, b.atk);
            this.emit("bite", b.x, b.y + BUG_FRONT, b.atk);
          } else {
            this.damageCat(b.atk);
          }
        }
        continue;
      }
      b.mode = "walk";
      b.y += v * h;
      if (b.y >= ROWS) {
        const dmg = b.def.boss ? 3 : 1;
        s.mamaHp = Math.max(0, s.mamaHp - dmg);
        b.alive = false;
        this.waveAlive[b.wave]--;
        this.emit("mamaHit", b.x, ROWS, dmg);
      }
    }
  }

  private damageBug(b: BugState, dmg: number): void {
    if (!b.alive) return;
    b.hp -= dmg;
    b.hurt = 0.12;
    this.addFloat(dmg, b.x, b.y - 0.3, "bug");
    this.emit("hit", b.x, b.y, dmg);
    if (b.hp <= 0) {
      b.alive = false;
      b.hp = 0;
      this.s.kills++;
      this.waveAlive[b.wave]--;
      const drop = b.def.drop * this.loadout.global.kibbleMul;
      if (drop > 0) this.addPickup(b.x, clamp(b.y, 0.2, ROWS - 0.2), drop);
      this.emit("kill", b.x, b.y, 0);
    }
  }

  private damageArea(x: number, y: number, r: number, dmg: number): void {
    const r2 = r * r;
    for (const b of this.s.bugs) {
      if (!b.alive) continue;
      const dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy <= r2) this.damageBug(b, dmg);
    }
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

  // ---- カリカリ ----
  private addPickup(x: number, y: number, value: number): void {
    this.s.pickups.push({ uid: this.nextUid++, x, y, value, age: 0, alive: true });
  }

  private updatePickups(h: number): void {
    const s = this.s;
    const c = s.cat;
    const r2 = this.loadout.char.pickupRange * this.loadout.char.pickupRange;
    for (const p of s.pickups) {
      if (!p.alive) continue;
      p.age += h;
      const dx = p.x - c.x, dy = p.y - c.y;
      if ((!c.resting && dx * dx + dy * dy <= r2) || p.age >= PICKUP_AUTO_TIME) {
        p.alive = false;
        s.kibble += p.value;
        this.emit("pickup", p.x, p.y, p.value);
      }
    }
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

  /** 死んだ虫・消えた弾・拾ったカリカリ・こわれたオブジェクトを配列から取り除く（その場で詰める）。 */
  private compact(): void {
    const s = this.s;
    compactBy(s.bugs, (b) => b.alive);
    compactBy(s.projectiles, (p) => p.alive);
    compactBy(s.pickups, (p) => p.alive);
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
      this.emit("lose", COLS / 2, ROWS, 0);
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
