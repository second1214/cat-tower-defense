// テスト用: ステージを順にクリアしつづけるプレイヤーのまね（欲ばりに全部つかう）。
// ちゅ〜るは「スキル」と「ねこ福袋」に分けて使う（もらったちゅ〜るの一部を、福袋用にとっておく）。
// はじめのほうで、うちの子を2匹追加で登録して、いちばん強い3匹をパーティ（主人公・相棒）にする。
import { newSave, type SaveData } from "../src/core/save";
import { mulberry32, type Rng } from "../src/core/rng";
import {
  autoEquip, autoFuse, buildLoadout, canLearn, catPower, equipWaza, estimateDps,
  grantRewards, heroUid, isNodeLinked, learnSkill, levelUpObject, mainWazaOf, nextNodeCost, nextRelic, objectDps, objectUpgradeCost,
  partyUids, powerRatio, registerCat, resolveObjects, setLoadout, setParty, skillTree, stageIdList, stageLoad,
  unlockRelic,
} from "../src/core/progress";
import { PULL10_COST, pull } from "../src/core/gacha";
import { MAX_SUBS, WAZA_MAP } from "../src/data/waza";
import { OBJECTS } from "../src/data/objects";
import { BUG_MAP } from "../src/data/bugs";
import { SKILL_MAP, type SkillNode, type SkillStat } from "../src/data/skills";

/** あとから登録するうちの子（クリアした通し番号 → 猫）。 */
const EXTRA_CATS: [number, { name: string; look: string; personality: "yancha" | "amaenbo" }][] = [
  [2, { name: "みけ", look: "mike", personality: "amaenbo" }],
  [7, { name: "くろ", look: "kuro", personality: "yancha" }],
];

export interface SimState {
  /** 福袋用にとっておくちゅ〜る。 */
  pullBudget: number;
  /** 前に見たときのちゅ〜る（ふえたぶんを分ける）。 */
  lastChuru: number;
  /** もらったちゅ〜るのうち、福袋にまわす割合。 */
  pullShare: number;
  churuEarned: number;
  churuOnSkills: number;
  churuOnPulls: number;
  pulls: number;
  /** 主人公が入れかわった回数。 */
  switches: number;
}

export function newSimState(save: SaveData, pullShare = 0.35): SimState {
  return {
    pullBudget: 0, lastChuru: save.churu, pullShare, churuEarned: save.churu, churuOnSkills: 0, churuOnPulls: 0,
    pulls: 0, switches: 0,
  };
}

/** 猫ごとに、いちばん強くなるメインのわざとサブのわざをつける。 */
function bestWaza(save: SaveData, uid: string): void {
  const owned = Object.keys(save.wazas).filter((id) => WAZA_MAP[id]);
  let best = save.cats[uid].waza.main, bestP = catPower(save, uid);
  for (const id of owned.filter((x) => WAZA_MAP[x].slot === "main")) {
    equipWaza(save, uid, "main", id);
    const p = catPower(save, uid);
    if (p > bestP) { bestP = p; best = id; }
  }
  equipWaza(save, uid, "main", best);
  const subs = owned.filter((x) => WAZA_MAP[x].slot === "sub");
  save.cats[uid].waza.subs = [];
  for (let slot = 0; slot < MAX_SUBS; slot++) {
    let pickId: string | null = null, pickP = catPower(save, uid);
    for (const id of subs) {
      if (save.cats[uid].waza.subs.includes(id)) continue;
      if (!equipWaza(save, uid, slot as 0 | 1, id).ok) continue;
      const p = catPower(save, uid);
      if (p > pickP * 1.0001) { pickP = p; pickId = id; }
      equipWaza(save, uid, slot as 0 | 1, null);
    }
    if (!pickId) break;
    equipWaza(save, uid, slot as 0 | 1, pickId);
  }
}

/** ノードのだいたいの得（1レベルぶん）。宝・ねこドアの先は、先に進めるぶん少し高く見る。 */
function nodeValue(n: SkillNode): number {
  let v = 0;
  for (const e of n.effects) v += e.combo ? 0.05 : (VALUE_W[e.stat!] ?? 0.5) * e.per;
  return (n.gate ? 3 : 1) * (n.combo ? 2 : 1) * Math.max(0.01, v);
}
/** ステータスごとの重み（攻撃 1% = 0.01 を 1 として）。 */
const VALUE_W: Partial<Record<SkillStat, number>> = {
  atk: 1, hp: 0.6, atkSpd: 1.2, objAtk: 1.2, objHp: 0.3, critMul: 0.5, crit: 1.5, poison: 0.6, move: 0.2,
  multiHit: 0.5, pierce: 0.1,
};

export function spendAll(save: SaveData, rng: Rng, st: SimState): void {
  autoFuse(save, rng);
  autoEquip(save);
  // ふえたちゅ〜るを分ける
  const income = save.churu - st.lastChuru;
  if (income > 0) {
    st.pullBudget += income * st.pullShare;
    st.churuEarned += income;
  }
  // ねこ福袋: 10回ぶんたまったら
  while (st.pullBudget >= PULL10_COST && save.churu >= PULL10_COST) {
    const before = save.churu;
    const r = pull(save, rng, 10);
    if (!r.ok) break;
    st.pullBudget -= PULL10_COST;
    st.churuOnPulls += before - save.churu;
    st.pulls += 10;
  }
  // うちの子を追加で登録する（1-3 クリアで2匹目、1-8 クリアで3匹目）
  for (const [g, cat] of EXTRA_CATS) {
    if (save.cleared >= g && !Object.values(save.cats).some((c) => c.name === cat.name)) registerCat(save, cat);
  }
  // わざをつけて、強い3匹をパーティに
  const prevHero = heroUid(save);
  for (const uid of Object.keys(save.cats)) bestWaza(save, uid);
  const rank = Object.keys(save.cats).sort((a, b) => catPower(save, b) - catPower(save, a));
  const hero = catPower(save, rank[0]) > catPower(save, prevHero) * 1.1 ? rank[0] : prevHero;
  setParty(save, 0, hero);
  const comps = rank.filter((u) => u !== hero).slice(0, 2);
  setParty(save, 1, comps[0] ?? null);
  setParty(save, 2, comps[1] ?? null);
  if (hero !== prevHero) st.switches++;
  // スキル盤: 取れるノード（線でつながったもの）のうち、ちゅ〜るあたりの得がいちばん大きいものから（福袋用はとっておく）
  for (;;) {
    let pick: { id: string; cost: number } | null = null;
    let pickScore = -Infinity;
    for (const n of skillTree()) {
      const c = nextNodeCost(save, n.id);
      if (c == null || !isNodeLinked(save, n.id) || !canLearn(save, n.id).ok) continue;
      const score = nodeValue(n) / c;
      if (score <= pickScore) continue;
      pickScore = score; pick = { id: n.id, cost: c };
    }
    if (!pick || save.churu - pick.cost < st.pullBudget) break;
    learnSkill(save, pick.id);
    st.churuOnSkills += pick.cost;
  }
  st.lastChuru = save.churu;
  // レリック
  for (let n = nextRelic(save); n && unlockRelic(save, n.id).ok; n = nextRelic(save)) { /* つづける */ }
  // 持っていくもの: 攻撃できるものを強い順に4つ＋餌皿
  const owned = OBJECTS.filter((o) => save.objects[o.id]).map((o) => o.id);
  const scored = resolveObjects(save, owned)
    .filter((o) => o.kind !== "producer" && o.kind !== "wall")
    // 群れへのだいたいの DPS（拡散・貫通・爆発・連鎖・毒・範囲もふくむ）
    // はじめのカリカリで置けないと序盤の波に負けるので、値段も見る（DPS ÷ √値段）。安いもの（35 以下）を1つはかならず入れる
    .map((o) => ({ id: o.id, v: (objectDps(o, 4) * Math.pow(o.maxHp, 0.25)) / Math.sqrt(o.cost), cheap: o.cost <= 35 }))
    .sort((a, b) => b.v - a.v);
  const pick4 = scored.slice(0, 4);
  if (!pick4.some((x) => x.cheap)) {
    const c = scored.find((x) => x.cheap);
    if (c) pick4[3] = c;
  }
  setLoadout(save, ["esara", ...pick4.map((x) => x.id)]);
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
  level: number;      // 主人公のレベル
  char: string;       // 主人公「名前/メインのわざ(レアリティ)Lv♥なかよし度」
  party: number;      // パーティの数（主人公＋相棒）
  skillLv: number;    // スキル盤で取ったレベルの合計（どの猫にも効く）
  combos: number;     // 主人公にかかっている複合効果の数
  charDps: number;
  compDps: number;    // 相棒の DPS の合計
  objDps: number;
  bugHp: number;      // アリ1匹の体力（ステージ倍率をかけたあと）
  churu: number;      // いま持っているちゅ〜る
  owned: number;      // 猫の数
  wazas: number;      // 覚えたわざの数
  obj: string;        // 持っていくオブジェクトの「id:レベル/かけら」
  perks: number;      // 持っていくオブジェクトの、解放ずみの特殊効果の数の合計
  bugs: number;       // そのステージの虫の数
}

/** 挑むのに必要な戦力の余裕（powerRatio）。これより小さいと、前のステージを回して育てる。 */
export const SIM_NEED = 2;
/** 1ステージで回せる上限（これをこえたら、あきらめて挑む）。 */
export const SIM_MAX_GRIND = 40;

/** hook の phase: "arrive" はそのステージに初めて来たとき（回す前）、"ready" は回しおえて挑む直前。 */
export type SimPhase = "arrive" | "ready";

/**
 * need: 戦力の余裕がこれ以上なら挑む。maxGrind: 1ステージで回せる上限。
 * hook: ステージごとに、そのときのセーブを見せる（本物の戦闘で試す用。書きかえないこと）。
 */
export function simulate(
  stages = 100, need = SIM_NEED, maxGrind = SIM_MAX_GRIND, seed = 42, pullShare = 0.35,
  hook?: (id: string, save: SaveData, phase: SimPhase) => void,
): { rows: SimRow[]; save: SaveData; st: SimState } {
  const rng = mulberry32(seed);
  const save = newSave();
  save.setupDone = true;
  const st = newSimState(save, pullShare);
  const ids = stageIdList().slice(0, stages);
  const rows: SimRow[] = [];
  for (const id of ids) {
    spendAll(save, rng, st);
    let grinds = 0;
    const first = powerRatio(save, id);
    hook?.(id, save, "arrive");
    while (powerRatio(save, id) < need && grinds < maxGrind && save.cleared >= 0) {
      grantRewards(save, ids[save.cleared], rng);
      spendAll(save, rng, st);
      grinds++;
    }
    hook?.(id, save, "ready");
    const lo = buildLoadout(save, id)!;
    const d = estimateDps(lo);
    const hero = heroUid(save);
    const cs = save.cats[hero];
    const w = mainWazaOf(save, hero);
    rows.push({
      stage: id, ratio: first, grinds, level: cs.level,
      char: `${cs.name}/${w.name}(${w.rarity})${save.wazas[w.id]?.level ?? 1}♥${cs.bond}`,
      party: partyUids(save).length,
      skillLv: Object.entries(save.skills).reduce((s, [id, v]) => s + (SKILL_MAP[id] ? v : 0), 0),
      combos: Object.keys(lo.char.combos).length,
      charDps: d.char, compDps: d.companions, objDps: d.objects, bugHp: BUG_MAP.ari.hp * lo.stage.hpMul,
      churu: save.churu,
      owned: Object.keys(save.cats).length,
      wazas: Object.keys(save.wazas).length,
      obj: save.loadout.map((i) => i + ":" + save.objects[i].level + "/" + save.objects[i].shards).join(" "),
      perks: lo.objects.reduce((s, o) => s + o.perks.length, 0),
      bugs: stageLoad(lo.stage).count,
    });
    grantRewards(save, id, rng);
  }
  spendAll(save, rng, st);
  return { rows, save, st };
}
