// セーブデータ（localStorage に保存。テストなど localStorage がないときは何もしない）。
import { CHARS } from "../data/chars";
import { OBJECTS } from "../data/objects";
import type { EquipItem, EquipSlot } from "../data/equips";

export type { EquipItem, EquipSlot } from "../data/equips";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "cat-tower-defense/save";
export const MAX_LOADOUT = 5;

export interface CharSave {
  level: number;
  exp: number;          // いまのレベルでたまっている経験値
  skills: string[];     // 取ったスキルの id
}

export interface ObjectSave {
  level: number;
  shards: number;       // いまたまっているかけら
}

export interface SaveData {
  version: number;
  coins: number;
  relicPoints: number;
  chars: Record<string, CharSave>;       // 持っている猫だけ入る
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
}

/** はじめからのデータ。 */
export function newSave(): SaveData {
  const chars: Record<string, CharSave> = {};
  for (const c of CHARS) if (c.unlockStage <= 0) chars[c.id] = { level: 1, exp: 0, skills: [] };
  const objects: Record<string, ObjectSave> = {};
  for (const o of OBJECTS) if (o.unlockStage <= 0) objects[o.id] = { level: 1, shards: 0 };
  return {
    version: SAVE_VERSION,
    coins: 0,
    relicPoints: 0,
    chars,
    selectedChar: CHARS[0].id,
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

/** 古いデータや壊れたデータを、なるべく今の形に直す。 */
export function migrate(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<SaveData>;
  const out: SaveData = { ...base, ...r, version: SAVE_VERSION } as SaveData;
  if (typeof out.coins !== "number" || !isFinite(out.coins)) out.coins = 0;
  if (typeof out.relicPoints !== "number" || !isFinite(out.relicPoints)) out.relicPoints = 0;
  if (!out.chars || typeof out.chars !== "object") out.chars = base.chars;
  for (const id of Object.keys(base.chars)) if (!out.chars[id]) out.chars[id] = base.chars[id];
  if (!out.chars[out.selectedChar]) out.selectedChar = Object.keys(out.chars)[0];
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
