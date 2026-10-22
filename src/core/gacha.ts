// ねこ福袋（ガチャ）。ちゅ〜るで福袋を買うと、中から「わざ」が出てくる。
// 同じわざがまた出たら、わざのレベル +1（最大5）。最大のあとは、ちゅ〜るにして返す。
import type { Rarity } from "./types";
import { type Rng, pick } from "./rng";
import type { SaveData } from "./save";
import { MAX_WAZA_LEVEL, RARITIES, RARITY_RANK, WAZAS, WAZA_MAP } from "../data/waza";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };

/** 1回のちゅ〜る。 */
export const PULL_COST = 10;
/** 10回まとめてのちゅ〜る（1回ぶんおとく。SR 以上が1つ確定）。 */
export const PULL10_COST = 90;
/** レアリティごとの出やすさ（%）。 */
export const GACHA_RATES: Record<Rarity, number> = { N: 50, R: 30, SR: 14, SSR: 5, UR: 1, EX: 0.6 };
/** SSR 以上が来ないままこの回数目になると、かならず SSR 以上（天井）。 */
export const PITY_PULLS = 50;
/** わざのレベルが最大のときに、また出たら返すちゅ〜る。 */
export const WAZA_REFUND: Record<Rarity, number> = { N: 1, R: 2, SR: 5, SSR: 15, UR: 40, EX: 60 };

export interface PullResult {
  wazaId: string;
  rarity: Rarity;
  /** はじめて覚えた。 */
  isNew: boolean;
  /** このあとのわざのレベル。 */
  level: number;
  /** レベルが上がった（2回目以降で、まだ最大でなかった）。 */
  levelUp: boolean;
  /** レベルが最大だったので返したちゅ〜る（なければ 0）。 */
  refund: number;
  /** 天井（50回目）で SSR 以上になった。 */
  pity: boolean;
  /** 10回まとめての SR 以上のおまけ。 */
  guaranteed: boolean;
}

function rollFrom(rng: Rng, list: Rarity[]): Rarity {
  const total = list.reduce((s, r) => s + GACHA_RATES[r], 0);
  let x = rng() * total;
  for (const r of list) {
    x -= GACHA_RATES[r];
    if (x < 0) return r;
  }
  return list[list.length - 1];
}

/** ねこ福袋に入っている EX のわざ（エンドレスで手に入れたものだけ）。 */
export function exWazaPool(save: SaveData | null): string[] {
  if (!save) return [];
  return WAZAS.filter((w) => w.rarity === "EX" && save.exUnlocked.includes(w.id)).map((w) => w.id);
}

/** レアリティを抽選する。atLeast を指定すると、それ以上の中から（比率はそのまま）。ex が false なら EX は出ない。 */
export function rollRarity(rng: Rng, atLeast: Rarity = "N", ex = false): Rarity {
  return rollFrom(rng, RARITIES.filter((r) => RARITY_RANK[r] >= RARITY_RANK[atLeast] && (ex || r !== "EX")));
}

/** そのレアリティのわざから1つ（メイン・サブまとめて、同じ確率）。EX は手に入れたものだけ。 */
export function rollWazaOf(rng: Rng, rarity: Rarity, save: SaveData | null = null): string {
  const ex = exWazaPool(save);
  const pool = rarity === "EX" ? WAZAS.filter((w) => ex.includes(w.id)) : WAZAS.filter((w) => w.rarity === rarity);
  return pick(rng, pool.length ? pool : WAZAS.filter((w) => w.rarity === "UR")).id;
}

/** 表示用: レアリティごとの確率（0〜1）と、そのレアリティのわざごとの確率。 */
export function pullRates(save: SaveData | null = null): { rarity: Rarity; rate: number; wazas: { id: string; rate: number }[] }[] {
  const ex = exWazaPool(save);
  const list = RARITIES.filter((r) => r !== "EX" || ex.length > 0);
  const total = list.reduce((s, r) => s + GACHA_RATES[r], 0);
  return list.map((rarity) => {
    const rate = GACHA_RATES[rarity] / total;
    const pool = rarity === "EX" ? WAZAS.filter((w) => ex.includes(w.id)) : WAZAS.filter((w) => w.rarity === rarity);
    return { rarity, rate, wazas: pool.map((w) => ({ id: w.id, rate: rate / pool.length })) };
  });
}

/** 天井まであと何回か（次の1回が天井なら 1）。 */
export function pullsToPity(save: SaveData): number {
  return Math.max(1, PITY_PULLS - save.gachaPity);
}

export function pullCost(count: 1 | 10): number {
  return count === 10 ? PULL10_COST : PULL_COST * count;
}

export function canPull(save: SaveData, count: 1 | 10): Result {
  const cost = pullCost(count);
  if (save.churu < cost) return { ok: false, reason: `ちゅ〜るが足りません（あと ${cost - Math.floor(save.churu)}）` };
  return { ok: true, value: undefined };
}

/** わざを1つ手に入れる（レベル・おみやげの処理）。ちゅ〜るはここでは使わない。 */
export function gainWaza(save: SaveData, wazaId: string): Omit<PullResult, "pity" | "guaranteed"> {
  const def = WAZA_MAP[wazaId];
  const w = save.wazas[wazaId];
  if (!w) {
    save.wazas[wazaId] = { level: 1, count: 1 };
    return { wazaId, rarity: def.rarity, isNew: true, level: 1, levelUp: false, refund: 0 };
  }
  w.count++;
  if (w.level < MAX_WAZA_LEVEL) {
    w.level++;
    return { wazaId, rarity: def.rarity, isNew: false, level: w.level, levelUp: true, refund: 0 };
  }
  const refund = WAZA_REFUND[def.rarity];
  save.churu += refund;
  return { wazaId, rarity: def.rarity, isNew: false, level: w.level, levelUp: false, refund };
}

/** ねこ福袋を count 回あける。ちゅ〜るを使い、結果を順に返す（演出用）。 */
export function pull(save: SaveData, rng: Rng, count: 1 | 10): Result<PullResult[]> {
  const can = canPull(save, count);
  if (!can.ok) return can;
  save.churu -= pullCost(count);
  // 先にレアリティを全部決める（10回まとめての SR 以上のおまけのため）
  const rolls: { rarity: Rarity; pity: boolean; guaranteed: boolean }[] = [];
  let pity = save.gachaPity;
  const ex = exWazaPool(save).length > 0;
  for (let i = 0; i < count; i++) {
    let rarity: Rarity;
    let isPity = false;
    if (pity + 1 >= PITY_PULLS) {
      rarity = rollRarity(rng, "SSR", ex);
      isPity = true;
    } else {
      rarity = rollRarity(rng, "N", ex);
    }
    pity = RARITY_RANK[rarity] >= RARITY_RANK.SSR ? 0 : pity + 1;
    rolls.push({ rarity, pity: isPity, guaranteed: false });
  }
  if (count === 10 && !rolls.some((r) => RARITY_RANK[r.rarity] >= RARITY_RANK.SR)) {
    const last = rolls[rolls.length - 1];
    last.rarity = rollRarity(rng, "SR", ex);
    last.guaranteed = true;
    if (RARITY_RANK[last.rarity] >= RARITY_RANK.SSR) pity = 0;
  }
  save.gachaPity = pity;
  save.totalPulls += count;
  const out: PullResult[] = rolls.map((r) => ({
    ...gainWaza(save, rollWazaOf(rng, r.rarity, save)),
    pity: r.pity,
    guaranteed: r.guaranteed,
  }));
  return { ok: true, value: out };
}
