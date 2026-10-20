// 開発用: 手作りのデータで戦闘をすぐ試すための Loadout（本番では core の buildLoadout を使う）。
import type { BugDef, CharRole, Loadout, ResolvedChar, ResolvedObject, StageDef } from "../core/types";

/** 特殊技能なしの値（ちょっとだけ入れておく）。 */
const SPECIAL = {
  crit: 0.1, critMul: 2, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slowHit: 1, pierce: 0,
  kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 1, dodge: 0,
} satisfies Partial<ResolvedChar>;

const CHARS: Record<CharRole, ResolvedChar> = {
  melee: { id: "chatora", name: "ちゃとら", role: "melee", maxHp: 30, atk: 2, atkInterval: 0.8, range: 0.9, aoe: 0, moveSpeed: 2.5, restTime: 5, armor: 1, ...SPECIAL, knockback: 0.5 },
  ranged: { id: "mike", name: "みけ", role: "ranged", maxHp: 18, atk: 1.5, atkInterval: 1.0, range: 3, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 1, ...SPECIAL, pierce: 1 },
  fast: { id: "kuro", name: "くろ", role: "fast", maxHp: 20, atk: 1.3, atkInterval: 0.6, range: 0.9, aoe: 0, moveSpeed: 3.6, restTime: 4, armor: 1, ...SPECIAL, multiHit: 0.3, dodge: 0.15 },
  aoe: { id: "shiro", name: "しろ", role: "aoe", maxHp: 22, atk: 1.2, atkInterval: 1.3, range: 1.2, aoe: 1.0, moveSpeed: 2.2, restTime: 5, armor: 1, ...SPECIAL, poison: 0.3 },
};

function obj(o: Partial<ResolvedObject> & Pick<ResolvedObject, "id" | "name" | "kind">): ResolvedObject {
  return {
    cost: 20, maxHp: 10, atk: 0, interval: 1, range: 1, slow: 1, produce: 0, cooldown: 4,
    upgradeCost: 15, upgradeMul: 1.5, block: true, ...o,
  };
}

const OBJECTS: ResolvedObject[] = [
  obj({ id: "danboru", name: "段ボールの壁", kind: "wall", cost: 8, maxHp: 40, cooldown: 0.6 }),
  obj({ id: "wagomu", name: "輪ゴム鉄砲", kind: "shooter", cost: 25, maxHp: 10, atk: 2, interval: 1.0, range: 2.5, cooldown: 2 }),
  obj({ id: "tape", name: "粘着テープ", kind: "slow", cost: 20, maxHp: 25, atk: 0.3, interval: 1, range: 0.9, slow: 0.5, cooldown: 4, block: false }),
  obj({ id: "esara", name: "猫の餌皿", kind: "producer", cost: 30, maxHp: 15, interval: 5, produce: 6, cooldown: 8, upgradeMul: 1.3 }),
  obj({ id: "nezumitori", name: "ねずみ捕り", kind: "mine", cost: 25, maxHp: 10, atk: 15, cooldown: 5, block: false }),
];

const BUGS: Record<string, BugDef> = {
  ari: { id: "ari", name: "アリ", hp: 5, atk: 1, speed: 0.5, atkInterval: 1, drop: 2 },
  ka: { id: "ka", name: "カ", hp: 3, atk: 0.5, speed: 0.8, atkInterval: 0.8, drop: 2, fly: true },
  gokiburi: { id: "gokiburi", name: "ゴキブリ", hp: 8, atk: 1.5, speed: 1.2, atkInterval: 1, drop: 3 },
  suzumebachi: { id: "suzumebachi", name: "スズメバチ", hp: 60, atk: 3, speed: 0.35, atkInterval: 1, drop: 30, fly: true, boss: true },
};

const STAGE: StageDef = {
  id: "demo",
  chapter: 3,
  index: 1,
  name: "ためしの部屋",
  hpMul: 1,
  atkMul: 1,
  startKibble: 120,
  kibblePerSec: 0,
  obstacles: [{ col: 1, row: 4, kind: "plant" }, { col: 5, row: 3, kind: "shelf" }, { col: 2, row: 7, kind: "sofa" }, { col: 4, row: 6, kind: "table" }],
  waves: [
    { at: 4, bugs: [{ bug: "ari", count: 8, every: 1.6 }] },
    { at: 20, bugs: [{ bug: "ari", count: 8, every: 1.2 }, { bug: "ka", count: 5, every: 2 }] },
    { at: 40, bugs: [{ bug: "gokiburi", count: 6, every: 1.5 }, { bug: "ka", count: 6, every: 1.5 }, { bug: "suzumebachi", count: 1, every: 1, lanes: [3] }] },
  ],
  rewards: { exp: 10, coins: 10, relicPoints: 1, churu: 1, equipDrops: 0, objectDrops: 1 },
};

/** 開発用の Loadout。role で猫を選べる。 */
export function demoLoadout(role: CharRole = "melee"): Loadout {
  return {
    char: { ...(CHARS[role] ?? CHARS.melee) },
    objects: OBJECTS.map((o) => ({ ...o })),
    stage: { ...STAGE, waves: STAGE.waves.map((w) => ({ ...w, bugs: w.bugs.map((b) => ({ ...b })) })) },
    bugs: { ...BUGS },
    global: { kibbleMul: 1, startKibbleAdd: 0, mamaHp: 5 },
  };
}
