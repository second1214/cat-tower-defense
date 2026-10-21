// 開発用: 手作りのデータで戦闘をすぐ試すための Loadout（本番では core の buildLoadout を使う）。
// v5: URL の ?theme=kitchen|bedroom|washitsu|study|bath で部屋（床と家具）、?wall=1|2 で「難関」「大難関」を試せる。
// かじる虫（シロアリ）・かたい虫（コガネムシ）・群れ（ハエの大群）も出る。
import type { BugDef, CharRole, ComboId, Loadout, ResolvedChar, ResolvedObject, StageDef } from "../core/types";

/** 特殊技能なしの値（ちょっとだけ入れておく）。 */
const SPECIAL = {
  crit: 0.1, critMul: 2, multiHit: 0, lifesteal: 0, regen: 0, knockback: 0, poison: 0, slowHit: 1, pierce: 0,
  kibbleBonus: 0, objectAura: 0, repair: 0, reviveHp: 1, dodge: 0,
} satisfies Partial<ResolvedChar>;

const CHARS: Record<CharRole, ResolvedChar> = {
  melee: { id: "c1", look: "chatora", companion: false, combos: { knockSlam: 1, lastStand: 0.5 }, name: "ノルウェージャン", role: "melee", maxHp: 30, atk: 2, atkInterval: 0.8, range: 0.9, aoe: 0, moveSpeed: 2.5, restTime: 5, armor: 1, ...SPECIAL, knockback: 0.5 },
  ranged: { id: "c2", look: "mike", companion: false, combos: { pierceGrow: 0.3, critChain: 2 }, name: "みけ", role: "ranged", maxHp: 18, atk: 1.5, atkInterval: 1.0, range: 3, aoe: 0, moveSpeed: 2.3, restTime: 5, armor: 1, ...SPECIAL, pierce: 1 },
  fast: { id: "c3", look: "kuro", companion: false, combos: { frenzy: 0.08, dodgeCounter: 2 }, name: "くろ", role: "fast", maxHp: 20, atk: 1.3, atkInterval: 0.6, range: 0.9, aoe: 0, moveSpeed: 3.6, restTime: 4, armor: 1, ...SPECIAL, multiHit: 0.3, dodge: 0.15 },
  aoe: { id: "c4", look: "shiro", companion: false, combos: { shockwave: 0.4, poisonBurst: 1, zapVenom: 0.3 }, name: "しろ", role: "aoe", maxHp: 22, atk: 1.2, atkInterval: 1.3, range: 1.2, aoe: 1.0, moveSpeed: 2.2, restTime: 5, armor: 1, ...SPECIAL, poison: 0.3 },
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
  shiroari: { id: "shiroari", name: "シロアリ", hp: 8, atk: 1, speed: 0.5, atkInterval: 0.8, drop: 2, chew: 1.5 },
  kogane: { id: "kogane", name: "コガネムシ", hp: 14, atk: 1, speed: 0.45, atkInterval: 1, drop: 3, catResist: 0.3 },
  ka_hae: { id: "ka_hae", name: "ハエの大群", hp: 2, atk: 0.4, speed: 0.8, atkInterval: 1, drop: 1, pack: 4 },
};

/** 部屋ごとの家具（?theme=）。 */
const ROOMS: Record<string, StageDef["obstacles"]> = {
  living: [
    { col: 1, row: 4, kind: "plant", w: 1, h: 1 }, { col: 9, row: 3, kind: "shelf", w: 2, h: 1 },
    { col: 2, row: 9, kind: "sofa", w: 3, h: 1 }, { col: 9, row: 10, kind: "table", w: 2, h: 2 },
    { col: 12, row: 14, kind: "basket", w: 1, h: 1 }, { col: 5, row: 6, kind: "tv", w: 2, h: 1 },
  ],
  kitchen: [
    { col: 0, row: 4, kind: "fridge", w: 1, h: 2 }, { col: 3, row: 4, kind: "counter", w: 3, h: 1 }, { col: 9, row: 4, kind: "sink", w: 2, h: 1 },
    { col: 11, row: 4, kind: "stove", w: 2, h: 1 }, { col: 5, row: 10, kind: "table", w: 2, h: 2 }, { col: 4, row: 10, kind: "chair", w: 1, h: 1 },
    { col: 7, row: 11, kind: "chair", w: 1, h: 1 }, { col: 12, row: 12, kind: "boxes", w: 1, h: 1 },
  ],
  bedroom: [
    { col: 1, row: 5, kind: "bed", w: 2, h: 3 }, { col: 10, row: 4, kind: "tansu", w: 2, h: 1 }, { col: 6, row: 8, kind: "desk", w: 2, h: 1 },
    { col: 7, row: 9, kind: "chair", w: 1, h: 1 }, { col: 12, row: 11, kind: "plant", w: 1, h: 1 }, { col: 3, row: 13, kind: "basket", w: 1, h: 1 },
  ],
  washitsu: [
    { col: 5, row: 8, kind: "kotatsu", w: 3, h: 2 }, { col: 1, row: 4, kind: "tansu", w: 2, h: 1 }, { col: 11, row: 3, kind: "partition", w: 1, h: 3 },
    { col: 3, row: 12, kind: "pillar", w: 1, h: 1 }, { col: 10, row: 12, kind: "pillar", w: 1, h: 1 }, { col: 12, row: 9, kind: "plant", w: 1, h: 1 },
  ],
  study: [
    { col: 0, row: 3, kind: "bookshelf", w: 1, h: 4 }, { col: 4, row: 4, kind: "desk", w: 3, h: 1 }, { col: 5, row: 5, kind: "chair", w: 1, h: 1 },
    { col: 10, row: 7, kind: "piano", w: 3, h: 1 }, { col: 8, row: 11, kind: "boxes", w: 2, h: 1 }, { col: 2, row: 11, kind: "plant", w: 1, h: 1 },
  ],
  bath: [
    { col: 1, row: 4, kind: "bathtub", w: 3, h: 2 }, { col: 10, row: 4, kind: "washer", w: 1, h: 1 }, { col: 11, row: 4, kind: "sink", w: 2, h: 1 },
    { col: 6, row: 9, kind: "basket", w: 1, h: 1 }, { col: 11, row: 11, kind: "shelf", w: 2, h: 1 },
  ],
};

/** URL の値（開発用。DOM が無いときは null）。 */
function param(k: string): string | null {
  try { return new URLSearchParams(globalThis.location?.search ?? "").get(k); } catch { return null; }
}

const STAGE: StageDef = {
  id: "demo",
  chapter: 3,
  index: 1,
  name: "ためしの部屋",
  hpMul: 1,
  atkMul: 1,
  startKibble: 160,
  kibblePerSec: 0,
  waves: [
    { at: 3, bugs: [{ bug: "ari", count: 40, every: 0.35 }, { bug: "shiroari", count: 6, every: 3 }] },
    { at: 22, bugs: [{ bug: "ari", count: 60, every: 0.2 }, { bug: "ka", count: 40, every: 0.3 }, { bug: "kogane", count: 10, every: 1.5 }, { bug: "ka_hae", count: 6, every: 3 }] },
    { at: 45, bugs: [{ bug: "gokiburi", count: 60, every: 0.25 }, { bug: "ka", count: 80, every: 0.15 }, { bug: "ari", count: 80, every: 0.15 }] },
    { at: 75, bugs: [{ bug: "gokiburi", count: 80, every: 0.2 }, { bug: "ari", count: 120, every: 0.1 }, { bug: "suzumebachi", count: 1, every: 1, lanes: [6, 7] }] },
  ],
  rewards: { exp: 10, coins: 10, relicPoints: 1, churu: 1, equipDrops: 0, objectDrops: 1 },
};

/** ?theme= ・?wall= を反映したステージ。 */
function stageFromUrl(): StageDef {
  const theme = param("theme") ?? undefined;
  const w = Number(param("wall"));
  const st: StageDef = { ...STAGE, waves: STAGE.waves.map((wv) => ({ ...wv, bugs: wv.bugs.map((b) => ({ ...b })) })) };
  if (theme && ROOMS[theme]) { st.theme = theme; st.obstacles = ROOMS[theme]!.map((o) => ({ ...o })); }
  else st.obstacles = ROOMS.living!.map((o) => ({ ...o }));
  if (w === 1 || w === 2) st.wall = w;
  return st;
}

/** 相棒の強さ（core の COMPANION_POWER と同じ）。 */
const COMPANION_POWER = 0.6;

/** 相棒にする（攻撃・体力に COMPANION_POWER を掛ける）。 */
function asCompanion(c: ResolvedChar): ResolvedChar {
  return { ...c, companion: true, combos: { ...c.combos, partyLink: 0.2 } as Partial<Record<ComboId, number>>, atk: c.atk * COMPANION_POWER, maxHp: c.maxHp * COMPANION_POWER };
}

/** 開発用の Loadout。role で主人公を選べる。相棒は残りの役割から2匹。 */
export function demoLoadout(role: CharRole = "melee"): Loadout {
  const main = CHARS[role] ?? CHARS.melee;
  const others = (["ranged", "aoe", "fast", "melee"] as CharRole[]).filter((r) => r !== main.role).slice(0, 2);
  return {
    char: { ...main, combos: { ...main.combos } },
    companions: others.map((r) => asCompanion(CHARS[r])),
    objects: OBJECTS.map((o) => ({ ...o })),
    stage: stageFromUrl(),
    bugs: { ...BUGS },
    global: { kibbleMul: 1, startKibbleAdd: 0, mamaHp: 10 },
  };
}
