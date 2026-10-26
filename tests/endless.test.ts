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

import { syncEndlessRewards } from "../src/core/progress";
import { pull } from "../src/core/gacha";
import { mulberry32 } from "../src/core/rng";
import { ENDLESS_REWARDS } from "../src/data/endless";

describe("エンドレスの EX", () => {
  test("記録に届くと手に入る・EX のわざは福袋から出る・EX のオブジェクトはストーリーでも持てる", () => {
    const s = newSave();
    const rng = mulberry32(5);
    // まだ EX が無いうちは、福袋から EX は出ない
    s.churu = 1e6;
    for (let i = 0; i < 30; i++) for (const r of (pull(s, rng, 10) as { ok: true; value: { rarity: string }[] }).value) expect(r.rarity).not.toBe("EX");
    s.endlessBest = 25;
    const got = syncEndlessRewards(s);
    expect(got.map((g) => g.id)).toEqual(["laser", "gatling", "nijiironokenami"]);
    expect(s.objects.laser).toBeTruthy();
    expect(s.wazas.nijiironokenami).toBeTruthy();
    expect(syncEndlessRewards(s)).toEqual([]);
    let ex = 0;
    for (let i = 0; i < 200; i++) for (const r of (pull(s, rng, 10) as { ok: true; value: { rarity: string; wazaId: string }[] }).value) if (r.rarity === "EX") { ex++; expect(r.wazaId).toBe("nijiironokenami"); }
    expect(ex).toBeGreaterThan(0);
    expect(ENDLESS_REWARDS.length).toBeGreaterThanOrEqual(8);
  });
});

describe("エンドレスの波", () => {
  test("前の波の虫を全部たおすまで、次の波は始まらない", () => {
    const b = new Battle(buildEndlessLoadout(newSave()), 3);
    const inp = { move: { x: 0, y: 0 }, place: null, upgrade: false };
    let starts = 0;
    for (let i = 0; i < 3000 && !b.result; i++) {
      const w0 = b.waveIndex;
      const prevAlive = b.bugs.some((g) => g.alive && g.wave === w0 - 1);
      b.step(0.1, inp);
      // 新しい波が始まったなら、その直前に前の波の虫は残っていない
      if (b.waveIndex > w0) { starts++; if (w0 > 0) expect(prevAlive).toBe(false); }
    }
    expect(starts).toBeGreaterThan(1);
  });
});

import { focusLearn, nodeLevel as nl, skillTree as st } from "../src/core/progress";

describe("極振り", () => {
  test("えらんだ系統にちゅ〜るを使う（道のノードもとる）", () => {
    const s = newSave();
    s.churu = 5000;
    const r = focusLearn(s, "def", 3000);
    expect(r.learned).toBeGreaterThan(5);
    expect(r.spent).toBeLessThanOrEqual(3000);
    const got = st().filter((n) => nl(s, n.id) > 0 && n.kind !== "root");
    const inReg = got.filter((n) => n.region === "def").length;
    expect(inReg).toBeGreaterThan(got.length / 2);
  });
});
