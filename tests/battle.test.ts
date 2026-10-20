// 戦闘エンジンのテスト（src/data は使わず、手で作った定義で確かめる）。v3: 14×18 の盤面・大きさのあるオブジェクト・特殊効果。
import { describe, expect, it } from "vitest";
import {
  Battle, GOAL_COL, GOAL_H, GOAL_ROW, GOAL_W, GOAL_X, GOAL_Y, idleInput, isGoal, type BattleEvent, type BugState,
} from "../src/battle/engine";
import { COLS, ROWS } from "../src/core/types";
import type { BattleInput, BugDef, Loadout, ResolvedChar, ResolvedObject, StageDef, WaveDef } from "../src/core/types";

const ant: BugDef = { id: "ant", name: "アリ", hp: 10, atk: 1, speed: 1, atkInterval: 1, drop: 5 };
const fly: BugDef = { id: "fly", name: "ハエ", hp: 10, atk: 1, speed: 1, atkInterval: 1, fly: true, drop: 0 };
const boss: BugDef = { id: "boss", name: "ゴキ", hp: 1e9, atk: 5, speed: 2, atkInterval: 1, boss: true, drop: 0 };
const tank: BugDef = { id: "tank", name: "カブト", hp: 1e9, atk: 1, speed: 1, atkInterval: 0.5, drop: 0 };
/** 動かない虫（位置はテストで決める）。 */
const post: BugDef = { id: "post", name: "かかし", hp: 100, atk: 0, speed: 0, atkInterval: 1, drop: 0 };
const weak: BugDef = { id: "weak", name: "よわむし", hp: 3, atk: 0, speed: 0, atkInterval: 1, drop: 1 };

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
    slow: 1, produce: 0, cooldown: 5, upgradeCost: 20, upgradeMul: 2, block: true, w: 1, h: 1,
    multishot: 0, spread: 0, pierce: 0, splash: 0, chain: 0, chainRange: 0, poison: 0, poisonSpread: 0,
    knockback: 0, crit: 0, critMul: 1, perks: [], ...over,
  };
}

/** タダで何度でも置ける壁。 */
const freeWall = (over: Partial<ResolvedObject> = {}) => obj({ kind: "wall", atk: 0, cost: 0, cooldown: 99, ...over });

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
    bugs: { ant, fly, boss, tank, post, weak },
    global: { kibbleMul: 1, startKibbleAdd: 0, mamaHp: opts.mamaHp ?? 10 },
  };
}

const idle = idleInput();
function run(b: Battle, seconds: number, input: BattleInput = idle, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) b.step(dt, input);
}

/** 1 回の step のイベントをコピーして返す（イベントの入れ物は使い回されるので）。 */
function stepEvents(b: Battle, dt: number, input: BattleInput = idle): BattleEvent[] {
  b.step(dt, input);
  return b.events.map((e) => ({ ...e }));
}

/** 秒数のあいだのイベントを集める。 */
function collect(b: Battle, seconds: number, dt = 0.05): BattleEvent[] {
  const out: BattleEvent[] = [];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) out.push(...stepEvents(b, dt));
  return out;
}

/** 猫を (x, y) へ動かす。 */
function moveCatTo(b: Battle, x: number, y: number): void {
  for (let i = 0; i < 900; i++) {
    const dx = x - b.cat.x, dy = y - b.cat.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) return;
    const sp = b.loadout.char.moveSpeed / 60;
    const k = d > sp ? 1 : d / sp;
    b.step(1 / 60, { move: { x: (dx / d) * k, y: (dy / d) * k }, place: null, upgrade: false });
  }
}

/** 遠くの最初の波（at 秒後）。 */
const later = (at: number, bugs: WaveDef["bugs"]): WaveDef[] => [{ at, bugs }];

/** 猫をじゃまにならない左下のすみへ。 */
function parkCat(b: Battle): void { moveCatTo(b, 0.4, ROWS - 0.4); }

/** 動かない虫を、指定の位置に並べる（hp も決められる）。 */
function frozen(positions: [number, number][], opts: { objects?: ResolvedObject[]; hp?: number; char?: ResolvedChar; bug?: string } = {}): { b: Battle; bugs: BugState[] } {
  const b = new Battle(loadout({
    objects: opts.objects, char: opts.char,
    waves: [{ at: 0, bugs: [{ bug: opts.bug ?? "post", count: positions.length, every: 0, lanes: [0] }] }, { at: 999, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [0] }] }],
  }));
  b.step(0.001, idle);
  const bugs = b.bugs as BugState[];
  positions.forEach(([x, y], i) => {
    const g = bugs[i];
    g.x = x; g.y = y; g.offX = 0; g.offY = 0;
    g.nextCol = Math.floor(x); g.nextRow = Math.floor(y);
    if (opts.hp !== undefined) { g.hp = opts.hp; g.maxHp = opts.hp; }
  });
  return { b, bugs: [...bugs] };
}

describe("盤面とママ（v3）", () => {
  it("盤面は 14×18。ママは一番下の真ん中の 2×2", () => {
    expect(COLS).toBe(14);
    expect(ROWS).toBe(18);
    expect([GOAL_COL, GOAL_ROW, GOAL_W, GOAL_H]).toEqual([6, 16, 2, 2]);
    expect(GOAL_X).toBe(7);
    expect(GOAL_Y).toBe(17);
    const b = new Battle(loadout());
    for (const [c, r] of [[6, 16], [7, 16], [6, 17], [7, 17]]) {
      expect(isGoal(c, r)).toBe(true);
      expect(b.pathDist(c, r)).toBe(0);
    }
    expect(isGoal(5, 16)).toBe(false);
    const route = b.routeFrom(0, 0);
    const last = route[route.length - 1];
    expect(isGoal(last.col, last.row)).toBe(true);
  });

  it("ふつうの虫はママに着くと HP を 1 減らす", () => {
    const b = new Battle(loadout({ waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    parkCat(b);
    const evs = collect(b, 30, 0.1);
    expect(b.mamaHp).toBe(9);
    expect(evs.filter((e) => e.type === "mamaHit").length).toBe(1);
    expect(b.result?.win).toBe(true);
  });

  it("ボスがママに着いたら、その場で負け", () => {
    const b = new Battle(loadout({ mamaHp: 50, waves: later(0, [{ bug: "boss", count: 1, every: 1, lanes: [0] }, { bug: "ant", count: 5, every: 10 }]) }));
    parkCat(b);
    run(b, 30);
    expect(b.mamaHp).toBe(0);
    expect(b.result?.win).toBe(false);
  });

  it("飛ぶ虫はいない（fly は無視され、壁をよけて歩く）", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(1, [{ bug: "fly", count: 1, every: 1, lanes: [7] }]) }));
    for (let c = 2; c < COLS; c++) expect(b.place(0, c, 8).ok).toBe(true);
    parkCat(b);
    let enteredBlocked = false;
    for (let i = 0; i < 800 && !b.result; i++) {
      b.step(0.05, idle);
      for (const g of b.bugs) {
        if (g.y < 0) continue;
        if (b.isBlocked(Math.floor(g.x), Math.floor(g.y))) enteredBlocked = true;
      }
    }
    expect(enteredBlocked).toBe(false);
    expect(b.mamaHp).toBe(9);
  });

  it("章 3 からは左右の上の方からも出る。同じ seed なら同じ所に出る", () => {
    const mk = (chapter: number) => new Battle(loadout({ stage: { chapter }, waves: later(0, [{ bug: "ant", count: 30, every: 0.05 }]) }), 42);
    const a = mk(1), c = mk(1);
    run(a, 1.6); run(c, 1.6);
    expect(a.bugs.map((x) => x.lane)).toEqual(c.bugs.map((x) => x.lane));
    expect(a.bugs.every((x) => x.lane >= 0 && x.lane < COLS)).toBe(true);
    const s = mk(3);
    s.step(1.6, idle);
    const side = s.bugs.filter((x) => x.lane === -1);
    expect(side.length).toBeGreaterThan(0);
    for (const g of side) expect(g.y).toBeLessThan(6);
  });
});

describe("置く（大きさ・ふさぐ・押し出し・待ち時間なし）", () => {
  it("2×2 は左上を指定して 4 マスをしめる。はみ出し・重なり・家具・ママには置けない", () => {
    const big = obj({ kind: "shooter", w: 2, h: 2, cost: 0 });
    const b = new Battle(loadout({ objects: [big, freeWall()], stage: { obstacles: [{ col: 10, row: 4, kind: "sofa", w: 2, h: 1 }] } }));
    expect(b.footprint(0)).toEqual({ w: 2, h: 2 });
    expect(b.place(0, 3, 5).ok).toBe(true);
    const o = b.objects[0];
    expect([o.w, o.h, o.cx, o.cy]).toEqual([2, 2, 4, 6]);
    for (const [c, r] of [[3, 5], [4, 5], [3, 6], [4, 6]]) {
      expect(b.objectAt(c, r)).toBe(o);
      expect(b.isBlocked(c, r)).toBe(true);
      expect(Number.isFinite(b.pathDist(c, r))).toBe(false);
    }
    expect(b.objectAt(5, 5)).toBeNull();
    expect(b.placeCheck(0, 13, 3).reason).toBe("盤面からはみ出すよ");
    expect(b.placeCheck(0, 3, 17).reason).toBe("盤面からはみ出すよ");
    expect(b.placeCheck(0, 4, 6).reason).toBe("もう置いてあります");
    expect(b.placeCheck(1, 4, 6).reason).toBe("もう置いてあります");
    expect(b.placeCheck(0, 9, 3).reason).toContain("家具");
    expect(b.isBlocked(11, 4)).toBe(true);
    expect(b.placeCheck(0, 5, 15).reason).toContain("ママ");
    expect(b.placeCheck(1, 7, 16).reason).toContain("ママ");
    expect(b.placeCheck(0, 4, 14).ok).toBe(true);
    // 盤面の点を中心にしたアンカー（盤面の中に収める）
    expect(b.anchorAt(0, 4, 6)).toEqual({ col: 3, row: 5 });
    expect(b.anchorAt(0, 13.9, 0.1)).toEqual({ col: 12, row: 0 });
    expect(b.anchorAt(1, 2.5, 3.5)).toEqual({ col: 2, row: 3 });
  });

  it("2×2 で道を完全にふさぐ置き方はできない（1マスなら置ける）", () => {
    const big = obj({ kind: "wall", atk: 0, w: 2, h: 2, cost: 0 });
    const b = new Battle(loadout({ objects: [freeWall(), big] }));
    // 8 行目を 4,5 列だけ空けてふさぐ
    for (let c = 0; c < COLS; c++) if (c !== 4 && c !== 5) expect(b.place(0, c, 8).ok, `col ${c}`).toBe(true);
    expect(b.wouldSeal(4, 7, 2, 2)).toBe(true);
    expect(b.placeCheck(1, 4, 7).reason).toBe("通り道がなくなるよ");
    expect(b.placeCheck(1, 3, 8).reason).toBe("もう置いてあります");
    expect(b.place(0, 4, 8).ok).toBe(true);
    expect(b.placeCheck(0, 5, 8).reason).toBe("通り道がなくなるよ");
    expect(Number.isFinite(b.pathDist(0, 0))).toBe(true);
    // 通れるものは道をふさがない
    const c2 = new Battle(loadout({ objects: [freeWall({ block: false, kind: "mine", w: 2, h: 1 })] }));
    for (let c = 0; c < COLS; c += 2) expect(c2.place(0, c, 5).ok).toBe(true);
    expect(Number.isFinite(c2.pathDist(0, 0))).toBe(true);
  });

  it("lanes の出口はふさげない。虫を閉じこめる置き方もできない", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(100, [{ bug: "ant", count: 1, every: 1, lanes: [3] }]) }));
    expect(b.placeCheck(0, 3, 0).reason).toBe("通り道がなくなるよ");
    expect(b.place(0, 4, 0).ok).toBe(true);

    // 虫を (0,0) のすみに置いて、まわりをふさぐ
    const { b: t } = frozen([[0.5, 0.5]], { objects: [freeWall()] });
    expect(t.place(0, 1, 0).ok).toBe(true);
    expect(t.place(0, 0, 2).ok).toBe(true);
    expect(t.place(0, 1, 2).ok).toBe(true);
    expect(t.placeCheck(0, 1, 1).reason).toBe("通り道がなくなるよ");
  });

  it("虫がいるところにも置ける。下の虫は近くの空いたマスへ押し出される（閉じこめない）", () => {
    const big = obj({ kind: "wall", atk: 0, w: 2, h: 2, cost: 0 });
    const { b, bugs } = frozen([[5.5, 6.5], [6.2, 7.3], [9.5, 9.5]], { objects: [big] });
    const r = b.place(0, 5, 6);
    expect(r.ok).toBe(true);
    const pushes = b.events.filter((e) => e.type === "push");
    expect(pushes.length).toBe(2);
    for (const g of bugs.slice(0, 2)) {
      const c = Math.floor(g.x), rr = Math.floor(g.y);
      expect(b.objectAt(c, rr)).toBeNull();
      expect(Number.isFinite(b.pathDist(c, rr))).toBe(true);
      expect(g.knock).toBeGreaterThan(0);
      expect(Math.hypot(g.x - 6, g.y - 7)).toBeLessThan(2.5);
    }
    // 押し出しの見た目のイベントは次の step にも残る
    const evs = stepEvents(b, 0.01);
    expect(evs.some((e) => e.type === "push")).toBe(true);
    expect(stepEvents(b, 0.01).some((e) => e.type === "push")).toBe(false);
    // 3 匹目は動かない
    expect(bugs[2].x).toBe(9.5);
  });

  it("置いたあとの待ち時間は無い（カリカリだけで決まる）", () => {
    const o = obj({ kind: "wall", atk: 0, cost: 30, cooldown: 99 });
    const b = new Battle(loadout({ objects: [o], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    expect(b.place(0, 1, 3).ok).toBe(true);
    expect(b.place(0, 2, 3).ok).toBe(true);
    expect(b.place(0, 3, 3).ok).toBe(true);
    expect(b.kibble).toBe(10);
    expect(b.canAfford(0)).toBe(false);
    expect(b.place(0, 4, 3).reason).toBe("カリカリが足りません");
    expect(b.objects.length).toBe(3);
    // 猫が休けい中でも置ける
    const r = new Battle(loadout({ objects: [obj({ cost: 0 })], char: char({ maxHp: 1, restTime: 5 }), waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [7] }]) }));
    moveCatTo(r, 7.5, 4);
    for (let i = 0; i < 300 && !r.cat.resting; i++) r.step(0.05, idle);
    expect(r.cat.resting).toBe(true);
    expect(r.place(0, 1, 1).ok).toBe(true);
  });

  it("置いたオブジェクトを指定して強化する（猫の位置は関係ない）", () => {
    const o = obj({ cost: 10, upgradeCost: 20, upgradeMul: 2, atk: 5, maxHp: 10 });
    const b = new Battle(loadout({ objects: [o], stage: { startKibble: 50 }, waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    expect(b.upgradeCheck(null).ok).toBe(false);
    b.place(0, 2, 2);
    const p = b.objects[0];
    expect(b.upgradeCheck(p).cost).toBe(20);
    expect(b.upgrade(p.uid).ok).toBe(true);
    expect([p.level, p.atk, p.maxHp, p.upgradeCost]).toEqual([1, 10, 20, 30]);
    expect(b.kibble).toBeCloseTo(20);
    expect(b.events.some((e) => e.type === "upgrade")).toBe(true);
    expect(b.upgrade(p).reason).toBe("カリカリが足りません");
  });

  it("壁を置くと、向かっていたマスがふさがった虫も道を選びなおす", () => {
    const b = new Battle(loadout({ objects: [freeWall()], waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [7] }]) }));
    parkCat(b);
    run(b, 4);
    const g = b.bugs[0];
    const nc = g.nextCol, nr = g.nextRow;
    expect(b.place(0, nc, nr).ok).toBe(true);
    let bad = false;
    for (let i = 0; i < 600 && !b.result; i++) {
      b.step(0.05, idle);
      for (const x of b.bugs) if (x.y >= 0 && b.isBlocked(Math.floor(x.x), Math.floor(x.y))) bad = true;
    }
    expect(bad).toBe(false);
    expect(b.mamaHp).toBe(9);
  });
});

describe("オブジェクトの種類と特殊効果", () => {
  it("shooter は range 以内の虫だけを撃つ。2×2 は中心から測る", () => {
    const { b } = frozen([[3.5, 3.5]], { objects: [obj({ range: 2 }), obj({ range: 2.6, w: 2, h: 2 })] });
    b.place(0, 3, 7);
    expect(collect(b, 1).some((e) => e.type === "shoot")).toBe(false);
    b.place(1, 3, 5); // 中心 (4,6)・距離 2.55 ≦ 2.6
    expect(collect(b, 1).some((e) => e.type === "shoot")).toBe(true);
  });

  it("multishot: 扇形に 1 + multishot 発の弾", () => {
    const { b } = frozen([[7.5, 3.5]], { objects: [obj({ multishot: 4, spread: 0.8, w: 2, h: 2, interval: 10 })] });
    b.place(0, 7, 10);
    let evs: BattleEvent[] = [];
    for (let i = 0; i < 300 && !evs.some((e) => e.type === "shoot"); i++) evs = stepEvents(b, 0.02);
    expect(evs.find((e) => e.type === "shoot")!.value).toBe(5);
    expect(b.projectiles.length).toBe(5);
    const angs = b.projectiles.map((p) => Math.atan2(p.vy, p.vx)).sort((x, y) => x - y);
    expect(angs[4] - angs[0]).toBeCloseTo(0.8, 1);
    expect(b.projectiles.filter((p) => p.target).length).toBe(1);
  });

  it("pierce: 弾が突き抜けて後ろの虫にも当たる", () => {
    const line: [number, number][] = [[7.5, 9.5], [7.5, 8.5], [7.5, 7.5], [7.5, 6.5]];
    const mk = (pierce: number) => {
      const { b, bugs } = frozen(line, { objects: [obj({ pierce, interval: 100, atk: 1 })] });
      b.place(0, 7, 12);
      run(b, 2, idle, 0.02);
      return bugs.filter((g) => g.hp < g.maxHp).length;
    };
    expect(mk(0)).toBe(1);
    expect(mk(2)).toBe(3);
  });

  it("splash: 当たった所のまわりにも範囲ダメージ", () => {
    const { b, bugs } = frozen([[7.5, 6.5], [8.3, 6.5], [7.5, 5.7], [11.5, 6.5]], { objects: [obj({ splash: 1.2, interval: 100, atk: 4, range: 12 })] });
    b.place(0, 7, 12);
    const evs = collect(b, 2, 0.02);
    expect(evs.some((e) => e.type === "splash")).toBe(true);
    expect(bugs.map((g) => g.maxHp - g.hp)).toEqual([4, 4, 4, 0]);
  });

  it("zap: 電撃が近くの虫へ chain 回飛び移る（chainRange より遠い虫へは飛ばない）", () => {
    const row: [number, number][] = [[2.5, 4.5], [4, 4.5], [5.5, 4.5], [7, 4.5], [8.5, 4.5]];
    const mk = (chain: number, chainRange: number, pos = row) => {
      const { b, bugs } = frozen(pos, { objects: [obj({ kind: "zap", chain, chainRange, atk: 2, interval: 100, range: 3 })] });
      b.place(0, 2, 6);
      let evs: BattleEvent[] = [];
      for (let i = 0; i < 100 && !evs.some((e) => e.type === "zap"); i++) evs = stepEvents(b, 0.02);
      return { hit: bugs.filter((g) => g.hp < g.maxHp).length, zaps: evs.filter((e) => e.type === "zap") };
    };
    const a = mk(3, 2);
    expect(a.hit).toBe(4);
    expect(a.zaps.length).toBe(4);
    expect(a.zaps.map((z) => z.value)).toEqual([0, 1, 2, 3]);
    // 1 本目はオブジェクトから、2 本目は 1 匹目から
    expect([a.zaps[0].x, a.zaps[0].y]).toEqual([2.5, 6.5]);
    expect([a.zaps[1].x, a.zaps[1].y]).toEqual([a.zaps[0].x2, a.zaps[0].y2]);
    expect(mk(10, 2).hit).toBe(5);
    expect(mk(0, 2).hit).toBe(1);
    expect(mk(3, 1).hit).toBe(1);
    // 同じ虫には2回飛ばない（2匹だけなら 2 回で終わる）
    expect(mk(5, 3, [[2.5, 4.5], [3.5, 4.5]]).zaps.length).toBe(2);
  });

  it("poison: 範囲の虫に毒（毎秒 atk × poison、3 秒）。かかり直すと時間が戻る", () => {
    const { b, bugs } = frozen([[3.5, 3.5], [4.2, 4.2], [12.5, 3.5]], { objects: [obj({ kind: "poison", atk: 2, poison: 1, interval: 100, range: 2 })] });
    b.place(0, 3, 5);
    const evs = collect(b, 0.1, 0.02);
    expect(evs.some((e) => e.type === "poisonCloud")).toBe(true);
    expect(bugs[0].poisonTimer).toBeGreaterThan(2.8);
    expect(bugs[2].poisonTimer).toBe(0);
    run(b, 4, idle, 0.05);
    expect(bugs[0].maxHp - bugs[0].hp).toBeCloseTo(6);
    expect(bugs[1].maxHp - bugs[1].hp).toBeCloseTo(6);
    expect(bugs[2].hp).toBe(bugs[2].maxHp);
    // 何度もまくと、毒が切れない
    const r = frozen([[3.5, 3.5]], { objects: [obj({ kind: "poison", atk: 1, poison: 1, interval: 1, range: 2 })] });
    r.b.place(0, 3, 5);
    run(r.b, 5, idle, 0.05);
    expect(r.bugs[0].poisonTimer).toBeGreaterThan(1.5);
    expect(r.bugs[0].maxHp - r.bugs[0].hp).toBeGreaterThan(4);
  });

  it("poisonSpread: 毒で倒れた虫から、まわりへ毒がうつって連鎖する", () => {
    const pos: [number, number][] = [];
    for (let i = 0; i < 8; i++) pos.push([2.5 + i * 1.2, 3.5]);
    const mk = (spread: number) => {
      const { b, bugs } = frozen(pos, { bug: "weak", objects: [obj({ kind: "poison", atk: 2, poison: 1, poisonSpread: spread, interval: 100, range: 1.1 })] });
      b.place(0, 2, 4); // 中心 (2.5, 4.5)。1 匹目だけに届く
      const evs = collect(b, 20, 0.05);
      return { kills: bugs.filter((g) => !g.alive).length, spreads: evs.filter((e) => e.type === "poisonSpread").length };
    };
    expect(mk(0)).toEqual({ kills: 1, spreads: 0 });
    const r = mk(1.5);
    expect(r.kills).toBe(8);
    expect(r.spreads).toBe(8);
  });

  it("当てた虫に毒（shooter の poison）・ノックバック・会心", () => {
    const { b, bugs } = frozen([[7.5, 5.5]], { objects: [obj({ atk: 2, poison: 0.5, knockback: 0, crit: 1, critMul: 3, interval: 100 })] });
    b.place(0, 7, 12);
    run(b, 1.5, idle, 0.02);
    expect(bugs[0].maxHp - bugs[0].hp).toBeGreaterThanOrEqual(6);
    expect(bugs[0].poisonTimer).toBeGreaterThan(0);
    expect(bugs[0].poisonDps).toBeCloseTo(1);
    expect(b.floats.some((f) => f.kind === "crit")).toBe(true);

    const k = new Battle(loadout({ objects: [obj({ atk: 1, knockback: 2, interval: 0.3, range: 3 })], waves: later(0, [{ bug: "tank", count: 1, every: 1, lanes: [7] }]) }));
    parkCat(k);
    k.place(0, 7, 9);
    let pushed = -1, prevY = 0;
    for (let i = 0; i < 600 && pushed < 0; i++) {
      prevY = k.bugs[0]?.y ?? 0;
      const evs = stepEvents(k, 0.02);
      if (evs.some((e) => e.type === "knockback")) pushed = prevY - k.bugs[0].y;
    }
    expect(pushed).toBeGreaterThan(1.5);
  });

  it("aoe・slow・mine（大きさつき）", () => {
    const a = frozen([[4.5, 4.9], [7.5, 4.5]], { objects: [obj({ kind: "aoe", atk: 3, range: 1.5, slow: 0.6, interval: 0.5, w: 2, h: 2 })] });
    a.b.place(0, 4, 5); // 中心 (5, 6)、半径 1.5
    run(a.b, 0.6, idle, 0.02);
    expect(a.bugs[0].hp).toBeLessThan(a.bugs[0].maxHp);
    expect(a.bugs[1].hp).toBe(a.bugs[1].maxHp);
    expect(a.bugs[0].slowMul).toBe(0.6);

    const s = frozen([[4.5, 4.5]], { objects: [obj({ kind: "slow", atk: 1, slow: 0.5, range: 1.2, interval: 0.5, block: false })] });
    s.b.place(0, 4, 5);
    run(s.b, 0.6, idle, 0.02);
    expect(s.bugs[0].slowMul).toBe(0.5);

    const m = new Battle(loadout({ objects: [obj({ kind: "mine", atk: 50, block: false, w: 2, h: 1, cost: 0 })], waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [7] }]) }));
    parkCat(m);
    m.place(0, 6, 4);
    expect(Number.isFinite(m.pathDist(7, 4))).toBe(true);
    const evs = collect(m, 10, 0.05);
    expect(evs.filter((e) => e.type === "mine").length).toBe(1);
    expect(m.objects.length).toBe(0);
    expect(m.kills).toBe(1);
  });

  it("producer はカリカリを直接ふやす", () => {
    const b = new Battle(loadout({ objects: [obj({ kind: "producer", atk: 0, produce: 7, interval: 2, cost: 0 })], waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    b.place(0, 1, 1);
    const k0 = b.kibble;
    run(b, 4.2);
    expect(b.kibble - k0).toBeCloseTo(14);
  });
});

describe("猫", () => {
  it("虫は猫に触れるとかじる（armor で軽く、dodge でよける）", () => {
    const b = new Battle(loadout({ char: char({ maxHp: 100, armor: 0.5 }), waves: later(1, [{ bug: "tank", count: 1, every: 1, lanes: [7] }]) }));
    moveCatTo(b, 7.5, 6.5);
    for (let i = 0; i < 300 && b.cat.hp === 100; i++) b.step(0.05, idle);
    expect(b.cat.hp).toBeCloseTo(99.5);
    expect(b.bugs[0].mode).toBe("bite");
    const d = new Battle(loadout({ char: char({ maxHp: 100, dodge: 1 }), waves: later(1, [{ bug: "tank", count: 1, every: 1, lanes: [7] }]) }));
    moveCatTo(d, 7.5, 6.5);
    const evs = collect(d, 15);
    expect(evs.filter((e) => e.type === "dodge").length).toBeGreaterThan(3);
    expect(d.cat.hp).toBe(100);
  });

  it("猫は HP 0 で休けいし、reviveHp の割合（最低 0.5）で戻る", () => {
    for (const [rv, want] of [[1, 2], [0.2, 1], [0.75, 1.5]] as const) {
      const b = new Battle(loadout({
        char: char({ maxHp: 2, restTime: 3, reviveHp: rv }),
        waves: [{ at: 1, bugs: [{ bug: "tank", count: 1, every: 1, lanes: [7] }] }, { at: 90, bugs: [{ bug: "ant", count: 1, every: 1 }] }],
      }));
      moveCatTo(b, 7.5, 3.5);
      for (let i = 0; i < 300 && !b.cat.resting; i++) b.step(0.05, idle);
      expect(b.cat.resting).toBe(true);
      for (let i = 0; i < 40 && b.cat.resting; i++) b.step(0.1, idle);
      expect(b.cat.resting).toBe(false);
      expect(b.cat.hp).toBeCloseTo(want);
    }
  });

  it("会心・毒・貫通（猫の特殊技能）", () => {
    const c = frozen([[7.3, 14.8]], { char: char({ atk: 2, crit: 1, critMul: 3, atkInterval: 100, poison: 1 }) });
    run(c.b, 0.1, idle, 0.02);
    expect(c.bugs[0].maxHp - c.bugs[0].hp).toBeCloseTo(6);
    run(c.b, 4, idle, 0.05);
    expect(c.bugs[0].maxHp - c.bugs[0].hp).toBeCloseTo(12);

    const mk = (pierce: number) => {
      const p = frozen([[7, 13.4], [7, 12.4], [7, 11.4]], { hp: 1, char: char({ atk: 5, pierce, atkInterval: 100, role: "ranged", range: 3 }) });
      run(p.b, 1, idle, 0.02);
      return p.b.kills;
    };
    expect(mk(0)).toBe(1);
    expect(mk(2)).toBe(3);
  });

  it("objectAura: 猫の近くのオブジェクトの攻撃が上がる", () => {
    const mk = (aura: number) => {
      const { b, bugs } = frozen([[3.5, 3.5]], { char: char({ objectAura: aura }), objects: [obj({ atk: 5, range: 3, interval: 100 })] });
      moveCatTo(b, 4.5, 5.5);
      b.place(0, 3, 5);
      run(b, 1, idle, 0.02);
      return bugs[0].maxHp - bugs[0].hp;
    };
    expect(mk(0)).toBe(5);
    expect(mk(1)).toBe(10);
  });

  it("大きい dt でも細かく分けて計算し、猫は盤面の外に出ない", () => {
    const b = new Battle(loadout({ waves: later(100, [{ bug: "ant", count: 1, every: 1 }]) }));
    b.step(5, { move: { x: 1, y: 1 }, place: null, upgrade: false });
    expect(b.cat.x).toBeLessThan(COLS);
    expect(b.cat.y).toBeLessThan(ROWS);
    expect(b.time).toBeCloseTo(5);
  });
});

describe("勝ち負け", () => {
  it("全部の虫を倒すと勝ち", () => {
    const b = new Battle(loadout({
      objects: [obj({ atk: 100, range: 20, interval: 0.2, cost: 0 })],
      waves: [
        { at: 0, bugs: [{ bug: "ant", count: 2, every: 1, lanes: [3] }] },
        { at: 3, bugs: [{ bug: "ant", count: 1, every: 1, lanes: [10] }] },
      ],
    }));
    b.place(0, 6, 8);
    parkCat(b);
    let sawWin = false;
    for (let i = 0; i < 400 && !b.result; i++) {
      b.step(0.05, idle);
      if (b.events.some((e) => e.type === "win")) sawWin = true;
    }
    expect(sawWin).toBe(true);
    expect(b.result!.win).toBe(true);
    expect(b.result!.kills).toBe(3);
    expect(b.result!.wavesCleared).toBe(2);
  });

  it("ママの HP が 0 で負け、そのあとは進まない", () => {
    const b = new Battle(loadout({ mamaHp: 2, waves: later(0, [{ bug: "ant", count: 5, every: 0.5, lanes: [0] }]) }));
    parkCat(b);
    run(b, 30);
    expect(b.result!.win).toBe(false);
    expect(b.mamaHp).toBe(0);
    const t = b.time;
    b.step(1, idle);
    expect(b.time).toBe(t);
  });

  it("虫の hp・atk にステージ倍率が掛かる", () => {
    const b = new Battle(loadout({ stage: { hpMul: 3, atkMul: 2 }, waves: later(0, [{ bug: "ant", count: 1, every: 1, lanes: [0] }]) }));
    b.step(0.01, idle);
    expect(b.bugs[0].maxHp).toBe(30);
    expect(b.bugs[0].atk).toBe(2);
  });
});

describe("たくさんの虫", () => {
  it("400 匹＋たくさんの弾でも 1 コマが軽い", () => {
    const objects = [
      obj({ id: "s", multishot: 4, spread: 0.7, pierce: 1, splash: 0.8, atk: 0.5, interval: 0.3, range: 4, w: 2, h: 2, cost: 0 }),
      obj({ id: "z", kind: "zap", chain: 6, chainRange: 2, atk: 0.5, interval: 0.4, range: 3.5, cost: 0 }),
      obj({ id: "p", kind: "poison", atk: 0.3, poison: 1, poisonSpread: 1.2, interval: 1, range: 2.5, cost: 0 }),
    ];
    const b = new Battle(loadout({
      objects,
      mamaHp: 1e9,
      stage: { chapter: 3 },
      waves: [{ at: 0, bugs: [{ bug: "tank", count: 400, every: 0.02 }] }],
    }), 3);
    for (const [i, c, r] of [[0, 2, 6], [0, 10, 6], [0, 6, 10], [1, 4, 9], [1, 9, 9], [2, 3, 12], [2, 10, 12], [0, 2, 13], [0, 10, 13], [1, 6, 5]] as const) {
      expect(b.place(i, c, r).ok).toBe(true);
    }
    parkCat(b);
    run(b, 9, idle, 1 / 30);
    expect(b.bugs.length).toBeGreaterThan(300);
    const t0 = performance.now();
    const frames = 120;
    let maxProj = 0;
    for (let i = 0; i < frames; i++) {
      b.step(1 / 60, idle);
      maxProj = Math.max(maxProj, b.projectiles.length);
    }
    const ms = (performance.now() - t0) / frames;
    expect(maxProj).toBeGreaterThan(20);
    expect(ms).toBeLessThan(4);
  });
});

describe("ステージの障害物（家具）", () => {
  it("障害物（w×h）は虫が通れず、オブジェクトも置けない", () => {
    const obstacles = [{ col: 3, row: 5, kind: "table", w: 2, h: 2 }];
    const b = new Battle(loadout({ objects: [freeWall()], stage: { obstacles } }));
    for (const [c, r] of [[3, 5], [4, 5], [3, 6], [4, 6]]) {
      expect(b.isBlocked(c, r)).toBe(true);
      expect(b.obstacleAt(c, r)).toBe(true);
      expect(Number.isFinite(b.pathDist(c, r))).toBe(false);
    }
    expect(b.placeCheck(0, 4, 6).reason).toContain("家具");
  });
  it("データのステージは、障害物があっても一番上のどこからでもママへ行ける", async () => {
    const { STAGES } = await import("../src/data/stages");
    for (const st of STAGES) {
      const b = new Battle({ ...loadout(), stage: { ...st, waves: [] } });
      for (let c = 0; c < COLS; c++) {
        if (b.isBlocked(c, 0)) continue;
        expect(Number.isFinite(b.pathDist(c, 0)), `${st.id} col ${c}`).toBe(true);
      }
    }
  });
});
