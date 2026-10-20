// 戦闘エンジンのテスト（src/data は使わず、手で作った定義で確かめる）。
import { describe, expect, it } from "vitest";
import { Battle, idleInput } from "../src/battle/engine";
import { COLS, ROWS } from "../src/core/types";
import type { BattleInput, BugDef, Loadout, ResolvedChar, ResolvedObject, StageDef, WaveDef } from "../src/core/types";

const ant: BugDef = { id: "ant", name: "アリ", hp: 10, atk: 1, speed: 1, atkInterval: 1, drop: 5 };
const fly: BugDef = { id: "fly", name: "ハエ", hp: 10, atk: 1, speed: 1, atkInterval: 1, fly: true, drop: 0 };
const boss: BugDef = { id: "boss", name: "ゴキ", hp: 1000, atk: 5, speed: 2, atkInterval: 1, boss: true, drop: 0 };
const tank: BugDef = { id: "tank", name: "カブト", hp: 1e9, atk: 1, speed: 1, atkInterval: 0.5, drop: 0 };

function char(over: Partial<ResolvedChar> = {}): ResolvedChar {
  return {
    id: "tama", name: "たま", role: "melee", maxHp: 10, atk: 0, atkInterval: 0.5, range: 0.9, aoe: 0,
    moveSpeed: 3, restTime: 3, armor: 1, pickupRange: 0.6, ...over,
  };
}

function obj(over: Partial<ResolvedObject> = {}): ResolvedObject {
  return {
    id: "o", name: "おもちゃ", kind: "shooter", cost: 10, maxHp: 10, atk: 5, interval: 0.5, range: 9,
    slow: 1, produce: 0, cooldown: 5, upgradeCost: 20, upgradeMul: 2, ...over,
  };
}

function stage(waves: WaveDef[], over: Partial<StageDef> = {}): StageDef {
  return {
    id: "t-1", chapter: 1, index: 1, name: "テスト", hpMul: 1, atkMul: 1, waves,
    startKibble: 100, kibblePerSec: 0,
    rewards: { exp: 0, coins: 0, relicPoints: 0, equipDrops: 0, objectDrops: 0 }, ...over,
  };
}

function loadout(opts: { waves?: WaveDef[]; objects?: ResolvedObject[]; char?: ResolvedChar; stage?: Partial<StageDef>; mamaHp?: number } = {}): Loadout {
  return {
    char: opts.char ?? char(),
    objects: opts.objects ?? [],
    stage: stage(opts.waves ?? [], opts.stage),
    bugs: { ant, fly, boss, tank },
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

describe("Battle", () => {
  it("虫が下りてきてママに着くと HP が減る", () => {
    const b = new Battle(loadout({ waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }] }));
    b.step(0.01, idle);
    expect(b.bugs.length).toBe(1);
    expect(b.bugs[0].lane).toBe(0);
    const y0 = b.bugs[0].y;
    run(b, 1);
    expect(b.bugs[0].y).toBeGreaterThan(y0 + 0.9);
    run(b, 10);
    expect(b.bugs.length).toBe(0);
    expect(b.mamaHp).toBe(9);
  });

  it("ボスはママの HP を 3 減らす", () => {
    const b = new Battle(loadout({ waves: [{ at: 0, bugs: [{ bug: "boss", count: 1, every: 1, lanes: [0] }] }] }));
    run(b, 8);
    expect(b.mamaHp).toBe(7);
  });

  it("shooter は自分の列の虫を倒し、カリカリが落ちる", () => {
    // 2つめの波は遅らせて、勝ちで止まらないようにする
    const b = new Battle(loadout({ objects: [obj()], waves: [{ at: 1, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [2] }] }, { at: 60, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    moveCatTo(b, 2, 8);
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(1);
    expect(b.kibble).toBe(90);
    let shot = false;
    for (let i = 0; i < 80 && b.kills === 0; i++) {
      b.step(0.05, idle);
      if (b.events.some((e) => e.type === "shoot")) shot = true;
    }
    expect(shot).toBe(true);
    expect(b.kills).toBe(1);
    expect(b.mamaHp).toBe(10);
    expect(b.pickups.length).toBe(1);
    run(b, 9); // 拾わなくても自動で回収される
    expect(b.pickups.length).toBe(0);
    expect(b.kibble).toBeCloseTo(95);
  });

  it("shooter は別の列の虫は撃たない", () => {
    const b = new Battle(loadout({ objects: [obj()], waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }] }));
    moveCatTo(b, 4, 8);
    b.step(0.01, place(0));
    run(b, 12);
    expect(b.kills).toBe(0);
    expect(b.mamaHp).toBe(9);
  });

  it("wall は虫を止め、かじられてこわれる", () => {
    const wall = obj({ kind: "wall", atk: 0, maxHp: 6 });
    const b = new Battle(loadout({ objects: [wall], waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [1] }] }] }));
    moveCatTo(b, 1, 4);
    b.step(0.01, place(0));
    moveCatTo(b, 4, 8);
    run(b, 6);
    expect(b.bugs.length).toBe(1);
    expect(b.bugs[0].mode).toBe("bite");
    expect(b.bugs[0].y).toBeLessThan(4);
    expect(b.objects[0].hp).toBeLessThan(6);
    run(b, 5);
    expect(b.objects.length).toBe(0);
    expect(b.objectAt(1, 4)).toBeNull();
    run(b, 10);
    expect(b.mamaHp).toBe(9);
  });

  it("飛ぶ虫は wall を越える", () => {
    const wall = obj({ kind: "wall", atk: 0, maxHp: 100 });
    const b = new Battle(loadout({ objects: [wall], waves: [{ at: 0, bugs: [{ bug: "fly", count: 1, every: 1, lanes: [1] }] }] }));
    moveCatTo(b, 1, 4);
    b.step(0.01, place(0));
    moveCatTo(b, 4, 8);
    run(b, 12);
    expect(b.mamaHp).toBe(9);
    expect(b.objects[0].hp).toBe(100);
  });

  it("猫の近接攻撃で虫を倒せる", () => {
    const b = new Battle(loadout({ char: char({ atk: 4 }), waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [2] }] }] }));
    // 猫は (2.5, 7.5) から始まる。虫は同じ列を下りてくる
    run(b, 10);
    expect(b.kills).toBe(1);
    expect(b.mamaHp).toBe(10);
  });

  it("aoe の猫はまとめてダメージを与える", () => {
    const b = new Battle(loadout({
      char: char({ role: "aoe", atk: 10, aoe: 1.5, range: 1.2 }),
      waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [1] }, { bug: "ant", count: 1, every: 1, lanes: [2] }] }],
    }));
    let maxKillsOneStep = 0;
    for (let i = 0; i < 120 && b.kills < 2; i++) {
      b.step(0.1, idle);
      maxKillsOneStep = Math.max(maxKillsOneStep, b.events.filter((e) => e.type === "kill").length);
    }
    expect(b.kills).toBe(2);
    expect(maxKillsOneStep).toBe(2);
  });

  it("ranged の猫は弾を撃って倒す", () => {
    const b = new Battle(loadout({ char: char({ role: "ranged", atk: 10, range: 4 }), waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [2] }] }] }));
    let sawProjectile = false;
    for (let i = 0; i < 100 && b.kills === 0; i++) {
      b.step(0.05, idle);
      if (b.projectiles.length > 0) sawProjectile = true;
    }
    expect(sawProjectile).toBe(true);
    expect(b.kills).toBe(1);
  });

  it("猫は HP 0 で休けいし、時間がたつと全回復する", () => {
    const b = new Battle(loadout({ char: char({ maxHp: 2, armor: 1, restTime: 3 }), waves: [{ at: 0, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [2] }] }, { at: 60, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    let downAt = -1;
    for (let i = 0; i < 300 && downAt < 0; i++) {
      b.step(0.05, idle);
      if (b.events.some((e) => e.type === "catDown")) downAt = b.time;
    }
    expect(downAt).toBeGreaterThan(0);
    expect(b.cat.resting).toBe(true);
    // 休けい中は動けない
    const x = b.cat.x;
    b.step(0.1, { move: { x: 1, y: 0 }, place: null, upgrade: false });
    expect(b.cat.x).toBe(x);
    run(b, 3.1);
    expect(b.cat.resting).toBe(false);
    expect(b.cat.hp).toBe(2);
  });

  it("armor でダメージが減る", () => {
    const b = new Battle(loadout({ char: char({ maxHp: 100, armor: 0.5 }), waves: [{ at: 0, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [2] }] }] }));
    for (let i = 0; i < 300 && b.cat.hp === 100; i++) b.step(0.05, idle);
    expect(b.cat.hp).toBeCloseTo(99.5);
  });

  it("置くルール: カリカリ・待ち時間・置いてあるマス・休けい中", () => {
    const o = obj({ cost: 60, cooldown: 5 });
    const b = new Battle(loadout({ objects: [o], waves: [{ at: 100, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    expect(b.canPlace(0).ok).toBe(true);
    expect(b.canPlace(3).ok).toBe(false);
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(1);
    expect(b.kibble).toBe(40);
    // 同じマス
    expect(b.canPlace(0).ok).toBe(false);
    moveCatTo(b, 0, 0);
    // 待ち時間
    expect(b.cooldowns[0]).toBeGreaterThan(0);
    expect(b.canPlace(0).reason).toBe("待ち時間中です");
    run(b, 5);
    expect(b.cooldowns[0]).toBe(0);
    // カリカリ不足
    expect(b.canPlace(0).reason).toBe("カリカリが足りません");
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(1);
    expect(b.kibble).toBe(40);
  });

  it("休けい中は置けない", () => {
    const b = new Battle(loadout({ objects: [obj({ cost: 0 })], char: char({ maxHp: 1, restTime: 5 }), waves: [{ at: 0, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [2] }] }] }));
    for (let i = 0; i < 300 && !b.cat.resting; i++) b.step(0.05, idle);
    expect(b.cat.resting).toBe(true);
    expect(b.canPlace(0).ok).toBe(false);
    b.step(0.01, place(0));
    expect(b.objects.length).toBe(0);
  });

  it("時間でカリカリが増え、開始のカリカリに上乗せがある", () => {
    const l = loadout({ stage: { startKibble: 50, kibblePerSec: 2 }, waves: [{ at: 100, bugs: [{ bug: "ant", count: 1, every: 1 }] }] });
    l.global.startKibbleAdd = 10;
    l.global.kibbleMul = 1.5;
    const b = new Battle(l);
    expect(b.kibble).toBe(60);
    run(b, 2);
    expect(b.kibble).toBeCloseTo(66);
  });

  it("強化で atk・maxHp が増え、次の強化が高くなる", () => {
    const o = obj({ cost: 10, upgradeCost: 20, upgradeMul: 2, atk: 5, maxHp: 10 });
    const b = new Battle(loadout({ objects: [o], stage: { startKibble: 200 }, waves: [{ at: 100, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    expect(b.canUpgrade().ok).toBe(false);
    b.step(0.01, place(0));
    const chk = b.canUpgrade();
    expect(chk.ok).toBe(true);
    expect(chk.cost).toBe(20);
    b.step(0.01, upgrade);
    const p = b.objects[0];
    expect(p.level).toBe(1);
    expect(p.atk).toBe(10);
    expect(p.maxHp).toBe(20);
    expect(p.hp).toBe(20);
    expect(p.upgradeCost).toBe(30);
    expect(b.kibble).toBeCloseTo(170);
    b.step(0.01, upgrade);
    expect(p.level).toBe(2);
    expect(p.upgradeCost).toBe(45);
    expect(b.kibble).toBeCloseTo(140);
    expect(b.events.some((e) => e.type === "upgrade")).toBe(true);
  });

  it("producer がカリカリを生む", () => {
    const prod = obj({ kind: "producer", atk: 0, cost: 10, interval: 2, produce: 25 });
    const b = new Battle(loadout({ objects: [prod], waves: [{ at: 100, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    b.step(0.01, place(0));
    expect(b.kibble).toBe(90);
    run(b, 2.1); // 猫が上にいるのですぐ拾う
    expect(b.kibble).toBeCloseTo(115);
    run(b, 2);
    expect(b.kibble).toBeCloseTo(140);
  });

  it("mine は1回だけ爆発して消える", () => {
    const mine = obj({ kind: "mine", atk: 100, cost: 10, cooldown: 0 });
    const b = new Battle(loadout({ objects: [mine], waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 0.1, lanes: [1] }, { bug: "ant", count: 1, every: 1, lanes: [2] }, { bug: "ant", count: 1, every: 1, lanes: [1] }] }, { at: 8, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [1] }] }] }));
    moveCatTo(b, 1, 4);
    b.step(0.01, place(0));
    moveCatTo(b, 4, 8);
    let explosions = 0;
    for (let i = 0; i < 300; i++) {
      b.step(0.05, idle);
      explosions += b.events.filter((e) => e.type === "mine").length;
    }
    expect(explosions).toBe(1);
    expect(b.objects.length).toBe(0);
    // 同じ列の2匹と、となりの列の1匹を巻き込む。あとから来た虫はママへ
    expect(b.kills).toBe(3);
    expect(b.mamaHp).toBe(9);
  });

  it("aoe オブジェクトは範囲の虫にダメージ", () => {
    const a = obj({ kind: "aoe", atk: 5, interval: 0.5, range: 1.5 });
    const b = new Battle(loadout({ objects: [a], waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [2] }, { bug: "ant", count: 1, every: 1, lanes: [3] }] }] }));
    moveCatTo(b, 2, 4);
    b.step(0.01, place(0));
    moveCatTo(b, 0, 8);
    run(b, 12);
    expect(b.kills).toBe(2);
  });

  it("slow を当てると虫が遅くなる", () => {
    const sl = obj({ kind: "slow", atk: 0.1, slow: 0.5, interval: 0.2, range: 9 });
    const b = new Battle(loadout({ objects: [sl], waves: [{ at: 0, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [3] }] }] }));
    moveCatTo(b, 3, 8);
    b.step(0.01, place(0));
    moveCatTo(b, 0, 8);
    for (let i = 0; i < 100 && b.bugs[0].slowMul === 1; i++) b.step(0.05, idle);
    expect(b.bugs[0].slowMul).toBe(0.5);
    const y0 = b.bugs[0].y;
    run(b, 1);
    expect(b.bugs[0].y - y0).toBeCloseTo(0.5, 1);
  });

  it("全部の虫を倒すと勝ち", () => {
    const b = new Battle(loadout({
      char: char({ atk: 100 }),
      waves: [
        { at: 0, bugs: [{ bug: "ant", count: 2, every: 1, lanes: [2] }] },
        { at: 3, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [2] }] },
      ],
    }));
    let sawWin = false;
    for (let i = 0; i < 400 && !b.result; i++) {
      b.step(0.05, idle);
      if (b.events.some((e) => e.type === "win")) sawWin = true;
    }
    expect(b.result).not.toBeNull();
    expect(sawWin).toBe(true);
    expect(b.result!.win).toBe(true);
    expect(b.result!.kills).toBe(3);
    expect(b.result!.wavesCleared).toBe(2);
    expect(b.result!.stageId).toBe("t-1");
    expect(b.waveIndex).toBe(2);
  });

  it("ママの HP が 0 で負け、そのあとは進まない", () => {
    const b = new Battle(loadout({ mamaHp: 2, waves: [{ at: 0, bugs: [{ bug: "ant", count: 5, every: 0.5, lanes: [0] }] }] }));
    run(b, 20);
    expect(b.result).not.toBeNull();
    expect(b.result!.win).toBe(false);
    expect(b.mamaHp).toBe(0);
    const t = b.time;
    b.step(1, idle);
    expect(b.time).toBe(t);
  });

  it("レーン指定なしでも同じ seed なら同じ列に出る", () => {
    const mk = () => new Battle(loadout({ waves: [{ at: 0, bugs: [{ bug: "ant", count: 10, every: 0.1 }] }] }), 42);
    const a = mk(), c = mk();
    run(a, 1.05); run(c, 1.05);
    expect(a.bugs.map((x) => x.lane)).toEqual(c.bugs.map((x) => x.lane));
    expect(a.bugs.every((x) => x.lane >= 0 && x.lane < COLS)).toBe(true);
  });

  it("大きい dt でも細かく分けて計算し、猫は盤面の外に出ない", () => {
    const b = new Battle(loadout({ waves: [{ at: 100, bugs: [{ bug: "ant", count: 1, every: 1 }] }] }));
    b.step(5, { move: { x: 1, y: 1 }, place: null, upgrade: false });
    expect(b.cat.x).toBeLessThan(COLS);
    expect(b.cat.y).toBeLessThan(ROWS);
    expect(b.time).toBeCloseTo(5);
  });

  it("虫の hp・atk にステージ倍率が掛かる", () => {
    const b = new Battle(loadout({ stage: { hpMul: 3, atkMul: 2 }, waves: [{ at: 0, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }] }));
    b.step(0.01, idle);
    expect(b.bugs[0].maxHp).toBe(30);
    expect(b.bugs[0].atk).toBe(2);
  });
});
