// 11・12章（2026-10-26 に 足した）: ふつうに 進めた プレイヤーが、前を 回して 育てたら 本物の 戦闘で 勝てる
import { describe, expect, test } from "vitest";
import { simulate, SIM_NEED, SIM_MAX_GRIND } from "./sim";
import { runBot } from "./bot";
import { buildLoadout } from "../src/core/progress";
import type { SaveData } from "../src/core/save";

describe("11・12章", () => {
  test("育てたあとは 勝てる（11-5・11-10・12-5・12-10）", () => {
    const ids = ["11-5", "11-10", "12-5", "12-10"];
    const snaps: Record<string, SaveData> = {};
    const { save } = simulate(120, SIM_NEED, SIM_MAX_GRIND, 42, 0.35, (id, s, phase) => { if (ids.includes(id) && phase === "ready") snaps[id] = structuredClone(s); });
    expect(save.cleared).toBe(119);
    const lost = ids.filter((id) => !runBot(buildLoadout(snaps[id], id)!, { objects: true }).win);
    expect(lost.length).toBeLessThanOrEqual(1);
  }, 300_000);
});
