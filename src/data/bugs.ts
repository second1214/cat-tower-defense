// 虫の定義（ステージ倍率を掛ける前の基本の強さ）。
import type { BugDef } from "../core/types";

export interface BugInfo extends BugDef {
  desc: string;
  /** このステージ（通し番号 0 始まり）から出てくる。新しい「くせ」のある虫は、難関（章の5番目）・大難関（章のぬし）から。 */
  from: number;
}

// 盤面は 14×18（マスは小さめ）。虫はゆっくり、そのかわり次々にたくさん出てくる。
// 体力は1匹ずつは低め（範囲・連鎖・毒でまとめて倒すと気持ちいい）。飛ぶ・障害物を無視する虫はいない。
//
// くせ（難関で1つずつ増える。猫だけでは勝てないようにするため）:
// - かたい（catResist）: 猫の攻撃があまり効かない。オブジェクトのダメージはそのまま → オブジェクトが必要
// - かじる（chew）: 通れないオブジェクトをかじってこわし、まっすぐ進む → 壁だけにたよれない
// - 群れ（pack）: 横にならんで何匹も同時に出る → 猫1匹では手が足りない
// - 速い（speed が大きい）: 猫が追いつけない → 道ぞいに置いたオブジェクトで止める
//
// 通し番号と難関: 1-5 = 4、1-10 = 9、2-5 = 14、2-10 = 19、3-5 = 24、3-10 = 29、4-5 = 34、5-5 = 44 …
/**
 * 章ごとのぬし（ボス）の体力の倍率。ぬしは1匹ずつ（まとめて当てる範囲・拡散・連鎖があまり効かない）なので、
 * ふつうの虫（群れ）とは別に、ふつうに進めたときの「1匹に当てる強さ」に合わせる。
 */
export const BOSS_HP_SCALE = [0.17, 0.23, 0.43, 0.06, 0.09, 0.053, 0.09, 0.025, 0.03, 0.015];
/** ぬしはオブジェクトの攻撃が 0.35 倍しか効かない（battle/engine の BOSS_OBJ_MUL）ぶん、体力を下げてならす。 */
export const BOSS_RESIST_COMP = 0.5;

export const BUGS: BugInfo[] = [
  { id: "ari", name: "アリ", hp: 2, atk: 1, speed: 0.45, atkInterval: 1, drop: 2, from: 0, desc: "列になってやってくる。お菓子のにおいが好き。" },
  { id: "ka", name: "カ", hp: 1.2, atk: 0.5, speed: 0.5, atkInterval: 0.8, drop: 2, from: 2, desc: "ぷーん。床すれすれをすばしっこく。" },
  {
    id: "dangomushi", name: "ダンゴムシ", hp: 5, atk: 0.8, speed: 0.32, atkInterval: 1.2, drop: 3, from: 4, catResist: 0.3,
    desc: "まるくなると、からがかたい。猫パンチはあまり効かない。おもちゃで倒そう。",
  },
  { id: "gokiburi", name: "ゴキブリ", hp: 3, atk: 1.5, speed: 0.6, atkInterval: 1, drop: 3, from: 9, desc: "とにかく速い。ママがいちばん嫌いな虫。" },
  { id: "kamemushi", name: "カメムシ", hp: 7, atk: 1, speed: 0.35, atkInterval: 1.2, drop: 4, from: 11, desc: "かたくて、くさい。" },
  {
    id: "shiroari", name: "シロアリ", hp: 3, atk: 1.2, speed: 0.45, atkInterval: 0.8, drop: 3, from: 14, chew: 1.5,
    desc: "木も段ボールもかじってしまう。通れないオブジェクトをこわして、まっすぐ進む。",
  },
  { id: "kumo", name: "クモ", hp: 4, atk: 2, speed: 0.45, atkInterval: 1, drop: 3, from: 17, desc: "かじる力が強い。" },
  {
    id: "hae", name: "ハエ", hp: 1.5, atk: 0.6, speed: 0.55, atkInterval: 0.8, drop: 1, from: 19, pack: 4,
    desc: "ぶんぶん、4匹ならんで大群でやってくる。まとめて倒すおもちゃが役に立つ。",
  },
  {
    id: "kogane", name: "コガネムシ", hp: 6, atk: 2, speed: 0.4, atkInterval: 1, drop: 4, from: 24, catResist: 0.25,
    desc: "ぶーんと床を歩いてくる、かたい虫。猫の攻撃はほとんど効かない。",
  },
  { id: "imomushi", name: "イモムシ", hp: 12, atk: 1, speed: 0.2, atkInterval: 1.5, drop: 5, from: 27, desc: "のんびりだけど、体力がすごい。" },
  {
    id: "gejigeji", name: "ゲジ", hp: 3, atk: 1, speed: 0.95, atkInterval: 0.7, drop: 3, from: 29,
    desc: "長い足で、すごい速さで走りぬける。猫では追いつけない。",
  },
  {
    id: "kabuto", name: "カブトムシ", hp: 16, atk: 4, speed: 0.3, atkInterval: 1.2, drop: 7, from: 34, catResist: 0.3, chew: 1,
    desc: "大きくて力もち。かたいうえに、壁もかじってこわす。",
  },
  {
    id: "kuwagata", name: "クワガタ", hp: 14, atk: 4, speed: 0.38, atkInterval: 1, drop: 7, from: 44, catResist: 0.2, chew: 2,
    desc: "大きなあごで、オブジェクトをはさんでこわす。からはとてもかたい。",
  },
  ...makeBosses(),
];

/** 章ごとのぬし: 奇数の章はハチ、偶数の章はムカデ（後の章ほど大物）。id の頭が絵の形（suzumebachi / mukade）。 */
function makeBosses(): BugInfo[] {
  const hornets = ["スズメバチ", "オオスズメバチ", "キイロスズメバチ", "クロスズメバチ", "女王スズメバチ"];
  const centis = ["ムカデ", "オオムカデ", "トビズムカデ", "アオズムカデ", "ムカデの親分"];
  const out: BugInfo[] = [];
  for (let ch = 1; ch <= 10; ch++) {
    const hornet = ch % 2 === 1;
    const k = Math.floor((ch - 1) / 2);
    out.push({
      id: bossIdOf(ch),
      name: hornet ? hornets[k] : centis[k],
      hp: (hornet ? 220 : 380) * BOSS_HP_SCALE[ch - 1] * BOSS_RESIST_COMP,
      atk: hornet ? 6 : 8,
      speed: 0.25,
      atkInterval: 1,
      drop: hornet ? 40 : 50,
      boss: true,
      from: ch * 10 - 1,
      desc: hornet ? `${ch}章のぬし。低くぶんぶん、道にそってせまってくる。` : `${ch}章のぬし。にょろにょろ、とてもしぶとい。`,
    });
  }
  return out;
}

/** 章のぬしの id（1章 "suzumebachi"、2章 "mukade"、3章から "suzumebachi_3" など）。 */
export function bossIdOf(chapter: number): string {
  const base = chapter % 2 === 1 ? "suzumebachi" : "mukade";
  return chapter <= 2 ? base : `${base}_${chapter}`;
}

export const BUG_MAP: Record<string, BugInfo> = Object.fromEntries(BUGS.map((b) => [b.id, b]));

/** くせのある虫か（かたい・かじる・群れ・速い）。難関で多めに出す。 */
export function isTraitBug(b: BugDef): boolean {
  return !b.boss && ((b.catResist ?? 1) < 1 || (b.chew ?? 0) > 0 || (b.pack ?? 1) > 1 || b.speed >= 0.6);
}

/** 戦闘に渡す形（BugDef だけ）。 */
export function bugDefs(): Record<string, BugDef> {
  const r: Record<string, BugDef> = {};
  for (const b of BUGS) {
    const { desc: _d, from: _f, ...def } = b;
    r[b.id] = def;
  }
  return r;
}
