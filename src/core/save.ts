// セーブデータ（localStorage に保存。テストなど localStorage がないときは何もしない）。
import { CHAR_MAP, MAX_BOND, STARTER_CHARS } from "../data/chars";
import { OBJECTS } from "../data/objects";
import { SKILL_MAP, legacySkillId } from "../data/skills";
import type { EquipItem, EquipSlot } from "../data/equips";

export type { EquipItem, EquipSlot } from "../data/equips";

/** v1: スキルは id の配列・スキルポイント。v2: スキルは id → レベル・ちゅ〜る・譲渡会会場。 */
export const SAVE_VERSION = 2;
export const SAVE_KEY = "cat-tower-defense/save";
export const MAX_LOADOUT = 5;
/** はじめにもらえるちゅ〜る（すぐに譲渡会会場を1回ためせる）。 */
export const START_CHURU = 30;

export interface CharSave {
  level: number;
  exp: number;                    // いまのレベルでたまっている経験値
  skills: Record<string, number>; // スキルノードの id → 取ったレベル（0 のものは入れない）
  bond: number;                   // なかよし度（0〜5）。同じ猫がもう一度来るたびに +1
}

export interface ObjectSave {
  level: number;
  shards: number;       // いまたまっているかけら
}

export interface SaveData {
  version: number;
  coins: number;
  relicPoints: number;
  churu: number;                         // ちゅ〜る（スキル・譲渡会会場に使う）
  chars: Record<string, CharSave>;       // お迎えした猫だけ入る
  selectedChar: string;
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
  gachaPity: number;                     // 譲渡会会場: SSR 以上が来ないまま続いた回数（天井用）
  totalPulls: number;                    // 譲渡会会場: これまでの回数
}

/** お迎えしたばかりの猫のデータ。 */
export function newCharSave(): CharSave {
  return { level: 1, exp: 0, skills: {}, bond: 0 };
}

/** はじめからのデータ。 */
export function newSave(): SaveData {
  const chars: Record<string, CharSave> = {};
  for (const id of STARTER_CHARS) chars[id] = newCharSave();
  const objects: Record<string, ObjectSave> = {};
  for (const o of OBJECTS) if (o.unlockStage <= 0) objects[o.id] = { level: 1, shards: 0 };
  return {
    version: SAVE_VERSION,
    coins: 0,
    relicPoints: 0,
    churu: START_CHURU,
    chars,
    selectedChar: STARTER_CHARS[0],
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

/** 猫1匹ぶんを今の形に直す（v1 のスキル配列は、新しいツリーの Lv1 に読みかえる。ちゅ〜るは戻さない）。 */
function migrateChar(raw: unknown): CharSave {
  const c = newCharSave();
  if (!raw || typeof raw !== "object") return c;
  const r = raw as { level?: unknown; exp?: unknown; skills?: unknown; bond?: unknown };
  c.level = Math.max(1, Math.floor(num(r.level, 1)));
  c.exp = Math.max(0, num(r.exp, 0));
  c.bond = Math.min(MAX_BOND, Math.max(0, Math.floor(num(r.bond, 0))));
  if (Array.isArray(r.skills)) {
    for (const old of r.skills) {
      if (typeof old !== "string") continue;
      const id = SKILL_MAP[old] ? old : legacySkillId(old);
      if (id && SKILL_MAP[id]) c.skills[id] = Math.max(c.skills[id] ?? 0, 1);
    }
  } else if (r.skills && typeof r.skills === "object") {
    for (const [id, lv] of Object.entries(r.skills as Record<string, unknown>)) {
      const node = SKILL_MAP[id];
      const L = Math.floor(num(lv, 0));
      if (node && L > 0) c.skills[id] = Math.min(node.maxLevel, L);
    }
  }
  return c;
}

/** 古いデータや壊れたデータを、なるべく今の形に直す。 */
export function migrate(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<SaveData>;
  const out: SaveData = { ...base, ...r, version: SAVE_VERSION } as SaveData;
  out.coins = num(out.coins, 0);
  out.relicPoints = num(out.relicPoints, 0);
  out.churu = Math.max(0, num(r.churu, START_CHURU));
  out.gachaPity = Math.max(0, Math.floor(num(r.gachaPity, 0)));
  out.totalPulls = Math.max(0, Math.floor(num(r.totalPulls, 0)));
  // 猫: 知らない id は捨てる。はじめの2匹はかならずいる
  const chars: Record<string, CharSave> = {};
  if (r.chars && typeof r.chars === "object") {
    for (const [id, c] of Object.entries(r.chars)) if (CHAR_MAP[id]) chars[id] = migrateChar(c);
  }
  for (const id of STARTER_CHARS) if (!chars[id]) chars[id] = newCharSave();
  out.chars = chars;
  if (!out.chars[out.selectedChar]) out.selectedChar = STARTER_CHARS[0];
  if (!out.objects || typeof out.objects !== "object") out.objects = base.objects;
  for (const id of Object.keys(base.objects)) if (!out.objects[id]) out.objects[id] = base.objects[id];
  if (!Array.isArray(out.loadout)) out.loadout = base.loadout;
  out.loadout = out.loadout.filter((id) => out.objects[id]).slice(0, MAX_LOADOUT);
  if (!Array.isArray(out.equips)) out.equips = [];
  if (!out.equipped || typeof out.equipped !== "object") out.equipped = {};
  for (const slot of Object.keys(out.equipped) as EquipSlot[]) {
    if (!out.equips.some((e) => e.uid === out.equipped[slot])) delete out.equipped[slot];
  }
  if (!Array.isArray(out.relics)) out.relics = [];
  if (typeof out.cleared !== "number") out.cleared = -1;
  if (!out.clearCounts || typeof out.clearCounts !== "object") out.clearCounts = {};
  if (typeof out.nextUid !== "number") out.nextUid = out.equips.length + 1;
  if (typeof out.seed !== "number") out.seed = base.seed;
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
