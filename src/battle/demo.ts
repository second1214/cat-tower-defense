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
    cost: 20, maxHp: 10, atk: 0, interval: 1, range: 1, slow: 1, produce: 0, cooldown: 0,
    upgradeCost: 15, upgradeMul: 1.5, block: true, w: 1, h: 1,
    multishot: 0, spread: 0, pierce: 0, splash: 0, chain: 0, chainRange: 0, poison: 0, poisonSpread: 0,
    knockback: 0, crit: 0, critMul: 1, perks: [], ...o,
  };
}

const OBJECTS: ResolvedObject[] = [
  obj({ id: "danboru", name: "段ボールの壁", kind: "wall", cost: 6, maxHp: 40 }),
  obj({ id: "wagomu", name: "輪ゴム鉄砲", kind: "shooter", cost: 30, maxHp: 10, atk: 1.6, interval: 0.7, range: 3.5, w: 2, h: 2,
    multishot: 2, spread: 0.6, pierce: 1, crit: 0.15, critMul: 2.5, perks: ["拡散 +2", "貫通 1", "会心 15%"] }),
  obj({ id: "shitajiki", name: "静電気の下敷き", kind: "zap", cost: 35, maxHp: 10, atk: 2, interval: 1.1, range: 2.8,
    chain: 5, chainRange: 1.8, perks: ["電撃チェイン 5"] }),
  obj({ id: "katorisenko", name: "蚊取り線香", kind: "poison", cost: 30, maxHp: 10, atk: 1, interval: 1.5, range: 2,
    poison: 1, poisonSpread: 1.3, perks: ["毒の伝染 1.3"] }),
  obj({ id: "soujiki", name: "掃除機", kind: "aoe", cost: 45, maxHp: 20, atk: 2.5, interval: 1.6, range: 1.8, w: 2, h: 2,
    slow: 0.7, knockback: 0.4, perks: ["吸い込み（遅くする）", "ノックバック"] }),
];

const BUGS: Record<string, BugDef> = {
  ari: { id: "ari", name: "アリ", hp: 3, atk: 1, speed: 0.55, atkInterval: 1, drop: 1 },
  ka: { id: "ka", name: "カ", hp: 2, atk: 0.5, speed: 0.75, atkInterval: 0.8, drop: 1 },
  gokiburi: { id: "gokiburi", name: "ゴキブリ", hp: 6, atk: 1.5, speed: 0.9, atkInterval: 1, drop: 2 },
  suzumebachi: { id: "suzumebachi", name: "スズメバチ", hp: 150, atk: 3, speed: 0.3, atkInterval: 1, drop: 30, boss: true },
};

const STAGE: StageDef = {
  id: "demo",
  chapter: 3,
  index: 1,
  name: "ためしの部屋",
  hpMul: 1,
  atkMul: 1,
  startKibble: 160,
  kibblePerSec: 0,
  obstacles: [
    { col: 1, row: 4, kind: "plant", w: 1, h: 1 }, { col: 9, row: 3, kind: "shelf", w: 2, h: 1 },
    { col: 2, row: 9, kind: "sofa", w: 3, h: 1 }, { col: 9, row: 10, kind: "table", w: 2, h: 2 },
    { col: 12, row: 14, kind: "basket", w: 1, h: 1 },
  ],
  waves: [
    { at: 3, bugs: [{ bug: "ari", count: 40, every: 0.35 }] },
    { at: 22, bugs: [{ bug: "ari", count: 60, every: 0.2 }, { bug: "ka", count: 40, every: 0.3 }] },
    { at: 45, bugs: [{ bug: "gokiburi", count: 60, every: 0.25 }, { bug: "ka", count: 80, every: 0.15 }, { bug: "ari", count: 80, every: 0.15 }] },
    { at: 75, bugs: [{ bug: "gokiburi", count: 80, every: 0.2 }, { bug: "ari", count: 120, every: 0.1 }, { bug: "suzumebachi", count: 1, every: 1, lanes: [6, 7] }] },
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
    global: { kibbleMul: 1, startKibbleAdd: 0, mamaHp: 10 },
  };
}
