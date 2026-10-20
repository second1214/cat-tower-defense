// テスト用: ステージを順にクリアしつづけるプレイヤーのまね（欲ばりに全部つかう）。
// ちゅ〜るは「スキル」と「譲渡会会場」に分けて使う（もらったちゅ〜るの一部を、お迎え用にとっておく）。
import { newSave, type SaveData } from "../src/core/save";
import { mulberry32, type Rng } from "../src/core/rng";
import {
  autoEquip, autoFuse, buildLoadout, canLearn, charPower, estimateDps, grantRewards, learnSkill, levelUpObject,
  nextNodeCost, nextRelic, objectUpgradeCost, powerRatio, resetSkills, resolveObjects, selectChar, setLoadout,
  skillTreeOf, stageIdList, unlockRelic,
} from "../src/core/progress";
import { PULL10_COST, pull } from "../src/core/gacha";
import { CHAR_MAP } from "../src/data/chars";
import { OBJECTS } from "../src/data/objects";

export interface SimState {
  /** お迎え用にとっておくちゅ〜る。 */
  pullBudget: number;
  /** 前に見たときのちゅ〜る（ふえたぶんを分ける）。 */
  lastChuru: number;
  /** もらったちゅ〜るのうち、お迎えにまわす割合。 */
  pullShare: number;
  churuEarned: number;
  churuOnSkills: number;
  churuOnPulls: number;
  pulls: number;
  switches: number;
}

export function newSimState(save: SaveData, pullShare = 0.35): SimState {
  return {
    pullBudget: 0, lastChuru: save.churu, pullShare, churuEarned: save.churu, churuOnSkills: 0, churuOnPulls: 0,
    pulls: 0, switches: 0,
  };
}

/** スキルを取っていないときの強さ（猫どうしをくらべる用）。 */
function barePower(save: SaveData, charId: string): number {
  const c = save.chars[charId];
  const keep = c.skills;
  c.skills = {};
  const p = charPower(save, charId);
  c.skills = keep;
  return p;
}

export function spendAll(save: SaveData, rng: Rng, st: SimState): void {
  autoFuse(save, rng);
  autoEquip(save);
  // ふえたちゅ〜るを分ける
  const income = save.churu - st.lastChuru;
  if (income > 0) {
    st.pullBudget += income * st.pullShare;
    st.churuEarned += income;
  }
  // 譲渡会会場: 10回ぶんたまったら
  while (st.pullBudget >= PULL10_COST && save.churu >= PULL10_COST) {
    const before = save.churu;
    const r = pull(save, rng, 10);
    if (!r.ok) break;
    st.pullBudget -= PULL10_COST;
    st.churuOnPulls += before - save.churu;
    st.pulls += 10;
  }
  // 一番強い猫を出す（乗りかえるときは、前の猫のスキルを全部もどす）
  const cur = save.selectedChar;
  let best = cur;
  for (const id of Object.keys(save.chars)) if (barePower(save, id) > barePower(save, best) * 1.1) best = id;
  if (best !== cur) {
    st.churuOnSkills -= resetSkills(save, cur);
    selectChar(save, best);
    st.switches++;
  }
  // スキル: 覚えられるうち、いちばん安いものから（お迎え用はとっておく）
  const id = save.selectedChar;
  for (;;) {
    let pickId: string | null = null;
    let pickCost = Infinity;
    for (const n of skillTreeOf(id)) {
      if (!canLearn(save, id, n.id).ok) continue;
      const c = nextNodeCost(save, id, n.id)!;
      if (c < pickCost) { pickCost = c; pickId = n.id; }
    }
    if (!pickId || save.churu - pickCost < st.pullBudget) break;
    learnSkill(save, id, pickId);
    st.churuOnSkills += pickCost;
  }
  st.lastChuru = save.churu;
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
      .map((oid) => ({ id: oid, c: objectUpgradeCost(save, oid)! }))
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
  char: string;       // 出している猫「id(レアリティ)♥なかよし度」
  skillLv: number;    // 出している猫のスキルのレベルの合計
  charDps: number;
  objDps: number;
  bugHp: number;      // アリ1匹の体力
  churu: number;      // いま持っているちゅ〜る
  owned: number;      // お迎えした猫の数
  obj: string;        // 持っていくオブジェクトの「id:レベル/かけら」
}

/** need: 戦力の余裕がこれ以上なら挑む。maxGrind: 1ステージで回せる上限。 */
export function simulate(
  stages = 100, need = 1.2, maxGrind = 30, seed = 42, pullShare = 0.35,
): { rows: SimRow[]; save: SaveData; st: SimState } {
  const rng = mulberry32(seed);
  const save = newSave();
  const st = newSimState(save, pullShare);
  const ids = stageIdList().slice(0, stages);
  const rows: SimRow[] = [];
  for (const id of ids) {
    spendAll(save, rng, st);
    let grinds = 0;
    const first = powerRatio(save, id);
    while (powerRatio(save, id) < need && grinds < maxGrind && save.cleared >= 0) {
      grantRewards(save, ids[save.cleared], rng);
      spendAll(save, rng, st);
      grinds++;
    }
    const lo = buildLoadout(save, id)!;
    const d = estimateDps(lo);
    const cs = save.chars[save.selectedChar];
    rows.push({
      stage: id, ratio: first, grinds, level: cs.level,
      char: `${save.selectedChar}(${CHAR_MAP[save.selectedChar].rarity})♥${cs.bond}`,
      skillLv: Object.values(cs.skills).reduce((s, v) => s + v, 0),
      charDps: d.char, objDps: d.objects, bugHp: 5 * lo.stage.hpMul, churu: save.churu,
      owned: Object.keys(save.chars).length,
      obj: save.loadout.map((i) => i + ":" + save.objects[i].level + "/" + save.objects[i].shards).join(" "),
    });
    grantRewards(save, id, rng);
  }
  spendAll(save, rng, st);
  return { rows, save, st };
}
