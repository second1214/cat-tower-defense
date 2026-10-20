// 虫の定義（ステージ倍率を掛ける前の基本の強さ）。
import type { BugDef } from "../core/types";

export interface BugInfo extends BugDef {
  desc: string;
  /** このステージ（通し番号 0 始まり）から出てくる。 */
  from: number;
}

export const BUGS: BugInfo[] = [
  { id: "ari", name: "アリ", hp: 5, atk: 1, speed: 0.5, atkInterval: 1, drop: 6, from: 0, desc: "列になってやってくる。お菓子のにおいが好き。" },
  { id: "ka", name: "カ", hp: 3, atk: 0.5, speed: 0.8, atkInterval: 0.8, drop: 6, fly: true, from: 2, desc: "ぷーん。壁を飛びこえる。" },
  { id: "gokiburi", name: "ゴキブリ", hp: 8, atk: 1.5, speed: 1.2, atkInterval: 1, drop: 9, from: 5, desc: "とにかく速い。ママがいちばん嫌いな虫。" },
  { id: "kamemushi", name: "カメムシ", hp: 20, atk: 1, speed: 0.35, atkInterval: 1.2, drop: 12, from: 9, desc: "かたくて、くさい。" },
  { id: "kumo", name: "クモ", hp: 12, atk: 2, speed: 0.6, atkInterval: 1, drop: 9, from: 14, desc: "かじる力が強い。" },
  { id: "imomushi", name: "イモムシ", hp: 35, atk: 1, speed: 0.25, atkInterval: 1.5, drop: 15, from: 20, desc: "のんびりだけど、体力がすごい。" },
  { id: "kogane", name: "コガネムシ", hp: 15, atk: 2, speed: 0.5, atkInterval: 1, drop: 12, fly: true, from: 28, desc: "ぶーんと飛んでくる、かたい虫。" },
  { id: "kabuto", name: "カブトムシ", hp: 60, atk: 4, speed: 0.3, atkInterval: 1.2, drop: 24, from: 38, desc: "大きくて力もち。壁をすぐにこわす。" },
  { id: "suzumebachi", name: "スズメバチ", hp: 300, atk: 6, speed: 0.35, atkInterval: 1, drop: 90, fly: true, boss: true, from: 9, desc: "ボス。ぶんぶんと飛んでくる。" },
  { id: "mukade", name: "ムカデ", hp: 500, atk: 8, speed: 0.3, atkInterval: 1, drop: 120, boss: true, from: 19, desc: "ボス。にょろにょろ、とてもしぶとい。" },
];

export const BUG_MAP: Record<string, BugInfo> = Object.fromEntries(BUGS.map((b) => [b.id, b]));

/** 戦闘に渡す形（BugDef だけ）。 */
export function bugDefs(): Record<string, BugDef> {
  const r: Record<string, BugDef> = {};
  for (const b of BUGS) {
    const { desc: _d, from: _f, ...def } = b;
    r[b.id] = def;
  }
  return r;
}
