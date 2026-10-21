// テスト用: 本物の戦闘（Battle）を、画面なしで遊ぶボット。
// - 猫: いちばんママに近い虫（ボスは優先）へ向かう。虫がいないときは置いたオブジェクトのそば（objectAura が効く）で待つ。
// - オブジェクト（objects = true のとき）: カリカリがあれば「置く」と「強化」のうち、1カリカリあたりの効き目が大きい方をする。
//   置く場所は、虫の道のマスをいちばん多く届く範囲に入れる所（ほかのオブジェクトと重なる所は少し下げる）。
//   餌皿（producer）は最初に1つ、道から離れた所に置く。壁（wall）は置かない（かんたんなボット）。
import { Battle, GOAL_X, GOAL_Y, type ObjState } from "../src/battle/engine";
import { COLS, ROWS, type Loadout, type ResolvedObject } from "../src/core/types";
import { objectDps } from "../src/core/progress";

export interface BotResult {
  win: boolean;
  time: number;
  kills: number;
  mamaHp: number;
  wavesCleared: number;
  waveTotal: number;
  placed: number;
  upgrades: number;
  /** 置いたオブジェクトの「攻撃力 ÷ 間隔」を時間で足したもの（目安との比べ用）。 */
  objNominal: number;
}

export interface BotOpts {
  objects: boolean;
  seed?: number;
  /** これより長くかかったら打ち切り（負け）。 */
  maxTime?: number;
}

/**
 * これより長くかかったら打ち切り（負け）。戦闘には時間の上限が無いので、猫が虫をかじらせて足止めしあうと、
 * 弱い守りでも何十分もかけて勝ててしまう。ふつうのステージは 400 秒くらい・大難関でも 600 秒くらいで終わるので、その少し上。
 */
export const BOT_MAX_TIME = 700;

const DT = 0.1;
const THINK = 0.5;

/** オブジェクトが攻撃するか。 */
const attacks = (d: ResolvedObject) => d.kind !== "producer" && d.kind !== "wall";

export function runBot(lo: Loadout, opts: BotOpts): BotResult {
  const b = new Battle(lo, opts.seed ?? 1);
  const maxTime = opts.maxTime ?? BOT_MAX_TIME;
  let placed = 0, upgrades = 0, think = 0;
  // 虫の道のマス（道が変わったら作りなおす）
  let routeVer = -1;
  let route: number[] = [];
  const refreshRoute = () => {
    if (routeVer === b.flowVersion) return;
    routeVer = b.flowVersion;
    const set = new Set<number>();
    for (const s of b.spawnCells()) {
      for (const c of b.routeFrom(s.col, s.row)) set.add(c.row * COLS + c.col);
      if (b.hasChewers) for (const c of b.routeFrom(s.col, s.row, true)) set.add(c.row * COLS + c.col);
    }
    route = [...set];
  };
  /** 道のマスが、置いた攻撃するオブジェクトにいくつ届いているか（重なりを下げるため）。 */
  const covered = (cell: number): number => {
    const cx = (cell % COLS) + 0.5, cy = Math.floor(cell / COLS) + 0.5;
    let n = 0;
    for (const o of b.objects) {
      if (!attacks(o.def)) continue;
      if (Math.hypot(o.cx - cx, o.cy - cy) <= reachOf(o.def)) n++;
    }
    return n;
  };
  const reachOf = (d: ResolvedObject) => (d.kind === "mine" || (d.kind === "slow" && !d.block) ? 0.75 : d.range + Math.max(d.w, d.h) / 2 - 0.5);
  /** 置き場所の点数（届く道のマスの数。もう守られているマスは下げる）。 */
  const placeScore = (d: ResolvedObject, col: number, row: number, cov: Map<number, number>): number => {
    const cx = col + d.w / 2, cy = row + d.h / 2, r = reachOf(d);
    let s = 0;
    for (const cell of route) {
      const x = (cell % COLS) + 0.5, y = Math.floor(cell / COLS) + 0.5;
      if (Math.hypot(cx - x, cy - y) > r) continue;
      // ママに近いマスほど少しだいじ（最後のとりで）
      const w = 1 + 0.5 * (y / ROWS);
      s += w / (1 + 0.6 * (cov.get(cell) ?? 0));
    }
    return s;
  };

  const bestSpot = (i: number): { col: number; row: number; score: number } | null => {
    const d = lo.objects[i];
    const cov = new Map<number, number>();
    for (const cell of route) cov.set(cell, covered(cell));
    let best: { col: number; row: number; score: number } | null = null;
    for (let row = 0; row <= ROWS - d.h; row++) {
      for (let col = 0; col <= COLS - d.w; col++) {
        if (!b.placeCheck(i, col, row).ok) continue;
        let s: number;
        if (d.kind === "producer") {
          // 道から離れた、ママのそば
          let near = 0;
          for (const cell of route) {
            const x = (cell % COLS) + 0.5, y = Math.floor(cell / COLS) + 0.5;
            if (Math.hypot(col + d.w / 2 - x, row + d.h / 2 - y) < 2) near++;
          }
          s = 100 - near * 10 - Math.hypot(col + d.w / 2 - GOAL_X, row + d.h / 2 - GOAL_Y);
        } else {
          s = placeScore(d, col, row, cov);
        }
        if (!best || s > best.score) best = { col, row, score: s };
      }
    }
    return best;
  };

  const objValue = (d: ResolvedObject, atkMul: number) => objectDps(d) * atkMul;
  /** 置いたオブジェクトの今の効き目（届く道のマスの数 × DPS）。 */
  const placedValue = (o: ObjState) => {
    const cov = new Map<number, number>();
    return objValue(o.def, o.atk / Math.max(1e-300, o.def.atk)) * Math.max(1, placeScore(o.def, o.col, o.row, cov));
  };

  const decide = () => {
    refreshRoute();
    for (let guard = 0; guard < 6; guard++) {
      const k = b.kibble;
      let act: (() => void) | null = null, actV = 0;
      // 餌皿: はじめに1つ
      const pi = lo.objects.findIndex((d) => d.kind === "producer");
      if (pi >= 0 && placed === 0 && b.time < 30 && !b.objects.some((o) => o.def.kind === "producer")) {
        if (lo.objects[pi].cost <= k) {
          const s = bestSpot(pi);
          if (s) { b.place(pi, s.col, s.row); placed++; continue; }
        }
      }
      for (let i = 0; i < lo.objects.length; i++) {
        const d = lo.objects[i];
        if (!attacks(d) || d.cost > k) continue;
        const s = bestSpot(i);
        if (!s || s.score <= 0.5) continue;
        const v = (objValue(d, 1) * s.score) / d.cost;
        if (v > actV) { actV = v; act = () => { b.place(i, s.col, s.row); placed++; }; }
      }
      for (const o of b.objects) {
        if (!attacks(o.def) || o.upgradeCost > k) continue;
        const v = (placedValue(o) * (o.def.upgradeMul - 1)) / o.upgradeCost;
        if (v > actV) { actV = v; act = () => { b.upgrade(o); upgrades++; }; }
      }
      if (!act) break;
      act();
    }
  };

  /** 置いた攻撃するオブジェクトの届く所にいるか（猫は、そこへ虫を連れてくる）。 */
  const nearDefense = (x: number, y: number): boolean => {
    for (const o of b.objects) if (attacks(o.def) && Math.hypot(o.cx - x, o.cy - y) <= reachOf(o.def) + 1) return true;
    return false;
  };
  const steer = () => {
    const c = b.cat;
    const defended = b.objects.some((o) => attacks(o.def));
    let tx = GOAL_X, ty = GOAL_Y - 2.5, best = Infinity, stop = 0.3;
    for (const g of b.bugs) {
      if (!g.alive || g.y < -0.3) continue;
      // オブジェクトがあるときは、守りの届く所・ママの近くの虫だけを相手にする（遠くで虫にかじられて足止めしあうと、
      // オブジェクトが当てられず、いつまでも終わらない）
      if (defended && !nearDefense(g.x, g.y) && Math.hypot(g.x - GOAL_X, g.y - GOAL_Y) > 5) continue;
      const cell = b.bugCell(g);
      let s = b.pathDist(cell.col, cell.row);
      if (!Number.isFinite(s)) s = 30;
      if (g.def.boss) s -= 8;
      s += 0.35 * Math.hypot(g.x - c.x, g.y - c.y);
      if (s < best) { best = s; tx = g.x; ty = g.y; stop = Math.max(0.2, c.char.range * 0.6); }
    }
    if (best === Infinity && defended) {
      // 相手がいないときは、オブジェクトのそば（objectAura が効く）
      let sx = 0, sy = 0, n = 0;
      for (const o of b.objects) if (attacks(o.def)) { sx += o.cx; sy += o.cy; n++; }
      if (n) { tx = sx / n; ty = sy / n; }
    }
    const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d <= stop) return { x: 0, y: 0 };
    return { x: dx / d, y: dy / d };
  };

  const input = { move: { x: 0, y: 0 }, place: null, upgrade: false };
  let objNominal = 0;
  while (!b.result && b.time < maxTime) {
    if (opts.objects && b.time >= think) { decide(); think = b.time + THINK; }
    input.move = steer();
    b.step(DT, input);
    for (const o of b.objects) if (attacks(o.def)) objNominal += (o.atk / Math.max(0.1, o.def.interval)) * DT;
  }
  const r = b.result;
  return {
    win: !!r?.win, time: b.time, kills: b.kills, mamaHp: b.mamaHp,
    wavesCleared: r?.wavesCleared ?? 0, waveTotal: b.waveTotal, placed, upgrades, objNominal,
  };
}

/** 猫・相棒・オブジェクトの攻撃を k 倍にした装備（どれだけ足りないか・余っているかを測る用）。 */
export function scaleLoadout(lo: Loadout, k: number): Loadout {
  return {
    ...lo,
    char: { ...lo.char, atk: lo.char.atk * k },
    companions: lo.companions.map((c) => ({ ...c, atk: c.atk * k })),
    objects: lo.objects.map((o) => ({ ...o, atk: o.atk * k })),
  };
}

/**
 * ボットが勝てる、いちばん小さい攻撃の倍率（だいたい。2倍ずつ → しぼりこみ）。
 * 1 より小さければ余裕あり（0.25 なら 4 倍の余裕）、1 より大きければ足りない。
 */
export function winScale(lo: Loadout, opts: BotOpts, lo0 = 1 / 64, hi0 = 64, steps = 7): number {
  const wins = (k: number) => runBot(scaleLoadout(lo, k), opts).win;
  if (!wins(hi0)) return Infinity;
  if (wins(lo0)) return lo0;
  let lo1 = Math.log(lo0), hi1 = Math.log(hi0);
  for (let i = 0; i < steps; i++) {
    const m = (lo1 + hi1) / 2;
    if (wins(Math.exp(m))) hi1 = m; else lo1 = m;
  }
  return Math.exp(hi1);
}
