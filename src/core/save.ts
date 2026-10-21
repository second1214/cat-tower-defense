// セーブデータ（localStorage に保存。テストなど localStorage がないときは何もしない）。
import type { CharRole, Personality } from "./types";
import { CAT_LOOKS, CHARS, CHAR_MAP, MAX_BOND, MAX_CAT_NAME } from "../data/chars";
import { OBJECTS } from "../data/objects";
import { SKILL_MAP } from "../data/skills";
import { isPersonality } from "../data/personality";
import { DEFAULT_MAIN_WAZA, MAX_SUBS, MAX_WAZA_LEVEL, STARTER_WAZAS, WAZA_MAP } from "../data/waza";
import type { EquipItem, EquipSlot } from "../data/equips";

export type { EquipItem, EquipSlot } from "../data/equips";

/**
 * v1: スキルは id の配列・スキルポイント。v2: スキルは猫ごとに id → レベル・ちゅ〜る・譲渡会会場。
 * v3: うちの子（cats）・パーティ・わざ・スキルは家族で共有（役割ごと）。
 */
export const SAVE_VERSION = 3;
export const SAVE_KEY = "cat-tower-defense/save";
export const MAX_LOADOUT = 5;
/** はじめにもらえるちゅ〜る（すぐにねこ福袋を1回ためせる）。 */
export const START_CHURU = 30;
/** うちの子の最大数（古いセーブから引きついだ猫もふくむ）。 */
export const MAX_CATS = 30;
/** パーティの枠（主人公・相棒1・相棒2）。 */
export const PARTY_SIZE = 3;
export const ROLES: CharRole[] = ["melee", "ranged", "aoe", "fast"];

export interface CatSave {
  uid: string;
  name: string;
  look: string;                 // 見た目（絵の id）
  personality: Personality;
  preset?: string;              // 古いセーブから引きついだ猫なら、そのひな形の id（data/chars.ts）
  level: number;
  exp: number;                  // いまのレベルでたまっている経験値
  bond: number;                 // なかよし度（0〜5）
  bondExp: number;              // 次のなかよし度までの戦闘の回数
  waza: { main: string; subs: string[] };
}

export interface WazaSave {
  level: number;                // 1〜5
  count: number;                // これまで手に入れた数
}

export interface ObjectSave {
  level: number;
  shards: number;       // いまたまっているかけら
}

export interface SaveData {
  version: number;
  coins: number;
  relicPoints: number;
  churu: number;                         // ちゅ〜る（スキル・ねこ福袋に使う）
  cats: Record<string, CatSave>;         // uid → 猫
  party: string[];                       // [主人公, 相棒1, 相棒2] の uid（相棒は空きでもよい。空きは詰める）
  nextCatUid: number;                    // 猫の uid の連番（"c1" "c2" …）
  wazas: Record<string, WazaSave>;       // 覚えたわざ
  skills: Record<CharRole, Record<string, number>>;  // 役割 → スキルノードの id → 取ったレベル（0 のものは入れない）
  setupDone: boolean;                    // 初回の登録（1匹目の名前・見た目・性格）がすんだ
  objects: Record<string, ObjectSave>;   // 持っているオブジェクトだけ入る
  loadout: string[];                     // 戦闘に持っていくオブジェクト（最大5）
  equips: EquipItem[];                   // 手持ちの装備（つけているものも入る）
  equipped: Partial<Record<EquipSlot, string>>;  // 枠 → 装備の uid
  relics: string[];                      // 解放したレリックの id
  cleared: number;                       // クリアした一番先のステージ（通し番号 0 始まり）。-1 はまだ
  clearCounts: Record<string, number>;   // ステージ id → クリア回数
  selectedStage: string;                 // メイン画面で選んでいるステージ
  nextUid: number;                       // 装備の uid の連番
  seed: number;                          // 抽選に使う乱数のたね（UI 用）
  gachaPity: number;                     // ねこ福袋: SSR 以上が来ないまま続いた回数（天井用）
  totalPulls: number;                    // ねこ福袋: これまでの回数
}

/** 新しい猫のデータ。 */
export function newCatSave(
  uid: string, name: string, look: string, personality: Personality, main = DEFAULT_MAIN_WAZA, preset?: string,
): CatSave {
  const c: CatSave = { uid, name, look, personality, level: 1, exp: 0, bond: 0, bondExp: 0, waza: { main, subs: [] } };
  if (preset) c.preset = preset;
  return c;
}

export function emptySkills(): Record<CharRole, Record<string, number>> {
  return { melee: {}, ranged: {}, aoe: {}, fast: {} };
}

/** はじめからのデータ。初回の登録の前でも遊べるように、仮の1匹（c1）がいる。 */
export function newSave(): SaveData {
  const objects: Record<string, ObjectSave> = {};
  for (const o of OBJECTS) if (o.unlockStage <= 0) objects[o.id] = { level: 1, shards: 0 };
  const wazas: Record<string, WazaSave> = {};
  for (const id of STARTER_WAZAS) wazas[id] = { level: 1, count: 1 };
  return {
    version: SAVE_VERSION,
    coins: 0,
    relicPoints: 0,
    churu: START_CHURU,
    cats: { c1: newCatSave("c1", "ノルウェージャン", "chatora", CHAR_MAP.chatora.personality, "nekopunch") },
    party: ["c1"],
    nextCatUid: 2,
    wazas,
    skills: emptySkills(),
    setupDone: false,
    objects,
    loadout: Object.keys(objects).slice(0, MAX_LOADOUT),
    equips: [],
    equipped: {},
    relics: [],
    cleared: -1,
    clearCounts: {},
    selectedStage: "1-1",
    nextUid: 1,
    seed: (Date.now() ^ 0x5eed) >>> 0,
    gachaPity: 0,
    totalPulls: 0,
  };
}

function storage(): Storage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

const num = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? v : d);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// ================= 古いスキル（v2 まで）のちゅ〜るを返す =================

/** v2 のスキルノード: [段, 基本のちゅ〜る, 最大レベル]。v2 のコストは round(基本 × 1.8^段 × 1.3^レベル)。 */
const V2_NODES: Record<string, [number, number, number]> = {
  root: [0, 2, 1], atk1: [0, 3, 10], aspd1: [1, 3, 10], crit1: [1, 6, 5], atk2: [2, 3, 10], critm1: [2, 6, 5],
  aspd2: [3, 3, 10], honki: [3, 6, 5], atk3: [4, 3, 10], crit2: [5, 6, 5], atk4: [6, 3, 10], atkcap: [7, 12, 3],
  critcap: [7, 12, 1], hp1: [0, 3, 10], armor1: [1, 3, 10], regen1: [1, 6, 5], hp2: [2, 3, 10], dodge1: [2, 6, 5],
  steal1: [3, 6, 5], revive1: [3, 6, 5], hp3: [4, 3, 10], armor2: [4, 3, 10], regen2: [5, 6, 5], hp4: [6, 3, 10],
  defcap: [7, 12, 3], move1: [0, 3, 10], rest1: [1, 6, 5], aspd3: [1, 3, 10], reach1: [2, 6, 5], rest2: [3, 6, 5],
  move2: [3, 3, 10], aspd4: [4, 3, 10], reach2: [5, 6, 5], rest3: [6, 6, 5], aspd5: [6, 3, 10], spdcap: [7, 12, 3],
  kb1: [0, 6, 5], poison1: [1, 6, 5], slow1: [1, 6, 5], poison2: [3, 6, 5], slow2: [3, 6, 5], steal2: [5, 6, 5],
  slow3: [5, 6, 5], kibble1: [0, 3, 10], obj1: [1, 3, 10], repair1: [1, 6, 5], aura1: [2, 6, 5], obj2: [3, 3, 10],
  repair2: [3, 6, 5], kibble2: [4, 3, 10], objhp1: [4, 3, 10], aura2: [5, 6, 5], obj3: [6, 3, 10], supcap: [7, 12, 3],
  // 役割ごとの得意技
  "melee.kb2": [2, 6, 5], "melee.multi1": [4, 30, 1], "melee.guard": [6, 6, 5], "melee.techcap": [7, 30, 1],
  "ranged.pierce1": [2, 10, 2], "ranged.aim": [4, 6, 5], "ranged.pierce2": [6, 20, 1], "ranged.techcap": [7, 12, 3],
  "aoe.wide1": [2, 6, 5], "aoe.spin": [4, 6, 5], "aoe.roll": [6, 6, 5], "aoe.techcap": [7, 20, 1],
  "fast.dash": [2, 6, 5], "fast.multi1": [4, 30, 1], "fast.patrol": [6, 12, 3], "fast.techcap": [7, 30, 1],
};

function v2Node(id: string): [number, number, number] | null {
  const m = /^(melee|ranged|aoe|fast)\.(\w+)$/.exec(id);
  if (!m) return null;
  return V2_NODES[id] ?? (m[2] in V2_NODES ? V2_NODES[m[2]] : null);
}

/** v2 のノードを Lv0 から level まで上げたちゅ〜る。知らないノードは 0。 */
export function v2SkillCost(id: string, level: number): number {
  const n = v2Node(id);
  if (!n) return 0;
  const [tier, base, max] = n;
  let s = 0;
  for (let i = 0; i < Math.min(max, Math.max(0, Math.floor(level))); i++) {
    s += Math.round(base * Math.pow(1.8, tier) * Math.pow(1.3, i));
  }
  return s;
}

/** v1 のスキル id（例: "melee_atk2"）を、v2 のノードに読みかえる。 */
export function legacySkillId(oldId: string): string | null {
  const m = /^(melee|ranged|aoe|fast)_(atk|hp|spd|special)(\d*)$/.exec(oldId);
  if (!m) return null;
  const table: Record<string, string[]> = {
    atk: ["atk1", "aspd1", "atk2", "honki"],
    hp: ["hp1", "armor1", "hp2"],
    spd: ["move1", "rest1", "reach1"],
    special: ["kb1"],
  };
  const k = table[m[2]][m[3] ? Number(m[3]) - 1 : 0];
  return k ? `${m[1]}.${k}` : null;
}

/** v1・v2 の猫1匹ぶんのスキルに使ったちゅ〜る（v1 の配列は v2 の Lv1 として数える）。 */
function oldSkillRefund(skills: unknown): number {
  let s = 0;
  if (Array.isArray(skills)) {
    const seen = new Set<string>();
    for (const old of skills) {
      if (typeof old !== "string") continue;
      const id = v2Node(old) ? old : legacySkillId(old);
      if (id && !seen.has(id)) { seen.add(id); s += v2SkillCost(id, 1); }
    }
  } else if (obj(skills)) {
    for (const [id, lv] of Object.entries(skills)) s += v2SkillCost(id, num(lv, 0));
  }
  return s;
}

// ================= 読みかえ =================

function cleanWazas(raw: unknown): Record<string, WazaSave> {
  const out: Record<string, WazaSave> = {};
  if (obj(raw)) {
    for (const [id, w] of Object.entries(raw)) {
      if (!WAZA_MAP[id] || !obj(w)) continue;
      const level = Math.min(MAX_WAZA_LEVEL, Math.max(1, Math.floor(num(w.level, 1))));
      out[id] = { level, count: Math.max(level, Math.floor(num(w.count, level))) };
    }
  }
  for (const id of STARTER_WAZAS) if (!out[id]) out[id] = { level: 1, count: 1 };
  return out;
}

function cleanCat(uid: string, raw: unknown, wazas: Record<string, WazaSave>): CatSave | null {
  if (!obj(raw)) return null;
  const look = typeof raw.look === "string" && CAT_LOOKS.includes(raw.look) ? raw.look : CAT_LOOKS[0];
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, MAX_CAT_NAME) : (CHAR_MAP[look]?.name ?? "ねこ");
  const personality = isPersonality(raw.personality) ? raw.personality : (CHAR_MAP[look]?.personality ?? "nonbiri");
  const preset = typeof raw.preset === "string" && CHAR_MAP[raw.preset] ? raw.preset : undefined;
  const w = obj(raw.waza) ? raw.waza : {};
  const mainId = typeof w.main === "string" && WAZA_MAP[w.main]?.slot === "main" && wazas[w.main] ? w.main : DEFAULT_MAIN_WAZA;
  const subs: string[] = [];
  if (Array.isArray(w.subs)) {
    for (const s of w.subs) {
      if (typeof s === "string" && WAZA_MAP[s]?.slot === "sub" && wazas[s] && !subs.includes(s) && subs.length < MAX_SUBS) subs.push(s);
    }
  }
  const c = newCatSave(uid, name, look, personality, mainId, preset);
  c.level = Math.max(1, Math.floor(num(raw.level, 1)));
  c.exp = Math.max(0, num(raw.exp, 0));
  c.bond = Math.min(MAX_BOND, Math.max(0, Math.floor(num(raw.bond, 0))));
  c.bondExp = Math.max(0, Math.floor(num(raw.bondExp, 0)));
  c.waza.subs = subs;
  return c;
}

/** v1・v2 の猫たちを、うちの子として cats に入れる。特技は同じレアリティのメインのわざとして手に入れる。 */
function migrateOldChars(out: SaveData, rawChars: unknown, selected: unknown): number {
  let refund = 0;
  out.cats = {};
  out.party = [];
  out.nextCatUid = 1;
  const chars = obj(rawChars) ? rawChars : {};
  const ids = CHARS.map((c) => c.id).filter((id) => obj(chars[id]));
  // 古いセーブには、はじめの2匹（chatora・mike）がかならずいた
  for (const id of ["chatora", "mike"]) if (!ids.includes(id)) ids.push(id);
  // 選んでいた猫を c1 に（主人公）
  const sel = typeof selected === "string" && ids.includes(selected) ? selected : ids[0];
  ids.sort((a, b) => Number(b === sel) - Number(a === sel));
  for (const id of ids) {
    const def = CHAR_MAP[id];
    const r = obj(chars[id]) ? chars[id] as Record<string, unknown> : {};
    const uid = `c${out.nextCatUid++}`;
    if (!out.wazas[def.waza]) out.wazas[def.waza] = { level: 1, count: 1 };
    const c = newCatSave(uid, def.name, id, def.personality, def.waza, id);
    c.level = Math.max(1, Math.floor(num(r.level, 1)));
    c.exp = Math.max(0, num(r.exp, 0));
    c.bond = Math.min(MAX_BOND, Math.max(0, Math.floor(num(r.bond, 0))));
    out.cats[uid] = c;
    if (id === sel) out.party = [uid];
    refund += oldSkillRefund(r.skills);
  }
  return refund;
}

/** 古いデータや壊れたデータを、なるべく今の形に直す。 */
export function migrate(raw: unknown): SaveData {
  const base = newSave();
  if (!obj(raw)) return base;
  const r = raw as Partial<SaveData> & { chars?: unknown; selectedChar?: unknown };
  const out: SaveData = { ...base, ...r, version: SAVE_VERSION } as SaveData;
  delete (out as { chars?: unknown }).chars;
  delete (out as { selectedChar?: unknown }).selectedChar;
  out.coins = num(out.coins, 0);
  out.relicPoints = num(out.relicPoints, 0);
  out.churu = Math.max(0, num(r.churu, START_CHURU));
  out.gachaPity = Math.max(0, Math.floor(num(r.gachaPity, 0)));
  out.totalPulls = Math.max(0, Math.floor(num(r.totalPulls, 0)));
  out.wazas = cleanWazas(r.wazas);

  const oldVersion = Math.floor(num(r.version, 0));
  const isOld = oldVersion < 3 && !obj(r.cats);
  if (isOld) {
    // v2 → v3: 猫はうちの子として、スキルは消して使ったちゅ〜るを返す。初回の登録はすんだものとする
    out.churu += migrateOldChars(out, r.chars, r.selectedChar);
    out.skills = emptySkills();
    out.setupDone = obj(r.chars) || oldVersion > 0;
    if (!out.setupDone) {
      // 中身のないデータ（はじめから扱い）
      out.cats = base.cats;
      out.party = base.party;
      out.nextCatUid = base.nextCatUid;
    }
  } else {
    // v3: 中身をたしかめる
    const cats: Record<string, CatSave> = {};
    let maxN = 0;
    if (obj(r.cats)) {
      for (const [uid, c] of Object.entries(r.cats)) {
        if (Object.keys(cats).length >= MAX_CATS) break;
        const cs = cleanCat(uid, c, out.wazas);
        if (!cs) continue;
        cats[uid] = cs;
        const m = /^c(\d+)$/.exec(uid);
        if (m) maxN = Math.max(maxN, Number(m[1]));
      }
    }
    if (!Object.keys(cats).length) {
      Object.assign(cats, base.cats);
      maxN = Math.max(maxN, 1);
    }
    out.cats = cats;
    out.nextCatUid = Math.max(maxN + 1, Math.floor(num(r.nextCatUid, 1)));
    const party: string[] = [];
    if (Array.isArray(r.party)) {
      for (const u of r.party) if (typeof u === "string" && cats[u] && !party.includes(u) && party.length < PARTY_SIZE) party.push(u);
    }
    if (!party.length) party.push(Object.keys(cats)[0]);
    out.party = party;
    const skills = emptySkills();
    if (obj(r.skills)) {
      for (const role of ROLES) {
        const tree = r.skills[role];
        if (!obj(tree)) continue;
        for (const [id, lv] of Object.entries(tree)) {
          const node = SKILL_MAP[id];
          const L = Math.floor(num(lv, 0));
          if (node && node.role === role && L > 0) skills[role][id] = Math.min(node.maxLevel, L);
        }
      }
    }
    out.skills = skills;
    out.setupDone = typeof r.setupDone === "boolean" ? r.setupDone : true;
  }

  if (!obj(out.objects)) out.objects = base.objects;
  for (const id of Object.keys(base.objects)) if (!out.objects[id]) out.objects[id] = base.objects[id];
  if (!Array.isArray(out.loadout)) out.loadout = base.loadout;
  out.loadout = out.loadout.filter((id) => out.objects[id]).slice(0, MAX_LOADOUT);
  if (!Array.isArray(out.equips)) out.equips = [];
  if (!obj(out.equipped)) out.equipped = {};
  for (const slot of Object.keys(out.equipped) as EquipSlot[]) {
    if (!out.equips.some((e) => e.uid === out.equipped[slot])) delete out.equipped[slot];
  }
  if (!Array.isArray(out.relics)) out.relics = [];
  if (typeof out.cleared !== "number") out.cleared = -1;
  if (!obj(out.clearCounts)) out.clearCounts = {};
  if (typeof out.nextUid !== "number") out.nextUid = out.equips.length + 1;
  if (typeof out.seed !== "number") out.seed = base.seed;
  if (typeof out.selectedStage !== "string") out.selectedStage = base.selectedStage;
  return out;
}

/** 読みこむ。ないとき・読めないときは newSave()。 */
export function loadSave(key = SAVE_KEY): SaveData {
  const ls = storage();
  if (!ls) return newSave();
  try {
    const s = ls.getItem(key);
    if (!s) return newSave();
    return migrate(JSON.parse(s));
  } catch {
    return newSave();
  }
}

/** 保存する。できたら true。 */
export function writeSave(save: SaveData, key = SAVE_KEY): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(key, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** 保存を消す。 */
export function clearSave(key = SAVE_KEY): void {
  const ls = storage();
  if (!ls) return;
  try { ls.removeItem(key); } catch { /* 何もしない */ }
}

/** 文字列にする（バックアップ用）。 */
export function exportSave(save: SaveData): string {
  return JSON.stringify(save);
}

/** 文字列から戻す。読めないときは null。 */
export function importSave(text: string): SaveData | null {
  try {
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
