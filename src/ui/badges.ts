// 赤いバッジ（なにかできることがあるとき）の判定。
import type { SaveData } from "../core/save";
import type { CharRole } from "../core/types";
import { adoptableNeighbors, canLearn, canLevelUpObject, canUnlockRelic, nextRelic, partyRoles, skillTreeOf } from "../core/progress";
import { canPull } from "../core/gacha";
import { MAX_CATS } from "../core/save";
import { EQUIP_SLOTS, MAX_EQUIP_RARITY } from "../data/equips";

/** この役割のスキルツリーで、いま覚えられるスキルがあるか。 */
export function roleCanLearn(save: SaveData, role: CharRole): boolean {
  return skillTreeOf(role).some((n) => canLearn(save, role, n.id).ok);
}

/** パーティの役割のスキルで、いま覚えられるものがあるか（ほかの役割は、うるさくないように数えない）。 */
export function anySkillBadge(save: SaveData): boolean {
  return partyRoles(save).some((r) => roleCanLearn(save, r));
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

/** 譲渡会に、お迎えできる近所の猫が来ているか。 */
export function adoptBadge(save: SaveData): boolean {
  return Object.keys(save.cats).length < MAX_CATS && adoptableNeighbors(save).length > 0;
}

/** 下のタブ「福袋」。 */
export function gachaBadge(save: SaveData): boolean {
  return bagBadge(save) || adoptBadge(save);
}
