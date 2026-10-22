// 赤いバッジ（なにかできることがあるとき）の判定。
import type { SaveData } from "../core/save";
import { canLearn, canLevelUpObject, canUnlockRelic, nextRelic, partyRoles, skillTree } from "../core/progress";
import type { SkillBranch } from "../data/skills";
import { canPull } from "../core/gacha";
import { MAX_CATS } from "../core/save";
import { EQUIP_SLOTS, MAX_EQUIP_RARITY } from "../data/equips";

/** その枝で、いま覚えられるスキルがあるか（根もとはのぞく）。 */
export function branchCanLearn(save: SaveData, b: SkillBranch): boolean {
  return skillTree().some((n) => n.branch === b && n.req.length > 0 && canLearn(save, n.id).ok);
}

/** いま覚えられるスキルがあるか（役割の枝は、パーティにいる役割だけ。うるさくないように）。 */
export function anySkillBadge(save: SaveData): boolean {
  const roles = partyRoles(save);
  return skillTree().some((n) => (!n.role || roles.includes(n.role)) && canLearn(save, n.id).ok);
}

export function objCanLevel(save: SaveData, id: string): boolean {
  return canLevelUpObject(save, id).ok;
}

export function anyObjBadge(save: SaveData): boolean {
  return Object.keys(save.objects).some((id) => objCanLevel(save, id));
}

/** 合成できる組（同じ枠・同じレアリティが3つ以上）があるか。 */
export function fusableGroups(save: SaveData): { slot: string; rarity: number; count: number }[] {
  const out: { slot: string; rarity: number; count: number }[] = [];
  for (const s of EQUIP_SLOTS) {
    for (let r = 0; r < MAX_EQUIP_RARITY; r++) {
      const n = save.equips.filter((e) => e.slot === s && e.rarity === r).length;
      if (n >= 3) out.push({ slot: s, rarity: r, count: n });
    }
  }
  return out;
}

export function anyEquipBadge(save: SaveData): boolean {
  if (fusableGroups(save).length > 0) return true;
  // 空いている枠に、つけられる装備がある
  return EQUIP_SLOTS.some((s) => !save.equipped[s] && save.equips.some((e) => e.slot === s));
}

/** キャラ: 相棒の枠が空いていて、入れられる猫がいる。 */
export function anyCharBadge(save: SaveData): boolean {
  const n = Object.keys(save.cats).length;
  const inParty = save.party.filter((u) => save.cats[u]).length;
  return inParty < 3 && n > inParty;
}

export function growBadge(save: SaveData): boolean {
  return anyCharBadge(save) || anySkillBadge(save) || anyObjBadge(save) || anyEquipBadge(save);
}

export function relicBadge(save: SaveData): boolean {
  const n = nextRelic(save);
  return !!n && canUnlockRelic(save, n.id).ok;
}

/** ねこ福袋を1回あけられるだけのちゅ〜るがあるか。 */
export function bagBadge(save: SaveData): boolean {
  return canPull(save, 1).ok;
}

/** 下のタブ「福袋」。 */
export function gachaBadge(save: SaveData): boolean {
  return bagBadge(save);
}
