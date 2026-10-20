// 譲渡会会場（ガチャ）。ちゅ〜るを持って譲渡会に行き、猫をお迎えする。
// 同じ猫とまた会えたら「なかよし度」が上がる（最大5）。それ以上はちゅ〜るにして返す（おみやげ）。
import { type Rng, pick } from "./rng";
import { type SaveData, newCharSave } from "./save";
import { CHARS, CHAR_MAP, CHAR_RARITIES, MAX_BOND, RARITY_RANK, type CharRarity } from "../data/chars";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };

/** 1回のちゅ〜る。 */
export const PULL_COST = 10;
/** 10回まとめてのちゅ〜る（1回ぶんおとく）。 */
export const PULL10_COST = 90;
/** レアリティごとの出やすさ（%）。 */
export const GACHA_RATES: Record<CharRarity, number> = { N: 50, R: 30, SR: 14, SSR: 5, UR: 1 };
/** SSR 以上が来ないままこの回数目になると、かならず SSR 以上（天井）。 */
export const PITY_PULLS = 50;
/** なかよし度が最大の猫がまた来たときに返すちゅ〜る。 */
export const BOND_REFUND: Record<CharRarity, number> = { N: 1, R: 2, SR: 5, SSR: 15, UR: 40 };

export interface PullResult {
  charId: string;
  rarity: CharRarity;
  /** はじめてのお迎え。 */
  isNew: boolean;
  /** このあとのなかよし度。 */
  bond: number;
  /** なかよし度が上がった（2回目以降で、まだ最大でなかった）。 */
  bondUp: boolean;
  /** なかよし度が最大だったので、返したちゅ〜る（なければ 0）。 */
  refund: number;
  /** 天井（50回目）で SSR 以上になった。 */
  pity: boolean;
  /** 10回まとめての SR 以上のおまけ。 */
  guaranteed: boolean;
}

function rollFrom(rng: Rng, list: CharRarity[]): CharRarity {
  const total = list.reduce((s, r) => s + GACHA_RATES[r], 0);
  let x = rng() * total;
  for (const r of list) {
    x -= GACHA_RATES[r];
    if (x < 0) return r;
  }
  return list[list.length - 1];
}

/** レアリティを抽選する。atLeast を指定すると、それ以上の中から（比率はそのまま）。 */
export function rollRarity(rng: Rng, atLeast: CharRarity = "N"): CharRarity {
  return rollFrom(rng, CHAR_RARITIES.filter((r) => RARITY_RANK[r] >= RARITY_RANK[atLeast]));
}

/** そのレアリティの猫から1匹。 */
export function rollCharOf(rng: Rng, rarity: CharRarity): string {
  const pool = CHARS.filter((c) => c.rarity === rarity);
  return pick(rng, pool.length ? pool : CHARS).id;
}

/** 表示用: レアリティごとの確率（0〜1）と、そのレアリティの猫ごとの確率。 */
export function pullRates(): { rarity: CharRarity; rate: number; chars: { id: string; rate: number }[] }[] {
  const total = CHAR_RARITIES.reduce((s, r) => s + GACHA_RATES[r], 0);
  return CHAR_RARITIES.map((rarity) => {
    const rate = GACHA_RATES[rarity] / total;
    const pool = CHARS.filter((c) => c.rarity === rarity);
    return { rarity, rate, chars: pool.map((c) => ({ id: c.id, rate: rate / pool.length })) };
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

/** 猫を1匹お迎えする（なかよし度・おみやげの処理）。ちゅ〜るはここでは使わない。 */
export function welcomeChar(save: SaveData, charId: string): Omit<PullResult, "pity" | "guaranteed"> {
  const def = CHAR_MAP[charId];
  const c = save.chars[charId];
  if (!c) {
    save.chars[charId] = newCharSave();
    return { charId, rarity: def.rarity, isNew: true, bond: 0, bondUp: false, refund: 0 };
  }
  if (c.bond < MAX_BOND) {
    c.bond++;
    return { charId, rarity: def.rarity, isNew: false, bond: c.bond, bondUp: true, refund: 0 };
  }
  const refund = BOND_REFUND[def.rarity];
  save.churu += refund;
  return { charId, rarity: def.rarity, isNew: false, bond: c.bond, bondUp: false, refund };
}

/** 譲渡会会場で count 匹お迎えする。ちゅ〜るを使い、結果を順に返す（演出用）。 */
export function pull(save: SaveData, rng: Rng, count: 1 | 10): Result<PullResult[]> {
  const can = canPull(save, count);
  if (!can.ok) return can;
  save.churu -= pullCost(count);
  // 先にレアリティを全部決める（10回まとめての SR 以上のおまけのため）
  const rolls: { rarity: CharRarity; pity: boolean; guaranteed: boolean }[] = [];
  let pity = save.gachaPity;
  for (let i = 0; i < count; i++) {
    let rarity: CharRarity;
    let isPity = false;
    if (pity + 1 >= PITY_PULLS) {
      rarity = rollRarity(rng, "SSR");
      isPity = true;
    } else {
      rarity = rollRarity(rng);
    }
    pity = RARITY_RANK[rarity] >= RARITY_RANK.SSR ? 0 : pity + 1;
    rolls.push({ rarity, pity: isPity, guaranteed: false });
  }
  if (count === 10 && !rolls.some((r) => RARITY_RANK[r.rarity] >= RARITY_RANK.SR)) {
    const last = rolls[rolls.length - 1];
    last.rarity = rollRarity(rng, "SR");
    last.guaranteed = true;
    if (RARITY_RANK[last.rarity] >= RARITY_RANK.SSR) pity = 0;
  }
  save.gachaPity = pity;
  save.totalPulls += count;
  const out: PullResult[] = rolls.map((r) => ({
    ...welcomeChar(save, rollCharOf(rng, r.rarity)),
    pity: r.pity,
    guaranteed: r.guaranteed,
  }));
  return { ok: true, value: out };
}
