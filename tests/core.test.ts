import { describe, expect, test } from "vitest";
import { fmt } from "../src/core/num";
import { mulberry32 } from "../src/core/rng";
import { newSave, loadSave, writeSave, migrate, importSave, exportSave, MAX_LOADOUT } from "../src/core/save";
import {
  addExp, expToNext, skillPoints, canLearn, learnSkill, levelUpObject, objectUpgradeCost, addEquip, fuseEquips,
  equip, unequip, unlockRelic, canUnlockRelic, buildLoadout, resolveChar, resolveObjects, grantRewards, stageIdList,
  stageById, isStageUnlocked, estimateDps, stageLoad, toggleLoadout, sellEquip, relicBonus,
} from "../src/core/progress";
import { CHARS, SKILL_TREES } from "../src/data/chars";
import { OBJECTS } from "../src/data/objects";
import { BUGS } from "../src/data/bugs";
import { EQUIPS, affixCount } from "../src/data/equips";
import { RELICS } from "../src/data/relics";
import { STAGES } from "../src/data/stages";
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
    expect(CHARS.length).toBeGreaterThanOrEqual(8);
    expect(CHARS.filter((c) => c.unlockStage === 0).length).toBe(2);
    expect(OBJECTS.length).toBeGreaterThanOrEqual(10);
    expect(BUGS.length).toBeGreaterThanOrEqual(8);
    expect(STAGES.length).toBe(100);
    expect(RELICS.length).toBeGreaterThanOrEqual(20);
    for (const list of [CHARS, OBJECTS, BUGS, EQUIPS, RELICS, STAGES]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const tree of Object.values(SKILL_TREES)) {
      expect(tree.length).toBeGreaterThanOrEqual(10);
      const ids = new Set(tree.map((n) => n.id));
      for (const n of tree) for (const r of n.req) expect(ids.has(r)).toBe(true);
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
    expect(stageById("1-2")!.hpMul).toBeCloseTo(1.3);
  });
});

describe("セーブ", () => {
  test("localStorage がなくても動く", () => {
    const s = loadSave();
    expect(s.cleared).toBe(-1);
    expect(writeSave(s)).toBe(false);
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

describe("猫のレベル・スキル", () => {
  test("経験値でレベルアップ", () => {
    const s = newSave();
    const id = s.selectedChar;
    expect(addExp(s, id, expToNext(1) - 1)).toBe(0);
    expect(addExp(s, id, 1)).toBe(1);
    expect(s.chars[id].level).toBe(2);
    expect(s.chars[id].exp).toBe(0);
    const ups = addExp(s, id, expToNext(2) + expToNext(3) + 1);
    expect(ups).toBe(2);
    expect(s.chars[id].level).toBe(4);
    expect(expToNext(20)).toBeGreaterThan(expToNext(10) * 4);
    expect(addExp(s, "kuro", 100)).toBe(0); // まだ仲間じゃない
  });
  test("スキルの前提とポイント", () => {
    const s = newSave();
    const id = s.selectedChar; // melee
    expect(skillPoints(s, id)).toBe(1);
    expect(canLearn(s, id, "melee_atk2").ok).toBe(false); // 前提が足りない
    expect(learnSkill(s, id, "melee_atk1").ok).toBe(true);
    expect(skillPoints(s, id)).toBe(0);
    expect(learnSkill(s, id, "melee_atk2").ok).toBe(false); // ポイント不足
    expect(learnSkill(s, id, "ranged_atk1").ok).toBe(false); // ほかの役割
    addExp(s, id, 1e6);
    expect(learnSkill(s, id, "melee_atk2").ok).toBe(true);
    expect(learnSkill(s, id, "melee_atk2").ok).toBe(false); // 2回目
    const before = resolveChar(s).atk;
    learnSkill(s, id, "melee_atk3");
    learnSkill(s, id, "melee_atk4");
    expect(resolveChar(s).atk).toBeGreaterThan(before);
    expect(learnSkill(s, id, "melee_special").ok).toBe(false); // 体力の枝が必要
    for (const n of ["melee_hp1", "melee_hp2", "melee_hp3"]) expect(learnSkill(s, id, n).ok).toBe(true);
    expect(learnSkill(s, id, "melee_special").ok).toBe(true);
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
    expect(lo.stage.hpMul).toBe(1);
    expect(lo.bugs.ari.hp).toBe(5);
    expect(lo.global.mamaHp).toBeGreaterThan(0);
    for (const o of lo.objects) {
      expect(o.cost).toBeGreaterThan(0);
      expect(o.interval).toBeGreaterThan(0);
      expect(Number.isFinite(o.atk)).toBe(true);
    }
    const { totalHp, duration } = stageLoad(lo.stage);
    expect(totalHp).toBeLessThan(60);
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
  test("報酬がはいる・仲間がふえる", () => {
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
    expect(s.chars.kuro).toBeDefined(); // 3ステージ目で仲間に
    expect(s.objects.mizudeppo).toBeDefined();
    expect(s.cleared).toBe(2);
  });
});

describe("インフレの曲線", () => {
  test("ずっとクリアしつづけるプレイヤーの戦力が虫に追いつく", () => {
    const { rows, save } = simulate(100);
    const pick = ["1-1", "1-5", "1-10", "2-5", "3-5", "5-5", "5-10", "7-5", "10-1", "10-5", "10-10"];
    for (const r of rows.filter((x) => pick.includes(x.stage))) {
      console.log(
        `${r.stage.padEnd(5)} 余裕 ${r.ratio.toFixed(2).padStart(6)}  回し ${String(r.grinds).padStart(2)}  Lv ${String(r.level).padStart(3)}` +
        `  猫DPS ${fmt(r.charDps).padStart(6)}  物DPS ${fmt(r.objDps).padStart(6)}  アリHP ${fmt(r.bugHp).padStart(6)}`,
      );
    }
    const totalGrinds = rows.reduce((s, r) => s + r.grinds, 0);
    console.log("回した合計", totalGrinds, "レリック", save.relics.length);
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
    // 数字はちゃんとインフレしている
    expect(rows[99].charDps).toBeGreaterThan(1e10);
    // オブジェクトも最後まで役に立つ（猫の 5% 以上）
    expect(rows[99].objDps).toBeGreaterThan(rows[99].charDps * 0.05);
  });
});
