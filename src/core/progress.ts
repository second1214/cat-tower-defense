// 成長の計算（セーブデータをさわる純粋な関数たち）。
// 関数は save をその場で書きかえる。保存（writeSave）は呼ぶ側でする。
import type { BugDef, CharRole, ComboId, Loadout, ObjectKind, Personality, ResolvedChar, ResolvedObject, StageDef } from "./types";
import { type Rng, pickWeighted, randInt } from "./rng";
import { type CatSave, type SaveData, MAX_CATS, MAX_LOADOUT, PARTY_SIZE, ROLES, newCatSave } from "./save";
import { BOND_STAT_PER, CAT_LOOKS, CHARS, CHAR_MAP, MAX_BOND, MAX_CAT_NAME, NEIGHBOR_UNLOCK, bondToNext } from "../data/chars";
import {
  SKILL_MAP, SKILL_TREES, type CharMods, type SkillNode, type SkillTotals, addEffects, addNodeTotals, emptyTotals,
  modsFromTotals, nodeCost, nodeTotalCost,
} from "../data/skills";
import {
  CHAR_GROWTH, DEFAULT_MAIN_WAZA, MAX_SUBS, RARITY_MUL, ROLE_BASE, SPECIAL0, WAZAS, WAZA_MAP, type WazaDef,
  wazaLevelMul,
} from "../data/waza";
import { PERSONALITY_MAP, isPersonality } from "../data/personality";
import {
  OBJECTS, OBJECT_MAP, OBJ_LEVEL_GROWTH, OBJ_PRODUCE_PER_LEVEL, OBJ_RARITY_COST, OBJ_RARITY_DROP, type ObjectBase,
  type ObjectPerk, shardsToNext,
} from "../data/objects";
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
/** パーティにいない猫（控え）がもらえる経験値の割合。 */
export const IDLE_EXP_RATE = 0.3;
export const MAX_CHAR_LEVEL = 999;
/** 相棒の強さ（攻撃・体力に掛ける）。 */
export const COMPANION_POWER = 0.6;

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

/** 経験値を足す。上がったレベル数を返す。レベルが上がるとちゅ〜るも入る。いない猫なら 0。 */
export function addExp(save: SaveData, uid: string, exp: number): number {
  const c = save.cats[uid];
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

/** なかよし度による、基本の体力・攻撃の倍率（1 + 0.2 × なかよし度）。 */
export function bondMul(bond: number): number {
  return 1 + BOND_STAT_PER * Math.max(0, bond);
}

export { bondToNext };

/** なかよし度の経験（戦闘 n 回ぶん）を足す。なかよし度が上がったら true。 */
export function addBondExp(save: SaveData, uid: string, n = 1): boolean {
  const c = save.cats[uid];
  if (!c || c.bond >= MAX_BOND) return false;
  c.bondExp += n;
  let up = false;
  while (c.bond < MAX_BOND && c.bondExp >= bondToNext(c.bond)) {
    c.bondExp -= bondToNext(c.bond);
    c.bond++;
    up = true;
  }
  if (c.bond >= MAX_BOND) c.bondExp = 0;
  return up;
}

/** 家族の一番高いレベル（スキルツリーの段の判定に使う）。 */
export function familyLevel(save: SaveData): number {
  let lv = 1;
  for (const c of Object.values(save.cats)) lv = Math.max(lv, c.level);
  return lv;
}

// ================= うちの子・パーティ =================

/** パーティ（いる猫だけ・重なりなし・最大3）。先頭が主人公。 */
export function partyUids(save: SaveData): string[] {
  const out: string[] = [];
  for (const u of save.party) if (save.cats[u] && !out.includes(u) && out.length < PARTY_SIZE) out.push(u);
  if (!out.length) {
    const first = Object.keys(save.cats)[0];
    if (first) out.push(first);
  }
  return out;
}

/** 主人公の uid。 */
export function heroUid(save: SaveData): string {
  return partyUids(save)[0] ?? "";
}

function checkName(name: unknown): Result<string> {
  if (typeof name !== "string" || !name.trim()) return ng("名前を入れてね");
  const n = name.trim();
  if ([...n].length > MAX_CAT_NAME) return ng(`名前は ${MAX_CAT_NAME} 文字までです`);
  return ok(n);
}

function checkLook(look: unknown): Result<string> {
  return typeof look === "string" && CAT_LOOKS.includes(look) ? ok(look) : ng("見た目が見つかりません");
}

/** うちの子を登録する。新しい uid を返す。メインのわざは「ねこパンチ」から。 */
export function registerCat(save: SaveData, p: { name: string; look: string; personality: Personality }): Result<string> {
  if (Object.keys(save.cats).length >= MAX_CATS) return ng(`猫は ${MAX_CATS} 匹までです`);
  const name = checkName(p.name);
  if (!name.ok) return name;
  const look = checkLook(p.look);
  if (!look.ok) return look;
  if (!isPersonality(p.personality)) return ng("性格が見つかりません");
  const uid = newCatUid(save);
  save.cats[uid] = newCatSave(uid, name.value, look.value, p.personality, DEFAULT_MAIN_WAZA);
  return ok(uid);
}

function newCatUid(save: SaveData): string {
  let uid = `c${save.nextCatUid++}`;
  while (save.cats[uid]) uid = `c${save.nextCatUid++}`;
  return uid;
}

/** 名前・見た目・性格を変える。 */
export function updateCat(
  save: SaveData, uid: string, patch: Partial<Pick<CatSave, "name" | "look" | "personality">>,
): Result {
  const c = save.cats[uid];
  if (!c) return ng("猫が見つかりません");
  let name = c.name, look = c.look, personality = c.personality;
  if (patch.name !== undefined) {
    const r = checkName(patch.name);
    if (!r.ok) return r;
    name = r.value;
  }
  if (patch.look !== undefined) {
    const r = checkLook(patch.look);
    if (!r.ok) return r;
    look = r.value;
  }
  if (patch.personality !== undefined) {
    if (!isPersonality(patch.personality)) return ng("性格が見つかりません");
    personality = patch.personality;
  }
  c.name = name;
  c.look = look;
  c.personality = personality;
  return ok(undefined);
}

/** 猫をはずす（お別れ）。主人公ははずせない。相棒ならパーティからも外す。 */
export function removeCat(save: SaveData, uid: string): Result {
  if (!save.cats[uid]) return ng("猫が見つかりません");
  if (heroUid(save) === uid) return ng("主人公ははずせません（先にほかの猫を主人公にしてね）");
  delete save.cats[uid];
  save.party = partyUids(save).filter((u) => u !== uid);
  return ok(undefined);
}

/**
 * パーティの枠に猫を入れる（slot 0 = 主人公、1・2 = 相棒）。null で相棒を外す（主人公は外せない）。
 * ほかの枠にいる猫を入れると、入れかわる。空いた枠は詰める（相棒2だけ、にはならない）。
 */
export function setParty(save: SaveData, slot: 0 | 1 | 2, uid: string | null): Result {
  if (slot !== 0 && slot !== 1 && slot !== 2) return ng("枠が見つかりません");
  const party = partyUids(save);
  if (uid === null) {
    if (slot === 0) return ng("主人公は外せません");
    if (slot < party.length) party.splice(slot, 1);
    save.party = party;
    return ok(undefined);
  }
  if (!save.cats[uid]) return ng("猫が見つかりません");
  const cur = party.indexOf(uid);
  if (cur === slot) return ok(undefined);
  if (slot >= party.length) {
    // 空いている枠へ
    if (cur === 0) return ng("主人公は外せません（先にほかの猫を主人公にしてね）");
    if (cur > 0) party.splice(cur, 1);
    party.push(uid);
  } else {
    if (cur >= 0) party[cur] = party[slot];
    party[slot] = uid;
  }
  save.party = party.slice(0, PARTY_SIZE);
  return ok(undefined);
}

/** わざをつける（slot: "main" か、サブの 0・1）。null でサブを外す（メインは外せない）。 */
export function equipWaza(save: SaveData, uid: string, slot: "main" | 0 | 1, wazaId: string | null): Result {
  const c = save.cats[uid];
  if (!c) return ng("猫が見つかりません");
  const w = wazaId ? WAZA_MAP[wazaId] : undefined;
  if (wazaId && !w) return ng("わざが見つかりません");
  if (wazaId && !save.wazas[wazaId]) return ng("まだ覚えていないわざです");
  if (slot === "main") {
    if (!w) return ng("メインのわざは外せません");
    if (w.slot !== "main") return ng("メインのわざではありません");
    c.waza.main = w.id;
    return ok(undefined);
  }
  if (slot !== 0 && slot !== 1) return ng("枠が見つかりません");
  const subs = c.waza.subs.filter((s) => WAZA_MAP[s]);
  if (!w) {
    if (slot < subs.length) subs.splice(slot, 1);
    c.waza.subs = subs;
    return ok(undefined);
  }
  if (w.slot !== "sub") return ng("サブのわざではありません");
  const cur = subs.indexOf(w.id);
  if (cur === slot) return ok(undefined);
  if (cur >= 0) return ng("同じわざは1匹に1つだけです");
  if (slot < subs.length) subs[slot] = w.id;
  else subs.push(w.id);
  c.waza.subs = subs.slice(0, MAX_SUBS);
  return ok(undefined);
}

/** 譲渡会に来ている近所の猫（まだお迎えしていないもの）のひな形 id。 */
export function adoptableNeighbors(save: SaveData): string[] {
  const have = new Set(Object.values(save.cats).map((c) => c.preset).filter(Boolean));
  return CHARS.filter((d) => (NEIGHBOR_UNLOCK[d.id] ?? Infinity) <= save.cleared && !have.has(d.id)).map((d) => d.id);
}

/** 近所の猫をお迎えする（無料）。その猫らしいわざを覚えていればそれを、なければ「ねこパンチ」か「ちょいちょい」をつける。 */
export function adoptNeighbor(save: SaveData, presetId: string): Result<string> {
  const def = CHAR_MAP[presetId];
  if (!def) return ng("猫が見つかりません");
  if (!adoptableNeighbors(save).includes(presetId)) return ng("まだ譲渡会に来ていません");
  if (Object.keys(save.cats).length >= MAX_CATS) return ng(`猫は ${MAX_CATS} 匹までです`);
  const sig = WAZA_MAP[def.waza];
  const main = save.wazas[def.waza] ? def.waza : (sig?.role === "ranged" || sig?.role === "aoe" ? "choichoi" : DEFAULT_MAIN_WAZA);
  const uid = newCatUid(save);
  save.cats[uid] = newCatSave(uid, def.name, def.id, def.personality, main, def.id);
  return ok(uid);
}

/** その猫のメインのわざ（なければ「ねこパンチ」）。 */
export function mainWazaOf(save: SaveData, uid: string): WazaDef {
  const w = WAZA_MAP[save.cats[uid]?.waza.main ?? ""];
  return w && w.slot === "main" ? w : WAZA_MAP[DEFAULT_MAIN_WAZA];
}

/** その猫の役割（メインのわざで決まる）。 */
export function catRole(save: SaveData, uid: string): CharRole {
  return mainWazaOf(save, uid).role!;
}

/** パーティの役割（主人公から順・重なりなし）。この役割のスキルツリーが戦闘で効く。 */
export function partyRoles(save: SaveData): CharRole[] {
  const out: CharRole[] = [];
  for (const u of partyUids(save)) {
    const r = catRole(save, u);
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

// ================= スキルツリー（家族で共有・役割ごと） =================

export { nodeCost, nodeTotalCost };

/** その役割のスキルツリー。 */
export function skillTreeOf(role: CharRole): SkillNode[] {
  return SKILL_TREES[role] ?? [];
}

function roleSkills(save: SaveData, role: CharRole): Record<string, number> {
  if (!save.skills[role]) save.skills[role] = {};
  return save.skills[role];
}

/** 取ったレベル（取っていなければ 0）。 */
export function nodeLevel(save: SaveData, role: CharRole, nodeId: string): number {
  return save.skills[role]?.[nodeId] ?? 0;
}

/** 次のレベルに上げるちゅ〜る。最大レベルなら null。 */
export function nextNodeCost(save: SaveData, role: CharRole, nodeId: string): number | null {
  const node = SKILL_MAP[nodeId];
  if (!node || node.role !== role) return null;
  const lv = nodeLevel(save, role, nodeId);
  return lv >= node.maxLevel ? null : nodeCost(node, lv);
}

/** 前提・家族のレベルだけを見る（ちゅ〜るは見ない）。ツリーで「開いている」ノードを光らせる用。 */
export function isNodeOpen(save: SaveData, role: CharRole, nodeId: string): Result {
  const node = SKILL_MAP[nodeId];
  if (!node || node.role !== role) return ng("この役割のスキルではありません");
  if (nodeLevel(save, role, nodeId) >= node.maxLevel) return ng("もう最大レベルです");
  const miss = node.req.filter((r) => nodeLevel(save, role, r.id) < r.lv);
  if (miss.length) {
    return ng(`先に${miss.map((r) => `「${SKILL_MAP[r.id]?.name ?? r.id}」を Lv${r.lv}`).join("・")}まで上げてね`);
  }
  if (familyLevel(save) < node.minCharLevel) return ng(`家族のだれかのレベルが ${node.minCharLevel} になったら覚えられます`);
  return ok(undefined);
}

export function canLearn(save: SaveData, role: CharRole, nodeId: string): Result {
  const r = isNodeOpen(save, role, nodeId);
  if (!r.ok) return r;
  const cost = nextNodeCost(save, role, nodeId)!;
  if (save.churu < cost) return ng(`ちゅ〜るが足りません（あと ${cost - Math.floor(save.churu)}）`);
  return ok(undefined);
}

/** 1レベル上げる。成功したら新しいレベルを返す。 */
export function learnSkill(save: SaveData, role: CharRole, nodeId: string): Result<number> {
  const r = canLearn(save, role, nodeId);
  if (!r.ok) return r;
  save.churu -= nextNodeCost(save, role, nodeId)!;
  const sk = roleSkills(save, role);
  const lv = (sk[nodeId] ?? 0) + 1;
  sk[nodeId] = lv;
  return ok(lv);
}

/** その役割のスキルに使ったちゅ〜るの合計。 */
export function skillSpent(save: SaveData, role: CharRole): number {
  let s = 0;
  for (const [id, lv] of Object.entries(save.skills[role] ?? {})) {
    const n = SKILL_MAP[id];
    if (n) s += nodeTotalCost(n, lv);
  }
  return s;
}

/** その役割のスキルをぜんぶ忘れて、使ったちゅ〜るを全部もどす。もどった量を返す。 */
export function resetSkills(save: SaveData, role: CharRole): number {
  const refund = skillSpent(save, role);
  save.skills[role] = {};
  save.churu += refund;
  return refund;
}

function addSkillTotals(t: SkillTotals, save: SaveData, role: CharRole): void {
  for (const [id, lv] of Object.entries(save.skills[role] ?? {})) {
    const n = SKILL_MAP[id];
    if (n && n.role === role) addNodeTotals(t, n, lv);
  }
}

/** その役割のスキルツリーだけの補正。 */
export function skillMods(save: SaveData, role: CharRole): CharMods {
  const t = emptyTotals();
  addSkillTotals(t, save, role);
  return modsFromTotals(t);
}

/** その猫にかかる合計（役割のスキルツリー・メインのわざ・サブのわざ）。 */
export function catTotals(save: SaveData, uid: string): SkillTotals {
  const t = emptyTotals();
  const c = save.cats[uid];
  const main = mainWazaOf(save, uid);
  addSkillTotals(t, save, main.role!);
  addEffects(t, main.effects, wazaLevelMul(save.wazas[main.id]?.level ?? 1));
  for (const sid of c?.waza.subs ?? []) {
    const s = WAZA_MAP[sid];
    if (s && s.slot === "sub") addEffects(t, s.effects, wazaLevelMul(save.wazas[sid]?.level ?? 1));
  }
  return t;
}

/** 猫とわざの補正をまとめたもの（表示用）。 */
export function catMods(save: SaveData, uid: string): CharMods {
  return modsFromTotals(catTotals(save, uid));
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
  const aff = item.affixes.reduce((s, a) => s + a.value * (AFFIX_MAP[a.id]?.flat ? 0.4 : 1), 0);
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
  objMultishot: number;                         // うつ物の弾 +数
  objPierce: number;                            // うつ物の貫通 +数
  objChain: number;                             // 電撃の連鎖 +数
  objPoison: number;                            // 毒の強さ +割合
  objCrit: number;                              // オブジェクトの会心 +確率
}

export function equipBonus(save: SaveData): EquipBonus {
  const r: EquipBonus = {
    baseAtkMul: 1, baseHpMul: 1, charAtkMul: 1, charHpMul: 1, charMoveMul: 1, objAtk: 0, objAtkKind: {}, objInterval: 0,
    objIntervalKind: {}, objCost: 0, objHp: 0, produce: 0, objMultishot: 0, objPierce: 0, objChain: 0, objPoison: 0,
    objCrit: 0,
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
        case "objMultishot": r.objMultishot += a.value; break;
        case "objPierce": r.objPierce += a.value; break;
        case "objChain": r.objChain += a.value; break;
        case "objPoison": r.objPoison += a.value; break;
        case "objCrit": r.objCrit += a.value; break;
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

/** 猫がいないときの仮の猫（ふつうは使われない）。 */
const FALLBACK_CAT: CatSave = newCatSave("c1", CHAR_MAP.chatora.name, "chatora", CHAR_MAP.chatora.personality);

/**
 * 猫の戦闘での強さ（省くと主人公）。companion なら相棒として（攻撃・体力 ×COMPANION_POWER）。
 * どの猫も同じ式: 役割の基本の形 × メインのわざのレアリティ × なかよし度 × レベル × スキル・わざ × 性格 × 装備 × レリック。
 */
export function resolveCat(save: SaveData, uid: string = heroUid(save), companion = false): ResolvedChar {
  const c = save.cats[uid] ?? save.cats[heroUid(save)] ?? FALLBACK_CAT;
  const w = mainWazaOf(save, c.uid);
  const role = w.role!;
  const m = modsFromTotals(save.cats[c.uid] ? catTotals(save, c.uid) : emptyTotals());
  const eq = equipBonus(save);
  const rel = relicBonus(save);
  const p = PERSONALITY_MAP[c.personality] ?? PERSONALITY_MAP.nonbiri;
  const b = { ...ROLE_BASE[role], ...SPECIAL0, ...(w.shape ?? {}) };
  const lv = c.level;
  const baseMul = RARITY_MUL[w.rarity] * bondMul(c.bond) * (companion ? COMPANION_POWER : 1);
  const combos: Partial<Record<ComboId, number>> = {};
  for (const [k, v] of Object.entries(m.combos) as [ComboId, number][]) if (v > 0) combos[k] = v;
  return {
    id: c.uid,
    name: c.name,
    look: c.look,
    role,
    companion,
    combos,
    maxHp: b.maxHp * baseMul * Math.pow(CHAR_GROWTH.hp, lv - 1) * m.hpMul * (1 + p.hp) * eq.charHpMul * rel.charHp,
    atk: b.atk * baseMul * Math.pow(CHAR_GROWTH.atk, lv - 1) * m.atkMul * (1 + p.atk) * eq.charAtkMul * rel.dmg,
    atkInterval: Math.max(0.15, (b.atkInterval * m.intervalMul) / (1 + p.atkSpd)),
    range: b.range + m.range,
    aoe: b.aoe > 0 ? b.aoe + m.aoe : 0,
    moveSpeed: b.moveSpeed * m.moveMul * (1 + p.move) * eq.charMoveMul,
    restTime: Math.max(1, b.restTime * m.restMul * (1 + p.rest)),
    armor: Math.max(0.3, b.armor * m.armorMul),
    crit: Math.min(1, b.crit + m.crit),
    critMul: Math.max(1.5, b.critMul) + m.critMul,
    multiHit: Math.floor(b.multiHit + m.multiHit),
    lifesteal: Math.min(0.5, b.lifesteal + m.lifesteal),
    regen: Math.min(0.05, b.regen + m.regen),
    knockback: b.knockback + m.knockback,
    poison: b.poison + m.poison,
    slowHit: Math.max(0.3, b.slowHit - m.slow),
    pierce: role === "ranged" || b.pierce + m.pierce >= 1 ? Math.floor(b.pierce + m.pierce) : 0,
    kibbleBonus: b.kibbleBonus + m.kibbleBonus + p.kibble,
    objectAura: b.objectAura + m.objectAura,
    repair: Math.min(0.2, b.repair + m.repair),
    reviveHp: Math.min(1, Math.max(0.5, b.reviveHp + m.reviveHp)),
    dodge: Math.min(0.6, b.dodge + m.dodge),
  };
}

/** 猫のだいたいの強さ（一覧の並べかえ・おすすめ用）。DPS × 体力の平方根。 */
export function catPower(save: SaveData, uid: string): number {
  const c = resolveCat(save, uid);
  return charDps(c) * Math.sqrt(c.maxHp);
}

/** オブジェクトのレベルで解放される特殊効果の一覧（解放ずみかどうかつき）。持っていなければレベル1として。 */
export function objectPerks(save: SaveData, id: string): { level: number; id: string; name: string; desc: string; unlocked: boolean }[] {
  const def = OBJECT_MAP[id];
  if (!def) return [];
  const lv = save.objects[id]?.level ?? 1;
  return def.perks.map((p) => ({ level: p.level, id: p.id, name: p.name, desc: p.desc, unlocked: lv >= p.level }));
}

/** レベル lv で解放されている特殊効果を、基本ステータスにかける（新しい値を返す）。 */
export function applyPerks(base: ObjectBase, perks: ObjectPerk[], lv: number): { stats: ObjectBase; names: string[] } {
  const stats: ObjectBase = { ...base };
  const names: string[] = [];
  for (const p of perks) {
    if (lv < p.level) continue;
    names.push(p.name);
    for (const e of p.effects) {
      let v = stats[e.stat] as number;
      if (e.add) v += e.add;
      if (e.mul !== undefined) v *= e.mul;
      (stats[e.stat] as number) = v;
    }
  }
  return { stats, names };
}

export function resolveObject(save: SaveData, id: string): ResolvedObject | null {
  const def = OBJECT_MAP[id];
  if (!def) return null;
  const lv = save.objects[id]?.level ?? 1;
  const g = Math.pow(OBJ_LEVEL_GROWTH, lv - 1);
  const eq = equipBonus(save);
  const rel = relicBonus(save);
  const sk = modsFromTotals(catTotals(save, heroUid(save)));
  const { stats: b, names } = applyPerks(def.base, def.perks, lv);
  // 装備の基本の攻撃・体力は、猫が置くオブジェクトにも効く
  const atkMul = eq.baseAtkMul * (1 + eq.objAtk + (eq.objAtkKind[def.kind] ?? 0)) * sk.objAtkMul * rel.dmg;
  const intMul = Math.max(0.4, 1 - eq.objInterval - (eq.objIntervalKind[def.kind] ?? 0));
  const costMul = Math.max(0.4, 1 - eq.objCost - rel.objCost);
  const attacks = b.atk > 0;
  const shooter = def.kind === "shooter";
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    cost: Math.max(1, Math.round(b.cost * costMul)),
    maxHp: b.maxHp * g * eq.baseHpMul * (1 + eq.objHp) * sk.objHpMul,
    atk: b.atk * g * atkMul,
    interval: Math.max(0.1, b.interval * intMul),
    range: b.range,
    slow: Math.max(0.15, Math.min(1, b.slow)),
    produce: b.produce * (1 + OBJ_PRODUCE_PER_LEVEL * (lv - 1)) * (1 + eq.produce),
    cooldown: 0,
    upgradeCost: Math.max(1, Math.round(b.upgradeCost * costMul)),
    upgradeMul: b.upgradeMul,
    block: b.block,
    w: b.w,
    h: b.h,
    multishot: Math.floor(b.multishot + (shooter ? eq.objMultishot : 0)),
    // 弾を増やす補正だけのときは、少し広げる
    spread: b.spread > 0 || !(shooter && eq.objMultishot > 0) ? b.spread : 0.4,
    pierce: Math.floor(b.pierce + (shooter ? eq.objPierce : 0)),
    splash: b.splash,
    chain: Math.floor(b.chain + (def.kind === "zap" ? eq.objChain : 0)),
    chainRange: b.chainRange,
    poison: b.poison * (1 + eq.objPoison),
    poisonSpread: b.poisonSpread,
    knockback: b.knockback,
    crit: attacks ? Math.min(1, b.crit + eq.objCrit) : 0,
    critMul: Math.max(1.5, b.critMul),
    perks: names,
  };
}

/** オブジェクトを計算する（省くと持っていくもの）。 */
export function resolveObjects(save: SaveData, ids: string[] = save.loadout): ResolvedObject[] {
  return ids.map((id) => resolveObject(save, id)).filter((o): o is ResolvedObject => !!o);
}

/** 戦闘を始めるのに必要なものをそろえる（主人公・相棒・オブジェクト）。ステージがなければ null。 */
export function buildLoadout(save: SaveData, stageId: string): Loadout | null {
  const stage = stageById(stageId);
  if (!stage) return null;
  const rel = relicBonus(save);
  const bugs: Record<string, BugDef> = bugDefs();
  const [hero, ...rest] = partyUids(save);
  return {
    char: resolveCat(save, hero),
    companions: rest.map((u) => resolveCat(save, u, true)),
    objects: resolveObjects(save),
    stage,
    bugs,
    global: { kibbleMul: 1 + rel.kibble, startKibbleAdd: rel.startKibble, mamaHp: BASE_MAMA_HP + rel.mamaHp },
  };
}

// ================= 戦力の目安 =================

/** 置くオブジェクトの数の目安（同じものを何こ置くか）。 */
const OBJ_COPIES = 2;
/** 相棒はいつも戦えるわけではない（主人公についていく・休けい）ので、DPS を少し控えめに見る。 */
const COMPANION_UPTIME = 0.6;

/** 複合効果による DPS の上乗せの上限（目安なので、のびすぎないように）。 */
const COMBO_DPS_CAP = 2.5;

/** 複合効果による DPS のだいたいの上乗せ（倍率）。くわしい動きは戦闘しだいなので、控えめに見る。 */
export function comboDpsFactor(c: ResolvedChar): number {
  const k = c.combos ?? {};
  const v = (id: ComboId) => k[id] ?? 0;
  let f = 1;
  f *= 1 + v("critChain") * 0.25 * (c.crit ?? 0);
  f *= 1 + Math.min(1, v("frenzy") * 3) * 0.25;
  f *= 1 + Math.min(1, v("kibbleFever") * 3) * 0.2;
  f *= 1 + v("partyLink") * 0.3;
  f *= 1 + v("bossHunter") * 0.05;
  f *= 1 + v("lastStand") * 0.05;
  f *= 1 + v("mamaGuard") * 0.15;
  f *= 1 + v("slowShatter") * ((c.slowHit ?? 1) < 1 ? 0.4 : 0.1);
  f *= 1 + v("pierceGrow") * (c.pierce ?? 0) * 0.3;
  f *= 1 + Math.min(1.5, v("multiEcho")) * 0.2 * ((c.multiHit ?? 0) > 0 ? 1 : 0.1);
  f *= 1 + v("poisonBurst") * Math.min(1, (c.poison ?? 0) + (v("zapVenom") > 0 ? 0.5 : 0)) * 0.3;
  f *= 1 + v("overkill") * 0.15;
  f *= 1 + v("knockSlam") * Math.min(1, c.knockback ?? 0) * 0.15;
  f *= 1 + v("shockwave") * 0.05;
  f *= 1 + v("zapVenom") * 0.15 * ((c.aoe ?? 0) > 0 || v("critChain") > 0 ? 1 : 0.2);
  f *= 1 + v("dodgeCounter") * (c.dodge ?? 0) * 0.5;
  f *= 1 + Math.min(1, v("venomCrit")) * Math.max(0, (c.critMul ?? 1.5) - 1) * ((c.poison ?? 0) > 0 ? 0.25 : 0);
  return Math.min(COMBO_DPS_CAP, f);
}

/** 猫のだいたいの DPS（会心・連続攻撃・範囲・貫通・毒・複合効果をならしたもの）。 */
export function charDps(c: ResolvedChar): number {
  const critF = 1 + (c.crit ?? 0) * Math.max(0, (c.critMul ?? 1.5) - 1);
  const multiF = 1 + (c.multiHit ?? 0);
  const areaF = c.aoe > 0 ? 1 + c.aoe : 1;
  const pierceF = 1 + 0.5 * (c.pierce ?? 0);
  const poisonF = 1 + Math.min(1, (c.poison ?? 0) * 1.5);
  return (c.atk / c.atkInterval) * critF * multiF * areaF * pierceF * poisonF * comboDpsFactor(c);
}

/**
 * オブジェクト1つのだいたいの DPS（虫の群れに対して。拡散・貫通・爆発・連鎖・毒・範囲をならしたもの）。
 * 群れは次々に来るが、いつも全部に当たるわけではないので、まとめて当たる数は控えめに見る。
 */
export function objectDps(o: ResolvedObject): number {
  const critF = 1 + (o.crit ?? 0) * Math.max(0, (o.critMul ?? 1.5) - 1);
  const base = (o.atk / Math.max(0.1, o.interval)) * critF;
  const poisonF = 1 + Math.min(4, (o.poison ?? 0) * 1.5) * (1 + 0.5 * (o.poisonSpread ?? 0));
  const area = (r: number) => 1 + 0.6 * r;  // 半径 r の範囲で、だいたい何匹に当たるか
  switch (o.kind) {
    case "shooter": {
      const f = (1 + 0.4 * (o.multishot ?? 0)) * (1 + 0.3 * (o.pierce ?? 0)) * (1 + 0.8 * (o.splash ?? 0));
      return base * Math.min(8, f) * poisonF;
    }
    case "aoe": return base * area(o.range) * poisonF;
    case "zap": return base * Math.min(8, 1 + 0.5 * (o.chain ?? 0)) * poisonF;
    case "poison": return base * area(o.range) * poisonF;
    case "slow": return base * area(Math.max(0, o.range - 0.5)) * poisonF;
    // わなは1回きり。だいたい数秒に1つ置きなおすとして
    case "mine": return (o.atk / 6) * critF * (1 + 1.2 * (o.splash ?? 0));
    default: return 0;
  }
}

/** だいたいの DPS（1秒あたりのダメージ）。char は主人公、companions は相棒の合計。 */
export function estimateDps(
  lo: Pick<Loadout, "char" | "objects"> & Partial<Pick<Loadout, "companions">>,
): { char: number; companions: number; objects: number; total: number } {
  const c = lo.char;
  const char = charDps(c);
  let companions = 0;
  for (const m of lo.companions ?? []) companions += charDps(m) * COMPANION_UPTIME;
  let objects = 0;
  for (const o of lo.objects) objects += objectDps(o);
  objects *= OBJ_COPIES * (1 + (c.objectAura ?? 0) * 0.5);
  return { char, companions, objects, total: char + companions + objects };
}

/** 虫がママまで歩く道のりの目安（マス）。14×18 の盤面で、家具やオブジェクトをよけて遠回りする。 */
export const PATH_TILES = 30;

/** ステージの虫の体力の合計と、だいたいの長さ（秒。最後の虫がママに着くまで）。 */
export function stageLoad(stage: StageDef): { totalHp: number; duration: number; count: number } {
  const bugs = bugDefs();
  let totalHp = 0, count = 0, end = 0;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      totalHp += (b?.hp ?? 0) * stage.hpMul * g.count;
      count += g.count;
      const walk = PATH_TILES / Math.max(0.1, b?.speed ?? 0.5);
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
  /** 新しく譲渡会に来た近所の猫（ひな形 id）。 */
  newNeighbors: string[];
  levelUps: Record<string, number>;   // 猫の uid → 上がったレベル数
  bondUps: Record<string, number>;    // 猫の uid → 上がったあとのなかよし度（上がった猫だけ）
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

/** クリアした数に合わせて、オブジェクトを手に入れる。新しく増えた id を返す。 */
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

/**
 * ステージに勝ったときに呼ぶ。報酬を抽選して save に入れ、クリアを記録する。
 * 経験値: パーティ（主人公・相棒）は全部、控えの猫は IDLE_EXP_RATE。なかよし度: パーティの猫に戦闘1回ぶん。
 */
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
  const party = partyUids(save);
  const levelUps: Record<string, number> = {};
  const bondUps: Record<string, number> = {};
  for (const uid of Object.keys(save.cats)) {
    const inParty = party.includes(uid);
    const ups = addExp(save, uid, inParty ? exp : Math.round(exp * IDLE_EXP_RATE));
    if (ups) levelUps[uid] = ups;
    if (inParty && addBondExp(save, uid, 1)) bondUps[uid] = save.cats[uid].bond;
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
  const before = new Set(adoptableNeighbors(save));
  save.clearCounts[stage.id] = (save.clearCounts[stage.id] ?? 0) + 1;
  if (firstClear) save.cleared = g;
  const { newObjects } = syncUnlocks(save);
  const newNeighbors = adoptableNeighbors(save).filter((id) => !before.has(id));

  return {
    stageId: stage.id, firstClear, exp, coins, relicPoints, churu, churuFromLevels, equips,
    shards: [...shardMap].map(([id, count]) => ({ id, count })),
    newObjects, newNeighbors, levelUps, bondUps,
  };
}

// 使いやすいように定義も出しておく
export { CHARS, OBJECTS, EQUIPS, RELICS, STAGES, WAZAS, ROLES };
