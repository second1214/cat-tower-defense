// 猫の定義とスキルツリー。
import type { CharRole, ResolvedChar } from "../core/types";

/** レベル1の基本ステータス。 */
export type CharBase = Omit<ResolvedChar, "id" | "name" | "role">;

export interface CharDef {
  id: string;
  name: string;
  role: CharRole;
  desc: string;
  /** このステージ（通し番号 1〜100）をクリアすると仲間になる。0 なら最初から。 */
  unlockStage: number;
  base: CharBase;
  /** 1レベルごとに掛ける倍率。 */
  growth: { hp: number; atk: number };
}

export const ROLE_NAMES: Record<CharRole, string> = {
  melee: "近接",
  ranged: "遠距離",
  aoe: "範囲",
  fast: "すばやい",
};

const G = { hp: 1.12, atk: 1.12 };

export const CHARS: CharDef[] = [
  {
    id: "chatora", name: "ちゃとら", role: "melee", unlockStage: 0,
    desc: "体が大きくてがんじょう。近くの虫をねこパンチ。",
    base: { maxHp: 30, atk: 2, atkInterval: 0.8, range: 0.9, aoe: 0, moveSpeed: 2.5, restTime: 5, armor: 1, pickupRange: 0.6 },
    growth: G,
  },
  {
    id: "mike", name: "みけ", role: "ranged", unlockStage: 0,
    desc: "離れたところから、ちょいちょいと手を出す。",
    base: { maxHp: 18, atk: 1.5, atkInterval: 1.0, range: 3, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 1, pickupRange: 0.6 },
    growth: G,
  },
  {
    id: "kuro", name: "くろ", role: "fast", unlockStage: 3,
    desc: "足がとても速い。カリカリを拾うのが得意。",
    base: { maxHp: 20, atk: 1.3, atkInterval: 0.6, range: 0.9, aoe: 0, moveSpeed: 3.6, restTime: 4, armor: 1, pickupRange: 1.2 },
    growth: G,
  },
  {
    id: "shiro", name: "しろ", role: "aoe", unlockStage: 6,
    desc: "しっぽをぶんぶん。まわりの虫をまとめてはらう。",
    base: { maxHp: 22, atk: 1.2, atkInterval: 1.3, range: 1.2, aoe: 1.0, moveSpeed: 2.2, restTime: 5, armor: 1, pickupRange: 0.6 },
    growth: G,
  },
  {
    id: "hachiware", name: "はちわれ", role: "melee", unlockStage: 12,
    desc: "どっしり構えて、かじられてもへっちゃら。",
    base: { maxHp: 45, atk: 2.4, atkInterval: 0.9, range: 0.9, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 0.85, pickupRange: 0.6 },
    growth: G,
  },
  {
    id: "sabatora", name: "さばとら", role: "ranged", unlockStage: 20,
    desc: "じっと狙って、遠くの虫にぴしっ。",
    base: { maxHp: 20, atk: 2.6, atkInterval: 1.2, range: 4, aoe: 0, moveSpeed: 2.2, restTime: 5, armor: 1, pickupRange: 0.6 },
    growth: G,
  },
  {
    id: "omochi", name: "おもち", role: "aoe", unlockStage: 30,
    desc: "もふもふの長い毛。ごろんと転がって虫をまとめてつぶす。",
    base: { maxHp: 28, atk: 1.6, atkInterval: 1.2, range: 1.3, aoe: 1.3, moveSpeed: 2.1, restTime: 5, armor: 0.95, pickupRange: 0.7 },
    growth: G,
  },
  {
    id: "komugi", name: "こむぎ", role: "fast", unlockStage: 45,
    desc: "家じゅうを走りまわる元気な子ねこ。",
    base: { maxHp: 22, atk: 1.6, atkInterval: 0.5, range: 0.9, aoe: 0, moveSpeed: 4.0, restTime: 3.5, armor: 1, pickupRange: 1.4 },
    growth: G,
  },
];

export const CHAR_MAP: Record<string, CharDef> = Object.fromEntries(CHARS.map((c) => [c.id, c]));

// ---- スキルツリー ----

/** スキル・装備・レリックで猫にかかる補正。mul は掛け算、add は足し算。 */
export interface CharMods {
  atkMul: number;
  hpMul: number;
  intervalMul: number;  // 攻撃の間隔に掛ける（小さいほど速い）
  rangeAdd: number;
  aoeAdd: number;
  moveMul: number;
  restMul: number;      // 休けい時間に掛ける
  armorMul: number;     // 受けるダメージに掛ける
  pickupAdd: number;
  objAtkMul: number;    // 置いたオブジェクトの攻撃に掛ける
}

export function emptyCharMods(): CharMods {
  return { atkMul: 1, hpMul: 1, intervalMul: 1, rangeAdd: 0, aoeAdd: 0, moveMul: 1, restMul: 1, armorMul: 1, pickupAdd: 0, objAtkMul: 1 };
}

/** 補正を重ねる（mul は掛け、add は足す）。 */
export function addCharMods(a: CharMods, b: Partial<CharMods>): CharMods {
  const r = { ...a };
  for (const k of Object.keys(b) as (keyof CharMods)[]) {
    const v = b[k];
    if (v === undefined) continue;
    if (k.endsWith("Add")) r[k] += v;
    else r[k] *= v;
  }
  return r;
}

export type SkillBranch = "atk" | "hp" | "spd" | "special";

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  branch: SkillBranch;
  cost: number;
  /** 先に取っておくスキル（すべて必要）。 */
  req: string[];
  effect: Partial<CharMods>;
  /** 画面での位置の目安（列・段）。 */
  pos: { x: number; y: number };
}

export const BRANCH_NAMES: Record<SkillBranch, string> = { atk: "攻撃", hp: "体力", spd: "速さ", special: "とっておき" };

/** 役割ごとに、3本の枝＋とっておき（11こ）を作る。 */
function tree(role: CharRole, defs: {
  atk: [string, string, Partial<CharMods>][];   // 4つ
  hp: [string, string, Partial<CharMods>][];    // 3つ
  spd: [string, string, Partial<CharMods>][];   // 3つ
  special: [string, string, Partial<CharMods>];
}): SkillNode[] {
  const nodes: SkillNode[] = [];
  const branchList: [SkillBranch, [string, string, Partial<CharMods>][], number][] = [
    ["atk", defs.atk, 0], ["hp", defs.hp, 1], ["spd", defs.spd, 2],
  ];
  for (const [branch, list, x] of branchList) {
    list.forEach(([name, desc, effect], i) => {
      const id = `${role}_${branch}${i + 1}`;
      nodes.push({
        id, name, desc, branch, effect,
        cost: i === list.length - 1 ? 2 : 1,
        req: i === 0 ? [] : [`${role}_${branch}${i}`],
        pos: { x, y: i },
      });
    });
  }
  const [name, desc, effect] = defs.special;
  nodes.push({
    id: `${role}_special`, name, desc, branch: "special", effect, cost: 2,
    req: [`${role}_atk${defs.atk.length}`, `${role}_hp${defs.hp.length}`],
    pos: { x: 1, y: 4 },
  });
  return nodes;
}

export const SKILL_TREES: Record<CharRole, SkillNode[]> = {
  melee: tree("melee", {
    atk: [
      ["つめとぎ", "攻撃 +20%", { atkMul: 1.2 }],
      ["ねこパンチ", "攻撃 +25%", { atkMul: 1.25 }],
      ["れんぞくパンチ", "攻撃の間隔 -10%", { intervalMul: 0.9 }],
      ["ぜんりょくパンチ", "攻撃 +50%", { atkMul: 1.5 }],
    ],
    hp: [
      ["よく食べる", "体力 +25%", { hpMul: 1.25 }],
      ["ぶあつい毛", "受けるダメージ -10%", { armorMul: 0.9 }],
      ["どっしり", "体力 +50%", { hpMul: 1.5 }],
    ],
    spd: [
      ["ひるねじょうず", "休けい時間 -15%", { restMul: 0.85 }],
      ["しのびあし", "移動 +10%", { moveMul: 1.1 }],
      ["とびかかり", "届く距離 +0.3", { rangeAdd: 0.3 }],
    ],
    special: ["ボスねこの貫禄", "攻撃 +30%・体力 +30%", { atkMul: 1.3, hpMul: 1.3 }],
  }),
  ranged: tree("ranged", {
    atk: [
      ["ねらいうち", "攻撃 +20%", { atkMul: 1.2 }],
      ["ちょいちょい", "攻撃の間隔 -10%", { intervalMul: 0.9 }],
      ["するどいつめ", "攻撃 +30%", { atkMul: 1.3 }],
      ["ひっさつ肉球", "攻撃 +50%", { atkMul: 1.5 }],
    ],
    hp: [
      ["毛づくろい", "体力 +25%", { hpMul: 1.25 }],
      ["さっとよける", "受けるダメージ -10%", { armorMul: 0.9 }],
      ["ひるねじょうず", "休けい時間 -25%", { restMul: 0.75 }],
    ],
    spd: [
      ["のびのび", "届く距離 +0.5", { rangeAdd: 0.5 }],
      ["かろやか", "移動 +10%", { moveMul: 1.1 }],
      ["ながい手", "届く距離 +0.8", { rangeAdd: 0.8 }],
    ],
    special: ["名ハンター", "攻撃 +40%・オブジェクトの攻撃 +15%", { atkMul: 1.4, objAtkMul: 1.15 }],
  }),
  aoe: tree("aoe", {
    atk: [
      ["しっぽふりふり", "攻撃 +20%", { atkMul: 1.2 }],
      ["ひろがる毛", "範囲 +0.2", { aoeAdd: 0.2 }],
      ["ぶんぶん", "攻撃 +30%", { atkMul: 1.3 }],
      ["だいかいてん", "攻撃 +40%・範囲 +0.3", { atkMul: 1.4, aoeAdd: 0.3 }],
    ],
    hp: [
      ["もふもふ", "体力 +30%", { hpMul: 1.3 }],
      ["ころころ", "受けるダメージ -10%", { armorMul: 0.9 }],
      ["まんまる", "体力 +50%", { hpMul: 1.5 }],
    ],
    spd: [
      ["せっかち", "攻撃の間隔 -10%", { intervalMul: 0.9 }],
      ["おさんぽ", "移動 +10%", { moveMul: 1.1 }],
      ["あわてんぼ", "攻撃の間隔 -15%", { intervalMul: 0.85 }],
    ],
    special: ["おうちの守り神", "攻撃 +30%・オブジェクトの攻撃 +20%", { atkMul: 1.3, objAtkMul: 1.2 }],
  }),
  fast: tree("fast", {
    atk: [
      ["すばやいつめ", "攻撃 +20%", { atkMul: 1.2 }],
      ["れんぱ", "攻撃の間隔 -10%", { intervalMul: 0.9 }],
      ["かけぬけパンチ", "攻撃 +30%", { atkMul: 1.3 }],
      ["いなずまパンチ", "攻撃 +50%", { atkMul: 1.5 }],
    ],
    hp: [
      ["げんきいっぱい", "体力 +25%", { hpMul: 1.25 }],
      ["ひらり", "受けるダメージ -15%", { armorMul: 0.85 }],
      ["すぐおきる", "休けい時間 -30%", { restMul: 0.7 }],
    ],
    spd: [
      ["はしりこみ", "移動 +15%", { moveMul: 1.15 }],
      ["くいしんぼう", "拾える距離 +0.4", { pickupAdd: 0.4 }],
      ["ダッシュ", "移動 +20%・拾える距離 +0.3", { moveMul: 1.2, pickupAdd: 0.3 }],
    ],
    special: ["家じゅうパトロール", "攻撃 +30%・移動 +10%", { atkMul: 1.3, moveMul: 1.1 }],
  }),
};

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(
  Object.values(SKILL_TREES).flat().map((n) => [n.id, n]),
);
