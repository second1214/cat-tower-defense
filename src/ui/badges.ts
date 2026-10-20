// 赤いバッジ（なにかできることがあるとき）の判定。
import type { SaveData } from "../core/save";
import { canLearn, canLevelUpObject, canUnlockRelic, nextRelic, skillPoints, skillTreeOf } from "../core/progress";
import { EQUIP_SLOTS, MAX_EQUIP_RARITY } from "../data/equips";

/** この猫がいま覚えられるスキルがあるか。 */
export function charCanLearn(save: SaveData, charId: string): boolean {
  if (!save.chars[charId] || skillPoints(save, charId) <= 0) return false;
  return skillTreeOf(charId).some((n) => canLearn(save, charId, n.id).ok);
}

export function anyCharBadge(save: SaveData): boolean {
  return Object.keys(save.chars).some((id) => charCanLearn(save, id));
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

export function growBadge(save: SaveData): boolean {
  return anyCharBadge(save) || anyObjBadge(save) || anyEquipBadge(save);
}

export function relicBadge(save: SaveData): boolean {
  const n = nextRelic(save);
  return !!n && canUnlockRelic(save, n.id).ok;
}
