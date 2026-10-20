// 戦闘エンジンのテスト（src/data は使わず、手で作った定義で確かめる）。v2: 迷路タワーディフェンス。
import { describe, expect, it } from "vitest";
import { Battle, GOAL_COL, GOAL_ROW, idleInput, type ObjState } from "../src/battle/engine";
import { COLS, ROWS } from "../src/core/types";
import type { BattleInput, BugDef, Loadout, ResolvedChar, ResolvedObject, StageDef, WaveDef } from "../src/core/types";

const ant: BugDef = { id: "ant", name: "アリ", hp: 10, atk: 1, speed: 1, atkInterval: 1, drop: 5 };
const fly: BugDef = { id: "fly", name: "ハエ", hp: 10, atk: 1, speed: 1, atkInterval: 1, fly: true, drop: 0 };
const boss: BugDef = { id: "boss", name: "ゴキ", hp: 1000, atk: 5, speed: 2, atkInterval: 1, boss: true, drop: 0 };
const tank: BugDef = { id: "tank", name: "カブト", hp: 1e9, atk: 1, speed: 1, atkInterval: 0.5, drop: 0 };
const flytank: BugDef = { id: "flytank", name: "カナブン", hp: 1e9, atk: 1, speed: 1, atkInterval: 0.5, fly: true, drop: 0 };

function char(over: Partial<ResolvedChar> = {}): ResolvedChar {
  return {
    id: "tama", name: "たま", role: "melee", maxHp: 10, atk: 0, atkInterval: 0.5, range: 0.9, aoe: 0,
    moveSpeed: 3, restTime: 3, armor: 1,
    crit: 0, critMul: 2, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slowHit: 1, pierce: 0,
    kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 1, dodge: 0,
    ...over,
  };
}

function obj(over: Partial<ResolvedObject> = {}): ResolvedObject {
  return {
    id: "o", name: "おもちゃ", kind: "shooter", cost: 10, maxHp: 10, atk: 5, interval: 0.5, range: 9,
    slow: 1, produce: 0, cooldown: 5, upgradeCost: 20, upgradeMul: 2, block: true, ...over,
  };
}

/** タダで何度でも置ける壁。 */
const freeWall = (over: Partial<ResolvedObject> = {}) => obj({ kind: "wall", atk: 0, cost: 0, cooldown: 0, ...over });

function stage(waves: WaveDef[], over: Partial<StageDef> = {}): StageDef {
  return {
    id: "t-1", chapter: 1, index: 1, name: "テスト", hpMul: 1, atkMul: 1, waves,
    startKibble: 100, kibblePerSec: 0,
    rewards: { exp: 0, coins: 0, relicPoints: 0, churu: 0, equipDrops: 0, objectDrops: 0 }, ...over,
  };
}

function loadout(opts: { waves?: WaveDef[]; objects?: ResolvedObject[]; char?: ResolvedChar; stage?: Partial<StageDef>; mamaHp?: number } = {}): Loadout {
  return {
    char: opts.char ?? char(),
    objects: opts.objects ?? [],
    stage: stage(opts.waves ?? [], opts.stage),
    bugs: { ant, fly, boss, tank, flytank },
    global: { kibbleMul: 1, startKibbleAdd: 0, mamaHp: opts.mamaHp ?? 10 },
  };
}

const idle = idleInput();
function run(b: Battle, seconds: number, input: BattleInput = idle, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) b.step(dt, input);
}

/** 猫をマス (col, row) の中心へ動かす。 */
function moveCatTo(b: Battle, col: number, row: number): void {
  for (let i = 0; i < 600; i++) {
    const dx = col + 0.5 - b.cat.x, dy = row + 0.5 - b.cat.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) return;
    const sp = b.loadout.char.moveSpeed / 60;
    const k = d > sp ? 1 : d / sp;
    b.step(1 / 60, { move: { x: (dx / d) * k, y: (dy / d) * k }, place: null, upgrade: false });
  }
}
const place = (i: number): BattleInput => ({ move: { x: 0, y: 0 }, place: i, upgrade: false });
const upgrade: BattleInput = { move: { x: 0, y: 0 }, place: null, upgrade: true };

/** (col, row) に枠 i を置く（猫を動かして）。 */
function placeAt(b: Battle, i: number, col: number, row: number): void {
  moveCatTo(b, col, row);
  b.step(0.01, place(i));
}

/** 5 行目に、col=open だけ空けた横一列の壁を作る。 */
function wallRow(b: Battle, row: number, open: number): void {
  for (let c = 0; c < COLS; c++) if (c !== open) placeAt(b, 0, c, row);
}

const later = (at: number, bugs: WaveDef["bugs"]): WaveDef[] => [{ at, bugs }];

describe("Battle v2（迷路）", () => {
  it("地面の虫はママに着くと HP を 1 減らす。ボスは 3", () => {
    const b = new Battle(loadout({ waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    moveCatTo(b, 6, 0);
    b.step(0.01, idle);
    expect(b.bugs.length).toBe(1);
    expect(b.bugs[0].lane).toBe(0);
    run(b, 15);
    expect(b.bugs.length).toBe(0);
    expect(b.mamaHp).toBe(9);

    const c = new Battle(loadout({ waves: later(0, [{ bug: "boss", count: 1, every: 1, lanes: [6] }]) }));
    moveCatTo(c, 0, 0);
    run(c, 10);
    expect(c.mamaHp).toBe(7);
  });

  it("最初の道は一番下の真ん中（ママ）へ向かう", () => {
    const b = new Battle(loadout());
    expect(b.pathDist(GOAL_COL, GOAL_ROW)).toBe(0);
    expect(b.pathDist(GOAL_COL, 0)).toBe(ROWS - 1);
    const r = b.routeFrom(0, 0);
    expect(r[0]).toEqual({ col: 0, row: 0 });
    expect(r[r.length - 1]).toEqual({ col: GOAL_COL, row: GOAL_ROW });
  });

  it("地面の虫は壁をよけて回り込む（通れないマスには入らない）", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(30, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    wallRow(b, 5, 6);
    expect(b.objects.length).toBe(6);
    expect(b.isBlocked(0, 5)).toBe(true);
    expect(b.isBlocked(6, 5)).toBe(false);
    expect(b.pathDist(0, 0)).toBeGreaterThan(ROWS); // 遠回り
    moveCatTo(b, 6, 9); // 道のじゃまにならない所（道は (6,5) を通ってから左下へ）
    moveCatTo(b, 0, 10);
    let maxX = 0, enteredBlocked = false, steps = 0;
    while (b.mamaHp === 10 && steps++ < 800) {
      b.step(0.05, idle);
      for (const bug of b.bugs) {
        maxX = Math.max(maxX, bug.x);
        const c = b.bugCell(bug);
        if (bug.y >= 0 && b.isBlocked(c.col, c.row)) enteredBlocked = true;
      }
    }
    expect(b.mamaHp).toBe(9);
    expect(maxX).toBeGreaterThan(6);
    expect(enteredBlocked).toBe(false);
  });

  it("飛ぶ虫は壁を無視してママへまっすぐ", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(30, [{ bug: "fly", count: 1, every: 1, lanes: [0] }]) }));
    wallRow(b, 5, 6);
    moveCatTo(b, 6, 0);
    let maxX = 0, overWall = false;
    for (let i = 0; i < 1200 && b.mamaHp === 10; i++) {
      b.step(0.05, idle);
      for (const bug of b.bugs) {
        maxX = Math.max(maxX, bug.x);
        const c = b.bugCell(bug);
        if (b.isBlocked(c.col, c.row)) overWall = true;
      }
    }
    expect(b.mamaHp).toBe(9);
    expect(overWall).toBe(true);
    expect(maxX).toBeLessThan(GOAL_COL + 0.6);
  });

  it("道を完全にふさぐ置き方はできない", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    wallRow(b, 5, 6);
    moveCatTo(b, 6, 5);
    expect(b.wouldSeal(6, 5)).toBe(true);
    expect(b.canPlace(0).ok).toBe(false);
    expect(b.canPlace(0).reason).toBe("通り道がなくなるよ");
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(6);
    expect(Number.isFinite(b.pathDist(0, 0))).toBe(true);
    // ママのマスには何も置けない
    moveCatTo(b, GOAL_COL, GOAL_ROW);
    expect(b.canPlace(0).reason).toBe("ママのところには置けないよ");
    // ママを囲うのもだめ
    const c = new Battle(loadout({ objects: [freeWall()], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    placeAt(c, 0, GOAL_COL - 1, GOAL_ROW);
    placeAt(c, 0, GOAL_COL + 1, GOAL_ROW);
    placeAt(c, 0, GOAL_COL - 1, GOAL_ROW - 1);
    placeAt(c, 0, GOAL_COL + 1, GOAL_ROW - 1);
    expect(c.objects.length).toBe(4);
    moveCatTo(c, GOAL_COL, GOAL_ROW - 1);
    expect(c.canPlace(0).reason).toBe("通り道がなくなるよ");
  });

  it("lanes の出口のマスはふさげない。lanes 無しなら一番上のどこか1つが空いていればよい", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(100, [{ bug: "ant", count: 1, every: 1, lanes: [2] }]) }));
    moveCatTo(b, 2, 0);
    expect(b.canPlace(0).reason).toBe("通り道がなくなるよ");
    placeAt(b, 0, 3, 0);
    expect(b.objects.length).toBe(1);

    const c = new Battle(loadout({ objects: [freeWall()], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    for (let col = 0; col < COLS - 1; col++) placeAt(c, 0, col, 0);
    expect(c.objects.length).toBe(COLS - 1);
    moveCatTo(c, COLS - 1, 0);
    expect(c.canPlace(0).reason).toBe("通り道がなくなるよ");
  });

  it("虫が立っているマスに通れないものは置けない。いる虫を閉じこめる置き方もできない", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [0] }]) }));
    moveCatTo(b, 6, 10);
    run(b, 2.5);
    const bug = b.bugs[0];
    const cell = b.bugCell(bug);
    expect(b.placeCheck(0, cell.col, cell.row).reason).toBe("虫がいるので置けないよ");
    // 6 行目は列 0 と列 6 だけ空いている。列 0 の通路 (0,6) に虫がいるとき、下 (0,7) をふさいだあとで上 (0,5) もふさぐと閉じこめになる
    const c = new Battle(loadout({ objects: [freeWall()], waves: later(20, [{ bug: "tank", count: 1, every: 1, lanes: [0] }]) }));
    for (let col = 1; col <= 5; col++) placeAt(c, 0, col, 6);
    moveCatTo(c, 0, 7);
    for (let i = 0; i < 2000 && !(c.bugs[0] && c.bugCell(c.bugs[0]).row === 6); i++) c.step(0.02, idle);
    expect(c.bugCell(c.bugs[0])).toEqual({ col: 0, row: 6 });
    expect(c.canPlace(0).ok).toBe(true);
    c.step(0.001, place(0));
    expect(c.isBlocked(0, 7)).toBe(true);
    expect(c.wouldSeal(0, 5)).toBe(true);
    expect(c.placeCheck(0, 0, 5).reason).toBe("通り道がなくなるよ");
  });

  it("通れるオブジェクトは道をふさがない（横一列に置ける）", () => {
    const tape = obj({ kind: "wall", atk: 0, cost: 0, cooldown: 0, block: false });
    const b = new Battle(loadout({ objects: [tape], waves: later(10, [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let c = 0; c < COLS; c++) placeAt(b, 0, c, 5);
    expect(b.objects.length).toBe(COLS);
    expect(b.isBlocked(GOAL_COL, 5)).toBe(false);
    expect(b.pathDist(GOAL_COL, 0)).toBe(ROWS - 1);
    moveCatTo(b, 0, 0);
    run(b, 30);
    expect(b.mamaHp).toBe(9);
  });

  it("壁を置くと、向かっていたマスがふさがった虫も道を選びなおす", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    // 猫を (3,5) のマスの上のほうに立たせて、虫を (3,4) で止める（虫は (3,5) へ向かっている）
    moveCatTo(b, GOAL_COL, 5);
    b.step(0.1, { move: { x: 0, y: -1 }, place: null, upgrade: false });
    for (let i = 0; i < 400 && b.bugs[0]?.mode !== "bite"; i++) b.step(0.02, idle);
    const bug = b.bugs[0];
    expect(b.bugCell(bug).row).toBe(4);
    expect(bug.nextRow).toBe(5);
    b.step(0.001, place(0));
    expect(b.isBlocked(GOAL_COL, 5)).toBe(true);
    expect(bug.nextRow).toBe(4);
    moveCatTo(b, 0, 0);
    let entered = false;
    for (let i = 0; i < 400 && b.mamaHp === 10; i++) {
      b.step(0.05, idle);
      for (const x of b.bugs) { const c = b.bugCell(x); if (b.isBlocked(c.col, c.row)) entered = true; }
    }
    expect(entered).toBe(false);
    expect(b.mamaHp).toBe(9);
  });

  it("倒した瞬間にカリカリが入る（kibbleMul × (1 + kibbleBonus)）", () => {
    const l = loadout({
      char: char({ kibbleBonus: 0.5 }),
      objects: [obj({ range: 3 })],
      waves: [{ at: 3, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }] }, { at: 99, bugs: [{ bug: "ant", count: 1, every: 1 }] }],
    });
    l.global.kibbleMul = 2;
    const b = new Battle(l);
    placeAt(b, 0, GOAL_COL, 4);
    moveCatTo(b, 0, 10);
    expect(b.kibble).toBe(90);
    let ev = null as null | { value: number };
    for (let i = 0; i < 200 && b.kills === 0; i++) {
      const before = b.kibble;
      b.step(0.05, idle);
      const k = b.events.find((e) => e.type === "kibble");
      if (k) { ev = k; expect(b.kibble - before).toBeCloseTo(15); }
    }
    expect(b.kills).toBe(1);
    expect(ev).not.toBeNull();
    expect(ev!.value).toBeCloseTo(15);
    expect(b.kibble).toBeCloseTo(105);
  });

  it("shooter は半径 range 以内の虫だけを撃つ", () => {
    const near = new Battle(loadout({ objects: [obj({ range: 2 })], waves: later(5, [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    placeAt(near, 0, GOAL_COL, 4);
    moveCatTo(near, 0, 10);
    run(near, 15);
    expect(near.kills).toBe(1);

    const far = new Battle(loadout({ objects: [obj({ range: 1.5 })], waves: later(5, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    placeAt(far, 0, 4, 3);
    moveCatTo(far, 6, 0);
    let shots = 0;
    for (let i = 0; i < 300; i++) { far.step(0.05, idle); shots += far.events.filter((e) => e.type === "shoot").length; }
    expect(shots).toBe(0);
    expect(far.kills).toBe(0);
  });

  it("producer はカリカリを直接ふやす", () => {
    const prod = obj({ kind: "producer", atk: 0, cost: 10, interval: 2, produce: 25 });
    const b = new Battle(loadout({ objects: [prod], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    b.step(0.01, place(0));
    expect(b.kibble).toBe(90);
    let sawKibble = false;
    for (let i = 0; i < 21; i++) { b.step(0.1, idle); if (b.events.some((e) => e.type === "kibble")) sawKibble = true; }
    expect(sawKibble).toBe(true);
    expect(b.kibble).toBeCloseTo(115);
  });

  it("mine は通れて、乗った虫のまわりを1回だけ爆発", () => {
    const mine = obj({ kind: "mine", atk: 100, cost: 10, cooldown: 0, block: false });
    const b = new Battle(loadout({ objects: [mine], waves: [{ at: 3, bugs: [{ bug: "ant", count: 2, every: 0.3, lanes: [0] }] }, { at: 12, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }] }));
    placeAt(b, 0, 0, 3);
    expect(b.isBlocked(0, 3)).toBe(false);
    moveCatTo(b, 6, 0);
    let explosions = 0;
    for (let i = 0; i < 600; i++) { b.step(0.05, idle); explosions += b.events.filter((e) => e.type === "mine").length; }
    expect(explosions).toBe(1);
    expect(b.objects.length).toBe(0);
    expect(b.kills).toBe(2);
    expect(b.mamaHp).toBe(9);
  });

  it("aoe・slow オブジェクトは半径で効く", () => {
    const a = obj({ kind: "aoe", atk: 5, interval: 0.5, range: 1.5 });
    const b = new Battle(loadout({ objects: [a], waves: later(4, [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }, { bug: "ant", count: 1, every: 1, lanes: [GOAL_COL + 1] }]) }));
    placeAt(b, 0, GOAL_COL, 3);
    moveCatTo(b, 0, 10);
    run(b, 12);
    expect(b.kills).toBe(2);

    const sl = obj({ kind: "slow", atk: 0, slow: 0.5, interval: 0.2, range: 9, block: false });
    const c = new Battle(loadout({ objects: [sl], waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    moveCatTo(c, 0, 10);
    c.step(0.01, place(0));
    for (let i = 0; i < 100 && c.bugs[0].slowMul === 1; i++) c.step(0.05, idle);
    expect(c.bugs[0].slowMul).toBe(0.5);
    const y0 = c.bugs[0].y;
    run(c, 1);
    expect(c.bugs[0].y - y0).toBeCloseTo(0.5, 1);
  });

  it("虫は猫に触れるとかじる（armor で軽く、dodge でよける）。オブジェクトはかじらない", () => {
    const b = new Battle(loadout({ char: char({ maxHp: 100, armor: 0.5 }), objects: [freeWall()], waves: later(1, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    placeAt(b, 0, 2, 3);
    moveCatTo(b, GOAL_COL, 6);
    for (let i = 0; i < 300 && b.cat.hp === 100; i++) b.step(0.05, idle);
    expect(b.cat.hp).toBeCloseTo(99.5);
    expect(b.bugs[0].mode).toBe("bite");
    expect(b.objects[0].hp).toBe(b.objects[0].maxHp);

    const d = new Battle(loadout({ char: char({ maxHp: 100, dodge: 1 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    let dodges = 0;
    for (let i = 0; i < 300; i++) { d.step(0.05, idle); dodges += d.events.filter((e) => e.type === "dodge").length; }
    expect(dodges).toBeGreaterThan(3);
    expect(d.cat.hp).toBe(100);
  });

  it("猫は HP 0 で休けいし、reviveHp の割合（最低 0.5）で戻る", () => {
    const mk = (reviveHp: number) => new Battle(loadout({
      char: char({ maxHp: 2, restTime: 3, reviveHp }),
      waves: [{ at: 0, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }] }, { at: 60, bugs: [{ bug: "ant", count: 1, every: 1 }] }],
    }));
    for (const [rv, want] of [[1, 2], [0.2, 1], [0.75, 1.5]] as const) {
      const b = mk(rv);
      for (let i = 0; i < 300 && !b.cat.resting; i++) b.step(0.05, idle);
      expect(b.cat.resting).toBe(true);
      const x = b.cat.x;
      b.step(0.1, { move: { x: 1, y: 0 }, place: null, upgrade: false });
      expect(b.cat.x).toBe(x);
      // 休けい中に虫から離れておく（戻った直後にかじられないように、時間だけ進める）
      for (let i = 0; i < 40 && b.cat.resting; i++) b.step(0.1, idle);
      expect(b.cat.resting).toBe(false);
      expect(b.cat.hp).toBeCloseTo(want);
    }
  });

  it("会心: crit の確率で critMul 倍", () => {
    const b = new Battle(loadout({ char: char({ atk: 2, crit: 1, critMul: 3, atkInterval: 100 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let i = 0; i < 300 && !b.events.some((e) => e.type === "catAttack"); i++) b.step(0.05, idle);
    const t = b.bugs[0];
    expect(t.maxHp - t.hp).toBeCloseTo(6);
    expect(b.floats.some((f) => f.kind === "crit")).toBe(true);
  });

  it("連続攻撃: multiHit 回ぶん追加で叩く", () => {
    const b = new Battle(loadout({ char: char({ atk: 1, multiHit: 2, atkInterval: 100 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let i = 0; i < 300 && !b.events.some((e) => e.type === "catAttack"); i++) b.step(0.05, idle);
    run(b, 0.5, idle, 0.02);
    const t = b.bugs[0];
    expect(t.maxHp - t.hp).toBeCloseTo(3);
  });

  it("吸血・自動回復で HP が戻る", () => {
    const mk = (over: Partial<ResolvedChar>) => {
      const b = new Battle(loadout({ char: char({ maxHp: 100, atk: 10, ...over }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }), 7);
      run(b, 14);
      return b.cat.hp;
    };
    const base = mk({});
    expect(base).toBeLessThan(100);
    expect(mk({ lifesteal: 0.05 })).toBeGreaterThan(base);
    expect(mk({ regen: 0.02 })).toBeGreaterThan(base);
  });

  it("毒: atk × poison を毎秒、3 秒", () => {
    const b = new Battle(loadout({ char: char({ atk: 2, poison: 1, atkInterval: 100 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let i = 0; i < 300 && !b.events.some((e) => e.type === "catAttack"); i++) b.step(0.05, idle);
    run(b, 4, idle, 0.05);
    const t = b.bugs[0];
    expect(t.maxHp - t.hp).toBeCloseTo(8);
    expect(t.poisonTimer).toBe(0);
    expect(b.floats.length + 1).toBeGreaterThan(0);
  });

  it("slowHit: 当てた虫が遅くなる", () => {
    const b = new Battle(loadout({ char: char({ atk: 1, slowHit: 0.7, atkInterval: 100, role: "ranged", range: 4 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let i = 0; i < 300 && !b.events.some((e) => e.type === "hit"); i++) b.step(0.05, idle);
    expect(b.bugs[0].slowMul).toBeCloseTo(0.7);
  });

  it("ノックバック: 地面の虫は道を戻り、飛ぶ虫はママから遠ざかる", () => {
    const b = new Battle(loadout({ char: char({ atk: 1, knockback: 2, atkInterval: 100, role: "ranged", range: 3 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    let prevY = 0, pushed = -1;
    for (let i = 0; i < 400 && pushed < 0; i++) {
      prevY = b.bugs[0]?.y ?? 0;
      b.step(0.02, idle);
      if (b.events.some((e) => e.type === "knockback")) pushed = prevY - b.bugs[0].y;
    }
    expect(pushed).toBeGreaterThan(1.8);
    expect(b.bugs[0].knock).toBeGreaterThan(0);

    const f = new Battle(loadout({ char: char({ atk: 1, knockback: 1.5, atkInterval: 100, role: "ranged", range: 3 }), waves: later(0, [{ bug: "flytank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    const gd = (x: number, y: number) => Math.hypot(x - (GOAL_COL + 0.5), y - (GOAL_ROW + 0.5));
    let before = 0, after = -1;
    for (let i = 0; i < 400 && after < 0; i++) {
      const bb = f.bugs[0];
      before = bb ? gd(bb.x, bb.y) : 0;
      f.step(0.02, idle);
      if (f.events.some((e) => e.type === "knockback")) after = gd(f.bugs[0].x, f.bugs[0].y);
    }
    expect(after - before).toBeGreaterThan(1.3);
  });

  it("貫通: ranged の弾が後ろの虫にも当たる", () => {
    const mk = (pierce: number) => {
      const b = new Battle(loadout({
        char: char({ atk: 100, pierce, atkInterval: 100, role: "ranged", range: 3 }),
        waves: [{ at: 0, bugs: [{ bug: "ant", count: 3, every: 0.5, lanes: [GOAL_COL] }] }, { at: 99, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }],
      }));
      let attacks = 0;
      for (let i = 0; i < 1000 && attacks === 0; i++) { b.step(0.02, idle); attacks += b.events.filter((e) => e.type === "catAttack").length; }
      run(b, 1, idle, 0.02);
      return b.kills;
    };
    expect(mk(0)).toBe(1);
    expect(mk(2)).toBe(3);
  });

  it("objectAura: 猫の近くのオブジェクトの攻撃が上がる。repair で直る", () => {
    const mk = (aura: number) => {
      const b = new Battle(loadout({ char: char({ objectAura: aura, repair: 0.5 }), objects: [obj({ atk: 5, range: 3 })], waves: later(2, [{ bug: "tank", count: 1, every: 1, lanes: [0] }]) }));
      placeAt(b, 0, 1, 3);
      let hit = 0;
      for (let i = 0; i < 400 && hit === 0; i++) { b.step(0.05, idle); hit = b.events.find((e) => e.type === "hit")?.value ?? 0; }
      return { b, hit };
    };
    expect(mk(0).hit).toBe(5);
    const { b, hit } = mk(1);
    expect(hit).toBe(10);
    expect(b.auraActive(b.objects[0])).toBe(true);
    const o = b.objects[0] as ObjState;
    o.hp = 1;
    run(b, 0.5, idle, 0.05);
    expect(o.hp).toBeGreaterThan(2);
  });

  it("置くルール: カリカリ・待ち時間・置いてあるマス・休けい中", () => {
    const o = obj({ cost: 60, cooldown: 5 });
    const b = new Battle(loadout({ objects: [o], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    expect(b.canPlace(0).ok).toBe(true);
    expect(b.canPlace(3).ok).toBe(false);
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(1);
    expect(b.kibble).toBe(40);
    expect(b.canPlace(0).reason).toBe("待ち時間中です");
    run(b, 5);
    expect(b.canPlace(0).reason).toBe("もう置いてあります");
    moveCatTo(b, 0, 1);
    expect(b.canPlace(0).reason).toBe("カリカリが足りません");
    const b2 = new Battle(loadout({ objects: [o], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    b2.step(0.01, place(0));
    moveCatTo(b2, 0, 1);
    expect(b2.cooldowns[0]).toBeGreaterThan(0);
    expect(b2.canPlace(0).reason).toBe("待ち時間中です");
    b2.step(0.01, place(0));
    expect(b2.objects.length).toBe(1);

    const r = new Battle(loadout({ objects: [obj({ cost: 0 })], char: char({ maxHp: 1, restTime: 5 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [GOAL_COL] }]) }));
    for (let i = 0; i < 300 && !r.cat.resting; i++) r.step(0.05, idle);
    expect(r.canPlace(0).reason).toBe("猫が休けい中です");
  });

  it("強化で atk・maxHp が増え、次の強化が高くなる", () => {
    const o = obj({ cost: 10, upgradeCost: 20, upgradeMul: 2, atk: 5, maxHp: 10 });
    const b = new Battle(loadout({ objects: [o], stage: { startKibble: 200 }, waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    expect(b.canUpgrade().ok).toBe(false);
    b.step(0.01, place(0));
    expect(b.canUpgrade().cost).toBe(20);
    b.step(0.01, upgrade);
    const p = b.objects[0];
    expect(p.level).toBe(1);
    expect(p.atk).toBe(10);
    expect(p.maxHp).toBe(20);
    expect(p.upgradeCost).toBe(30);
    expect(b.kibble).toBeCloseTo(170);
  });

  it("全部の虫を倒すと勝ち", () => {
    const b = new Battle(loadout({
      char: char({ atk: 100 }),
      waves: [
        { at: 0, bugs: [{ bug: "ant", count: 2, every: 1, lanes: [GOAL_COL] }] },
        { at: 3, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [GOAL_COL] }] },
      ],
    }));
    let sawWin = false;
    for (let i = 0; i < 400 && !b.result; i++) {
      b.step(0.05, idle);
      if (b.events.some((e) => e.type === "win")) sawWin = true;
    }
    expect(sawWin).toBe(true);
    expect(b.result!.win).toBe(true);
    expect(b.result!.kills).toBe(3);
    expect(b.result!.wavesCleared).toBe(2);
    expect(b.result!.stageId).toBe("t-1");
  });

  it("ママの HP が 0 で負け、そのあとは進まない", () => {
    const b = new Battle(loadout({ mamaHp: 2, waves: later(0, [{ bug: "ant", count: 5, every: 0.5, lanes: [0] }]) }));
    moveCatTo(b, 6, 0);
    run(b, 25);
    expect(b.result!.win).toBe(false);
    expect(b.mamaHp).toBe(0);
    const t = b.time;
    b.step(1, idle);
    expect(b.time).toBe(t);
  });

  it("lanes 無しでも同じ seed なら同じ所に出る。章 3 からは左右からも出る", () => {
    const mk = (chapter: number) => new Battle(loadout({ stage: { chapter }, waves: later(0, [{ bug: "ant", count: 30, every: 0.05 }]) }), 42);
    const a = mk(1), c = mk(1);
    run(a, 1.6); run(c, 1.6);
    expect(a.bugs.map((x) => x.lane)).toEqual(c.bugs.map((x) => x.lane));
    expect(a.bugs.every((x) => x.lane >= 0 && x.lane < COLS)).toBe(true);
    const s = mk(3);
    s.step(1.6, idle);
    expect(s.bugs.some((x) => x.lane === -1)).toBe(true);
  });

  it("大きい dt でも細かく分けて計算し、猫は盤面の外に出ない", () => {
    const b = new Battle(loadout({ waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    b.step(5, { move: { x: 1, y: 1 }, place: null, upgrade: false });
    expect(b.cat.x).toBeLessThan(COLS);
    expect(b.cat.y).toBeLessThan(ROWS);
    expect(b.time).toBeCloseTo(5);
  });

  it("虫の hp・atk にステージ倍率が掛かる", () => {
    const b = new Battle(loadout({ stage: { hpMul: 3, atkMul: 2 }, waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    b.step(0.01, idle);
    expect(b.bugs[0].maxHp).toBe(30);
    expect(b.bugs[0].atk).toBe(2);
  });
});

describe("ステージの障害物（家具）", () => {
  it("障害物は虫が通れず、オブジェクトも置けない。道は障害物をよけて計算される", () => {
    const obstacles = [{ col: 3, row: 5, kind: "table" }];
    const b = new Battle(loadout({ objects: [freeWall()], stage: { obstacles } }));
    expect(b.isBlocked(3, 5)).toBe(true);
    expect(b.obstacleAt(3, 5)).toBe(true);
    expect(Number.isFinite(b.pathDist(3, 5))).toBe(false);
    expect(b.placeCheck(0, 3, 5).ok).toBe(false);
    expect(b.placeCheck(0, 3, 5).reason).toContain("家具");
  });
  it("データのステージは、障害物があっても一番上のどこからでもママへ行ける", async () => {
    const { STAGES } = await import("../src/data/stages");
    for (const st of STAGES) {
      const b = new Battle({ ...loadout(), stage: { ...st, waves: [] } });
      for (let c = 0; c < 7; c++) expect(Number.isFinite(b.pathDist(c, 0)), `${st.id} col ${c}`).toBe(true);
      expect((st.obstacles ?? []).length).toBeGreaterThan(0);
    }
  });
});
