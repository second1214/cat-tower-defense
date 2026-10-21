import { describe, expect, test } from "vitest";
import { fmt } from "../src/core/num";
import { mulberry32 } from "../src/core/rng";
import {
  newSave, loadSave, writeSave, migrate, importSave, exportSave, v2SkillCost, MAX_CATS, MAX_LOADOUT, SAVE_VERSION,
  START_CHURU,
} from "../src/core/save";
import {
  addExp, expToNext, canLearn, learnSkill, levelUpObject, objectUpgradeCost, addEquip, fuseEquips,
  equip, unequip, unlockRelic, canUnlockRelic, buildLoadout, resolveCat, resolveObjects, grantRewards, stageIdList,
  stageById, isStageUnlocked, estimateDps, stageLoad, toggleLoadout, sellEquip, relicBonus, churuForLevel,
  nodeLevel, nextNodeCost, resetSkills, skillSpent, skillTreeOf, isNodeOpen, bondMul, FIRST_CLEAR_CHURU_MUL,
  objectPerks, resolveObject, objectDps, equipBonus, registerCat, updateCat, removeCat, setParty, equipWaza,
  familyLevel, catPower, partyRoles, addBondExp, bondToNext, COMPANION_POWER,
  IDLE_EXP_RATE, heroUid, powerRatio,
} from "../src/core/progress";
import {
  GACHA_RATES, PITY_PULLS, PULL10_COST, PULL_COST, WAZA_REFUND, gainWaza, pull, pullCost, pullRates, pullsToPity,
  rollRarity, canPull,
} from "../src/core/gacha";
import { CAT_LOOKS, CHARS, CHAR_MAP, MAX_BOND } from "../src/data/chars";
import {
  MAIN_WAZAS, MAX_WAZA_LEVEL, RARITIES, RARITY_MUL, STARTER_WAZAS, SUB_WAZAS, WAZAS, WAZA_MAP, wazaLevelMul, wazaText,
} from "../src/data/waza";
import { PERSONALITIES, PERSONALITY_MAP } from "../src/data/personality";
import {
  COMBO_TEXT, SKILL_BRANCHES, SKILL_MAP, SKILL_TREES, SKILL_TREE_SIZE, TIER_MIN_LEVEL, effectText, nodeCost,
} from "../src/data/skills";
import { OBJECTS, OBJECT_MAP, PERK_LEVELS } from "../src/data/objects";
import { BUGS, BUG_MAP, isTraitBug } from "../src/data/bugs";
import { AFFIXES, EQUIPS, affixCount, affixText, rollAffix } from "../src/data/equips";
import { RELICS } from "../src/data/relics";
import {
  FURNITURE_SIZES, MAMA_COL, MAMA_H, MAMA_ROW, MAMA_W, OBSTACLE_ROW_MAX, OBSTACLE_ROW_MIN, STAGES, boardConnected,
  mazeLength, obstacleCells, stageBlocked, stageIndexOf, wallOf,
} from "../src/data/stages";
import { bugShapeOf } from "../src/battle/sprites";
import { COLS, FURNITURE_KINDS, ROWS, type CharRole, type ComboId } from "../src/core/types";
import type { SaveData } from "../src/core/save";
import { SIM_MAX_GRIND, SIM_NEED, simulate } from "./sim";

const ROLES: CharRole[] = ["melee", "ranged", "aoe", "fast"];

/** テスト用: 猫を登録して uid を返す。 */
function addCat(s: SaveData, name = "テスト", look = "kuro", personality: "nonbiri" | "yancha" = "nonbiri"): string {
  const r = registerCat(s, { name, look, personality });
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

/** テスト用: わざを覚える。 */
function learnWaza(s: SaveData, id: string, level = 1): void {
  s.wazas[id] = { level, count: level };
}

describe("fmt", () => {
  test("小さい数", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(7)).toBe("7");
    expect(fmt(7.9)).toBe("7");
    expect(fmt(999)).toBe("999");
    expect(fmt(-5)).toBe("-5");
    expect(fmt(-0.4)).toBe("0");
  });
  test("単位", () => {
    expect(fmt(1000)).toBe("1A");
    expect(fmt(1500)).toBe("1.5A");
    expect(fmt(1234)).toBe("1.23A");
    expect(fmt(12300)).toBe("12.3A");
    expect(fmt(123000)).toBe("123A");
    expect(fmt(999999)).toBe("999A");
    expect(fmt(1e6)).toBe("1B");
    expect(fmt(2.5e9)).toBe("2.5C");
    expect(fmt(1e78)).toBe("1Z");
    expect(fmt(1e81)).toBe("1AA");
    expect(fmt(1e84)).toBe("1AB");
    expect(fmt(1e81 * 1000 ** 26)).toBe("1BA");
    expect(fmt(-1500)).toBe("-1.5A");
    expect(fmt(1150)).toBe("1.15A");
  });
  test("特別な値", () => {
    expect(fmt(Infinity)).toBe("∞");
    expect(fmt(-Infinity)).toBe("-∞");
    expect(fmt(NaN)).toBe("?");
    expect(fmt(1.7e308)).toMatch(/^\d/);
  });
});

describe("データ", () => {
  test("数と id のかぶり", () => {
    expect(CHARS.length).toBe(20);
    expect(OBJECTS.length).toBeGreaterThanOrEqual(10);
    expect(BUGS.length).toBeGreaterThanOrEqual(8);
    expect(STAGES.length).toBe(100);
    expect(RELICS.length).toBeGreaterThanOrEqual(20);
    for (const list of [CHARS, OBJECTS, BUGS, EQUIPS, RELICS, STAGES, WAZAS, PERSONALITIES]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  test("猫（近所の猫）: レアリティも役割もない・絵の id はそのまま", () => {
    expect(CHARS.map((c) => c.id)).toEqual([
      "chatora", "mike", "kuro", "shiro", "kijitora", "hachiware", "sabatora", "komugi", "omochi", "sabi",
      "leo", "luna", "chibi", "kuma", "sora", "purin", "kotetsu", "hime", "taisho", "tama",
    ]);
    expect(CAT_LOOKS).toEqual(CHARS.map((c) => c.id));
    expect(CHAR_MAP.chatora.name).toBe("ノルウェージャン");
    for (const c of CHARS) {
      expect("rarity" in c).toBe(false);
      expect("role" in c).toBe(false);
      expect("passive" in c).toBe(false);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
      expect(PERSONALITY_MAP[c.personality]).toBeDefined();
      expect(WAZA_MAP[c.waza]?.slot).toBe("main"); // 特技はメインのわざに
    }
  });
  test("わざ: メイン 20 以上（役割ごとに5以上）・サブ 12 以上", () => {
    expect(MAIN_WAZAS.length).toBeGreaterThanOrEqual(20);
    expect(SUB_WAZAS.length).toBeGreaterThanOrEqual(12);
    for (const role of ROLES) expect(MAIN_WAZAS.filter((w) => w.role === role).length).toBeGreaterThanOrEqual(5);
    for (const r of RARITIES) {
      expect(MAIN_WAZAS.some((w) => w.rarity === r)).toBe(true);
      expect(SUB_WAZAS.some((w) => w.rarity === r)).toBe(true);
    }
    for (const w of WAZAS) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.desc.length).toBeGreaterThan(0);
      expect(w.effects.length).toBeGreaterThan(0);
      expect(wazaText(w).length).toBeGreaterThan(0);
      if (w.slot === "main") expect(ROLES).toContain(w.role);
      else expect(w.role).toBeUndefined();
    }
    // はじめのわざ
    expect(STARTER_WAZAS).toEqual(["nekopunch", "choichoi"]);
    expect(WAZA_MAP.nekopunch).toMatchObject({ name: "ねこパンチ", rarity: "N", slot: "main", role: "melee" });
    expect(WAZA_MAP.choichoi).toMatchObject({ name: "ちょいちょい", rarity: "N", slot: "main", role: "ranged" });
    // 古い猫の特技は、同じレアリティのメインのわざに
    const old: Record<string, string> = {
      chatora: "N", mike: "N", kuro: "N", shiro: "N", kijitora: "N", hachiware: "R", sabatora: "R", komugi: "R",
      omochi: "R", sabi: "R", leo: "SR", luna: "SR", chibi: "SR", kuma: "SR", sora: "SR", purin: "SSR", kotetsu: "SSR",
      hime: "SSR", taisho: "UR", tama: "UR",
    };
    for (const [id, r] of Object.entries(old)) expect(WAZA_MAP[CHAR_MAP[id].waza].rarity).toBe(r);
    expect(new Set(CHARS.map((c) => c.waza)).size).toBe(20);
    // サブのわざは、レアリティが高いほど複合効果が多い（派手）
    const comboCount = (r: string) => {
      const list = SUB_WAZAS.filter((w) => w.rarity === r);
      return list.reduce((s, w) => s + w.effects.filter((e) => e.combo).length, 0) / list.length;
    };
    expect(comboCount("UR")).toBeGreaterThan(comboCount("SR"));
    expect(comboCount("SR")).toBeGreaterThan(comboCount("N"));
    expect(RARITY_MUL).toEqual({ N: 1, R: 1.2, SR: 1.45, SSR: 1.75, UR: 2.1 });
    expect(wazaLevelMul(1)).toBe(1);
    expect(wazaLevelMul(5)).toBeCloseTo(1.8);
    expect(wazaLevelMul(9)).toBeCloseTo(1.8);
  });
  test("性格: 6種・どれも得意と不得意がある", () => {
    expect(PERSONALITIES.map((p) => p.id).sort()).toEqual(["amaenbo", "kokishin", "kuishinbo", "maipace", "nonbiri", "yancha"]);
    for (const p of PERSONALITIES) {
      // 休けい時間は短いほど良いので、向きを合わせる
      const vals = [p.atk, p.hp, p.atkSpd, p.move, -p.rest, p.kibble];
      expect(vals.some((v) => v > 0)).toBe(true);
      expect(vals.some((v) => v < 0)).toBe(true);
      // 合計の価値はだいたい同じ（良いほうが少し大きいくらい）
      const sum = vals.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThanOrEqual(0);
      expect(sum).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.desc.length).toBeGreaterThan(0);
    }
    expect(PERSONALITY_MAP.yancha).toMatchObject({ atk: 0.15, hp: -0.1 });
  });
  test("スキルツリー: 役割ごとに 170 以上・段 0〜11・複合効果 10 以上", () => {
    expect(TIER_MIN_LEVEL.length).toBe(12);
    for (let i = 1; i < TIER_MIN_LEVEL.length; i++) expect(TIER_MIN_LEVEL[i]).toBeGreaterThan(TIER_MIN_LEVEL[i - 1]);
    for (const [role, tree] of Object.entries(SKILL_TREES)) {
      expect(tree.length).toBeGreaterThanOrEqual(170);
      const ids = new Set(tree.map((n) => n.id));
      expect(ids.size).toBe(tree.length);
      const pos = new Set(tree.map((n) => `${n.pos.x},${n.pos.y}`));
      expect(pos.size).toBe(tree.length); // 画面で重ならない
      for (const b of SKILL_BRANCHES) expect(tree.filter((n) => n.branch === b).length).toBeGreaterThanOrEqual(30);
      for (const n of tree) {
        expect(n.role).toBe(role);
        expect("minRarity" in n).toBe(false); // レアリティの条件はない
        expect(n.minCharLevel).toBe(TIER_MIN_LEVEL[n.tier]);
        expect(n.pos.x).toBeGreaterThanOrEqual(0);
        expect(n.pos.x).toBeLessThan(SKILL_TREE_SIZE.w);
        expect(n.pos.y).toBeGreaterThanOrEqual(0);
        expect(n.pos.y).toBeLessThan(SKILL_TREE_SIZE.h);
        expect(n.maxLevel).toBeGreaterThanOrEqual(1);
        expect(n.baseCost).toBeGreaterThan(0);
        expect(effectText(n).length).toBeGreaterThan(0);
        expect(n.desc.length).toBeGreaterThan(0);
        for (const r of n.req) {
          expect(ids.has(r.id)).toBe(true);
          expect(r.lv).toBeLessThanOrEqual(SKILL_MAP[r.id].maxLevel);
          expect(SKILL_MAP[r.id].tier).toBeLessThanOrEqual(n.tier); // 前提は浅い段
          expect(SKILL_MAP[r.id].pos.y).toBeLessThan(n.pos.y);      // 画面でも上にある
        }
      }
      // 段が深いほど下
      const byTier = (t: number) => tree.filter((n) => n.tier === t).map((n) => n.pos.y);
      for (let t = 1; t < 12; t++) expect(Math.min(...byTier(t))).toBeGreaterThan(Math.max(...byTier(t - 1)));
      expect(tree.filter((n) => n.req.length === 0).length).toBe(1); // 根もとは1つ
      expect(Math.max(...tree.map((n) => n.tier))).toBe(11);
      // 複合効果
      const combos = tree.filter((n) => n.combo);
      expect(combos.length).toBeGreaterThanOrEqual(10);
      for (const n of combos) expect(n.effects.every((e) => e.combo)).toBe(true);
      expect(new Set(combos.map((n) => n.tier)).size).toBeGreaterThanOrEqual(8); // いろいろな深さに
      // 同じ複合効果なら、深いほど強い
      const seen = new Map<ComboId, { tier: number; per: number }>();
      for (const n of [...combos].sort((a, b) => a.tier - b.tier)) {
        const e = n.effects[0];
        const prev = seen.get(e.combo!);
        if (prev && n.tier > prev.tier) expect(e.per * n.maxLevel).toBeGreaterThan(prev.per);
        seen.set(e.combo!, { tier: n.tier, per: e.per * n.maxLevel });
      }
      // ステータスのノードもたくさん
      expect(tree.filter((n) => !n.combo).length).toBeGreaterThanOrEqual(160);
    }
    // 役割に合った複合効果
    const has = (role: CharRole, c: ComboId) => SKILL_TREES[role].some((n) => n.effects.some((e) => e.combo === c));
    expect(has("melee", "knockSlam") && has("melee", "multiEcho") && has("melee", "lastStand")).toBe(true);
    expect(has("ranged", "pierceGrow") && has("ranged", "critChain")).toBe(true);
    expect(has("aoe", "shockwave") && has("aoe", "poisonBurst")).toBe(true);
    expect(has("fast", "frenzy") && has("fast", "dodgeCounter")).toBe(true);
    // 遠距離だけ「つらぬく」がある
    expect(SKILL_TREES.ranged.some((n) => n.effects.some((e) => e.stat === "pierce"))).toBe(true);
    expect(SKILL_TREES.melee.some((n) => n.effects.some((e) => e.stat === "pierce"))).toBe(false);
    // 複合効果の説明
    const c = SKILL_TREES.aoe.find((n) => n.effects[0].combo === "poisonBurst")!;
    expect(effectText(c, 2)).toContain("爆発");
    for (const t of Object.values(COMBO_TEXT)) expect(t(0.5).length).toBeGreaterThan(0);
    expect(effectText(SKILL_MAP["melee.root"])).toBe("攻撃 +5%・体力 +5%");
  });
  test("オブジェクト: 通れる・通れない", () => {
    const by = Object.fromEntries(OBJECTS.map((o) => [o.id, o.base.block]));
    expect(by.danboru).toBe(true);
    expect(by.cushion).toBe(true);
    expect(by.wagomu).toBe(true);
    expect(by.esara).toBe(true);
    expect(by.tape).toBe(false);
    expect(by.nezumitori).toBe(false);
    for (const o of OBJECTS) expect(typeof o.base.block).toBe("boolean");
  });
  test("オブジェクト: 大きさ・待ち時間なし・新しい種類", () => {
    for (const o of OBJECTS) {
      expect(Number.isInteger(o.base.w) && o.base.w >= 1 && o.base.w <= 3).toBe(true);
      expect(Number.isInteger(o.base.h) && o.base.h >= 1 && o.base.h <= 3).toBe(true);
      expect(o.base.cooldown).toBe(0);
      expect(o.base.critMul).toBeGreaterThanOrEqual(1.5);
    }
    const size = (id: string) => `${OBJECT_MAP[id].base.w}x${OBJECT_MAP[id].base.h}`;
    expect(size("danboru")).toBe("1x1");
    expect(size("wagomu")).toBe("2x2");
    expect(size("soujiki")).toBe("2x2");
    expect(size("esara")).toBe("1x1");
    expect(size("tape")).toBe("1x1");
    expect(size("nezumitori")).toBe("1x1");
    expect(size("senpuki")).toBe("2x2");
    expect(OBJECTS.some((o) => o.kind === "wall" && o.base.w * o.base.h > 1)).toBe(true); // 長い壁もある
    // 電撃と毒
    const zaps = OBJECTS.filter((o) => o.kind === "zap"), poisons = OBJECTS.filter((o) => o.kind === "poison");
    expect(zaps.length).toBeGreaterThanOrEqual(2);
    expect(poisons.length).toBeGreaterThanOrEqual(2);
    for (const z of zaps) expect(z.base.chain > 0 && z.base.chainRange > 0).toBe(true);
    for (const p of poisons) expect(p.base.poison).toBeGreaterThan(0);
    expect(OBJECT_MAP.shitajiki.name).toBe("静電気の下敷き");
    expect(OBJECT_MAP.katorisenko.name).toBe("蚊取り線香");
    // 大きいものほど高い（同じ種類どうし・だいたい）
    expect(OBJECT_MAP.danboru.base.cost).toBeLessThan(OBJECT_MAP.wagomu.base.cost);
  });
  test("オブジェクト: レベルで特殊効果", () => {
    for (const o of OBJECTS) {
      expect(o.perks.length).toBeGreaterThanOrEqual(o.kind === "wall" || o.kind === "producer" ? 4 : 6);
      const lv = o.perks.map((p) => p.level);
      expect([...lv].sort((a, b) => a - b)).toEqual(lv);
      expect(new Set(lv).size).toBe(lv.length);
      expect(new Set(o.perks.map((p) => p.id)).size).toBe(o.perks.length);
      for (const p of o.perks) {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.desc.length).toBeGreaterThan(0);
        expect(p.effects.length).toBeGreaterThan(0);
        for (const e of p.effects) {
          expect(e.stat in o.base).toBe(true);
          expect(e.add !== undefined || e.mul !== undefined).toBe(true);
        }
      }
    }
    for (const o of OBJECTS.filter((x) => x.kind !== "wall" && x.kind !== "producer")) {
      for (const l of o.perks.map((p) => p.level)) expect(PERK_LEVELS).toContain(l);
    }
    // 種類ごとの「らしい」効果
    const has = (id: string, stat: string) => OBJECT_MAP[id].perks.some((p) => p.effects.some((e) => e.stat === stat));
    expect(has("wagomu", "multishot") && has("wagomu", "pierce") && has("wagomu", "splash") && has("wagomu", "crit")).toBe(true);
    expect(has("soujiki", "range") && has("soujiki", "knockback") && has("soujiki", "slow")).toBe(true);
    expect(has("shitajiki", "chain") && has("shitajiki", "range")).toBe(true);
    expect(has("katorisenko", "poison") && has("katorisenko", "poisonSpread") && has("katorisenko", "range")).toBe(true);
    expect(has("danboru", "maxHp")).toBe(true);
    expect(has("tape", "slow") && has("tape", "poison")).toBe(true);
    expect(has("nezumitori", "splash")).toBe(true);
  });
  test("虫: 飛ぶ虫はいない・ゆっくり（速い虫は「くせ」として少しだけ）", () => {
    for (const b of BUGS) {
      expect(b.fly).toBeFalsy();
      expect(b.speed).toBeGreaterThanOrEqual(0.2);
      expect(b.speed).toBeLessThanOrEqual(1);
      // 速い虫（0.6 以上）は、かたい・かじる・群れのくせが無い、体力の低い虫だけ
      if (b.speed >= 0.6) expect(b.hp).toBeLessThanOrEqual(3);
    }
    expect(BUG_MAP.kamemushi.speed).toBe(0.35);
    expect(BUG_MAP.imomushi.speed).toBe(Math.min(...BUGS.map((b) => b.speed)));
    for (const b of BUGS.filter((x) => x.boss)) expect(b.speed).toBeLessThanOrEqual(0.3);
  });
  test("虫のくせ: かたい・かじる・群れ・速いがそろっていて、難関から出てくる", () => {
    const trait = BUGS.filter((b) => isTraitBug(b));
    expect(trait.some((b) => (b.catResist ?? 1) < 1)).toBe(true);
    expect(trait.some((b) => (b.chew ?? 0) > 0)).toBe(true);
    expect(trait.some((b) => (b.pack ?? 1) > 1)).toBe(true);
    expect(trait.some((b) => b.speed >= 0.9)).toBe(true);
    for (const b of trait) {
      // はじめて出るのは難関（章の5番目か10番目）
      expect(wallOf(b.from)).toBeGreaterThan(0);
      const st = STAGES[b.from];
      expect(st.waves.some((w) => w.bugs.some((g) => g.bug === b.id))).toBe(true);
    }
    // 新しい虫の絵は、ほかの虫と見分けがつく（シロアリはアリの絵ではない）
    const normal = BUGS.filter((b) => !b.boss);
    const shapes = new Set(normal.map((b) => bugShapeOf(b.id)));
    expect(shapes.size).toBeGreaterThanOrEqual(normal.length - 2);
    // ぬしは章ごと（ハチとムカデが交互）
    expect(new Set(BUGS.filter((b) => b.boss).map((b) => bugShapeOf(b.id)))).toEqual(new Set(["hornet", "centipede"]));
    expect(bugShapeOf("shiroari")).not.toBe(bugShapeOf("ari"));
    expect(bugShapeOf("hae")).not.toBe(bugShapeOf("ka"));
  });
  test("ステージの家具: 大きさ・場所・道がつながる・いろいろ", () => {
    expect([COLS, ROWS]).toEqual([14, 18]);
    expect([MAMA_COL, MAMA_ROW, MAMA_W, MAMA_H]).toEqual([6, 16, 2, 2]);
    for (const s of STAGES) {
      const obs = s.obstacles ?? [];
      expect(obs.length).toBeGreaterThanOrEqual(8);
      const used = new Set<number>();
      for (const o of obs) {
        const w = o.w ?? 1, h = o.h ?? 1;
        expect(FURNITURE_KINDS as readonly string[]).toContain(o.kind);
        expect(FURNITURE_SIZES[o.kind]).toBeDefined();
        expect(FURNITURE_SIZES[o.kind].some(([a, b]) => a === w && b === h)).toBe(true);
        expect(o.col).toBeGreaterThanOrEqual(0);
        expect(o.col + w).toBeLessThanOrEqual(COLS);
        expect(o.row).toBeGreaterThanOrEqual(OBSTACLE_ROW_MIN);
        expect(o.row + h - 1).toBeLessThanOrEqual(OBSTACLE_ROW_MAX);
        for (const i of obstacleCells(o)) {
          expect(used.has(i)).toBe(false); // 重ならない
          used.add(i);
        }
      }
      const blocked = stageBlocked(obs);
      expect(boardConnected(blocked)).toBe(true);
      // ママのマス・上の端・左右の上の方は空いている
      for (let c = 0; c < COLS; c++) expect(blocked[c]).toBe(false);
      for (let r = 0; r < 3; r++) expect(blocked[r * COLS] || blocked[r * COLS + COLS - 1]).toBe(false);
      // 盤面の 15〜25% くらいが家具
      const cover = used.size / (COLS * ROWS);
      expect(cover).toBeGreaterThanOrEqual(0.14);
      expect(cover).toBeLessThanOrEqual(0.25);
      // 2×2 のオブジェクトを置ける所が十分ある（ママのマスはのぞく）
      let spots = 0;
      for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
        const cells = [r * COLS + c, r * COLS + c + 1, (r + 1) * COLS + c, (r + 1) * COLS + c + 1];
        const mama = (i: number) => (i % COLS) >= MAMA_COL && (i % COLS) < MAMA_COL + MAMA_W && Math.floor(i / COLS) >= MAMA_ROW;
        if (cells.every((i) => !blocked[i] && !mama(i))) spots++;
      }
      expect(spots).toBeGreaterThanOrEqual(60);
      // 難関は迷路が長い
      if (s.wall) expect(mazeLength(obs)).toBeGreaterThan(30);
      expect(s.theme).toBeDefined();
    }
    expect(STAGES.some((s) => s.obstacles!.some((o) => (o.w ?? 1) * (o.h ?? 1) >= 3))).toBe(true);
    // 章ごとに部屋（床）が変わり、家具の種類もいろいろ
    expect(new Set(STAGES.map((s) => s.theme)).size).toBeGreaterThanOrEqual(6);
    for (let ch = 1; ch <= 10; ch++) {
      const kinds = new Set(STAGES.filter((s) => s.chapter === ch).flatMap((s) => s.obstacles!.map((o) => o.kind)));
      expect(kinds.size).toBeGreaterThanOrEqual(7);
    }
    expect(new Set(STAGES.flatMap((s) => s.obstacles!.map((o) => o.kind))).size).toBeGreaterThanOrEqual(20);
    // 縦長の仕切り（1×3・1×4）も、横長（3×1・4×1）も出てくる
    const all = STAGES.flatMap((s) => s.obstacles!);
    expect(all.some((o) => (o.w ?? 1) === 1 && (o.h ?? 1) >= 3)).toBe(true);
    expect(all.some((o) => (o.w ?? 1) >= 4 && (o.h ?? 1) === 1)).toBe(true);
  });
  test("難しさの山: 章の5番目は難関・10番目は大難関（ぬし）。体力がぐっと上がり、次はやさしくなる", () => {
    for (const s of STAGES) {
      expect(s.wall).toBe(s.index === 10 ? 2 : s.index === 5 ? 1 : 0);
      expect(wallOf(stageIndexOf(s.id))).toBe(s.wall);
    }
    for (let g = 1; g < 100; g++) {
      const r = STAGES[g].hpMul / STAGES[g - 1].hpMul;
      if (STAGES[g].wall) expect(r).toBeGreaterThan(2.5);          // 難関でぐっと上がる
      else if (STAGES[g - 1].wall) expect(r).toBeLessThan(1);      // 難関のあとは、やさしくなる
      else expect(r).toBeGreaterThan(1.2);                         // ふつうは少しずつ
    }
    // 難関は出口が多い・くせのある虫が多い
    const lanesOf = (s: (typeof STAGES)[number]) => new Set(s.waves.flatMap((w) => w.bugs.flatMap((g) => g.lanes ?? [-1]))).size;
    const traitShare = (s: (typeof STAGES)[number]) => {
      let t = 0, n = 0;
      for (const w of s.waves) for (const g of w.bugs) { const b = BUG_MAP[g.bug]; if (b.boss) continue; n += g.count; if (isTraitBug(b)) t += g.count; }
      return n ? t / n : 0;
    };
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const walls = STAGES.filter((s) => s.wall && s.chapter >= 1 && stageIndexOf(s.id) >= 4);
    const normal = STAGES.filter((s) => !s.wall && stageIndexOf(s.id) >= 4);
    expect(avg(walls.map(lanesOf))).toBeGreaterThan(avg(normal.map(lanesOf)));
    expect(avg(walls.map(traitShare))).toBeGreaterThan(avg(normal.map(traitShare)) + 0.1);
  });
  test("ステージの虫: 次々にたくさん・いくつもの所から", () => {
    const counts = STAGES.map((s) => stageLoad(s).count);
    expect(counts[0]).toBeGreaterThanOrEqual(20);
    expect(counts[99]).toBeGreaterThanOrEqual(300);
    expect(Math.min(...counts.slice(50))).toBeGreaterThanOrEqual(150);
    // 1ステージの中では、最初の波は少なく、最後の波ほど多い
    const waveCount = (w: (typeof STAGES)[number]["waves"][number]) => w.bugs.reduce((a, x) => a + x.count, 0);
    // （大難関の最後の「ぬしの波」は、ぬしとお供だけなので、その前の波でくらべる）
    for (const s of STAGES) {
      const swarm = s.waves.filter((w) => !w.bugs.some((g) => BUG_MAP[g.bug].boss));
      expect(waveCount(swarm[swarm.length - 1])).toBeGreaterThan(waveCount(swarm[0]) * 3);
    }
    for (const s of STAGES) {
      for (const w of s.waves) {
        for (const g of w.bugs) {
          expect(g.every).toBeGreaterThanOrEqual(0.25);
          expect(g.every).toBeLessThanOrEqual(8);
          for (const l of g.lanes ?? []) expect(l >= 0 && l < COLS).toBe(true);
        }
      }
    }
    // 後半は同時にいくつもの所から出てくる
    const multi = STAGES.slice(30).filter((s) => s.waves.some((w) => w.bugs.length >= 2 && w.bugs.some((g) => !g.lanes || g.lanes.length >= 2)));
    expect(multi.length).toBeGreaterThan(60);
    // 体力は、ふつうのステージどうしでは 1.3 倍くらいずつ（章の頭は少しやさしい）
    for (let g = 1; g < 100; g++) {
      if (STAGES[g].wall || STAGES[g - 1].wall || STAGES[g].index === 1) continue;
      const r = STAGES[g].hpMul / STAGES[g - 1].hpMul;
      expect(r).toBeGreaterThan(1.3);
      expect(r).toBeLessThan(1.8);
    }
  });
  test("ステージの虫はすべて定義ずみ・10番目はボス", () => {
    const bugIds = new Set(BUGS.map((b) => b.id));
    for (const s of STAGES) {
      for (const w of s.waves) for (const g of w.bugs) expect(bugIds.has(g.bug)).toBe(true);
      const hasBoss = s.waves.some((w) => w.bugs.some((g) => BUGS.find((b) => b.id === g.bug)?.boss));
      expect(hasBoss).toBe(s.index === 10);
    }
    expect(stageById("1-1")!.hpMul).toBe(1);
    expect(stageById("1-2")!.hpMul).toBeGreaterThan(1.3);
  });
});

describe("セーブ", () => {
  test("localStorage がなくても動く", () => {
    const s = loadSave();
    expect(s.cleared).toBe(-1);
    expect(writeSave(s)).toBe(false);
  });
  test("はじめのデータ: 仮の1匹（登録の前でも遊べる）", () => {
    const s = newSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(s.setupDone).toBe(false);
    expect(Object.keys(s.cats)).toEqual(["c1"]);
    expect(s.cats.c1).toMatchObject({
      uid: "c1", name: "ノルウェージャン", look: "chatora", level: 1, exp: 0, bond: 0, bondExp: 0,
      waza: { main: "nekopunch", subs: [] },
    });
    expect(s.cats.c1.preset).toBeUndefined();
    expect(s.party).toEqual(["c1"]);
    expect(s.wazas).toEqual({ nekopunch: { level: 1, count: 1 }, choichoi: { level: 1, count: 1 } });
    expect(s.skills).toEqual({ melee: {}, ranged: {}, aoe: {}, fast: {} });
    expect(s.churu).toBe(START_CHURU);
    expect(s.churu).toBeGreaterThanOrEqual(PULL_COST); // すぐに1回ためせる
    expect(s.gachaPity).toBe(0);
    expect("chars" in s).toBe(false);
    expect("selectedChar" in s).toBe(false);
    expect(resolveCat(s).look).toBe("chatora");
  });
  test("v2 → v3: 猫は近所の猫に・特技はメインのわざに・スキルはちゅ〜るで返す", () => {
    // v2 のコスト（round(基本 × 1.8^段 × 1.3^レベル)）
    expect(v2SkillCost("melee.root", 1)).toBe(2);
    expect(v2SkillCost("melee.atk1", 3)).toBe(3 + 4 + 5);
    expect(v2SkillCost("melee.crit1", 2)).toBe(11 + 14);
    expect(v2SkillCost("fast.techcap", 1)).toBe(Math.round(30 * Math.pow(1.8, 7)));
    expect(v2SkillCost("nazo.x", 3)).toBe(0);
    const old = {
      version: 2, churu: 77, coins: 50, gachaPity: 12, totalPulls: 30, selectedChar: "leo", cleared: 5,
      chars: {
        chatora: { level: 7, exp: 2, skills: { "melee.root": 1, "melee.atk1": 3 }, bond: 2 },
        mike: { level: 3, exp: 0, skills: {}, bond: 0 },
        leo: { level: 20, exp: 5, skills: { "melee.crit1": 2 }, bond: 9 },
        nazo_neko: { level: 9, exp: 0, skills: { "melee.atk1": 10 } },
      },
    };
    const s = migrate(old);
    expect(s.version).toBe(3);
    expect(s.setupDone).toBe(true);
    expect(s.coins).toBe(50);
    expect(s.cleared).toBe(5);
    expect(s.gachaPity).toBe(12);
    expect(s.churu).toBe(77 + 2 + 12 + 25); // 知らない猫のぶんは返さない
    expect(s.skills).toEqual({ melee: {}, ranged: {}, aoe: {}, fast: {} });
    expect(Object.keys(s.cats).length).toBe(3);
    // 選んでいた猫が主人公（c1）
    expect(s.party).toEqual(["c1"]);
    expect(s.cats.c1).toMatchObject({ name: "レオ", look: "leo", preset: "leo", level: 20, exp: 5, bond: MAX_BOND });
    expect(s.cats.c1.waza.main).toBe(CHAR_MAP.leo.waza);
    expect(WAZA_MAP[s.cats.c1.waza.main].rarity).toBe("SR");
    const byLook = (look: string) => Object.values(s.cats).find((c) => c.look === look)!;
    expect(byLook("chatora")).toMatchObject({ name: "ノルウェージャン", level: 7, bond: 2, waza: { main: "nekopunch", subs: [] } });
    expect(byLook("mike").waza.main).toBe("choichoi");
    expect(s.wazas[CHAR_MAP.leo.waza]).toEqual({ level: 1, count: 1 });
    for (const id of STARTER_WAZAS) expect(s.wazas[id]).toBeDefined();
    expect(s.nextCatUid).toBe(4);
    expect("chars" in s).toBe(false);
    expect("selectedChar" in s).toBe(false);
    // v1（スキルは id の配列）も
    const t = migrate({ version: 1, coins: 1, selectedChar: "kuro", chars: { chatora: { level: 2, skills: ["melee_atk1", "melee_hp2", "nazo"] }, kuro: { level: 3 } } });
    expect(t.churu).toBe(START_CHURU + v2SkillCost("melee.atk1", 1) + v2SkillCost("melee.armor1", 1));
    expect(t.cats[t.party[0]].look).toBe("kuro");
    expect(Object.values(t.cats).map((c) => c.look).sort()).toEqual(["chatora", "kuro", "mike"]); // はじめの2匹はいた
    expect(t.setupDone).toBe(true);
  });
  test("v3 の中身をたしかめる・足りない項目がうまる・往復できる", () => {
    const s = migrate({ coins: 5 });
    expect(s.coins).toBe(5);
    expect(s.setupDone).toBe(false); // 中身のないデータは、はじめから扱い
    expect(Object.keys(s.cats)).toEqual(["c1"]);
    expect(s.loadout.length).toBeGreaterThan(0);
    const bad = migrate({
      version: 3, setupDone: true, nextCatUid: 2,
      cats: {
        c1: { uid: "c1", name: "  たろう ", look: "kuro", personality: "yancha", level: 4, waza: { main: "machinoboss", subs: ["kakurenbo", "kakurenbo", "nekopunch"] } },
        c7: { name: "", look: "nazo", personality: "nazo", level: -3, bond: 99, waza: { main: "choichoi", subs: [] } },
        c8: "こわれた",
      },
      party: ["c7", "zz", "c7", "c1"],
      wazas: { kakurenbo: { level: 9, count: 1 }, nazo: { level: 1 } },
      skills: { melee: { "melee.root": 5, "ranged.root": 1, nope: 1 }, nazo: {} },
    });
    expect(Object.keys(bad.cats)).toEqual(["c1", "c7"]);
    expect(bad.cats.c1).toMatchObject({ name: "たろう", look: "kuro", personality: "yancha", level: 4 });
    expect(bad.cats.c1.waza).toEqual({ main: "nekopunch", subs: ["kakurenbo"] }); // 覚えていないわざ・メインはサブにできない
    expect(bad.cats.c7.look).toBe(CAT_LOOKS[0]);
    expect(bad.cats.c7.level).toBe(1);
    expect(bad.cats.c7.bond).toBe(MAX_BOND);
    expect(bad.party).toEqual(["c7", "c1"]);
    expect(bad.nextCatUid).toBe(8);
    expect(bad.wazas.kakurenbo.level).toBe(MAX_WAZA_LEVEL);
    expect(bad.wazas.nazo).toBeUndefined();
    expect(bad.skills.melee).toEqual({ "melee.root": 1 });
    expect(bad.setupDone).toBe(true);
    const t = newSave();
    t.coins = 123;
    addCat(t, "みー");
    t.skills.melee["melee.root"] = 1;
    const back = importSave(exportSave(t))!;
    expect(back.coins).toBe(123);
    expect(back.cats).toEqual(t.cats);
    expect(back.skills).toEqual(t.skills);
    expect(back.nextCatUid).toBe(t.nextCatUid);
    expect(importSave("こわれた")).toBeNull();
  });
});

describe("うちの子・近所の猫", () => {
  test("登録・変更・お別れ", () => {
    const s = newSave();
    const bad = [
      registerCat(s, { name: " ", look: "kuro", personality: "yancha" }),
      registerCat(s, { name: "あ".repeat(20), look: "kuro", personality: "yancha" }),
      registerCat(s, { name: "みー", look: "nazo", personality: "yancha" }),
      registerCat(s, { name: "みー", look: "kuro", personality: "nazo" as never }),
    ];
    for (const r of bad) expect(r.ok).toBe(false);
    const r = registerCat(s, { name: "  みー ", look: "kuro", personality: "yancha" });
    expect(r).toEqual({ ok: true, value: "c2" });
    expect(s.cats.c2).toMatchObject({ uid: "c2", name: "みー", look: "kuro", personality: "yancha", level: 1, waza: { main: "nekopunch", subs: [] } });
    expect(updateCat(s, "c2", { name: "みーちゃん", look: "hime", personality: "maipace" }).ok).toBe(true);
    expect(s.cats.c2).toMatchObject({ name: "みーちゃん", look: "hime", personality: "maipace" });
    expect(updateCat(s, "c2", { look: "nazo", name: "x" }).ok).toBe(false);
    expect(s.cats.c2.name).toBe("みーちゃん"); // まちがいがあれば何も変えない
    expect(updateCat(s, "zz", { name: "x" }).ok).toBe(false);
    // 主人公ははずせない。相棒ははずすとパーティからも
    expect(removeCat(s, "c1").ok).toBe(false);
    setParty(s, 1, "c2");
    expect(s.party).toEqual(["c1", "c2"]);
    expect(removeCat(s, "c2").ok).toBe(true);
    expect(s.cats.c2).toBeUndefined();
    expect(s.party).toEqual(["c1"]);
    // 最大 30 匹
    for (let i = Object.keys(s.cats).length; i < MAX_CATS; i++) addCat(s, `ねこ${i}`);
    expect(Object.keys(s.cats).length).toBe(MAX_CATS);
    const over = registerCat(s, { name: "もう1匹", look: "kuro", personality: "yancha" });
    expect(over.ok).toBe(false);
    // uid はかぶらない
    expect(new Set(Object.keys(s.cats)).size).toBe(MAX_CATS);
  });
  test("パーティ: 主人公＋相棒2匹・同じ猫は1つの枠だけ", () => {
    const s = newSave();
    const a = addCat(s, "あ"), b = addCat(s, "い"), c = addCat(s, "う");
    expect(setParty(s, 2, a).ok).toBe(true); // 空きは詰める
    expect(s.party).toEqual(["c1", a]);
    expect(setParty(s, 2, b).ok).toBe(true);
    expect(s.party).toEqual(["c1", a, b]);
    expect(setParty(s, 1, b).ok).toBe(true); // 入れかわる
    expect(s.party).toEqual(["c1", b, a]);
    expect(setParty(s, 0, a).ok).toBe(true); // 相棒を主人公に
    expect(s.party).toEqual([a, b, "c1"]);
    expect(heroUid(s)).toBe(a);
    expect(setParty(s, 2, c).ok).toBe(true);
    expect(s.party).toEqual([a, b, c]);
    expect(setParty(s, 0, null).ok).toBe(false);
    expect(setParty(s, 1, null).ok).toBe(true);
    expect(s.party).toEqual([a, c]);
    expect(setParty(s, 2, a).ok).toBe(false); // 主人公を空きの枠へは動かせない
    expect(setParty(s, 1, "zz").ok).toBe(false);
    expect(partyRoles(s)).toEqual(["melee"]);
    learnWaza(s, "choichoi");
    equipWaza(s, c, "main", "choichoi");
    expect(partyRoles(s)).toEqual(["melee", "ranged"]);
  });
  test("わざをつける: 覚えたものだけ・同じ猫に同じわざは不可・何匹にでも", () => {
    const s = newSave();
    const b = addCat(s, "い");
    expect(equipWaza(s, "c1", "main", "karinomeijin").ok).toBe(false); // まだ覚えていない
    learnWaza(s, "karinomeijin");
    learnWaza(s, "kakurenbo");
    learnWaza(s, "bilibili");
    expect(equipWaza(s, "c1", "main", "kakurenbo").ok).toBe(false); // サブはメインにできない
    expect(equipWaza(s, "c1", 0, "karinomeijin").ok).toBe(false);   // メインはサブにできない
    expect(equipWaza(s, "c1", "main", null).ok).toBe(false);
    expect(equipWaza(s, "c1", "main", "karinomeijin").ok).toBe(true);
    expect(equipWaza(s, b, "main", "karinomeijin").ok).toBe(true); // 何匹にでも
    expect(equipWaza(s, "c1", 0, "kakurenbo").ok).toBe(true);
    expect(equipWaza(s, "c1", 1, "kakurenbo").ok).toBe(false); // 同じ猫に同じわざは不可
    expect(equipWaza(s, "c1", 1, "bilibili").ok).toBe(true);
    expect(equipWaza(s, b, 0, "kakurenbo").ok).toBe(true);
    expect(s.cats.c1.waza).toEqual({ main: "karinomeijin", subs: ["kakurenbo", "bilibili"] });
    expect(equipWaza(s, "c1", 0, null).ok).toBe(true);
    expect(s.cats.c1.waza.subs).toEqual(["bilibili"]);
    expect(equipWaza(s, "zz", 0, "bilibili").ok).toBe(false);
    // メインのわざで役割が決まる
    expect(resolveCat(s, "c1").role).toBe("melee");
    learnWaza(s, "kihin");
    equipWaza(s, "c1", "main", "kihin");
    const k = resolveCat(s, "c1");
    expect(k.role).toBe("ranged");
    expect(k.pierce).toBe(2);
    expect(k.range).toBeCloseTo(3.5);
    expect(k.combos.critChain).toBe(1);   // サブ（会心ビリビリ）
    expect(k.combos.pierceGrow).toBeCloseTo(0.15); // メイン（気品）
  });
  test("譲渡会はない: ステージを進めても猫は勝手に増えない（増やすのは登録だけ）", () => {
    const s = newSave();
    const rng = mulberry32(1);
    for (const id of ["1-1", "1-2", "1-3", "1-4", "1-5"]) {
      const r = grantRewards(s, id, rng);
      expect("newNeighbors" in r).toBe(false);
    }
    expect(Object.keys(s.cats)).toEqual(["c1"]);
    const uid = addCat(s, "みけ", "mike");
    expect(s.cats[uid]).toMatchObject({ name: "みけ", look: "mike", level: 1 });
    expect(s.cats[uid].preset).toBeUndefined();
  });
  test("猫にはレアリティがない（同じわざ・レベル・性格なら同じ強さ）", () => {
    const s = newSave();
    // 古いセーブから引きついだ猫（preset あり）と、登録したうちの子
    const old = migrate({ version: 2, selectedChar: "taisho", chars: { taisho: { level: 1 } } });
    const taisho = old.party[0];
    const mine = addCat(old, "うちの子", "chatora");
    old.cats[taisho].personality = "nonbiri";
    old.cats[taisho].bond = 0; old.cats[taisho].bondExp = 0;
    equipWaza(old, taisho, "main", "nekopunch");
    expect(old.cats[taisho].preset).toBe("taisho");
    const x = resolveCat(old, taisho), y = resolveCat(old, mine);
    for (const key of ["atk", "maxHp", "atkInterval", "range", "moveSpeed", "crit"] as const) expect(x[key]).toBeCloseTo(y[key]);
    expect(catPower(old, taisho)).toBeCloseTo(catPower(old, mine));
  });
  test("メインのわざのレアリティ・わざのレベル・性格・なかよし度・相棒", () => {
    const s = newSave();
    const base = resolveCat(s, "c1");
    expect(base).toMatchObject({ id: "c1", name: "ノルウェージャン", look: "chatora", role: "melee", companion: false });
    expect(base.knockback).toBeCloseTo(0.3);
    expect(base.combos).toEqual({});
    for (const v of Object.values(base)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    expect(base.reviveHp).toBe(0.5);
    expect(base.critMul).toBe(1.5);
    expect(base.slowHit).toBe(1);
    expect(base.pierce).toBe(0);
    // レアリティ: R のメインのわざ（攻撃の形は同じ）なら攻撃 ×1.2
    learnWaza(s, "dossiri");
    equipWaza(s, "c1", "main", "dossiri");
    expect(resolveCat(s, "c1").atk).toBeCloseTo(base.atk * 1.2);
    expect(resolveCat(s, "c1").armor).toBeCloseTo(0.85);
    equipWaza(s, "c1", "main", "nekopunch");
    // わざのレベル: 1つにつき効果 +20%
    s.wazas.nekopunch.level = 3;
    expect(resolveCat(s, "c1").knockback).toBeCloseTo(0.3 * 1.4);
    expect(resolveCat(s, "c1").atk).toBeCloseTo(base.atk); // 倍率は変わらない
    // 性格
    s.cats.c1.personality = "yancha";
    expect(resolveCat(s, "c1").atk).toBeCloseTo(base.atk * 1.15);
    expect(resolveCat(s, "c1").maxHp).toBeCloseTo(base.maxHp / 1.2 * 0.9); // のんびり（体力 +20%）から
    s.cats.c1.personality = "amaenbo";
    expect(resolveCat(s, "c1").restTime).toBeCloseTo(base.restTime * 0.75);
    s.cats.c1.personality = "nonbiri";
    // なかよし度
    s.cats.c1.bond = MAX_BOND;
    expect(resolveCat(s, "c1").atk).toBeCloseTo(base.atk * bondMul(MAX_BOND));
    expect(bondMul(MAX_BOND)).toBeCloseTo(2);
    s.cats.c1.bond = 0;
    // 相棒は攻撃・体力 ×0.45（猫は手助け役。主役はオブジェクト）
    const comp = resolveCat(s, "c1", true);
    expect(COMPANION_POWER).toBe(0.45);
    expect(comp.companion).toBe(true);
    expect(comp.atk).toBeCloseTo(base.atk * COMPANION_POWER);
    expect(comp.maxHp).toBeCloseTo(base.maxHp * COMPANION_POWER);
    expect(comp.moveSpeed).toBeCloseTo(base.moveSpeed);
    // 知らない uid は主人公
    expect(resolveCat(s, "zz").id).toBe("c1");
  });
});

describe("猫のレベル・ちゅ〜る・なかよし度", () => {
  test("経験値でレベルアップ・ちゅ〜るがもらえる", () => {
    const s = newSave();
    const id = heroUid(s);
    const c0 = s.churu;
    expect(addExp(s, id, expToNext(1) - 1)).toBe(0);
    expect(s.churu).toBe(c0);
    expect(addExp(s, id, 1)).toBe(1);
    expect(s.cats[id].level).toBe(2);
    expect(s.cats[id].exp).toBe(0);
    expect(s.churu).toBe(c0 + churuForLevel(2));
    const ups = addExp(s, id, expToNext(2) + expToNext(3) + 1);
    expect(ups).toBe(2);
    expect(s.cats[id].level).toBe(4);
    expect(familyLevel(s)).toBe(4);
    expect(expToNext(20)).toBeGreaterThan(expToNext(10) * 4);
    expect(addExp(s, "zz", 100)).toBe(0);
    expect(churuForLevel(10)).toBeGreaterThan(churuForLevel(9));
    expect(churuForLevel(50)).toBeGreaterThan(churuForLevel(10));
  });
  test("ステージクリアのちゅ〜る（はじめては多め）", () => {
    const s = newSave();
    const rw = stageById("1-1")!.rewards;
    expect(rw.churu).toBeGreaterThan(0);
    const c0 = s.churu;
    const r = grantRewards(s, "1-1", mulberry32(1));
    expect(r.churu).toBe(rw.churu * FIRST_CLEAR_CHURU_MUL);
    expect(s.churu).toBe(c0 + r.churu + r.churuFromLevels);
    const again = grantRewards(s, "1-1", mulberry32(2));
    expect(again.churu).toBe(rw.churu);
    expect(stageById("10-1")!.rewards.churu).toBeGreaterThan(rw.churu * 5); // 後ほど多い
  });
  test("経験値はパーティに全部・控えは 30%、なかよし度はパーティだけ戦闘ごとに", () => {
    const s = newSave();
    const comp = addCat(s, "相棒"), idle = addCat(s, "控え");
    setParty(s, 1, comp);
    const totalExp = (uid: string) => {
      const c = s.cats[uid];
      let e = c.exp;
      for (let lv = 1; lv < c.level; lv++) e += expToNext(lv);
      return e;
    };
    const r = grantRewards(s, "1-1", mulberry32(4));
    expect(IDLE_EXP_RATE).toBe(0.3);
    expect(totalExp("c1")).toBe(r.exp);
    expect(totalExp(comp)).toBe(r.exp);
    expect(totalExp(idle)).toBe(Math.round(r.exp * IDLE_EXP_RATE));
    expect(s.cats.c1.bondExp).toBe(1);
    expect(s.cats[comp].bondExp).toBe(1);
    expect(s.cats[idle].bondExp).toBe(0);
    // 戦闘を重ねると、なかよし度が上がる（最大5）
    const rng = mulberry32(5);
    let ups = 0;
    for (let i = 1; i < bondToNext(0); i++) if (grantRewards(s, "1-1", rng).bondUps.c1) ups++;
    expect(s.cats.c1.bond).toBe(1);
    expect(ups).toBe(1);
    expect(s.cats[idle].bond).toBe(0);
    for (let i = 0; i < 200; i++) addBondExp(s, "c1");
    expect(s.cats.c1.bond).toBe(MAX_BOND);
    expect(addBondExp(s, "c1")).toBe(false);
    let total = 0;
    for (let b = 0; b < MAX_BOND; b++) total += bondToNext(b);
    expect(total).toBeGreaterThanOrEqual(20); // すぐには最大にならない
    expect(total).toBeLessThanOrEqual(80);
  });
});

describe("スキルツリー（家族で共有・役割ごと）", () => {
  test("前提・ちゅ〜る・家族のレベル", () => {
    const s = newSave();
    expect(skillTreeOf("melee")).toBe(SKILL_TREES.melee);
    s.churu = 0;
    const r0 = canLearn(s, "melee", "melee.root");
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.reason).toContain("ちゅ〜る");
    s.churu = 10000;
    const atk1 = SKILL_TREES.melee.find((n) => n.tier === 0 && n.id !== "melee.root" && n.effects[0].stat === "atk")!;
    const r1 = canLearn(s, "melee", atk1.id);
    expect(r1.ok).toBe(false); // 根もとがまだ
    if (!r1.ok) expect(r1.reason).toContain("はじめの一歩");
    expect(learnSkill(s, "melee", "melee.root").ok).toBe(true);
    expect(learnSkill(s, "melee", "melee.root").ok).toBe(false); // 最大レベル
    expect(learnSkill(s, "melee", "ranged.root").ok).toBe(false); // ほかの役割
    expect(learnSkill(s, "ranged", "melee.atk1").ok).toBe(false);
    const before = resolveCat(s).atk;
    for (let i = 0; i < 3; i++) expect(learnSkill(s, "melee", atk1.id).ok).toBe(true);
    expect(nodeLevel(s, "melee", atk1.id)).toBe(3);
    expect(resolveCat(s).atk).toBeCloseTo(before / 1.05 * (1 + 0.05 + 3 * atk1.effects[0].per));
    // 段1は家族のだれかのレベル 3 から
    const t1 = SKILL_TREES.melee.find((n) => n.tier === 1 && n.req.every((r) => r.id === atk1.id))!;
    const r2 = canLearn(s, "melee", t1.id);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain("レベル");
    const other = addCat(s, "ベテラン");
    s.cats[other].level = 3; // 控えの猫でもよい
    expect(familyLevel(s)).toBe(3);
    expect(learnSkill(s, "melee", t1.id).ok).toBe(true);
  });
  test("1匹で取れば、その役割で戦う全員に効く", () => {
    const s = newSave();
    const b = addCat(s, "い");
    const c = addCat(s, "う");
    learnWaza(s, "choichoi");
    equipWaza(s, c, "main", "choichoi");
    const a0 = resolveCat(s, "c1").atk, b0 = resolveCat(s, b).atk, c0 = resolveCat(s, c).atk;
    s.churu = 100;
    learnSkill(s, "melee", "melee.root");
    expect(resolveCat(s, "c1").atk).toBeCloseTo(a0 * 1.05);
    expect(resolveCat(s, b).atk).toBeCloseTo(b0 * 1.05);
    expect(resolveCat(s, c).atk).toBeCloseTo(c0); // 遠距離には効かない
    expect(s.skills.melee).toEqual({ "melee.root": 1 });
  });
  test("コストは段とレベルで増える", () => {
    const t = SKILL_TREES.melee;
    const a0 = t.find((n) => n.tier === 0 && n.id !== "melee.root" && n.effects[0].stat === "atk")!;
    const a6 = t.find((n) => n.tier === 6 && n.effects[0].stat === "atk" && n.maxLevel === a0.maxLevel)!;
    for (let lv = 1; lv < a0.maxLevel; lv++) expect(nodeCost(a0, lv)).toBeGreaterThan(nodeCost(a0, lv - 1));
    expect(nodeCost(a6, 0)).toBeGreaterThan(nodeCost(a0, 0) * 10);
    const s = newSave();
    expect(nextNodeCost(s, "melee", a0.id)).toBe(nodeCost(a0, 0));
    expect(nextNodeCost(s, "ranged", a0.id)).toBeNull();
  });
  test("忘れると全部もどる（役割ごと）", () => {
    const s = newSave();
    s.churu = 500;
    learnSkill(s, "melee", "melee.root");
    learnSkill(s, "ranged", "ranged.root");
    const a0 = SKILL_TREES.melee.find((n) => n.tier === 0 && n.id !== "melee.root" && n.effects[0].stat === "atk")!;
    learnSkill(s, "melee", a0.id);
    learnSkill(s, "melee", a0.id);
    const spent = skillSpent(s, "melee");
    expect(s.churu).toBe(500 - spent - skillSpent(s, "ranged"));
    expect(resetSkills(s, "melee")).toBe(spent);
    expect(s.skills.melee).toEqual({});
    expect(s.skills.ranged).toEqual({ "ranged.root": 1 });
    expect(s.churu).toBe(500 - skillSpent(s, "ranged"));
  });
  test("ぜんぶ取ると上限の中におさまる・複合効果も入る", () => {
    for (const role of ROLES) {
      const s = newSave();
      s.cats.c1.level = 999;
      for (const n of SKILL_TREES[role]) {
        expect(isNodeOpen(s, role, n.id).ok).toBe(true); // 前から順に取れる（レアリティの条件はない）
        s.skills[role][n.id] = n.maxLevel;
      }
      const main = { melee: "nekopunch", ranged: "choichoi", aoe: "fuwafuwa", fast: "yorunome" }[role];
      learnWaza(s, main);
      equipWaza(s, "c1", "main", main);
      const k = resolveCat(s, "c1");
      expect(k.role).toBe(role);
      expect(k.crit).toBeGreaterThan(0.2);
      expect(k.crit).toBeLessThanOrEqual(1);
      expect(k.dodge).toBeLessThanOrEqual(0.6);
      expect(k.armor).toBeGreaterThanOrEqual(0.3);
      expect(k.reviveHp).toBeLessThanOrEqual(1);
      expect(k.atkInterval).toBeGreaterThanOrEqual(0.15);
      expect(k.restTime).toBeGreaterThanOrEqual(1);
      expect(Object.keys(k.combos).length).toBeGreaterThanOrEqual(8);
      if (role === "ranged") expect(k.pierce).toBeGreaterThanOrEqual(3);
      else expect(k.pierce).toBe(0);
      if (role !== "ranged") expect(k.multiHit).toBeGreaterThanOrEqual(1);
      for (const v of Object.values(k.combos)) expect(v).toBeGreaterThan(0);
    }
  });
});

describe("ねこ福袋", () => {
  test("レアリティの出やすさ（たねつき）", () => {
    const rng = mulberry32(123);
    const n = 100000;
    const cnt: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = rollRarity(rng);
      cnt[r] = (cnt[r] ?? 0) + 1;
    }
    const total = Object.values(GACHA_RATES).reduce((a, b) => a + b, 0);
    for (const r of RARITIES) {
      const expect_ = GACHA_RATES[r] / total;
      expect(Math.abs(cnt[r] / n - expect_)).toBeLessThan(Math.max(0.005, expect_ * 0.08));
    }
    expect(GACHA_RATES).toEqual({ N: 50, R: 30, SR: 14, SSR: 5, UR: 1 });
    const rates = pullRates();
    expect(rates.reduce((s, x) => s + x.rate, 0)).toBeCloseTo(1);
    expect(rates.flatMap((x) => x.wazas).reduce((s, w) => s + w.rate, 0)).toBeCloseTo(1);
    expect(rates.flatMap((x) => x.wazas).length).toBe(WAZAS.length); // わざは全部出る
  });
  test("1回 10・10回 90 のちゅ〜る", () => {
    expect(pullCost(1)).toBe(10);
    expect(pullCost(10)).toBe(90);
    expect([PULL_COST, PULL10_COST]).toEqual([10, 90]);
    const s = newSave();
    const rng = mulberry32(9);
    s.churu = PULL_COST - 1;
    expect(canPull(s, 1).ok).toBe(false);
    const no = pull(s, rng, 1);
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toContain("ちゅ〜る");
    s.churu = PULL_COST + PULL10_COST;
    const one = pull(s, rng, 1);
    expect(one.ok && one.value.length).toBe(1);
    const ten = pull(s, rng, 10);
    expect(ten.ok && ten.value.length).toBe(10);
    expect(s.totalPulls).toBe(11);
    const all = [...(one.ok ? one.value : []), ...(ten.ok ? ten.value : [])];
    for (const r of all) {
      expect(WAZA_MAP[r.wazaId].rarity).toBe(r.rarity);
      expect(s.wazas[r.wazaId].level).toBeGreaterThanOrEqual(r.level);
    }
    // おみやげ（返ってきたちゅ〜る）だけが残る
    expect(s.churu).toBe(all.reduce((a, r) => a + r.refund, 0));
  });
  test("10回まとめては SR 以上がかならず1つ", () => {
    const s = newSave();
    s.churu = PULL10_COST;
    const r = pull(s, () => 0.01, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slice(0, 9).every((x) => x.rarity === "N")).toBe(true);
    expect(["SR", "SSR", "UR"]).toContain(r.value[9].rarity);
    expect(r.value[9].guaranteed).toBe(true);
    const t = newSave();
    const rng = mulberry32(77);
    for (let i = 0; i < 300; i++) {
      t.churu = PULL10_COST;
      const x = pull(t, rng, 10);
      expect(x.ok && x.value.some((p) => ["SR", "SSR", "UR"].includes(p.rarity))).toBe(true);
    }
  });
  test("天井: 50回目はかならず SSR 以上", () => {
    const s = newSave();
    s.churu = 1e6;
    const allN = () => 0.01;
    for (let i = 0; i < PITY_PULLS - 1; i++) {
      const r = pull(s, allN, 1);
      expect(r.ok && r.value[0].rarity).toBe("N");
    }
    expect(s.gachaPity).toBe(PITY_PULLS - 1);
    expect(pullsToPity(s)).toBe(1);
    const r = pull(s, allN, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(["SSR", "UR"]).toContain(r.value[0].rarity);
    expect(r.value[0].pity).toBe(true);
    expect(s.gachaPity).toBe(0);
    const t = newSave();
    t.churu = 1e6;
    t.gachaPity = 30;
    pull(t, () => 0.999, 1); // UR
    expect(t.gachaPity).toBe(0);
    const u = newSave();
    u.churu = 1e9;
    const rng = mulberry32(5);
    let gap = 0, maxGap = 0;
    for (let i = 0; i < 6000; i++) {
      const x = pull(u, rng, 1);
      if (!x.ok) break;
      gap = ["SSR", "UR"].includes(x.value[0].rarity) ? 0 : gap + 1;
      maxGap = Math.max(maxGap, gap);
    }
    expect(maxGap).toBeLessThan(PITY_PULLS);
    // たくさん回せば、わざは全部そろって、みんな最大レベル
    for (const w of WAZAS) expect(u.wazas[w.id]?.level).toBe(MAX_WAZA_LEVEL);
  });
  test("かぶったら、わざのレベル +1（最大5）・そのあとはちゅ〜るに", () => {
    const s = newSave();
    const first = gainWaza(s, "karinomeijin");
    expect(first).toMatchObject({ wazaId: "karinomeijin", rarity: "SR", isNew: true, level: 1, levelUp: false, refund: 0 });
    equipWaza(s, "c1", "main", "karinomeijin");
    const crit1 = resolveCat(s).crit;
    for (let lv = 2; lv <= MAX_WAZA_LEVEL; lv++) {
      expect(gainWaza(s, "karinomeijin")).toMatchObject({ isNew: false, level: lv, levelUp: true, refund: 0 });
    }
    expect(resolveCat(s).crit).toBeCloseTo(crit1 * wazaLevelMul(MAX_WAZA_LEVEL));
    const c0 = s.churu;
    expect(gainWaza(s, "karinomeijin")).toMatchObject({ isNew: false, level: MAX_WAZA_LEVEL, levelUp: false, refund: WAZA_REFUND.SR });
    expect(s.churu).toBe(c0 + WAZA_REFUND.SR);
    expect(s.wazas.karinomeijin.count).toBe(MAX_WAZA_LEVEL + 1);
    // はじめのわざも、かぶればレベルアップ
    expect(gainWaza(s, "nekopunch")).toMatchObject({ isNew: false, level: 2 });
    for (const r of RARITIES) expect(WAZA_REFUND[r]).toBeGreaterThan(0);
    expect(WAZA_REFUND.UR).toBeGreaterThan(WAZA_REFUND.N);
  });
  test("レアリティの高いメインのわざほど強い（レベル1どうし）", () => {
    const s = newSave();
    for (const w of WAZAS) gainWaza(s, w.id);
    const p0 = catPower(s, "c1");
    equipWaza(s, "c1", "main", "machinoboss");
    expect(catPower(s, "c1")).toBeGreaterThan(p0 * 2);
    expect(resolveCat(s).atk).toBeCloseTo(resolveCat(s, "c1").atk);
  });
});

describe("オブジェクト", () => {
  test("かけらとお金でレベルアップ", () => {
    const s = newSave();
    const cost = objectUpgradeCost(s, "wagomu")!;
    expect(cost.shards).toBe(10);
    expect(levelUpObject(s, "wagomu").ok).toBe(false);
    s.objects.wagomu.shards = 12;
    s.coins = cost.coins;
    const atk1 = resolveObjects(s, ["wagomu"])[0].atk;
    expect(levelUpObject(s, "wagomu").ok).toBe(true);
    expect(s.objects.wagomu).toEqual({ level: 2, shards: 2 });
    expect(s.coins).toBe(0);
    expect(resolveObjects(s, ["wagomu"])[0].atk).toBeGreaterThan(atk1);
    expect(objectUpgradeCost(s, "wagomu")!.shards).toBe(15);
    expect(objectUpgradeCost(s, "surippa")).toBeNull();
  });
  test("計算ずみのオブジェクト: 新しい項目がすべてうまる", () => {
    const s = newSave();
    for (const o of OBJECTS) {
      s.objects[o.id] = { level: 1, shards: 0 };
      const r = resolveObject(s, o.id)!;
      for (const k of ["w", "h", "multishot", "spread", "pierce", "splash", "chain", "chainRange", "poison", "poisonSpread",
        "knockback", "crit", "critMul", "cost", "maxHp", "atk", "interval", "range", "slow", "produce", "cooldown"] as const) {
        expect(typeof r[k]).toBe("number");
        expect(Number.isFinite(r[k])).toBe(true);
      }
      expect(r.cooldown).toBe(0);
      expect(r.critMul).toBeGreaterThanOrEqual(1.5);
      expect(r.perks).toEqual([]);
      expect(r.w).toBe(o.base.w);
      expect(r.interval).toBeGreaterThan(0);
    }
    const w1 = resolveObject(s, "wagomu")!;
    expect(w1.multishot).toBe(0);
    expect(w1.pierce).toBe(0);
    expect(w1.crit).toBe(0);
    expect(w1.critMul).toBe(1.5);
    expect(resolveObject(s, "shitajiki")!.chain).toBe(2);
  });
  test("特殊効果はレベルで解放される", () => {
    const s = newSave();
    expect(objectPerks(s, "wagomu").every((p) => !p.unlocked)).toBe(true);
    expect(objectPerks(s, "nope")).toEqual([]);
    s.objects.wagomu.level = 6;
    const ps = objectPerks(s, "wagomu");
    expect(ps.filter((p) => p.unlocked).map((p) => p.level)).toEqual([3, 6]);
    expect(ps[0]).toMatchObject({ level: 3, name: "連射", unlocked: true });
    const r6 = resolveObject(s, "wagomu")!;
    expect(r6.perks).toEqual(["連射", "拡散"]);
    expect(r6.multishot).toBe(2);
    expect(r6.spread).toBeGreaterThan(0);
    expect(r6.interval).toBeCloseTo(OBJECT_MAP.wagomu.base.interval * 0.85);
    s.objects.wagomu.level = 2;
    expect(resolveObject(s, "wagomu")!.perks).toEqual([]);
    s.objects.wagomu.level = 50;
    const r50 = resolveObject(s, "wagomu")!;
    expect(r50.perks.length).toBe(8);
    expect(r50.multishot).toBe(4);
    expect(r50.pierce).toBe(1);
    expect(r50.splash).toBeGreaterThan(0);
    expect(r50.crit).toBeCloseTo(0.3);
    expect(r50.critMul).toBeCloseTo(2.5);
    // 電撃の連鎖・毒の伝染
    s.objects.shitajiki = { level: 50, shards: 0 };
    expect(resolveObject(s, "shitajiki")!.chain).toBe(2 + 1 + 1 + 2 + 2);
    s.objects.katorisenko = { level: 10, shards: 0 };
    const k = resolveObject(s, "katorisenko")!;
    expect(k.poisonSpread).toBe(1);
    expect(k.poison).toBeCloseTo(1.3);
    // 掃除機の吸い込み（遅くする）・ノックバック
    s.objects.soujiki = { level: 15, shards: 0 };
    const v = resolveObject(s, "soujiki")!;
    expect(v.slow).toBeCloseTo(0.7);
    expect(v.knockback).toBe(0.5);
    // 壁は体力
    s.objects.danboru.level = 10;
    expect(resolveObject(s, "danboru")!.maxHp).toBeGreaterThan(40 * Math.pow(1.22, 9) * 2.9);
    // 特殊効果で群れへの DPS が上がる
    s.objects.wagomu.level = 5;
    const d5 = objectDps(resolveObject(s, "wagomu")!) / resolveObject(s, "wagomu")!.atk;
    s.objects.wagomu.level = 6;
    const d6 = objectDps(resolveObject(s, "wagomu")!) / resolveObject(s, "wagomu")!.atk;
    expect(d6).toBeGreaterThan(d5 * 1.5);
  });
  test("装備の特殊効果の補正", () => {
    const rng = mulberry32(11);
    // 低いレアリティにはつかない
    for (let i = 0; i < 300; i++) {
      const a = rollAffix(rng, 1);
      expect(["objMultishot", "objPierce", "objChain"]).not.toContain(a.id);
    }
    for (const a of AFFIXES.filter((x) => x.flat)) expect(a.minRarity).toBeGreaterThanOrEqual(3);
    expect(affixText({ id: "objChain", value: 2 })).toBe("連鎖 +2（でんき）");
    const s = newSave();
    s.objects.shitajiki = { level: 1, shards: 0 };
    s.equips.push({ uid: "x", defId: "suzu", slot: "neck", rarity: 4, affixes: [
      { id: "objChain", value: 2 }, { id: "objMultishot", value: 1 }, { id: "objCrit", value: 0.1 },
    ] });
    s.equipped.neck = "x";
    expect(equipBonus(s).objChain).toBe(2);
    expect(resolveObject(s, "shitajiki")!.chain).toBe(4);
    const w = resolveObject(s, "wagomu")!;
    expect(w.multishot).toBe(1);
    expect(w.spread).toBeGreaterThan(0);
    expect(w.crit).toBeCloseTo(0.1);
    expect(resolveObject(s, "danboru")!.crit).toBe(0); // 攻撃しないものには会心はつかない
  });
  test("持っていくのは最大5つ", () => {
    const s = newSave();
    for (const o of OBJECTS) s.objects[o.id] = { level: 1, shards: 0 };
    s.loadout = [];
    for (const o of OBJECTS) toggleLoadout(s, o.id);
    expect(s.loadout.length).toBe(MAX_LOADOUT);
  });
});

describe("装備", () => {
  test("合成でレアリティ+1・補正の数", () => {
    const rng = mulberry32(1);
    const s = newSave();
    const a = addEquip(s, rng, 0, "neck");
    const b = addEquip(s, rng, 0, "neck");
    const c = addEquip(s, rng, 0, "neck");
    const d = addEquip(s, rng, 0, "head");
    expect(a.affixes.length).toBe(1);
    equip(s, a.uid);
    expect(fuseEquips(s, [a.uid, b.uid, d.uid], rng).ok).toBe(false); // 枠がちがう
    expect(fuseEquips(s, [a.uid, a.uid, b.uid], rng).ok).toBe(false);
    const r = fuseEquips(s, [a.uid, b.uid, c.uid], rng);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.rarity).toBe(1);
    expect(r.value.slot).toBe("neck");
    expect(r.value.affixes.length).toBe(2);
    expect(s.equips.length).toBe(2);
    expect(s.equipped.neck).toBe(r.value.uid); // つけていたので引きつぐ
    expect(affixCount(4)).toBe(5);
    const ur = addEquip(s, rng, 4, "body");
    expect(ur.affixes.length).toBe(5);
    expect(new Set(ur.affixes.map((x) => x.id)).size).toBe(5);
    const hp0 = resolveCat(s).maxHp;
    equip(s, ur.uid);
    expect(resolveCat(s).maxHp).toBeGreaterThan(hp0 * 5);
    unequip(s, "body");
    expect(resolveCat(s).maxHp).toBeCloseTo(hp0);
    expect(sellEquip(s, r.value.uid).ok).toBe(false); // つけている
    expect(sellEquip(s, d.uid).ok).toBe(true);
  });
  test("同じたねなら同じ結果", () => {
    const s1 = newSave(), s2 = newSave();
    const x = addEquip(s1, mulberry32(7), 2);
    const y = addEquip(s2, mulberry32(7), 2);
    expect(x).toEqual(y);
  });
});

describe("レリック", () => {
  test("順番に解放", () => {
    const s = newSave();
    expect(unlockRelic(s, RELICS[0].id).ok).toBe(false);
    s.relicPoints = 100;
    expect(canUnlockRelic(s, RELICS[1].id).ok).toBe(false); // 前が必要
    const atk = resolveCat(s).atk;
    expect(unlockRelic(s, RELICS[0].id).ok).toBe(true);
    expect(s.relicPoints).toBe(100 - RELICS[0].cost);
    expect(resolveCat(s).atk).toBeCloseTo(atk * RELICS[0].value);
    expect(unlockRelic(s, RELICS[0].id).ok).toBe(false);
    expect(unlockRelic(s, RELICS[1].id).ok).toBe(true);
    expect(relicBonus(s).startKibble).toBe(RELICS[1].value);
    for (let i = 1; i < RELICS.length; i++) expect(RELICS[i].cost).toBeGreaterThanOrEqual(RELICS[i - 1].cost);
  });
});

describe("戦闘の準備・報酬", () => {
  test("はじめのデータで 1-1 がかんたん", () => {
    const s = newSave();
    const lo = buildLoadout(s, "1-1")!;
    expect(lo.char.atk).toBeGreaterThanOrEqual(1);
    expect(lo.char.atk).toBeLessThanOrEqual(3);
    expect(lo.char.companion).toBe(false);
    expect(lo.companions).toEqual([]);
    expect(lo.objects.length).toBe(3);
    expect(lo.objects.find((o) => o.id === "danboru")!.block).toBe(true);
    expect(lo.stage.hpMul).toBe(1);
    expect(lo.bugs.ari.hp).toBe(2);
    expect(lo.global.mamaHp).toBeGreaterThan(0);
    for (const o of lo.objects) {
      expect(o.cost).toBeGreaterThan(0);
      expect(o.interval).toBeGreaterThan(0);
      expect(Number.isFinite(o.atk)).toBe(true);
    }
    const { totalHp, duration } = stageLoad(lo.stage);
    expect(totalHp).toBeLessThan(80);
    expect(lo.stage.startKibble).toBe(60);
    expect(lo.stage.kibblePerSec).toBe(0);
    expect(estimateDps(lo).total * duration).toBeGreaterThan(totalHp * 2);
    expect(buildLoadout(s, "11-1")).toBeNull();
  });
  test("相棒も戦闘に出る（強さ 0.45）・戦力の目安にも入る", () => {
    const s = newSave();
    const p0 = powerRatio(s, "1-1");
    const a = addCat(s, "あ"), b = addCat(s, "い");
    learnWaza(s, "choichoi");
    equipWaza(s, b, "main", "choichoi");
    setParty(s, 1, a);
    setParty(s, 2, b);
    const lo = buildLoadout(s, "1-1")!;
    expect(lo.char.id).toBe("c1");
    expect(lo.companions.map((c) => c.id)).toEqual([a, b]);
    expect(lo.companions.every((c) => c.companion)).toBe(true);
    expect(lo.companions[0].look).toBe("kuro");
    expect(lo.companions[1].role).toBe("ranged");
    expect(lo.companions[0].atk).toBeCloseTo(resolveCat(s, a).atk * COMPANION_POWER);
    const d = estimateDps(lo);
    expect(d.companions).toBeGreaterThan(0);
    expect(d.total).toBeCloseTo(d.char + d.companions + d.objects);
    expect(powerRatio(s, "1-1")).toBeGreaterThan(p0);
  });
  test("ステージの解放", () => {
    const s = newSave();
    const ids = stageIdList();
    expect(ids[0]).toBe("1-1");
    expect(ids[99]).toBe("10-10");
    expect(isStageUnlocked(s, "1-1")).toBe(true);
    expect(isStageUnlocked(s, "1-2")).toBe(false);
    grantRewards(s, "1-1", mulberry32(3));
    expect(isStageUnlocked(s, "1-2")).toBe(true);
  });
  test("報酬がはいる・オブジェクトがふえる", () => {
    const rng = mulberry32(5);
    const s = newSave();
    const r = grantRewards(s, "1-1", rng);
    expect(r.firstClear).toBe(true);
    expect(s.coins).toBe(r.coins);
    expect(s.relicPoints).toBe(r.relicPoints);
    expect(r.relicPoints).toBeGreaterThan(0);
    expect(s.equips.length).toBe(r.equips.length);
    expect(r.shards.length).toBeGreaterThan(0);
    expect(r.levelUps.c1).toBeGreaterThan(0);
    const again = grantRewards(s, "1-1", rng);
    expect(again.firstClear).toBe(false);
    expect(again.relicPoints).toBe(0);
    for (const id of ["1-2", "1-3"]) grantRewards(s, id, rng);
    expect(Object.keys(s.cats)).toEqual(["c1"]); // 近所の猫は自分でお迎えする
    expect(s.objects.mizudeppo).toBeDefined();
    expect(s.cleared).toBe(2);
  });
});

describe("インフレの曲線", () => {
  test("ずっとクリアしつづけるプレイヤー: 難関で止まって育て、最後まで進める", () => {
    const { rows, save, st } = simulate(100);
    const pick = ["1-1", "1-4", "1-5", "1-6", "1-10", "2-1", "2-5", "3-5", "3-10", "5-5", "5-10", "7-5", "8-10", "10-1", "10-5", "10-10"];
    for (const r of rows.filter((x) => pick.includes(x.stage))) {
      console.log(
        `${r.stage.padEnd(5)} 余裕 ${r.ratio.toFixed(2).padStart(6)}  回し ${String(r.grinds).padStart(2)}  Lv ${String(r.level).padStart(3)}` +
        `  ${r.char.padEnd(20)} スキルLv ${String(r.skillLv).padStart(3)} 複合 ${r.combos}  猫 ${String(r.owned).padStart(2)}匹 わざ ${r.wazas}` +
        `  猫 ${fmt(r.charDps).padStart(6)}  相棒 ${fmt(r.compDps).padStart(6)}  物 ${fmt(r.objDps).padStart(6)}  アリHP ${fmt(r.bugHp).padStart(6)}`,
      );
    }
    const isWall = (g: number) => g % 10 === 4 || g % 10 === 9;
    const totalGrinds = rows.reduce((s, r) => s + r.grinds, 0);
    const wallRows = rows.filter((_, g) => isWall(g));
    const normalRows = rows.filter((_, g) => !isWall(g));
    console.log("回した合計", totalGrinds, "（戦闘は合計", totalGrinds + 100, "回）", "難関で止まった", wallRows.filter((r) => r.grinds > 0).length, "/ 20",
      "レリック", save.relics.length,
      `ちゅ〜る: もらった ${Math.round(st.churuEarned)} スキル ${Math.round(st.churuOnSkills)} 福袋 ${Math.round(st.churuOnPulls)}（${st.pulls}回）`);
    // 最初はかんたん
    expect(rows[0].ratio).toBeGreaterThan(2);
    // 最後まで進める。ただし難関で止まって、前のステージを回して育てる（作業だけで進めない）
    expect(save.cleared).toBe(99);
    expect(totalGrinds).toBeGreaterThan(80);
    expect(totalGrinds).toBeLessThan(320);
    expect(Math.max(...rows.map((r) => r.grinds))).toBeLessThan(SIM_MAX_GRIND);
    expect(wallRows.filter((r) => r.grinds > 0).length).toBeGreaterThanOrEqual(14);
    // 1-5 と 1-10 では、かならず止まる
    expect(rows[4].grinds).toBeGreaterThan(0);
    expect(rows[9].grinds).toBeGreaterThan(0);
    // ふつうのステージは、ほとんど止まらない
    expect(normalRows.reduce((s, r) => s + r.grinds, 0)).toBeLessThan(totalGrinds * 0.25);
    // のこぎりの歯: 難関に来たときの余裕は、ふつうのステージよりずっと小さい
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(med(wallRows.map((r) => r.ratio)) * 3).toBeLessThan(med(normalRows.map((r) => r.ratio)));
    for (const r of rows.slice(10)) {
      expect(r.ratio).toBeGreaterThan(0.05);
      expect(r.ratio).toBeLessThan(300); // 難関で育てたあとの章の頭は、とても楽になることがある
    }
    // オブジェクトの特殊効果も解放されていく（後半は持っていく5つで合わせて20以上）
    expect(rows[0].perks).toBe(0);
    expect(rows[99].perks).toBeGreaterThanOrEqual(20);
    // 虫は次々にたくさん
    expect(rows[99].bugs).toBeGreaterThan(rows[0].bugs * 8);
    // 数字はちゃんとインフレしている
    expect(rows[99].bugHp).toBeGreaterThan(1e15);
    // 2章からは、オブジェクトが主役のダメージ源（猫と相棒の合計の数倍）
    for (const r of rows.slice(10)) expect(r.objDps).toBeGreaterThan((r.charDps + r.compDps) * 3);
    // 相棒もはたらく
    expect(rows[99].party).toBe(3);
    expect(rows[99].compDps).toBeGreaterThan(0);
    // ちゅ〜るはスキルにも福袋にも使える
    expect(st.churuOnSkills).toBeGreaterThan(st.churuEarned * 0.4);
    expect(st.pulls).toBeGreaterThanOrEqual(100);
    expect(rows[99].wazas).toBeGreaterThan(20);
    // スキルは深いところまで・複合効果も取れる
    expect(rows[99].skillLv).toBeGreaterThan(200);
    expect(rows[99].combos).toBeGreaterThanOrEqual(3);
    // 猫は登録した3匹だけ（譲渡会はない）。1 章のうちに3匹のパーティになる
    expect(rows[99].owned).toBe(3);
    expect(rows[9].party).toBe(3);
    // 最初の10回（10回まとめて）は 2 章のうちにできる
    expect(rows.findIndex((r) => r.wazas > 2)).toBeLessThan(20);
  });
  test("福袋を引かなくても（スキルだけでも）最後まで進める", () => {
    const { rows, save, st } = simulate(100, SIM_NEED, SIM_MAX_GRIND, 42, 0);
    expect(st.pulls).toBe(0);
    expect(save.cleared).toBe(99);
    expect(rows.reduce((s, r) => s + r.grinds, 0)).toBeLessThan(400);
  });
});
