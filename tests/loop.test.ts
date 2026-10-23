// 連続周回のテスト（本物の戦闘のボットで）。クリアできるステージなら、10周は勝てる。
import { describe, expect, test } from "vitest";
import { simulate, SIM_NEED, SIM_MAX_GRIND } from "./sim";
import { runBot } from "./bot";
import { buildLoadout, grantRewards } from "../src/core/progress";
import { LOOP_BONUS, MAX_LAPS, makeLoopStage, STAGE_MAP } from "../src/data/stages";
import { mulberry32 } from "../src/core/rng";
import type { SaveData } from "../src/core/save";

describe("連続周回", () => {
  test("波を周の数だけつなげ、周ごとに少し強くなる・上限は99周", () => {
    const st = STAGE_MAP["1-6"];
    const lp = makeLoopStage(st, 5);
    expect(lp.waves.length).toBe(st.waves.length * 5);
    expect(lp.loop).toMatchObject({ lapWaves: st.waves.length, laps: 5 });
    expect(lp.waves[st.waves.length * 4].hpMul!).toBeGreaterThan(lp.waves[0].hpMul ?? 1);
    expect(makeLoopStage(st, 500).loop!.laps).toBe(MAX_LAPS);
  });
  test("報酬は周の数 × 上乗せ", () => {
    const snaps: Record<string, SaveData> = {};
    simulate(10, SIM_NEED, SIM_MAX_GRIND, 42, 0.35, (id, save, phase) => { if (id === "1-6" && phase === "ready") snaps[id] = structuredClone(save); });
    const a = structuredClone(snaps["1-6"]), b = structuredClone(snaps["1-6"]);
    const r1 = grantRewards(a, "1-6", mulberry32(1));
    const r10 = grantRewards(b, "1-6", mulberry32(1), 10, LOOP_BONUS);
    expect(r10.coins).toBeGreaterThanOrEqual(Math.floor(r1.coins * 10 * LOOP_BONUS) - 1);
  });
  test("クリアできるステージなら、10周は勝てる（本物の戦闘）", () => {
    const snaps: Record<string, SaveData> = {};
    const ids = ["1-6", "5-7"];
    simulate(50, SIM_NEED, SIM_MAX_GRIND, 42, 0.35, (id, save, phase) => { if (ids.includes(id) && phase === "ready") snaps[id] = structuredClone(save); });
    for (const id of ids) {
      const lo = buildLoadout(snaps[id], id)!;
      const r = runBot({ ...lo, stage: makeLoopStage(lo.stage, 10) }, { objects: true, maxTime: 9000 });
      expect(r.win).toBe(true);
    }
  }, 600000);
});
