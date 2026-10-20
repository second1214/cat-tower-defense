// たね（seed）つきの乱数。テストで同じ結果を出せるように。

/** 0 以上 1 未満を返す乱数関数。 */
export type Rng = () => number;

/** mulberry32。seed が同じなら毎回同じ並び。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0 〜 n-1 の整数。 */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** 配列から1つ選ぶ。 */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, arr.length)];
}

/** 重みつきで1つ選ぶ。 */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** min 以上 max 未満の小数。 */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}
