// テスト用: ステージを順にクリアしつづけるプレイヤーのまね（欲ばりに全部つかう）。
import { newSave, type SaveData } from "../src/core/save";
import { mulberry32, type Rng } from "../src/core/rng";
import {
  autoEquip, autoFuse, buildLoadout, canLearn, estimateDps, grantRewards, learnSkill, levelUpObject,
  nextRelic, objectUpgradeCost, powerRatio, resolveObjects, setLoadout, skillTreeOf, stageIdList, unlockRelic,
} from "../src/core/progress";
import { OBJECTS } from "../src/data/objects";

export function spendAll(save: SaveData, rng: Rng): void {
  autoFuse(save, rng);
  autoEquip(save);
  // スキル: 覚えられるものを順に
  for (const charId of Object.keys(save.chars)) {
    let learned = true;
    while (learned) {
      learned = false;
      for (const n of skillTreeOf(charId)) {
        if (canLearn(save, charId, n.id).ok) { learnSkill(save, charId, n.id); learned = true; }
      }
    }
  }
  // レリック
  for (let n = nextRelic(save); n && unlockRelic(save, n.id).ok; n = nextRelic(save)) { /* つづける */ }
  // 持っていくもの: 攻撃できるものを強い順に4つ＋餌皿
  const owned = OBJECTS.filter((o) => save.objects[o.id]).map((o) => o.id);
  const scored = resolveObjects(save, owned)
    .filter((o) => o.kind !== "producer" && o.kind !== "wall")
    .map((o) => ({ id: o.id, v: estimateDps({ char: { atk: 0, atkInterval: 1, aoe: 0 } as never, objects: [o] }).objects }))
    .sort((a, b) => b.v - a.v);
  setLoadout(save, ["esara", ...scored.slice(0, 4).map((x) => x.id)]);
  // オブジェクトのレベルアップ: 安いものから
  for (;;) {
    const c = save.loadout
      .map((id) => ({ id, c: objectUpgradeCost(save, id)! }))
      .filter((x) => save.objects[x.id].shards >= x.c.shards && save.coins >= x.c.coins)
      .sort((a, b) => a.c.coins - b.c.coins)[0];
    if (!c || !levelUpObject(save, c.id).ok) break;
  }
}

export interface SimRow {
  stage: string;
  ratio: number;      // 初めて挑むときの戦力の余裕
  grinds: number;     // 足りなくて前のステージを回した回数
  level: number;
  charDps: number;
  objDps: number;
  bugHp: number;      // アリ1匹の体力
  obj: string;        // 持っていくオブジェクトの「id:レベル/かけら」
}

/** need: 戦力の余裕がこれ以上なら挑む。maxGrind: 1ステージで回せる上限。 */
export function simulate(stages = 100, need = 1.2, maxGrind = 30, seed = 42): { rows: SimRow[]; save: SaveData } {
  const rng = mulberry32(seed);
  const save = newSave();
  const ids = stageIdList().slice(0, stages);
  const rows: SimRow[] = [];
  for (const id of ids) {
    spendAll(save, rng);
    let grinds = 0;
    const first = powerRatio(save, id);
    while (powerRatio(save, id) < need && grinds < maxGrind && save.cleared >= 0) {
      grantRewards(save, ids[save.cleared], rng);
      spendAll(save, rng);
      grinds++;
    }
    const lo = buildLoadout(save, id)!;
    const d = estimateDps(lo);
    rows.push({
      stage: id, ratio: first, grinds, level: save.chars[save.selectedChar].level,
      charDps: d.char, objDps: d.objects, bugHp: 5 * lo.stage.hpMul,
      obj: save.loadout.map((i) => i + ":" + save.objects[i].level + "/" + save.objects[i].shards).join(" "),
    });
    grantRewards(save, id, rng);
  }
  return { rows, save };
}
