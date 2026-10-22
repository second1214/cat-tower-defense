// 戦闘のオート: オブジェクトを置く・強化する、猫を動かす（画面のオートボタンと、テストのボットが使う）。
// - 猫: いちばんママに近い虫（ボスは優先）へ向かう。虫がいないときは置いたオブジェクトのそば（objectAura が効く）で待つ。
// - オブジェクト: カリカリがあれば「置く」と「強化」のうち、1カリカリあたりの効き目が大きい方をする。
//   置く場所は、虫の道のマスをいちばん多く届く範囲に入れる所（ほかのオブジェクトと重なる所は少し下げる）。
//   餌皿（producer）は最初に1つ、道から離れた所に置く。壁（wall）は置かない。
import { GOAL_X, GOAL_Y, type Battle, type ObjState } from "./engine";
import { COLS, ROWS, type Loadout, type ResolvedObject } from "../core/types";
import { objectDps } from "../core/progress";

/** オブジェクトが攻撃するか。 */
const attacks = (d: ResolvedObject) => d.kind !== "producer" && d.kind !== "wall" && d.kind !== "buff";

export interface AutoPilot {
  /** 置く・強化するを決めて、すぐにする。 */
  decide(): void;
  /** 猫の動き（スティックと同じ形）。 */
  steer(): { x: number; y: number };
  readonly placed: number;
  readonly upgrades: number;
}

export function createAutoPilot(b: Battle, lo: Loadout): AutoPilot {

  let placed = 0, upgrades = 0;
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
    // 電源タップ: 攻撃するオブジェクトが2つ以上あれば、いちばん多くに届く所に1つ置く
    const bi = lo.objects.findIndex((d) => d.kind === "buff");
    const atkObjs = b.objects.filter((o) => o.hp > 0 && attacks(o.def) && o.def.kind !== "buff");
    if (bi >= 0 && atkObjs.length >= 2 && b.kibble >= lo.objects[bi].cost && !b.objects.some((o) => o.hp > 0 && o.def.kind === "buff")) {
      const d = lo.objects[bi];
      let best: { col: number; row: number; n: number } | null = null;
      for (let row = 0; row <= ROWS - d.h; row++) for (let col = 0; col <= COLS - d.w; col++) {
        if (!b.placeCheck(bi, col, row).ok) continue;
        const cx = col + d.w / 2, cy = row + d.h / 2;
        let n = 0;
        for (const o of atkObjs) if (Math.hypot(o.cx - cx, o.cy - cy) <= d.range + Math.max(o.w, o.h) / 2) n++;
        if (n >= 2 && (!best || n > best.n)) best = { col, row, n };
      }
      if (best) { b.place(bi, best.col, best.row); placed++; }
    }
    // 必殺技: たまっていたら撃つ（近くに虫がいなければ撃たない）
    if ((b.cats[0]?.gauge ?? 0) >= 1) b.useSpecial(0);
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

  return {
    decide, steer,
    get placed() { return placed; },
    get upgrades() { return upgrades; },
  };
}
