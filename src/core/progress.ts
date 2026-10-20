// 成長の計算（セーブデータをさわる純粋な関数たち）。
// 関数は save をその場で書きかえる。保存（writeSave）は呼ぶ側でする。
import type { BugDef, Loadout, ObjectKind, ResolvedChar, ResolvedObject, StageDef } from "./types";
import { type Rng, pickWeighted, randInt } from "./rng";
import { type SaveData, MAX_LOADOUT } from "./save";
import { BOND_STAT_PER, CHARS, CHAR_MAP, CHAR_RARITY_MUL, RARITY_RANK } from "../data/chars";
import {
  SKILL_MAP, SKILL_TREES, type CharMods, type SkillNode, addNodeTotals, emptyTotals, modsFromTotals, nodeCost,
  nodeTotalCost,
} from "../data/skills";
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

// ================= 猫・経験値・ちゅ〜る =================

/** 次のレベルまでの経験値。 */
export function expToNext(level: number): number {
  return Math.round(8 * Math.pow(1.2, level - 1));
}

/** そのレベルに上がったときにもらえるちゅ〜る（ふだん 3、10 レベルごとに +10、50 レベルごとにさらに +30）。 */
export function churuForLevel(level: number): number {
  return 3 + (level % 10 === 0 ? 10 : 0) + (level % 50 === 0 ? 30 : 0);
}

/** 経験値を足す。上がったレベル数を返す。レベルが上がるとちゅ〜るも入る。持っていない猫なら 0。 */
export function addExp(save: SaveData, charId: string, exp: number): number {
  const c = save.chars[charId];
  if (!c || !(exp > 0)) return 0;
  c.exp += exp;
  let ups = 0;
  while (c.level < MAX_CHAR_LEVEL && c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level++;
    save.churu += churuForLevel(c.level);
    ups++;
  }
  return ups;
}

/** from から to へ上がったときにもらえるちゅ〜るの合計（表示用）。 */
export function churuForLevels(from: number, to: number): number {
  let s = 0;
  for (let lv = from + 1; lv <= to; lv++) s += churuForLevel(lv);
  return s;
}

export function selectChar(save: SaveData, charId: string): boolean {
  if (!save.chars[charId]) return false;
  save.selectedChar = charId;
  return true;
}

/** なかよし度による、基本の体力・攻撃の倍率（1 + 0.2 × なかよし度）。 */
export function bondMul(bond: number): number {
  return 1 + BOND_STAT_PER * Math.max(0, bond);
}

// ================= スキルツリー =================

export { nodeCost, nodeTotalCost };

/** その猫のスキルツリー（役割で決まる）。 */
export function skillTreeOf(charId: string): SkillNode[] {
  const def = CHAR_MAP[charId];
  return def ? SKILL_TREES[def.role] : [];
}

/** 取ったレベル（取っていなければ 0）。 */
export function nodeLevel(save: SaveData, charId: string, nodeId: string): number {
  return save.chars[charId]?.skills[nodeId] ?? 0;
}

/** 次のレベルに上げるちゅ〜る。最大レベルなら null。 */
export function nextNodeCost(save: SaveData, charId: string, nodeId: string): number | null {
  const node = SKILL_MAP[nodeId];
  if (!node) return null;
  const lv = nodeLevel(save, charId, nodeId);
  return lv >= node.maxLevel ? null : nodeCost(node, lv);
}

/** 前提・レベル・レアリティだけを見る（ちゅ〜るは見ない）。ツリーで「開いている」ノードを光らせる用。 */
export function isNodeOpen(save: SaveData, charId: string, nodeId: string): Result {
  const c = save.chars[charId];
  const def = CHAR_MAP[charId];
  const node = SKILL_MAP[nodeId];
  if (!c || !def) return ng("まだお迎えしていない猫です");
  if (!node || node.role !== def.role) return ng("この猫のスキルではありません");
  if ((c.skills[nodeId] ?? 0) >= node.maxLevel) return ng("もう最大レベルです");
  if (node.minRarity && RARITY_RANK[def.rarity] < RARITY_RANK[node.minRarity]) {
    return ng(`${node.minRarity} 以上の猫だけが覚えられます`);
  }
  const miss = node.req.filter((r) => (c.skills[r.id] ?? 0) < r.lv);
  if (miss.length) {
    return ng(`先に${miss.map((r) => `「${SKILL_MAP[r.id]?.name ?? r.id}」を Lv${r.lv}`).join("・")}まで上げてね`);
  }
  if (c.level < node.minCharLevel) return ng(`猫のレベルが ${node.minCharLevel} になったら覚えられます`);
  return ok(undefined);
}

export function canLearn(save: SaveData, charId: string, nodeId: string): Result {
  const r = isNodeOpen(save, charId, nodeId);
  if (!r.ok) return r;
  const cost = nextNodeCost(save, charId, nodeId)!;
  if (save.churu < cost) return ng(`ちゅ〜るが足りません（あと ${cost - Math.floor(save.churu)}）`);
  return ok(undefined);
}

/** 1レベル上げる。成功したら新しいレベルを返す。 */
export function learnSkill(save: SaveData, charId: string, nodeId: string): Result<number> {
  const r = canLearn(save, charId, nodeId);
  if (!r.ok) return r;
  const c = save.chars[charId];
  save.churu -= nextNodeCost(save, charId, nodeId)!;
  const lv = (c.skills[nodeId] ?? 0) + 1;
  c.skills[nodeId] = lv;
  return ok(lv);
}

/** その猫のスキルに使ったちゅ〜るの合計。 */
export function skillSpent(save: SaveData, charId: string): number {
  let s = 0;
  for (const [id, lv] of Object.entries(save.chars[charId]?.skills ?? {})) {
    const n = SKILL_MAP[id];
    if (n) s += nodeTotalCost(n, lv);
  }
  return s;
}

/** スキルをぜんぶ忘れて、使ったちゅ〜るを全部もどす。もどった量を返す。 */
export function resetSkills(save: SaveData, charId: string): number {
  const c = save.chars[charId];
  if (!c) return 0;
  const refund = skillSpent(save, charId);
  c.skills = {};
  save.churu += refund;
  return refund;
}

/** スキルの補正をまとめる。 */
export function skillMods(save: SaveData, charId: string): CharMods {
  const t = emptyTotals();
  for (const [id, lv] of Object.entries(save.chars[charId]?.skills ?? {})) {
    const n = SKILL_MAP[id];
    if (n) addNodeTotals(t, n, lv);
  }
  return modsFromTotals(t);
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
  const r: RelicBonus = {
    dmg: 1, charHp: 1, kibble: 0, startKibble: 0, mamaHp: 0, objCost: 0, drop: 0, exp: 0, coins: 0, churu: 0,
  };
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
  const cs = save.chars[def.id];
  const lv = cs?.level ?? 1;
  const m = skillMods(save, def.id);
  const eq = equipBonus(save);
  const rel = relicBonus(save);
  const b = def.base;
  const baseMul = CHAR_RARITY_MUL[def.rarity] * bondMul(cs?.bond ?? 0);
  const crit = Math.min(1, b.crit + m.crit);
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    maxHp: b.maxHp * baseMul * Math.pow(def.growth.hp, lv - 1) * m.hpMul * eq.charHpMul * rel.charHp,
    atk: b.atk * baseMul * Math.pow(def.growth.atk, lv - 1) * m.atkMul * eq.charAtkMul * rel.dmg,
    atkInterval: Math.max(0.15, b.atkInterval * m.intervalMul),
    range: b.range + m.range,
    aoe: b.aoe > 0 ? b.aoe + m.aoe : 0,
    moveSpeed: b.moveSpeed * m.moveMul * eq.charMoveMul,
    restTime: Math.max(1, b.restTime * m.restMul),
    armor: Math.max(0.3, b.armor * m.armorMul),
    crit,
    critMul: Math.max(1.5, b.critMul) + m.critMul,
    multiHit: Math.floor(b.multiHit + m.multiHit),
    lifesteal: Math.min(0.5, b.lifesteal + m.lifesteal),
    regen: Math.min(0.05, b.regen + m.regen),
    knockback: b.knockback + m.knockback,
    poison: b.poison + m.poison,
    slowHit: Math.max(0.3, b.slowHit - m.slow),
    pierce: def.role === "ranged" || b.pierce > 0 ? Math.floor(b.pierce + m.pierce) : 0,
    kibbleBonus: b.kibbleBonus + m.kibbleBonus,
    objectAura: b.objectAura + m.objectAura,
    repair: Math.min(0.2, b.repair + m.repair),
    reviveHp: Math.min(1, Math.max(0.5, b.reviveHp + m.reviveHp)),
    dodge: Math.min(0.6, b.dodge + m.dodge),
  };
}

/** 猫のだいたいの強さ（一覧の並べかえ・おすすめ用）。DPS × 体力の平方根。 */
export function charPower(save: SaveData, charId: string): number {
  const c = resolveChar(save, charId);
  return charDps(c) * Math.sqrt(c.maxHp);
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
    maxHp: b.maxHp * g * eq.baseHpMul * (1 + eq.objHp) * sk.objHpMul,
    atk: b.atk * g * atkMul,
    interval: b.interval * intMul,
    range: b.range,
    slow: b.slow,
    produce: b.produce * (1 + OBJ_PRODUCE_PER_LEVEL * (lv - 1)) * (1 + eq.produce),
    cooldown: b.cooldown,
    upgradeCost: Math.max(1, Math.round(b.upgradeCost * costMul)),
    upgradeMul: b.upgradeMul,
    block: b.block,
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

/** 猫のだいたいの DPS（会心・連続攻撃・範囲・貫通・毒をならしたもの）。 */
export function charDps(c: ResolvedChar): number {
  const critF = 1 + (c.crit ?? 0) * Math.max(0, (c.critMul ?? 1.5) - 1);
  const multiF = 1 + (c.multiHit ?? 0);
  const areaF = c.aoe > 0 ? 1 + c.aoe : 1;
  const pierceF = 1 + 0.5 * (c.pierce ?? 0);
  const poisonF = 1 + Math.min(1, (c.poison ?? 0) * 1.5);
  return (c.atk / c.atkInterval) * critF * multiF * areaF * pierceF * poisonF;
}

/** だいたいの DPS（1秒あたりのダメージ）。 */
export function estimateDps(lo: Pick<Loadout, "char" | "objects">): { char: number; objects: number; total: number } {
  const c = lo.char;
  const char = charDps(c);
  let objects = 0;
  for (const o of lo.objects) {
    if (o.kind === "shooter" || o.kind === "slow") objects += o.atk / o.interval;
    else if (o.kind === "aoe") objects += (o.atk / o.interval) * 1.5;
    else if (o.kind === "mine") objects += o.atk / Math.max(o.cooldown, 1);
  }
  objects *= OBJ_COPIES * (1 + (c.objectAura ?? 0) * 0.5);
  return { char, objects, total: char + objects };
}

/** 虫がママまで歩く道のりの目安（マス）。7×11 の盤面で、迷路にすると遠回りする。 */
export const PATH_TILES = 22;

/** ステージの虫の体力の合計と、だいたいの長さ（秒。最後の虫がママに着くまで）。 */
export function stageLoad(stage: StageDef): { totalHp: number; duration: number; count: number } {
  const bugs = bugDefs();
  let totalHp = 0, count = 0, end = 0;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      totalHp += (b?.hp ?? 0) * stage.hpMul * g.count;
      count += g.count;
      // 飛ぶ虫はまっすぐ（だいたい盤面の縦の長さ）
      const walk = (b?.fly ? 10 : PATH_TILES) / Math.max(0.1, b?.speed ?? 0.5);
      end = Math.max(end, w.at + g.count * g.every + walk * 0.5);
    }
  }
  return { totalHp, duration: end, count };
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
  /** ステージクリアのちゅ〜る（はじめてのクリアは多め）。 */
  churu: number;
  /** レベルアップでもらったちゅ〜る。 */
  churuFromLevels: number;
  equips: EquipItem[];
  shards: { id: string; count: number }[];
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
  const step = Math.min(0.35, 0.05 + g * 0.003);
  const cap = Math.min(MAX_EQUIP_RARITY, Math.floor(g / 30));
  let r = 0;
  while (r < cap && rng() < step) r++;
  return r as EquipRarity;
}

/** クリアした数に合わせて、オブジェクトを手に入れる（猫は譲渡会会場でお迎えする）。新しく増えた id を返す。 */
export function syncUnlocks(save: SaveData): { newObjects: string[] } {
  const n = save.cleared + 1; // クリアしたステージの数（通し番号＝この数まで）
  const newObjects: string[] = [];
  for (const o of OBJECTS) {
    if (o.unlockStage <= n && !save.objects[o.id]) {
      save.objects[o.id] = { level: 1, shards: 0 };
      newObjects.push(o.id);
      if (save.loadout.length < MAX_LOADOUT) save.loadout.push(o.id);
    }
  }
  return { newObjects };
}

/** はじめてクリアしたときのちゅ〜るの倍率。 */
export const FIRST_CLEAR_CHURU_MUL = 2;

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
  const churu = Math.round(rw.churu * (firstClear ? FIRST_CLEAR_CHURU_MUL : 1) * (1 + rel.churu));

  save.coins += coins;
  save.relicPoints += relicPoints;
  save.churu += churu;
  const churuBefore = save.churu;
  const levelUps: Record<string, number> = {};
  for (const id of Object.keys(save.chars)) {
    const e = id === save.selectedChar ? exp : Math.round(exp * IDLE_EXP_RATE);
    const ups = addExp(save, id, e);
    if (ups) levelUps[id] = ups;
  }
  const churuFromLevels = save.churu - churuBefore;

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
  const { newObjects } = syncUnlocks(save);

  return {
    stageId: stage.id, firstClear, exp, coins, relicPoints, churu, churuFromLevels, equips,
    shards: [...shardMap].map(([id, count]) => ({ id, count })),
    newObjects, levelUps,
  };
}

// 使いやすいように定義も出しておく
export { CHARS, OBJECTS, EQUIPS, RELICS, STAGES };
