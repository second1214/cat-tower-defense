// テスト用: 本物の戦闘（Battle）を、画面なしで遊ぶボット。
// - 猫: いちばんママに近い虫（ボスは優先）へ向かう。虫がいないときは置いたオブジェクトのそば（objectAura が効く）で待つ。
// - オブジェクト（objects = true のとき）: カリカリがあれば「置く」と「強化」のうち、1カリカリあたりの効き目が大きい方をする。
//   置く場所は、虫の道のマスをいちばん多く届く範囲に入れる所（ほかのオブジェクトと重なる所は少し下げる）。
//   餌皿（producer）は最初に1つ、道から離れた所に置く。壁（wall）は置かない（かんたんなボット）。
import { Battle } from "../src/battle/engine";
import { createAutoPilot } from "../src/battle/auto";
import type { Loadout, ResolvedObject } from "../src/core/types";

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
  const ap = createAutoPilot(b, lo);
  let think = 0;
  const input = { move: { x: 0, y: 0 }, place: null, upgrade: false };
  let objNominal = 0;
  while (!b.result && b.time < maxTime) {
    if (opts.objects && b.time >= think) { ap.decide(); think = b.time + THINK; }
    input.move = ap.steer();
    b.step(DT, input);
    for (const o of b.objects) if (attacks(o.def)) objNominal += (o.atk / Math.max(0.1, o.def.interval)) * DT;
  }
  const r = b.result;
  return {
    win: !!r?.win, time: b.time, kills: b.kills, mamaHp: b.mamaHp,
    wavesCleared: r?.wavesCleared ?? 0, waveTotal: b.waveTotal, placed: ap.placed, upgrades: ap.upgrades, objNominal,
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
