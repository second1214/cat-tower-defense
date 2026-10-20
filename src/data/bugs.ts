// 虫の定義（ステージ倍率を掛ける前の基本の強さ）。
import type { BugDef } from "../core/types";

export interface BugInfo extends BugDef {
  desc: string;
  /** このステージ（通し番号 0 始まり）から出てくる。 */
  from: number;
}

// 盤面は 14×18（マスは小さめ）。虫はゆっくり、そのかわり次々にたくさん出てくる。
// 体力は1匹ずつは低め（範囲・連鎖・毒でまとめて倒すと気持ちいい）。飛ぶ・障害物を無視する虫はいない。
export const BUGS: BugInfo[] = [
  { id: "ari", name: "アリ", hp: 2, atk: 1, speed: 0.45, atkInterval: 1, drop: 2, from: 0, desc: "列になってやってくる。お菓子のにおいが好き。" },
  { id: "ka", name: "カ", hp: 1.2, atk: 0.5, speed: 0.5, atkInterval: 0.8, drop: 2, from: 2, desc: "ぷーん。床すれすれをすばしっこく。" },
  { id: "gokiburi", name: "ゴキブリ", hp: 3, atk: 1.5, speed: 0.55, atkInterval: 1, drop: 3, from: 5, desc: "とにかく速い。ママがいちばん嫌いな虫。" },
  { id: "kamemushi", name: "カメムシ", hp: 7, atk: 1, speed: 0.35, atkInterval: 1.2, drop: 4, from: 9, desc: "かたくて、くさい。" },
  { id: "kumo", name: "クモ", hp: 4, atk: 2, speed: 0.45, atkInterval: 1, drop: 3, from: 14, desc: "かじる力が強い。" },
  { id: "imomushi", name: "イモムシ", hp: 12, atk: 1, speed: 0.2, atkInterval: 1.5, drop: 5, from: 20, desc: "のんびりだけど、体力がすごい。" },
  { id: "kogane", name: "コガネムシ", hp: 5, atk: 2, speed: 0.4, atkInterval: 1, drop: 4, from: 28, desc: "ぶーんと床を歩いてくる、かたい虫。" },
  { id: "kabuto", name: "カブトムシ", hp: 20, atk: 4, speed: 0.3, atkInterval: 1.2, drop: 8, from: 38, desc: "大きくて力もち。壁をすぐにこわす。" },
  { id: "suzumebachi", name: "スズメバチ", hp: 220, atk: 6, speed: 0.25, atkInterval: 1, drop: 40, boss: true, from: 9, desc: "ボス。低くぶんぶん、道にそってせまってくる。" },
  { id: "mukade", name: "ムカデ", hp: 380, atk: 8, speed: 0.25, atkInterval: 1, drop: 50, boss: true, from: 19, desc: "ボス。にょろにょろ、とてもしぶとい。" },
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
