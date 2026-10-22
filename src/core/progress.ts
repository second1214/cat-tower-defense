// 成長の計算（セーブデータをさわる純粋な関数たち）。
// 関数は save をその場で書きかえる。保存（writeSave）は呼ぶ側でする。
import type { BugDef, CatSpecial, CharRole, ComboId, Loadout, ObjectKind, Personality, Rarity, ResolvedChar, ResolvedObject, StageDef } from "./types";
import { type Rng, pickWeighted, randInt } from "./rng";
import { type CatSave, type SaveData, MAX_CATS, MAX_LOADOUT, PARTY_SIZE, ROLES, newCatSave } from "./save";
import { BOND_STAT_PER, CAT_LOOKS, CHARS, CHAR_MAP, MAX_BOND, MAX_CAT_NAME, bondToNext } from "../data/chars";
import {
  SKILL_MAP, SKILL_TREE, nodeAppliesTo, type CharMods, type SkillNode, type SkillTotals, addEffects, addNodeTotals, emptyTotals,
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
import { ENDLESS_REWARDS, type EndlessReward } from "../data/endless";
import { makeEndlessStage, STAGES, STAGE_MAP, mazeLength, stageIndexOf } from "../data/stages";
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
export const COMPANION_POWER = 0.45;

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

// ================= スキルツリー（家族みんなで1つ） =================

export { nodeCost, nodeTotalCost };

/** スキルツリー（みんなの枝 ＋ 役割の枝）。 */
export function skillTree(): SkillNode[] {
  return SKILL_TREE;
}

/** 取ったレベル（取っていなければ 0）。 */
export function nodeLevel(save: SaveData, nodeId: string): number {
  return save.skills[nodeId] ?? 0;
}

/** 次のレベルに上げるちゅ〜る。最大レベル・ないノードなら null。 */
export function nextNodeCost(save: SaveData, nodeId: string): number | null {
  const node = SKILL_MAP[nodeId];
  if (!node) return null;
  const lv = nodeLevel(save, nodeId);
  return lv >= node.maxLevel ? null : nodeCost(node, lv);
}

/** 前提・家族のレベルだけを見る（ちゅ〜るは見ない）。ツリーで「開いている」ノードを光らせる用。 */
export function isNodeOpen(save: SaveData, nodeId: string): Result {
  const node = SKILL_MAP[nodeId];
  if (!node) return ng("このスキルはありません");
  if (nodeLevel(save, nodeId) >= node.maxLevel) return ng("もう最大レベルです");
  const miss = node.req.filter((r) => nodeLevel(save, r.id) < r.lv);
  if (miss.length) {
    return ng(`先に${miss.map((r) => `「${SKILL_MAP[r.id]?.name ?? r.id}」を Lv${r.lv}`).join("・")}まで上げてね`);
  }
  if (familyLevel(save) < node.minCharLevel) return ng(`家族のだれかのレベルが ${node.minCharLevel} になったら覚えられます`);
  return ok(undefined);
}

export function canLearn(save: SaveData, nodeId: string): Result {
  const r = isNodeOpen(save, nodeId);
  if (!r.ok) return r;
  const cost = nextNodeCost(save, nodeId)!;
  if (save.churu < cost) return ng(`ちゅ〜るが足りません（あと ${cost - Math.floor(save.churu)}）`);
  return ok(undefined);
}

/** 1レベル上げる。成功したら新しいレベルを返す。 */
export function learnSkill(save: SaveData, nodeId: string): Result<number> {
  const r = canLearn(save, nodeId);
  if (!r.ok) return r;
  save.churu -= nextNodeCost(save, nodeId)!;
  const lv = nodeLevel(save, nodeId) + 1;
  save.skills[nodeId] = lv;
  return ok(lv);
}

/** スキルに使ったちゅ〜るの合計。 */
export function skillSpent(save: SaveData): number {
  let s = 0;
  for (const [id, lv] of Object.entries(save.skills)) {
    const n = SKILL_MAP[id];
    if (n) s += nodeTotalCost(n, lv);
  }
  return s;
}

/** スキルをぜんぶ忘れて、使ったちゅ〜るを全部もどす。もどった量を返す。 */
export function resetSkills(save: SaveData): number {
  const refund = skillSpent(save);
  save.skills = {};
  save.churu += refund;
  return refund;
}

/** スキルの合計の覚え書き（skills の中身が同じなら、計算しなおさない）。 */
const skillCache = new WeakMap<Record<string, number>, Map<CharRole, { sig: string; t: SkillTotals }>>();

/** その役割の猫に効くノード（みんなの枝 ＋ その役割の枝）を合計に足す。 */
function addSkillTotals(t: SkillTotals, save: SaveData, role: CharRole): void {
  const sk = save.skills;
  // 中身のしるし（ノードの数・レベルの合計・重みつきの合計）
  let n = 0, sum = 0, w = 0;
  for (const id in sk) { const lv = sk[id]; n++; sum += lv; w += lv * (id.length + id.charCodeAt(id.length - 1)) * n; }
  const sig = `${n}/${sum}/${w}`;
  let byRole = skillCache.get(sk);
  if (!byRole) { byRole = new Map(); skillCache.set(sk, byRole); }
  let hit = byRole.get(role);
  if (!hit || hit.sig !== sig) {
    const st = emptyTotals();
    for (const id in sk) {
      const node = SKILL_MAP[id];
      if (node && nodeAppliesTo(node, role)) addNodeTotals(st, node, sk[id]);
    }
    hit = { sig, t: st };
    byRole.set(role, hit);
  }
  for (const key in hit.t) {
    if (key === "combos") {
      for (const [c, v] of Object.entries(hit.t.combos) as [ComboId, number][]) t.combos[c] = (t.combos[c] ?? 0) + v;
    } else (t as unknown as Record<string, number>)[key] += (hit.t as unknown as Record<string, number>)[key];
  }
}

/** その役割の猫にかかる、スキルツリーだけの補正。 */
export function skillMods(save: SaveData, role: CharRole): CharMods {
  const t = emptyTotals();
  addSkillTotals(t, save, role);
  return modsFromTotals(t);
}

/** その猫にかかる合計（スキルツリーのみんなの枝と役割の枝・メインのわざ・サブのわざ）。 */
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

/**
 * スキルの付け替え（いちばん上のレアリティ UR どうし・同じ枠）。
 * donor（もとになる装備）は消える。base の補正 baseAffixIndex 番を、donor の補正 donorAffixIndex 番（ふった値のまま）に入れかえる。
 * 1回で付け替えられるのは1つだけ。base に同じ補正がほかにあるときはできない。donor をつけていたら、かわりに base をつける。
 */
export function transferAffix(
  save: SaveData, baseUid: string, donorUid: string, donorAffixIndex: number, baseAffixIndex: number,
): Result<EquipItem> {
  if (baseUid === donorUid) return ng("ちがう装備を2つ選んでね");
  const base = findEquip(save, baseUid);
  const donor = findEquip(save, donorUid);
  if (!base || !donor) return ng("見つからない装備があります");
  if (base.rarity !== MAX_EQUIP_RARITY || donor.rarity !== MAX_EQUIP_RARITY) return ng("UR の装備どうしだけ付け替えられます");
  if (base.slot !== donor.slot) return ng("同じ枠の装備を選んでね");
  const from = donor.affixes[donorAffixIndex];
  const to = base.affixes[baseAffixIndex];
  if (!Number.isInteger(donorAffixIndex) || !from) return ng("もらう補正を選んでね");
  if (!Number.isInteger(baseAffixIndex) || !to) return ng("入れかえる補正を選んでね");
  if (base.affixes.some((x, i) => i !== baseAffixIndex && x.id === from.id)) return ng("同じ補正がもうついています");
  const donorEquipped = isEquipped(save, donorUid);
  base.affixes[baseAffixIndex] = { id: from.id, value: from.value };
  save.equips = save.equips.filter((e) => e.uid !== donorUid);
  for (const s of EQUIP_SLOTS) if (save.equipped[s] === donorUid) delete save.equipped[s];
  if (donorEquipped) save.equipped[base.slot] = base.uid;
  return ok(base);
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

/** 必殺技の形（役割で決まる）。 */
export const SPECIAL_KIND: Record<CharRole, CatSpecial["kind"]> = { melee: "burst", ranged: "line", aoe: "nova", fast: "dash" };
/** 必殺技の威力（猫の攻撃力の何倍か。メインのわざのレアリティ）。レアなわざほど、ここで大きく差がつく。 */
export const SPECIAL_POWER: Record<Rarity, number> = { N: 5, R: 7, SR: 10, SSR: 14, UR: 20, EX: 26 };
/** 必殺技のゲージがたまる秒数。 */
export const SPECIAL_CHARGE: Record<Rarity, number> = { N: 18, R: 16, SR: 14, SSR: 12, UR: 10, EX: 9 };

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
    special: {
      kind: SPECIAL_KIND[role],
      name: w.name,
      power: SPECIAL_POWER[w.rarity] * wazaLevelMul(save.wazas[w.id]?.level ?? 1),
      charge: SPECIAL_CHARGE[w.rarity],
    },
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

/** オブジェクトの攻撃の底上げ（押し戻しで足止めできなくなったぶん。オブジェクトが主役）。 */
export const OBJ_ATK_BOOST = 1.5;

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
  const atkMul = OBJ_ATK_BOOST * eq.baseAtkMul * (1 + eq.objAtk + (eq.objAtkKind[def.kind] ?? 0)) * sk.objAtkMul * rel.dmg;
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
    ex: def.rarity === "EX" || undefined,
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

// ================= エンドレス =================

/** エンドレスを何番目の波から始めるか（記録の 10 波手前の、10 のきり。記録が 20 未満なら 0 から）。 */
export function endlessStart(save: SaveData): number {
  return save.endlessBest >= 20 ? Math.floor((save.endlessBest - 10) / 10) * 10 : 0;
}

/** エンドレスの戦闘を始めるのに必要なもの。 */
export function buildEndlessLoadout(save: SaveData, start = endlessStart(save)): Loadout {
  const lo = buildLoadout(save, STAGES[0].id)!;
  return { ...lo, stage: makeEndlessStage(start) };
}

export interface EndlessResult {
  /** こえた波（全員共通のものさし。start + その回にこえた数）。 */
  reached: number;
  best: number;
  newBest: boolean;
  churu: number;
  coins: number;
  /** この回で新しく手に入れた EX。 */
  unlocked: EndlessReward[];
}

/** 記録に届いた EX を手に入れる（まだのものだけ）。新しく手に入れたものを返す。 */
export function syncEndlessRewards(save: SaveData): EndlessReward[] {
  const got: EndlessReward[] = [];
  for (const r of ENDLESS_REWARDS) {
    if (r.wave > save.endlessBest || save.exUnlocked.includes(r.id)) continue;
    save.exUnlocked.push(r.id);
    if (r.kind === "waza") { if (!save.wazas[r.id]) save.wazas[r.id] = { level: 1, count: 1 }; }
    else if (!save.objects[r.id]) save.objects[r.id] = { level: catchUpLevel(save), shards: 0 };
    got.push(r);
  }
  return got;
}

/** 次に手に入る EX（全部手に入れたら undefined）。 */
export function nextEndlessReward(save: SaveData): EndlessReward | undefined {
  return ENDLESS_REWARDS.find((r) => !save.exUnlocked.includes(r.id));
}

/** エンドレスの結果を記録して、ごほうびを渡す（こえた波 1 つにつき ちゅ〜る 1・お金は少し）。 */
export function recordEndless(save: SaveData, start: number, wavesCleared: number): EndlessResult {
  const reached = start + Math.max(0, wavesCleared);
  const newBest = reached > save.endlessBest;
  if (newBest) save.endlessBest = reached;
  const unlocked = syncEndlessRewards(save);
  const churu = Math.max(0, wavesCleared);
  const coins = Math.round(wavesCleared * 5 * Math.pow(1.15, start / 10));
  save.churu += churu;
  save.coins += coins;
  return { reached, best: save.endlessBest, newBest, churu, coins, unlocked };
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
 * crowd: 虫のこみ具合（1 がふつう）。こんでいるほど、範囲・拡散・貫通・連鎖がたくさんの虫に当たる。
 */
export function objectDps(o: ResolvedObject, crowd = 1): number {
  const critF = 1 + (o.crit ?? 0) * Math.max(0, (o.critMul ?? 1.5) - 1);
  const base = (o.atk / Math.max(0.1, o.interval)) * critF;
  const poisonF = 1 + Math.min(4, (o.poison ?? 0) * 1.5) * (1 + 0.5 * (o.poisonSpread ?? 0) * crowd);
  const area = (r: number) => 1 + 0.6 * r * crowd;  // 半径 r の範囲で、だいたい何匹に当たるか
  const cap = 8 * Math.max(1, crowd);
  switch (o.kind) {
    case "shooter": {
      const f = (1 + 0.4 * (o.multishot ?? 0) * Math.sqrt(crowd)) * (1 + 0.3 * (o.pierce ?? 0) * crowd) * (1 + 0.8 * (o.splash ?? 0) * crowd);
      return base * Math.min(cap, f) * poisonF;
    }
    case "aoe": return base * area(o.range) * poisonF;
    case "zap": return base * Math.min(cap, 1 + 0.5 * (o.chain ?? 0) * Math.min(1.5, crowd)) * poisonF;
    case "poison": return base * area(o.range) * poisonF;
    case "slow": return base * area(Math.max(0, o.range - 0.5)) * poisonF;
    // わなは1回きり。だいたい数秒に1つ置きなおすとして
    case "mine": return (o.atk / 6) * critF * (1 + 1.2 * (o.splash ?? 0) * crowd);
    default: return 0;
  }
}

/** 虫のこみ具合のふつう（道 1 マスあたりの虫の数の目安 = 1秒に出てくる数 ÷ 速さ）。 */
export const CROWD_BASE = 2.7;
/**
 * ステージの虫のこみ具合（objectDps の crowd）と、オブジェクトが虫をねらえる割合（util）。
 * 虫がたくさん・ゆっくり来るほど、道にぎっしり並ぶ。虫が少ないと、オブジェクトは届く所に虫がいなくて休んでいる時間が長い。
 */
export function stageCrowd(stage: StageDef): { crowd: number; util: number } {
  const { count, duration } = stageLoad(stage);
  const bugs = bugDefs();
  let sp = 0, n = 0;
  for (const w of stage.waves) for (const g of w.bugs) { const b = bugs[g.bug]; if (b) { sp += b.speed * g.count; n += g.count; } }
  const speed = n > 0 ? Math.max(0.2, sp / n) : 0.45;
  const dense = duration > 0 ? count / duration / speed : 0;
  return { crowd: Math.max(0.5, dense / CROWD_BASE), util: dense / (dense + UTIL_HALF) };
}
/** util が半分になる、こみ具合（道 1 マスあたりの虫の数 × 速さの逆数）。 */
const UTIL_HALF = 1.3;

/** 戦闘中に置くオブジェクトの数の目安の上限（盤面の広さ・道ぞいの場所）。 */
export const MAX_PLACED = 40;
/** 戦闘で手に入るカリカリのうち、置くのに使う割合（残りは強化）。 */
const PLACE_SHARE = 0.45;
/** 戦闘中の強化は途中から効くので、時間でならした効き目の割合。 */
const UPGRADE_TIME_AVG = 0.7;
/** 餌皿などのカリカリは、置いてから効く（時間でならした割合）。 */
const PRODUCE_TIME_AVG = 0.6;

/** 1回の戦闘で手に入るカリカリの目安（はじめの分＋虫が落とす分）。餌皿の分は入れない。 */
export function stageKibble(stage: StageDef, kibbleMul = 1, startAdd = 0): number {
  const bugs = bugDefs();
  let k = stage.startKibble + startAdd;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      if (b) k += g.count * Math.max(1, Math.floor(b.pack ?? 1)) * b.drop * kibbleMul;
    }
  }
  return k;
}

/**
 * 戦闘中のオブジェクトのだいたいの強さ（カリカリで、いくつ置けて、どれだけ強化できるか）。
 * 強化は1回ごとに upgradeMul 倍・コストは 1.5 倍なので、カリカリが多いステージ（虫が多い）ほど強くなる。
 * dps は、置いた全部の合計（攻撃するものだけ）。
 */
export function inBattleObjects(objs: ResolvedObject[], kibble: number, crowd = 1): { placed: number; upMul: number; dps: number } {
  const atk = objs.filter((o) => o.kind !== "producer" && o.kind !== "wall").map((o) => ({ o, d: objectDps(o, crowd) })).filter((x) => x.d > 0);
  if (!atk.length || !(kibble > 0)) return { placed: 0, upMul: 1, dps: 0 };
  // 強いものほどたくさん置く（DPS の重みでならす）
  const sum = atk.reduce((a, x) => a + x.d, 0);
  const avg = (f: (o: ResolvedObject) => number) => atk.reduce((a, x) => a + f(x.o) * x.d, 0) / sum;
  const dps = atk.reduce((a, x) => a + x.d * x.d, 0) / sum;
  const cost = Math.max(1, avg((o) => o.cost));
  const upCost = Math.max(1, avg((o) => o.upgradeCost));
  const upMul = Math.max(1, avg((o) => o.upgradeMul));
  const placed = Math.min(MAX_PLACED, Math.max(1, (kibble * PLACE_SHARE) / cost));
  const rest = Math.max(0, kibble - placed * cost);
  const n = Math.log(1 + (0.5 * rest) / placed / upCost) / Math.log(1.5);
  const up = 1 + (Math.pow(upMul, n) - 1) * UPGRADE_TIME_AVG;
  return { placed, upMul: up, dps: dps * placed * up };
}

/** ステージの虫の、猫からのダメージの倍率（かたい虫 catResist を、体力の重みでならしたもの）。 */
export function stageCatResist(stage: StageDef): number {
  const bugs = bugDefs();
  let hp = 0, eff = 0;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      if (!b) continue;
      const x = b.hp * g.count * Math.max(1, Math.floor(b.pack ?? 1));
      hp += x;
      eff += x * (b.catResist ?? 1);
    }
  }
  return hp > 0 ? eff / hp : 1;
}

/**
 * 猫が戦闘で出せる、だいたいの DPS（かたい虫・1匹ずつしか叩けないことを入れたもの）。
 * 猫は1回に1匹（範囲・貫通・連続攻撃で少し増える）なので、虫が多くて1匹が弱いほど、DPS を使いきれない。
 */
export function catEffDps(c: ResolvedChar, stage: StageDef): number {
  const { totalHp, count } = stageLoad(stage);
  const avgHp = count > 0 ? totalHp / count : 0;
  const hits = (1 / Math.max(0.1, c.atkInterval)) * (1 + (c.multiHit ?? 0)) * (c.aoe > 0 ? 1 + 1.5 * c.aoe : 1) * (1 + 0.5 * (c.pierce ?? 0));
  return Math.min(charDps(c) * stageCatResist(stage), hits * avgHp * CAT_KILL_CAP);
}
/** 1回の攻撃で倒せる数の上限の目安（移動・ねらう虫えらびのむだもある）。 */
const CAT_KILL_CAP = 0.6;

/**
 * 群れへのまとめ当たりの伸び（1ステージごとに e^STAGE_MULTI 倍）。
 * 先のステージほど、虫がこんで迷路にならび、オブジェクトの特殊効果（拡散・貫通・爆発・連鎖・毒の伝染）も増えて、
 * 1回でたくさんの虫に当たる。本物の戦闘（tests/bot.ts のボット）に合わせた値。
 * （特殊効果の数そのもので見ると、回して育てたときに目安だけが急に伸びすぎるので、ステージで見る）
 */
export const STAGE_MULTI = 0.068;
/** 目安の全体の倍率（群れ・ぬし）。本物の戦闘に合わせた値。 */
const EST_SCALE = 2;
const EST_SCALE_BOSS = 0.35;

/** ステージの虫を、ふつうの虫（群れ）とぬし（ボス）に分けたもの。 */
export function stageParts(stage: StageDef): {
  regHp: number; regCount: number; regSpeed: number; bossHp: number; bossCount: number; bossSpeed: number; path: number;
} {
  const bugs = bugDefs();
  let regHp = 0, regCount = 0, sp = 0, bossHp = 0, bossCount = 0, bossSpeed = 0.25;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      if (!b) continue;
      const n = g.count * Math.max(1, Math.floor(b.pack ?? 1));
      if (b.boss) { bossHp = Math.max(bossHp, b.hp * stage.hpMul); bossCount += n; bossSpeed = b.speed; continue; }
      regHp += b.hp * stage.hpMul * n;
      regCount += n;
      sp += b.speed * n;
    }
  }
  const path = stage.obstacles ? Math.max(18, mazeLength(stage.obstacles)) : PATH_TILES;
  return { regHp, regCount, regSpeed: regCount > 0 ? Math.max(0.2, sp / regCount) : 0.45, bossHp, bossCount, bossSpeed, path };
}

/**
 * ステージでの戦力の余裕（1 をこえると勝てそう）。ステージがわかるときの目安（powerRatio・estimateDps が使う）。
 * - 群れ: 1匹の虫がママまで歩くあいだ（迷路の長さ ÷ 速さ）に、道ぞいのオブジェクトと猫が削れる量 と、虫の体力の合計をくらべる。
 *   オブジェクトは、カリカリで置ける数と強化（inBattleObjects）、こみ具合と特殊効果で、まとめて当たる数がふえる。
 *   猫は、かたい虫・1匹ずつしか叩けないことを入れる（catEffDps）
 * - ぬし（ボス）: 1匹ずつなので、まとめて当たる効果はない。ぬしが歩くあいだに倒せるか（いちばん強い1匹に当てる強さ × 置いた数）
 * どちらも足りないと勝てない（小さい方）。parts は、群れのダメージのうちわけ（猫・相棒・オブジェクト）。
 */
export function stageRatio(lo: Pick<Loadout, "char" | "objects" | "stage"> & Partial<Pick<Loadout, "companions" | "global">>): {
  ratio: number; swarm: number; boss: number; parts: { char: number; companions: number; objects: number };
} {
  const c = lo.char, st = lo.stage;
  const comps = lo.companions ?? [];
  const char = catEffDps(c, st);
  let companions = 0;
  for (const m of comps) companions += catEffDps(m, st) * COMPANION_UPTIME;
  const kMul = (lo.global?.kibbleMul ?? 1) * (1 + Math.max(0, ...[c, ...comps].map((x) => x.kibbleBonus ?? 0)));
  let kibble = stageKibble(st, kMul, lo.global?.startKibbleAdd ?? 0);
  // 餌皿（producer）を1つ置いたぶん
  const prod = lo.objects.filter((o) => o.kind === "producer" && o.produce > 0);
  if (prod.length) {
    const best = Math.max(...prod.map((o) => o.produce / Math.max(0.5, o.interval)));
    kibble += best * stageLoad(st).duration * PRODUCE_TIME_AVG * (lo.global?.kibbleMul ?? 1);
  }
  const { crowd, util } = stageCrowd(st);
  const one = inBattleObjects(lo.objects, kibble, 1);
  const many = inBattleObjects(lo.objects, kibble, crowd);
  const attackers = lo.objects.filter((o) => o.kind !== "producer" && o.kind !== "wall" && o.atk > 0);
  const multi = Math.exp(STAGE_MULTI * Math.max(0, stageIndexOf(st.id)));
  const aura = 1 + (c.objectAura ?? 0) * 0.5;
  const objects = one.dps * util * multi * aura;
  const p = stageParts(st);
  const walk = p.path / p.regSpeed;
  const swarm = p.regHp > 0 ? (EST_SCALE * (char + companions + objects) * walk) / p.regHp : Infinity;
  let boss = Infinity;
  if (p.bossCount > 0 && p.bossHp > 0) {
    const single = Math.max(0, ...attackers.map((o) => (o.atk / Math.max(0.1, o.interval)) * (1 + (o.crit ?? 0) * Math.max(0, (o.critMul ?? 1.5) - 1))));
    const catBoss = [c, ...comps].reduce((a, x, i) => a + charDps(x) * (1 + (x.combos?.bossHunter ?? 0)) * (i === 0 ? 1 : COMPANION_UPTIME), 0);
    const dps = catBoss + many.placed * single * many.upMul * aura;
    boss = (EST_SCALE_BOSS * dps * (p.path / p.bossSpeed)) / p.bossHp;
  }
  return { ratio: Math.min(swarm, boss), swarm, boss, parts: { char, companions, objects } };
}

/**
 * だいたいの DPS（1秒あたりのダメージ）。char は主人公、companions は相棒の合計。
 * lo.stage があれば、そのステージで（stageRatio）。total は「total × 長さ ÷ 体力の合計 = 余裕」になるようにならした値
 * （画面は stageLoad と total で余裕を出す）。char・companions・objects は、そのうちわけ。
 * なければ、ならした目安。
 */
export function estimateDps(
  lo: Pick<Loadout, "char" | "objects"> & Partial<Pick<Loadout, "companions" | "stage" | "global">>,
): { char: number; companions: number; objects: number; total: number } {
  const c = lo.char;
  if (lo.stage) {
    const r = stageRatio({ ...lo, stage: lo.stage });
    const { totalHp, duration } = stageLoad(lo.stage);
    const total = duration > 0 ? (r.ratio * totalHp) / duration : 0;
    const sum = r.parts.char + r.parts.companions + r.parts.objects;
    const f = sum > 0 ? total / sum : 0;
    return { char: r.parts.char * f, companions: r.parts.companions * f, objects: r.parts.objects * f, total };
  }
  const char = charDps(c);
  let companions = 0;
  for (const m of lo.companions ?? []) companions += charDps(m) * COMPANION_UPTIME;
  let objects = 0;
  for (const o of lo.objects) objects += objectDps(o);
  objects *= OBJ_COPIES * (1 + (c.objectAura ?? 0) * 0.5);
  return { char, companions, objects, total: char + companions + objects };
}

/** 虫がママまで歩く道のりの目安（マス。家具の迷路がないとき）。ステージがあれば mazeLength で測る。 */
export const PATH_TILES = 30;

/** ステージの虫の体力の合計と、だいたいの長さ（秒。最後の虫がママに着くまで）。 */
export function stageLoad(stage: StageDef): { totalHp: number; duration: number; count: number } {
  const bugs = bugDefs();
  // 道のり: 家具の迷路が長いほど、虫は長く歩く（オブジェクトが長く当てられる）
  const path = stage.obstacles ? Math.max(18, mazeLength(stage.obstacles)) * 1.25 : PATH_TILES;
  let totalHp = 0, count = 0, end = 0;
  for (const w of stage.waves) {
    for (const g of w.bugs) {
      const b = bugs[g.bug];
      const n = g.count * Math.max(1, Math.floor(b?.pack ?? 1));
      totalHp += (b?.hp ?? 0) * stage.hpMul * n;
      count += n;
      const walk = path / Math.max(0.1, b?.speed ?? 0.5);
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
  levelUps: Record<string, number>;   // 猫の uid → 上がったレベル数
  bondUps: Record<string, number>;    // 猫の uid → 上がったあとのなかよし度（上がった猫だけ）
}

/** 小数の回数を、確率で整数にする（2.3 → 2 か 3）。 */
function rollCount(n: number, rng: Rng): number {
  const f = Math.floor(n);
  return f + (rng() < n - f ? 1 : 0);
}

/**
 * ステージ（通し番号 g）で落ちる装備のレアリティ。
 * 上のレアリティは早めに出はじめるが、とても出にくい（step の何乗か）。急に強くなりすぎない（戦力の山がなめらか）ように。
 */
export function rollDropRarity(g: number, rng: Rng): EquipRarity {
  const step = Math.min(0.35, 0.05 + g * 0.003);
  const cap = Math.min(MAX_EQUIP_RARITY, Math.floor((g + 6) / 18));
  let r = 0;
  while (r < cap && rng() < step) r++;
  return r as EquipRarity;
}

/** クリアした数に合わせて、オブジェクトを手に入れる。新しく増えた id を返す。 */
/** 持っているオブジェクトのレベルの真ん中。 */
function medianObjectLevel(save: SaveData): number {
  const lv = Object.values(save.objects).map((o) => o.level).sort((a, b) => a - b);
  return lv.length ? lv[lv.length >> 1] : 1;
}

/** 新しく手に入ったオブジェクトのはじめのレベル。 */
export function catchUpLevel(save: SaveData): number {
  return Math.max(1, Math.floor(medianObjectLevel(save) * 0.6));
}

export function syncUnlocks(save: SaveData): { newObjects: string[] } {
  const n = save.cleared + 1; // クリアしたステージの数（通し番号＝この数まで）
  const newObjects: string[] = [];
  for (const o of OBJECTS) {
    if (o.unlockStage <= n && !save.objects[o.id]) {
      // 新しいオブジェクトは、持っているものの真ん中くらいのレベルから（古いものだけ強いままにならないように）
      save.objects[o.id] = { level: catchUpLevel(save), shards: 0 };
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
  const lvs = save.loadout.map((id) => save.objects[id]?.level ?? 1).sort((a, b) => a - b);
  const mid = lvs.length ? lvs[lvs.length >> 1] : 1;
  for (let i = 0; i < nSh && owned.length; i++) {
    // 持っていくオブジェクトの中で、レベルが真ん中より高いものほど出にくい（1つだけ育ちすぎないように）
    const o = pickWeighted(rng, owned, (x) => OBJ_RARITY_DROP[x.rarity] * (save.loadout.includes(x.id)
      ? 2 * Math.pow(0.7, Math.max(0, save.objects[x.id].level - mid)) : 1));
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
    newObjects, levelUps, bondUps,
  };
}

// 使いやすいように定義も出しておく
export { CHARS, OBJECTS, EQUIPS, RELICS, STAGES, WAZAS, ROLES };
