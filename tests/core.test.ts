import { describe, expect, test } from "vitest";
import { fmt } from "../src/core/num";
import { mulberry32 } from "../src/core/rng";
import {
  newSave, loadSave, writeSave, migrate, importSave, exportSave, MAX_LOADOUT, SAVE_VERSION, START_CHURU,
} from "../src/core/save";
import {
  addExp, expToNext, canLearn, learnSkill, levelUpObject, objectUpgradeCost, addEquip, fuseEquips,
  equip, unequip, unlockRelic, canUnlockRelic, buildLoadout, resolveChar, resolveObjects, grantRewards, stageIdList,
  stageById, isStageUnlocked, estimateDps, stageLoad, toggleLoadout, sellEquip, relicBonus, churuForLevel,
  nodeLevel, nextNodeCost, resetSkills, skillSpent, skillTreeOf, isNodeOpen, bondMul, FIRST_CLEAR_CHURU_MUL,
  objectPerks, resolveObject, objectDps, equipBonus,
} from "../src/core/progress";
import {
  BOND_REFUND, GACHA_RATES, PITY_PULLS, PULL10_COST, PULL_COST, pull, rollRarity, welcomeChar, pullRates,
} from "../src/core/gacha";
import { CHARS, CHAR_MAP, CHAR_RARITIES, MAX_BOND, STARTER_CHARS } from "../src/data/chars";
import { SKILL_BRANCHES, SKILL_MAP, SKILL_TREES, TIER_MIN_LEVEL, nodeCost } from "../src/data/skills";
import { OBJECTS, OBJECT_MAP, PERK_LEVELS } from "../src/data/objects";
import { BUGS, BUG_MAP } from "../src/data/bugs";
import { AFFIXES, EQUIPS, affixCount, affixText, rollAffix } from "../src/data/equips";
import { RELICS } from "../src/data/relics";
import {
  FURNITURE_SIZES, MAMA_COL, MAMA_H, MAMA_ROW, MAMA_W, OBSTACLE_ROW_MAX, OBSTACLE_ROW_MIN, STAGES, boardConnected,
  obstacleCells, stageBlocked,
} from "../src/data/stages";
import { COLS, ROWS } from "../src/core/types";
import { simulate } from "./sim";

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
    expect(CHARS.length).toBeGreaterThanOrEqual(20);
    expect(STARTER_CHARS).toEqual(["chatora", "mike"]);
    expect(OBJECTS.length).toBeGreaterThanOrEqual(10);
    expect(BUGS.length).toBeGreaterThanOrEqual(8);
    expect(STAGES.length).toBe(100);
    expect(RELICS.length).toBeGreaterThanOrEqual(20);
    for (const list of [CHARS, OBJECTS, BUGS, EQUIPS, RELICS, STAGES]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const [role, tree] of Object.entries(SKILL_TREES)) {
      expect(tree.length).toBeGreaterThanOrEqual(45);
      expect(tree.length).toBeLessThanOrEqual(60);
      const ids = new Set(tree.map((n) => n.id));
      expect(ids.size).toBe(tree.length);
      const pos = new Set(tree.map((n) => `${n.pos.x},${n.pos.y}`));
      expect(pos.size).toBe(tree.length); // 画面で重ならない
      for (const b of SKILL_BRANCHES) expect(tree.some((n) => n.branch === b)).toBe(true);
      for (const n of tree) {
        expect(n.role).toBe(role);
        expect(n.minCharLevel).toBe(TIER_MIN_LEVEL[n.tier]);
        for (const r of n.req) {
          expect(ids.has(r.id)).toBe(true);
          expect(r.lv).toBeLessThanOrEqual(SKILL_MAP[r.id].maxLevel);
          expect(SKILL_MAP[r.id].tier).toBeLessThanOrEqual(n.tier); // 前提は浅い段
        }
      }
      expect(tree.filter((n) => n.req.length === 0).length).toBe(1); // 根もとは1つ
      expect(tree.some((n) => n.minRarity)).toBe(true);
      expect(Math.max(...tree.map((n) => n.tier))).toBe(TIER_MIN_LEVEL.length - 1);
    }
    // 遠距離だけ「つらぬく」がある
    expect(SKILL_TREES.ranged.some((n) => n.effects.some((e) => e.stat === "pierce"))).toBe(true);
    expect(SKILL_TREES.melee.some((n) => n.effects.some((e) => e.stat === "pierce"))).toBe(false);
  });
  test("猫: レアリティと役割がそろっている", () => {
    for (const r of CHAR_RARITIES) expect(CHARS.some((c) => c.rarity === r)).toBe(true);
    for (const role of ["melee", "ranged", "aoe", "fast"] as const) {
      expect(CHARS.filter((c) => c.role === role).length).toBeGreaterThanOrEqual(3);
      expect(CHARS.some((c) => c.role === role && c.rarity === "N")).toBe(true);
    }
    expect(CHAR_MAP.chatora.role).toBe("melee");
    expect(CHAR_MAP.mike.role).toBe("ranged");
    // SR 以上はみんな、なにかしらの特技を持っている
    for (const c of CHARS.filter((x) => x.rarity !== "N")) {
      const b = c.base;
      const special = b.crit + b.multiHit + b.lifesteal + b.regen + b.knockback + b.poison + (1 - b.slowHit) + b.pierce +
        b.kibbleBonus + b.objectAura + b.repair + (b.reviveHp - 0.5) + b.dodge + (1 - b.armor);
      expect(special).toBeGreaterThan(0);
      expect(c.passive.name.length).toBeGreaterThan(0);
    }
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
  test("虫: 飛ぶ虫はいない・ゆっくり", () => {
    for (const b of BUGS) {
      expect(b.fly).toBeFalsy();
      expect(b.speed).toBeGreaterThanOrEqual(0.2);
      expect(b.speed).toBeLessThanOrEqual(0.55);
    }
    expect(BUG_MAP.kamemushi.speed).toBe(0.35);
    expect(BUG_MAP.gokiburi.speed).toBe(Math.max(...BUGS.map((b) => b.speed)));
    expect(BUG_MAP.imomushi.speed).toBe(Math.min(...BUGS.map((b) => b.speed)));
    for (const b of BUGS.filter((x) => x.boss)) expect(b.speed).toBeLessThanOrEqual(0.3);
  });
  test("ステージの家具: 大きさ・場所・道がつながる", () => {
    expect([COLS, ROWS]).toEqual([14, 18]);
    expect([MAMA_COL, MAMA_ROW, MAMA_W, MAMA_H]).toEqual([6, 16, 2, 2]);
    for (const s of STAGES) {
      const obs = s.obstacles ?? [];
      expect(obs.length).toBeGreaterThanOrEqual(4);
      const used = new Set<number>();
      for (const o of obs) {
        const w = o.w ?? 1, h = o.h ?? 1;
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
    }
    expect(STAGES.some((s) => s.obstacles!.some((o) => (o.w ?? 1) * (o.h ?? 1) >= 3))).toBe(true);
  });
  test("ステージの虫: 次々にたくさん・いくつもの所から", () => {
    const counts = STAGES.map((s) => stageLoad(s).count);
    expect(counts[0]).toBeGreaterThanOrEqual(20);
    expect(counts[99]).toBeGreaterThanOrEqual(300);
    expect(Math.min(...counts.slice(50))).toBeGreaterThanOrEqual(150);
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
    // 体力はステージごとに約1.3倍
    for (let g = 1; g < 100; g++) expect(STAGES[g].hpMul / STAGES[g - 1].hpMul).toBeCloseTo(1.3);
  });
  test("ステージの虫はすべて定義ずみ・10番目はボス", () => {
    const bugIds = new Set(BUGS.map((b) => b.id));
    for (const s of STAGES) {
      for (const w of s.waves) for (const g of w.bugs) expect(bugIds.has(g.bug)).toBe(true);
      const hasBoss = s.waves.some((w) => w.bugs.some((g) => BUGS.find((b) => b.id === g.bug)?.boss));
      expect(hasBoss).toBe(s.index === 10);
    }
    expect(stageById("1-1")!.hpMul).toBe(1);
    expect(stageById("1-2")!.hpMul).toBeCloseTo(1.3);
  });
});

describe("セーブ", () => {
  test("localStorage がなくても動く", () => {
    const s = loadSave();
    expect(s.cleared).toBe(-1);
    expect(writeSave(s)).toBe(false);
  });
  test("はじめのデータ", () => {
    const s = newSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(Object.keys(s.chars).sort()).toEqual(["chatora", "mike"]);
    expect(s.churu).toBe(START_CHURU);
    expect(s.churu).toBeGreaterThanOrEqual(PULL_COST); // すぐに1回ためせる
    expect(s.gachaPity).toBe(0);
    expect(s.chars.chatora).toEqual({ level: 1, exp: 0, skills: {}, bond: 0 });
  });
  test("v1 のデータを読みかえる", () => {
    const old = {
      version: 1, coins: 50, relicPoints: 3, selectedChar: "kuro",
      chars: {
        chatora: { level: 7, exp: 2, skills: ["melee_atk1", "melee_hp2", "melee_special", "nazo"] },
        kuro: { level: 3, exp: 0, skills: ["fast_atk1"] },
        nazo_neko: { level: 9, exp: 0, skills: [] },
      },
    };
    const s = migrate(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.coins).toBe(50);
    expect(s.churu).toBe(START_CHURU); // スキルのぶんは戻さない
    expect(s.chars.chatora.level).toBe(7);
    expect(s.chars.chatora.skills).toEqual({ "melee.atk1": 1, "melee.armor1": 1, "melee.kb1": 1 });
    expect(s.chars.chatora.bond).toBe(0);
    expect(s.chars.kuro.skills).toEqual({ "fast.atk1": 1 });
    expect(s.chars.mike).toBeDefined(); // はじめの2匹はかならず
    expect(s.chars.nazo_neko).toBeUndefined();
    expect(s.selectedChar).toBe("kuro");
    // v2 の形はそのまま（最大レベルをこえた分はけずる）
    const t = migrate({ version: 2, churu: 77, chars: { chatora: { level: 2, exp: 0, skills: { "melee.atk1": 99 }, bond: 9 } } });
    expect(t.churu).toBe(77);
    expect(t.chars.chatora.skills["melee.atk1"]).toBe(10);
    expect(t.chars.chatora.bond).toBe(MAX_BOND);
  });
  test("migrate で足りない項目がうまる・往復できる", () => {
    const s = migrate({ coins: 5, chars: {} });
    expect(s.coins).toBe(5);
    expect(Object.keys(s.chars).length).toBe(2);
    expect(s.loadout.length).toBeGreaterThan(0);
    const t = newSave();
    t.coins = 123;
    expect(importSave(exportSave(t))!.coins).toBe(123);
    expect(importSave("こわれた")).toBeNull();
  });
});

describe("猫のレベル・ちゅ〜る", () => {
  test("経験値でレベルアップ・ちゅ〜るがもらえる", () => {
    const s = newSave();
    const id = s.selectedChar;
    const c0 = s.churu;
    expect(addExp(s, id, expToNext(1) - 1)).toBe(0);
    expect(s.churu).toBe(c0);
    expect(addExp(s, id, 1)).toBe(1);
    expect(s.chars[id].level).toBe(2);
    expect(s.chars[id].exp).toBe(0);
    expect(s.churu).toBe(c0 + churuForLevel(2));
    const ups = addExp(s, id, expToNext(2) + expToNext(3) + 1);
    expect(ups).toBe(2);
    expect(s.chars[id].level).toBe(4);
    expect(expToNext(20)).toBeGreaterThan(expToNext(10) * 4);
    expect(addExp(s, "kuro", 100)).toBe(0); // まだお迎えしていない
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
});

describe("スキルツリー", () => {
  test("前提・ちゅ〜る・レベル", () => {
    const s = newSave();
    const id = s.selectedChar; // melee
    expect(skillTreeOf(id)).toBe(SKILL_TREES.melee);
    s.churu = 0;
    const r0 = canLearn(s, id, "melee.root");
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.reason).toContain("ちゅ〜る");
    s.churu = 10000;
    const r1 = canLearn(s, id, "melee.atk1");
    expect(r1.ok).toBe(false); // 根もとがまだ
    if (!r1.ok) expect(r1.reason).toContain("はじめの一歩");
    expect(learnSkill(s, id, "melee.root").ok).toBe(true);
    expect(learnSkill(s, id, "melee.root").ok).toBe(false); // 最大レベル
    expect(learnSkill(s, id, "ranged.atk1").ok).toBe(false); // ほかの役割
    const before = resolveChar(s).atk;
    for (let i = 0; i < 3; i++) expect(learnSkill(s, id, "melee.atk1").ok).toBe(true);
    expect(nodeLevel(s, id, "melee.atk1")).toBe(3);
    expect(resolveChar(s).atk).toBeCloseTo(before / 1.05 * (1 + 0.05 + 0.3));
    // 段1は猫のレベル 3 から
    const r2 = canLearn(s, id, "melee.crit1");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toContain("レベル");
    addExp(s, id, 200);
    expect(s.chars[id].level).toBeGreaterThanOrEqual(3);
    expect(learnSkill(s, id, "melee.crit1").ok).toBe(true);
    expect(resolveChar(s).crit).toBeCloseTo(0.02);
  });
  test("コストは段とレベルで増える", () => {
    const t = SKILL_TREES.melee;
    const atk1 = t.find((n) => n.id === "melee.atk1")!;
    const atk4 = t.find((n) => n.id === "melee.atk4")!;
    for (let lv = 1; lv < atk1.maxLevel; lv++) expect(nodeCost(atk1, lv)).toBeGreaterThan(nodeCost(atk1, lv - 1));
    expect(nodeCost(atk4, 0)).toBeGreaterThan(nodeCost(atk1, 0) * 20);
    const s = newSave();
    expect(nextNodeCost(s, "chatora", "melee.atk1")).toBe(nodeCost(atk1, 0));
  });
  test("レアリティで取れないノード", () => {
    const s = newSave();
    s.chars.chatora.level = 999;
    const node = SKILL_TREES.melee.find((n) => n.minRarity === "SR")!;
    // 前提をぜんぶ満たしておく
    for (const n of SKILL_TREES.melee) s.chars.chatora.skills[n.id] = n.maxLevel;
    delete s.chars.chatora.skills[node.id];
    const r = isNodeOpen(s, "chatora", node.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("SR");
    s.chars.leo = { level: 999, exp: 0, skills: { ...s.chars.chatora.skills }, bond: 0 }; // leo は SR の melee
    expect(isNodeOpen(s, "leo", node.id).ok).toBe(true);
  });
  test("忘れると全部もどる", () => {
    const s = newSave();
    s.churu = 500;
    learnSkill(s, "chatora", "melee.root");
    learnSkill(s, "chatora", "melee.atk1");
    learnSkill(s, "chatora", "melee.atk1");
    learnSkill(s, "chatora", "melee.hp1");
    const spent = skillSpent(s, "chatora");
    expect(s.churu).toBe(500 - spent);
    expect(resetSkills(s, "chatora")).toBe(spent);
    expect(s.churu).toBe(500);
    expect(s.chars.chatora.skills).toEqual({});
  });
  test("特殊技能もすべて計算される", () => {
    const s = newSave();
    const c = resolveChar(s);
    for (const v of Object.values(c)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    expect(c.reviveHp).toBe(0.5);
    expect(c.critMul).toBe(1.5);
    expect(c.slowHit).toBe(1);
    expect(c.pierce).toBe(0);
    // ぜんぶ取ると上限の中におさまる
    s.chars.kotetsu = { level: 999, exp: 0, skills: {}, bond: 5 };
    for (const n of SKILL_TREES.melee) s.chars.kotetsu.skills[n.id] = n.maxLevel;
    const k = resolveChar(s, "kotetsu");
    expect(k.crit).toBeGreaterThan(0.2);
    expect(k.crit).toBeLessThanOrEqual(1);
    expect(k.multiHit).toBeGreaterThanOrEqual(1);
    expect(k.dodge).toBeLessThanOrEqual(0.6);
    expect(k.armor).toBeGreaterThanOrEqual(0.3);
    expect(k.reviveHp).toBe(1);
    expect(k.atkInterval).toBeGreaterThanOrEqual(0.15);
    expect(k.restTime).toBeGreaterThanOrEqual(1);
    expect(k.pierce).toBe(0);
    s.chars.hime = { level: 1, exp: 0, skills: {}, bond: 0 };
    expect(resolveChar(s, "hime").pierce).toBe(2);
  });
});

describe("譲渡会会場", () => {
  test("レアリティの出やすさ（たねつき）", () => {
    const rng = mulberry32(123);
    const n = 100000;
    const cnt: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = rollRarity(rng);
      cnt[r] = (cnt[r] ?? 0) + 1;
    }
    const total = Object.values(GACHA_RATES).reduce((a, b) => a + b, 0);
    for (const r of CHAR_RARITIES) {
      const expect_ = GACHA_RATES[r] / total;
      expect(Math.abs(cnt[r] / n - expect_)).toBeLessThan(Math.max(0.005, expect_ * 0.08));
    }
    expect(pullRates().reduce((s, x) => s + x.rate, 0)).toBeCloseTo(1);
    expect(GACHA_RATES).toEqual({ N: 50, R: 30, SR: 14, SSR: 5, UR: 1 });
  });
  test("1回・10回でちゅ〜るを使う", () => {
    const s = newSave();
    const rng = mulberry32(9);
    s.churu = PULL_COST - 1;
    const no = pull(s, rng, 1);
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.reason).toContain("ちゅ〜る");
    s.churu = PULL_COST + PULL10_COST;
    const one = pull(s, rng, 1);
    expect(one.ok && one.value.length).toBe(1);
    const ten = pull(s, rng, 10);
    expect(ten.ok && ten.value.length).toBe(10);
    expect(s.totalPulls).toBe(11);
    // おみやげ（返ってきたちゅ〜る）だけが残る
    const refunds = [...(one.ok ? one.value : []), ...(ten.ok ? ten.value : [])].reduce((a, r) => a + r.refund, 0);
    expect(s.churu).toBe(refunds);
  });
  test("10回まとめては SR 以上がかならず1匹", () => {
    // いつも N が出る乱数でも、最後が SR 以上になる
    const s = newSave();
    s.churu = PULL10_COST;
    const r = pull(s, () => 0.01, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slice(0, 9).every((x) => x.rarity === "N")).toBe(true);
    expect(["SR", "SSR", "UR"]).toContain(r.value[9].rarity);
    expect(r.value[9].guaranteed).toBe(true);
    // たねつきで何回やっても
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
    const r = pull(s, allN, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(["SSR", "UR"]).toContain(r.value[0].rarity);
    expect(r.value[0].pity).toBe(true);
    expect(s.gachaPity).toBe(0);
    // SSR が出たら数えなおし
    const t = newSave();
    t.churu = 1e6;
    t.gachaPity = 30;
    pull(t, () => 0.999, 1); // UR
    expect(t.gachaPity).toBe(0);
    // たねつきで長く回しても、SSR 以上のない区間は 50 回をこえない
    const u = newSave();
    u.churu = 1e9;
    const rng = mulberry32(5);
    let gap = 0, maxGap = 0;
    for (let i = 0; i < 3000; i++) {
      const x = pull(u, rng, 1);
      if (!x.ok) break;
      gap = ["SSR", "UR"].includes(x.value[0].rarity) ? 0 : gap + 1;
      maxGap = Math.max(maxGap, gap);
    }
    expect(maxGap).toBeLessThan(PITY_PULLS);
  });
  test("同じ猫が来ると、なかよし度が上がる", () => {
    const s = newSave();
    const first = welcomeChar(s, "leo");
    expect(first).toMatchObject({ charId: "leo", rarity: "SR", isNew: true, bond: 0, bondUp: false, refund: 0 });
    const atk0 = resolveChar(s, "leo").atk;
    for (let b = 1; b <= MAX_BOND; b++) {
      const r = welcomeChar(s, "leo");
      expect(r).toMatchObject({ isNew: false, bond: b, bondUp: true, refund: 0 });
    }
    expect(resolveChar(s, "leo").atk).toBeCloseTo(atk0 * bondMul(MAX_BOND));
    expect(bondMul(MAX_BOND)).toBeCloseTo(2);
    const c0 = s.churu;
    const over = welcomeChar(s, "leo");
    expect(over).toMatchObject({ isNew: false, bond: MAX_BOND, bondUp: false, refund: BOND_REFUND.SR });
    expect(s.churu).toBe(c0 + BOND_REFUND.SR);
  });
  test("レアリティが高いほど強い（レベル1どうし）", () => {
    const s = newSave();
    for (const c of CHARS) welcomeChar(s, c.id);
    expect(resolveChar(s, "taisho").atk).toBeGreaterThan(resolveChar(s, "chatora").atk * 1.5);
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
    const hp0 = resolveChar(s).maxHp;
    equip(s, ur.uid);
    expect(resolveChar(s).maxHp).toBeGreaterThan(hp0 * 5);
    unequip(s, "body");
    expect(resolveChar(s).maxHp).toBeCloseTo(hp0);
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
    const atk = resolveChar(s).atk;
    expect(unlockRelic(s, RELICS[0].id).ok).toBe(true);
    expect(s.relicPoints).toBe(100 - RELICS[0].cost);
    expect(resolveChar(s).atk).toBeCloseTo(atk * RELICS[0].value);
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
    const again = grantRewards(s, "1-1", rng);
    expect(again.firstClear).toBe(false);
    expect(again.relicPoints).toBe(0);
    for (const id of ["1-2", "1-3"]) grantRewards(s, id, rng);
    expect(s.chars.kuro).toBeUndefined(); // 猫は譲渡会会場でお迎えする
    expect(s.objects.mizudeppo).toBeDefined();
    expect(s.cleared).toBe(2);
  });
});

describe("インフレの曲線", () => {
  test("ずっとクリアしつづけるプレイヤーの戦力が虫に追いつく", () => {
    const { rows, save, st } = simulate(100);
    const pick = ["1-1", "1-5", "1-10", "2-5", "3-5", "5-5", "5-10", "7-5", "10-1", "10-5", "10-10"];
    for (const r of rows.filter((x) => pick.includes(x.stage))) {
      console.log(
        `${r.stage.padEnd(5)} 余裕 ${r.ratio.toFixed(2).padStart(6)}  回し ${String(r.grinds).padStart(2)}  Lv ${String(r.level).padStart(3)}` +
        `  ${r.char.padEnd(14)} スキルLv ${String(r.skillLv).padStart(3)}  猫 ${String(r.owned).padStart(2)}匹` +
        `  猫DPS ${fmt(r.charDps).padStart(6)}  物DPS ${fmt(r.objDps).padStart(6)}  アリHP ${fmt(r.bugHp).padStart(6)}`,
      );
    }
    const totalGrinds = rows.reduce((s, r) => s + r.grinds, 0);
    console.log("回した合計", totalGrinds, "レリック", save.relics.length,
      `ちゅ〜る: もらった ${Math.round(st.churuEarned)} スキル ${Math.round(st.churuOnSkills)} 譲渡会 ${Math.round(st.churuOnPulls)}（${st.pulls}回）`);
    // 最初はかんたん
    expect(rows[0].ratio).toBeGreaterThan(2);
    // 最後まで進める（回しすぎない）
    expect(save.cleared).toBe(99);
    expect(totalGrinds).toBeLessThan(100);
    expect(Math.max(...rows.map((r) => r.grinds))).toBeLessThan(25);
    // 余裕がありすぎない（後半は 20 倍以内）・なさすぎない
    for (const r of rows.slice(10)) {
      expect(r.ratio).toBeGreaterThan(0.3);
      expect(r.ratio).toBeLessThan(20);
    }
    // オブジェクトの特殊効果も解放されていく（後半は持っていく5つで合わせて20以上）
    expect(rows[0].perks).toBe(0);
    expect(rows[99].perks).toBeGreaterThanOrEqual(20);
    // 虫は次々にたくさん
    expect(rows[99].bugs).toBeGreaterThan(rows[0].bugs * 10);
    // 数字はちゃんとインフレしている
    expect(rows[99].charDps).toBeGreaterThan(1e10);
    // オブジェクトも最後まで役に立つ（猫の 5% 以上）
    expect(rows[99].objDps).toBeGreaterThan(rows[99].charDps * 0.05);
    // ちゅ〜るはスキルにも譲渡会にも使える
    expect(st.churuOnSkills).toBeGreaterThan(st.churuEarned * 0.4);
    expect(st.pulls).toBeGreaterThanOrEqual(100);
    expect(Object.keys(save.chars).length).toBeGreaterThan(10);
    // 最初の10回（10回まとめて）は 2 章のうちにできる
    expect(rows.findIndex((r) => r.owned > 2)).toBeLessThan(20);
  });
  test("お迎えしなくても（スキルだけでも）最後まで進める", () => {
    const { rows, save, st } = simulate(100, 1.2, 30, 42, 0);
    expect(st.pulls).toBe(0);
    expect(save.cleared).toBe(99);
    expect(rows.reduce((s, r) => s + r.grinds, 0)).toBeLessThan(100);
  });
});
