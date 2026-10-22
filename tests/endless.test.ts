// エンドレス・オブジェクトをどける のテスト。
import { describe, expect, test } from "vitest";
import { Battle, REMOVE_COST_GROWTH } from "../src/battle/engine";
import { buildEndlessLoadout, endlessStart, recordEndless } from "../src/core/progress";
import { newSave } from "../src/core/save";
import { ENDLESS_HP_GROWTH, ENDLESS_WAVES, makeEndlessStage } from "../src/data/stages";

describe("エンドレス", () => {
  test("波ごとに強くなる・10波ごとにぬし・記録の少し手前から始まる", () => {
    const st = makeEndlessStage(0);
    expect(st.endless).toBe(true);
    expect(st.waves.length).toBe(ENDLESS_WAVES);
    expect(st.waves[5].hpMul! / st.waves[4].hpMul!).toBeCloseTo(ENDLESS_HP_GROWTH);
    expect(st.waves[9].bugs.some((b) => /suzumebachi|mukade/.test(b.bug))).toBe(true);
    const s = newSave();
    expect(endlessStart(s)).toBe(0);
    s.endlessBest = 37;
    expect(endlessStart(s)).toBe(20);
    expect(buildEndlessLoadout(s).stage.waves[0].hpMul).toBeCloseTo(Math.pow(ENDLESS_HP_GROWTH, 20));
  });
  test("記録とごほうび", () => {
    const s = newSave();
    const c0 = s.churu;
    const r = recordEndless(s, 0, 12);
    expect(r).toMatchObject({ reached: 12, best: 12, newBest: true, churu: 12 });
    expect(s.churu).toBe(c0 + 12);
    expect(recordEndless(s, 0, 5).newBest).toBe(false);
    expect(s.endlessBest).toBe(12);
  });
});

describe("オブジェクトをどける", () => {
  test("どけるたびに高くなる・カリカリは戻らない・道がもどる", () => {
    const lo = buildEndlessLoadout(newSave());
    const b = new Battle(lo, 1);
    let placed = false;
    for (let r = 4; r < 14 && !placed; r++) for (let c = 0; c < 13 && !placed; c++) placed = b.place(1, c, r).ok;
    expect(placed).toBe(true);
    const o = b.objects[b.objects.length - 1];
    const c1 = b.removeCost(o);
    const k0 = b.kibble;
    expect(b.remove(o).ok).toBe(true);
    expect(b.kibble).toBe(k0 - c1);
    expect(b.objects.filter((x) => x.hp > 0).length).toBe(0);
    for (let r = 4; r < 14; r++) for (let c = 0; c < 13; c++) if (b.place(1, c, r).ok) { r = 99; break; }
    const o2 = b.objects.filter((x) => x.hp > 0)[0];
    expect(b.removeCost(o2)).toBe(Math.ceil(c1 * REMOVE_COST_GROWTH));
  });
});
