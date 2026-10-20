// 成長の計算（セーブデータをさわる純粋な関数たち）。
// 関数は save をその場で書きかえる。保存（writeSave）は呼ぶ側でする。
import type { BugDef, Loadout, ObjectKind, ResolvedChar, ResolvedObject, StageDef } from "./types";
import { type Rng, pickWeighted, randInt } from "./rng";
import { type SaveData, MAX_LOADOUT } from "./save";
import { CHARS, CHAR_MAP, SKILL_MAP, SKILL_TREES, type CharMods, addCharMods, emptyCharMods } from "../data/chars";
import { OBJECTS, OBJECT_MAP, OBJ_LEVEL_GROWTH, OBJ_PRODUCE_PER_LEVEL, OBJ_RARITY_COST, OBJ_RARITY_DROP, shardsToNext } from "../data/objects";
import {
  AFFIX_MAP, EQUIPS, EQUIP_SLOTS, MAX_EQUIP_RARITY, type EquipItem, type EquipRarity, type EquipSlot,
  equipBaseStats, rollEquip,
} from "../data/equips";
import { RELICS, RELIC_MAP, type RelicStat } from "../data/relics";
import { STAGES, STAGE_MAP, stageIndexOf } from "../data/stages";
import { bugDefs } from "../data/bugs";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; reason: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ng = <T = never>(reason: string): Result<T> => ({ ok: false, reason });

/** ママの HP（レリックで増える前）。 */
export const BASE_MAMA_HP = 10;
/** 選んでいない猫がもらえる経験値の割合（おるすばん）。 */
export const IDLE_EXP_RATE = 0.5;
export const MAX_CHAR_LEVEL = 999;

// ================= ステージ =================

export function stageIdList(): string[] {
  return STAGES.map((s) => s.id);
}

export function stageById(id: string): StageDef | undefined {
  return STAGE_MAP[id];
}

export { stageIndexOf };

/** 遊べるステージか（クリアした次まで）。 */
export function isStageUnlocked(save: SaveData, id: string): boolean {
  const g = stageIndexOf(id);
  return g >= 0 && g <= save.cleared + 1;
}

/** 次に挑むステージの id（全部クリアなら最後）。 */
export function nextStageId(save: SaveData): string {
  return STAGES[Math.min(STAGES.length - 1, save.cleared + 1)].id;
}

// ================= 猫・経験値・スキル =================

/** 次のレベルまでの経験値。 */
export function expToNext(level: number): number {
  return Math.round(8 * Math.pow(1.2, level - 1));
}

/** 経験値を足す。上がったレベル数を返す。持っていない猫なら 0。 */
export function addExp(save: SaveData, charId: string, exp: number): number {
  const c = save.chars[charId];
  if (!c || !(exp > 0)) return 0;
  c.exp += exp;
  let ups = 0;
  while (c.level < MAX_CHAR_LEVEL && c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level++;
    ups++;
  }
  return ups;
}

/** 使えるスキルポイント（レベル1につき1。使ったぶんを引く）。 */
export function skillPoints(save: SaveData, charId: string): number {
  const c = save.chars[charId];
  if (!c) return 0;
  const spent = c.skills.reduce((s, id) => s + (SKILL_MAP[id]?.cost ?? 0), 0);
  return c.level - spent;
}

export function skillTreeOf(charId: string) {
  const def = CHAR_MAP[charId];
  return def ? SKILL_TREES[def.role] : [];
}

export function canLearn(save: SaveData, charId: string, nodeId: string): Result {
  const c = save.chars[charId];
  const def = CHAR_MAP[charId];
  const node = SKILL_MAP[nodeId];
  if (!c || !def) return ng("まだ仲間になっていない猫です");
  if (!node || !SKILL_TREES[def.role].includes(node)) return ng("この猫のスキルではありません");
  if (c.skills.includes(nodeId)) return ng("もう覚えています");
  const miss = node.req.filter((r) => !c.skills.includes(r));
  if (miss.length) return ng(`先に「${miss.map((r) => SKILL_MAP[r]?.name ?? r).join("・")}」を覚えてね`);
  if (skillPoints(save, charId) < node.cost) return ng("スキルポイントが足りません");
  return ok(undefined);
}

export function learnSkill(save: SaveData, charId: string, nodeId: string): Result {
  const r = canLearn(save, charId, nodeId);
  if (r.ok) save.chars[charId].skills.push(nodeId);
  return r;
}

/** スキルをぜんぶ忘れて、ポイントを戻す（無料）。 */
export function resetSkills(save: SaveData, charId: string): void {
  const c = save.chars[charId];
  if (c) c.skills = [];
}

export function selectChar(save: SaveData, charId: string): boolean {
  if (!save.chars[charId]) return false;
  save.selectedChar = charId;
  return true;
}

/** スキルの補正をまとめる。 */
export function skillMods(save: SaveData, charId: string): CharMods {
  let m = emptyCharMods();
  for (const id of save.chars[charId]?.skills ?? []) {
    const n = SKILL_MAP[id];
    if (n) m = addCharMods(m, n.effect);
  }
  return m;
}

// ================= オブジェクト =================

/** 次のレベルに必要なかけらとお金。持っていなければ null。 */
export function objectUpgradeCost(save: SaveData, id: string): { shards: number; coins: number } | null {
  const o = save.objects[id];
  const def = OBJECT_MAP[id];
  if (!o || !def) return null;
  return {
    shards: shardsToNext(o.level),
    coins: Math.round(20 * OBJ_RARITY_COST[def.rarity] * Math.pow(1.25, o.level - 1)),
  };
}

export function canLevelUpObject(save: SaveData, id: string): Result {
  const cost = objectUpgradeCost(save, id);
  if (!cost) return ng("まだ持っていません");
  if (save.objects[id].shards < cost.shards) return ng("かけらが足りません");
  if (save.coins < cost.coins) return ng("お金が足りません");
  return ok(undefined);
}

/** かけらとお金を使ってレベルアップ。 */
export function levelUpObject(save: SaveData, id: string): Result {
  const r = canLevelUpObject(save, id);
  if (!r.ok) return r;
  const cost = objectUpgradeCost(save, id)!;
  const o = save.objects[id];
  o.shards -= cost.shards;
  save.coins -= cost.coins;
  o.level++;
  return r;
}

/** 戦闘に持っていくオブジェクトを決める（持っているものだけ、重なりなし、最大5）。 */
export function setLoadout(save: SaveData, ids: string[]): void {
  const out: string[] = [];
  for (const id of ids) if (save.objects[id] && !out.includes(id) && out.length < MAX_LOADOUT) out.push(id);
  save.loadout = out;
}

/** 持っていく・外すを切りかえる。いっぱいのときは false。 */
export function toggleLoadout(save: SaveData, id: string): boolean {
  if (!save.objects[id]) return false;
  const i = save.loadout.indexOf(id);
  if (i >= 0) { save.loadout.splice(i, 1); return true; }
  if (save.loadout.length >= MAX_LOADOUT) return false;
  save.loadout.push(id);
  return true;
}

// ================= 装備 =================

export function findEquip(save: SaveData, uid: string): EquipItem | undefined {
  return save.equips.find((e) => e.uid === uid);
}

export function isEquipped(save: SaveData, uid: string): boolean {
  return Object.values(save.equipped).includes(uid);
}

export function equip(save: SaveData, uid: string): boolean {
  const it = findEquip(save, uid);
  if (!it) return false;
  save.equipped[it.slot] = uid;
  return true;
}

export function unequip(save: SaveData, slot: EquipSlot): void {
  delete save.equipped[slot];
}

function newUid(save: SaveData): string {
  return `e${save.nextUid++}`;
}

/** 装備を1つ作って手持ちに入れる。 */
export function addEquip(save: SaveData, rng: Rng, rarity: EquipRarity, slot?: EquipSlot, defId?: string): EquipItem {
  const it = rollEquip(rng, newUid(save), rarity, slot, defId);
  save.equips.push(it);
  return it;
}

/** 同じ枠・同じレアリティの3つを合成して、1つ上のレアリティにする。補正は引き直し。 */
export function fuseEquips(save: SaveData, uids: string[], rng: Rng): Result<EquipItem> {
  if (uids.length !== 3 || new Set(uids).size !== 3) return ng("ちがう装備を3つ選んでね");
  const items = uids.map((u) => findEquip(save, u));
  if (items.some((x) => !x)) return ng("見つからない装備があります");
  const [a, b, c] = items as EquipItem[];
  if (a.slot !== b.slot || a.slot !== c.slot) return ng("同じ枠の装備を選んでね");
  if (a.rarity !== b.rarity || a.rarity !== c.rarity) return ng("同じレアリティの装備を選んでね");
  if (a.rarity >= MAX_EQUIP_RARITY) return ng("これ以上は合成できません");
  const wasEquipped = items.some((x) => isEquipped(save, x!.uid));
  save.equips = save.equips.filter((e) => !uids.includes(e.uid));
  for (const s of EQUIP_SLOTS) if (save.equipped[s] && uids.includes(save.equipped[s]!)) delete save.equipped[s];
  const it = addEquip(save, rng, (a.rarity + 1) as EquipRarity, a.slot, a.defId);
  if (wasEquipped) save.equipped[it.slot] = it.uid;
  return ok(it);
}

/** 売ったときのお金。 */
export function equipSellPrice(save: SaveData, item: EquipItem): number {
  return Math.round(10 * Math.pow(3, item.rarity) * Math.pow(1.2, Math.max(0, save.cleared)));
}

export function sellEquip(save: SaveData, uid: string): Result<number> {
  const it = findEquip(save, uid);
  if (!it) return ng("見つかりません");
  if (isEquipped(save, uid)) return ng("つけている装備は売れません");
  const price = equipSellPrice(save, it);
  save.equips = save.equips.filter((e) => e.uid !== uid);
  save.coins += price;
  return ok(price);
}

/** 装備のだいたいの強さ（並べかえ・自動装備用）。 */
export function equipScore(item: EquipItem): number {
  const b = equipBaseStats(item);
  const aff = item.affixes.reduce((s, a) => s + a.value, 0);
  return (1 + b.atk) * (1 + b.hp * 0.5) * (1 + aff * 0.5);
}

/** 各枠に一番強い装備をつける。 */
export function autoEquip(save: SaveData): void {
  for (const s of EQUIP_SLOTS) {
    let best: EquipItem | undefined;
    for (const e of save.equips) if (e.slot === s && (!best || equipScore(e) > equipScore(best))) best = e;
    if (best) save.equipped[s] = best.uid;
  }
}

/** 合成できる組をぜんぶ合成する（つけていないもの・弱いものから使う）。合成した数を返す。 */
export function autoFuse(save: SaveData, rng: Rng): number {
  let n = 0;
  for (let r = 0; r < MAX_EQUIP_RARITY; r++) {
    for (const s of EQUIP_SLOTS) {
      for (;;) {
        const cands = save.equips
          .filter((e) => e.slot === s && e.rarity === r)
          .sort((x, y) => Number(isEquipped(save, x.uid)) - Number(isEquipped(save, y.uid)) || equipScore(x) - equipScore(y));
        if (cands.length < 3) break;
        const res = fuseEquips(save, cands.slice(0, 3).map((e) => e.uid), rng);
        if (!res.ok) break;
        n++;
      }
    }
  }
  return n;
}

/** つけている装備の補正をまとめたもの。 */
export interface EquipBonus {
  baseAtkMul: number;                           // 装備の基本の攻撃（猫とオブジェクトの両方に効く）
  baseHpMul: number;                            // 装備の基本の体力（猫とオブジェクトの両方に効く）
  charAtkMul: number;                           // 猫の攻撃（baseAtkMul と補正をあわせたもの）
  charHpMul: number;
  charMoveMul: number;
  objAtk: number;                               // 全オブジェクトの攻撃 +割合
  objAtkKind: Partial<Record<ObjectKind, number>>;
  objInterval: number;                          // -割合
  objIntervalKind: Partial<Record<ObjectKind, number>>;
  objCost: number;                              // -割合
  objHp: number;                                // +割合
  produce: number;                              // +割合
}

export function equipBonus(save: SaveData): EquipBonus {
  const r: EquipBonus = {
    baseAtkMul: 1, baseHpMul: 1, charAtkMul: 1, charHpMul: 1, charMoveMul: 1, objAtk: 0, objAtkKind: {}, objInterval: 0,
    objIntervalKind: {}, objCost: 0, objHp: 0, produce: 0,
  };
  let cAtk = 0, cHp = 0, cMove = 0;
  for (const s of EQUIP_SLOTS) {
    const uid = save.equipped[s];
    const it = uid ? findEquip(save, uid) : undefined;
    if (!it) continue;
    const b = equipBaseStats(it);
    r.baseAtkMul *= 1 + b.atk;
    r.baseHpMul *= 1 + b.hp;
    for (const a of it.affixes) {
      const def = AFFIX_MAP[a.id];
      if (!def) continue;
      switch (def.stat) {
        case "objAtk":
          if (def.kind) r.objAtkKind[def.kind] = (r.objAtkKind[def.kind] ?? 0) + a.value;
          else r.objAtk += a.value;
          break;
        case "objInterval":
          if (def.kind) r.objIntervalKind[def.kind] = (r.objIntervalKind[def.kind] ?? 0) + a.value;
          else r.objInterval += a.value;
          break;
        case "objCost": r.objCost += a.value; break;
        case "objHp": r.objHp += a.value; break;
        case "produce": r.produce += a.value; break;
        case "charAtk": cAtk += a.value; break;
        case "charHp": cHp += a.value; break;
        case "charMove": cMove += a.value; break;
      }
    }
  }
  r.charAtkMul = r.baseAtkMul * (1 + cAtk);
  r.charHpMul = r.baseHpMul * (1 + cHp);
  r.charMoveMul *= 1 + Math.min(cMove, 0.6);
  return r;
}

// ================= レリック =================

export type RelicBonus = Record<RelicStat, number>;

/** 解放ずみレリックの合計。dmg・charHp は掛け算（1 から）、ほかは足し算（0 から）。 */
export function relicBonus(save: SaveData): RelicBonus {
  const r: RelicBonus = { dmg: 1, charHp: 1, kibble: 0, startKibble: 0, mamaHp: 0, objCost: 0, drop: 0, exp: 0, coins: 0 };
  for (const id of save.relics) {
    const n = RELIC_MAP[id];
    if (!n) continue;
    if (n.stat === "dmg" || n.stat === "charHp") r[n.stat] *= n.value;
    else r[n.stat] += n.value;
  }
  return r;
}

export function canUnlockRelic(save: SaveData, nodeId: string): Result {
  const n = RELIC_MAP[nodeId];
  if (!n) return ng("見つかりません");
  if (save.relics.includes(nodeId)) return ng("もう解放しています");
  if (!n.req.every((r) => save.relics.includes(r))) return ng("先に前のレリックを解放してね");
  if (save.relicPoints < n.cost) return ng("レリックポイントが足りません");
  return ok(undefined);
}

export function unlockRelic(save: SaveData, nodeId: string): Result {
  const r = canUnlockRelic(save, nodeId);
  if (r.ok) {
    save.relicPoints -= RELIC_MAP[nodeId].cost;
    save.relics.push(nodeId);
  }
  return r;
}

/** 次に解放できる（道の先頭の）レリック。全部解放ずみなら undefined。 */
export function nextRelic(save: SaveData) {
  return RELICS.find((n) => !save.relics.includes(n.id));
}

// ================= 計算ずみの強さ =================

export function resolveChar(save: SaveData, charId: string = save.selectedChar): ResolvedChar {
  const def = CHAR_MAP[charId] ?? CHARS[0];
  const lv = save.chars[def.id]?.level ?? 1;
  const m = skillMods(save, def.id);
  const eq = equipBonus(save);
  const rel = relicBonus(save);
  const b = def.base;
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    maxHp: b.maxHp * Math.pow(def.growth.hp, lv - 1) * m.hpMul * eq.charHpMul * rel.charHp,
    atk: b.atk * Math.pow(def.growth.atk, lv - 1) * m.atkMul * eq.charAtkMul * rel.dmg,
    atkInterval: Math.max(0.15, b.atkInterval * m.intervalMul),
    range: b.range + m.rangeAdd,
    aoe: b.aoe + (b.aoe > 0 ? m.aoeAdd : 0),
    moveSpeed: b.moveSpeed * m.moveMul * eq.charMoveMul,
    restTime: Math.max(1, b.restTime * m.restMul),
    armor: Math.max(0.3, b.armor * m.armorMul),
    pickupRange: b.pickupRange + m.pickupAdd,
  };
}

export function resolveObject(save: SaveData, id: string): ResolvedObject | null {
  const def = OBJECT_MAP[id];
  if (!def) return null;
  const lv = save.objects[id]?.level ?? 1;
  const g = Math.pow(OBJ_LEVEL_GROWTH, lv - 1);
  const eq = equipBonus(save);
  const rel = relicBonus(save);
  const sk = skillMods(save, save.selectedChar);
  const b = def.base;
  // 装備の基本の攻撃・体力は、猫が置くオブジェクトにも効く
  const atkMul = eq.baseAtkMul * (1 + eq.objAtk + (eq.objAtkKind[def.kind] ?? 0)) * sk.objAtkMul * rel.dmg;
  const intMul = Math.max(0.4, 1 - eq.objInterval - (eq.objIntervalKind[def.kind] ?? 0));
  const costMul = Math.max(0.4, 1 - eq.objCost - rel.objCost);
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    cost: Math.max(1, Math.round(b.cost * costMul)),
    maxHp: b.maxHp * g * eq.baseHpMul * (1 + eq.objHp),
    atk: b.atk * g * atkMul,
    interval: b.interval * intMul,
    range: b.range,
    slow: b.slow,
    produce: b.produce * (1 + OBJ_PRODUCE_PER_LEVEL * (lv - 1)) * (1 + eq.produce),
    cooldown: b.cooldown,
    upgradeCost: Math.max(1, Math.round(b.upgradeCost * costMul)),
    upgradeMul: b.upgradeMul,
  };
}

/** オブジェクトを計算する（省くと持っていくもの）。 */
export function resolveObjects(save: SaveData, ids: string[] = save.loadout): ResolvedObject[] {
  return ids.map((id) => resolveObject(save, id)).filter((o): o is ResolvedObject => !!o);
}

/** 戦闘を始めるのに必要なものをそろえる。ステージがなければ null。 */
export function buildLoadout(save: SaveData, stageId: string): Loadout | null {
  const stage = stageById(stageId);
  if (!stage) return null;
  const rel = relicBonus(save);
  const bugs: Record<string, BugDef> = bugDefs();
  return {
    char: resolveChar(save),
    objects: resolveObjects(save),
    stage,
    bugs,
    global: { kibbleMul: 1 + rel.kibble, startKibbleAdd: rel.startKibble, mamaHp: BASE_MAMA_HP + rel.mamaHp },
  };
}

// ================= 戦力の目安 =================

/** 置くオブジェクトの数の目安（同じものを何こ置くか）。 */
const OBJ_COPIES = 2;

/** だいたいの DPS（1秒あたりのダメージ）。 */
export function estimateDps(lo: Pick<Loadout, "char" | "objects">): { char: number; objects: number; total: number } {
  const c = lo.char;
  const char = (c.atk / c.atkInterval) * (c.aoe > 0 ? 1 + c.aoe : 1);
  let objects = 0;
  for (const o of lo.objects) {
    if (o.kind === "shooter" || o.kind === "slow") objects += o.atk / o.interval;
    else if (o.kind === "aoe") objects += (o.atk / o.interval) * 1.5;
    else if (o.kind === "mine") objects += o.atk / Math.max(o.cooldown, 1);
  }
  objects *= OBJ_COPIES;
  return { char, objects, total: char + objects };
}

/** ステージの虫の体力の合計と、だいたいの長さ（秒）。 */
export function stageLoad(stage: StageDef): { totalHp: number; duration: number; count: number } {
  const bugs = bugDefs();
  let totalHp = 0, count = 0, end = 0;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      totalHp += (bugs[g.bug]?.hp ?? 0) * stage.hpMul * g.count;
      count += g.count;
      end = Math.max(end, w.at + g.count * g.every);
    }
  }
  return { totalHp, duration: end + 10, count };
}

/** 戦力の余裕（1 をこえると、計算上は時間内に全部たおせる）。 */
export function powerRatio(save: SaveData, stageId: string): number {
  const lo = buildLoadout(save, stageId);
  if (!lo) return 0;
  const { totalHp, duration } = stageLoad(lo.stage);
  return (estimateDps(lo).total * duration) / totalHp;
}

// ================= 報酬 =================

export interface RewardResult {
  stageId: string;
  firstClear: boolean;
  exp: number;
  coins: number;
  relicPoints: number;
  equips: EquipItem[];
  shards: { id: string; count: number }[];
  newChars: string[];
  newObjects: string[];
  levelUps: Record<string, number>;   // 猫 id → 上がったレベル数
}

/** 小数の回数を、確率で整数にする（2.3 → 2 か 3）。 */
function rollCount(n: number, rng: Rng): number {
  const f = Math.floor(n);
  return f + (rng() < n - f ? 1 : 0);
}

/** ステージ（通し番号 g）で落ちる装備のレアリティ。 */
export function rollDropRarity(g: number, rng: Rng): EquipRarity {
  const step = Math.min(0.5, 0.1 + g * 0.004);
  const cap = Math.min(MAX_EQUIP_RARITY, 1 + Math.floor(g / 25));
  let r = 0;
  while (r < cap && rng() < step) r++;
  return r as EquipRarity;
}

/** クリアした数に合わせて、猫とオブジェクトを仲間にする。新しく増えた id を返す。 */
export function syncUnlocks(save: SaveData): { newChars: string[]; newObjects: string[] } {
  const n = save.cleared + 1; // クリアしたステージの数（通し番号＝この数まで）
  const newChars: string[] = [];
  const newObjects: string[] = [];
  for (const c of CHARS) {
    if (c.unlockStage <= n && !save.chars[c.id]) {
      save.chars[c.id] = { level: 1, exp: 0, skills: [] };
      newChars.push(c.id);
    }
  }
  for (const o of OBJECTS) {
    if (o.unlockStage <= n && !save.objects[o.id]) {
      save.objects[o.id] = { level: 1, shards: 0 };
      newObjects.push(o.id);
      if (save.loadout.length < MAX_LOADOUT) save.loadout.push(o.id);
    }
  }
  return { newChars, newObjects };
}

/** ステージに勝ったときに呼ぶ。報酬を抽選して save に入れ、クリアを記録する。 */
export function grantRewards(save: SaveData, stageOrId: StageDef | string, rng: Rng): RewardResult {
  const stage = typeof stageOrId === "string" ? stageById(stageOrId) : stageOrId;
  if (!stage) throw new Error(`ステージがありません: ${String(stageOrId)}`);
  const g = stageIndexOf(stage.id);
  const firstClear = g > save.cleared;
  const rel = relicBonus(save);
  const rw = stage.rewards;

  const exp = Math.round(rw.exp * (1 + rel.exp));
  const coins = Math.round(rw.coins * (1 + rel.coins));
  const relicPoints = firstClear ? rw.relicPoints : 0;

  save.coins += coins;
  save.relicPoints += relicPoints;
  const levelUps: Record<string, number> = {};
  for (const id of Object.keys(save.chars)) {
    const e = id === save.selectedChar ? exp : Math.round(exp * IDLE_EXP_RATE);
    const ups = addExp(save, id, e);
    if (ups) levelUps[id] = ups;
  }

  // 装備
  const equips: EquipItem[] = [];
  const nEq = rollCount(rw.equipDrops * (1 + rel.drop), rng);
  for (let i = 0; i < nEq; i++) equips.push(addEquip(save, rng, rollDropRarity(g, rng)));

  // オブジェクトのかけら（持っているものから）
  const shardMap = new Map<string, number>();
  const owned = OBJECTS.filter((o) => save.objects[o.id]);
  const nSh = rollCount(rw.objectDrops * (1 + rel.drop), rng);
  for (let i = 0; i < nSh && owned.length; i++) {
    const o = pickWeighted(rng, owned, (x) => OBJ_RARITY_DROP[x.rarity] * (save.loadout.includes(x.id) ? 2 : 1));
    const cnt = 5 + g * 2 + randInt(rng, 3);
    shardMap.set(o.id, (shardMap.get(o.id) ?? 0) + cnt);
  }
  for (const [id, cnt] of shardMap) save.objects[id].shards += cnt;

  // クリアの記録
  save.clearCounts[stage.id] = (save.clearCounts[stage.id] ?? 0) + 1;
  if (firstClear) save.cleared = g;
  const { newChars, newObjects } = syncUnlocks(save);

  return {
    stageId: stage.id, firstClear, exp, coins, relicPoints, equips,
    shards: [...shardMap].map(([id, count]) => ({ id, count })),
    newChars, newObjects, levelUps,
  };
}

// 使いやすいように定義も出しておく
export { CHARS, OBJECTS, EQUIPS, RELICS, STAGES };
