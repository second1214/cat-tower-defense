import { test } from "vitest";
import { simulate } from "./sim";
import { runBot } from "./bot";
import { buildLoadout } from "../src/core/progress";
import { STAGES, stageBlocked, mazeLength } from "../src/data/stages";
import type { SaveData } from "../src/core/save";
test("report", () => {
  const snaps: Record<string, SaveData> = {};
  const { rows } = simulate(100, undefined, undefined, 42, 0.35, (id, save, ph) => {
    const i = Number(id.split("-")[1]);
    if (i === 5 || i === 10 || i === 4 || i === 6 || i === 1 || i === 3 || i === 8) snaps[id + ":" + ph] = structuredClone(save);
  });
  for (let c = 0; c < 10; c++) console.log("CURVE", rows.slice(c*10, c*10+10).map(r => `${r.ratio.toFixed(1)}${r.grinds ? "(" + r.grinds + ")" : ""}`).join(" "));
  console.log("HPJUMP", STAGES.filter(s => s.wall).map(s => { const g = (s.chapter - 1) * 10 + s.index - 1; return `${s.id}:${(s.hpMul / STAGES[g - 1].hpMul).toFixed(1)}→${(STAGES[g + 1] ? STAGES[g + 1].hpMul / s.hpMul : 0).toFixed(2)}`; }).join(" "));
  const covs = STAGES.map(s => stageBlocked(s.obstacles!).filter(Boolean).length / 252);
  const mz = (f: (s: any) => boolean) => { const v = STAGES.filter(f).map(s => mazeLength(s.obstacles!)); return `${Math.min(...v).toFixed(0)}-${Math.max(...v).toFixed(0)} avg ${(v.reduce((a, b) => a + b) / v.length).toFixed(1)}`; };
  console.log("COVER", `min ${(Math.min(...covs) * 100).toFixed(0)}% max ${(Math.max(...covs) * 100).toFixed(0)}% avg ${(covs.reduce((a, b) => a + b) / 100 * 100).toFixed(1)}%`,
    "maze normal", mz((s) => !s.wall), "wall1", mz((s) => s.wall === 1), "wall2", mz((s) => s.wall === 2),
    "pieces avg", (STAGES.reduce((a, s) => a + s.obstacles!.length, 0) / 100).toFixed(1), "kinds", new Set(STAGES.flatMap(s => s.obstacles!.map(o => o.kind))).size);
  let wallOk = 0, wallN = 0; const lines: string[] = [];
  for (const s of STAGES) {
    if (!s.wall) continue;
    const a = snaps[s.id + ":arrive"], r = snaps[s.id + ":ready"];
    const ca = runBot(buildLoadout(a, s.id)!, { objects: false, maxTime: 1500 });
    const oa = runBot(buildLoadout(a, s.id)!, { objects: true, maxTime: 1500 });
    const or = runBot(buildLoadout(r, s.id)!, { objects: true, maxTime: 1500 });
    const grinds = rows.find(x => x.stage === s.id)!.grinds;
    wallN++; if (!oa.win && or.win) wallOk++;
    lines.push(`${s.id} grinds ${grinds} catOnly ${ca.win ? "W" : "L"} objArrive ${oa.win ? "W" : "L"}(mama ${oa.mamaHp}, t ${oa.time.toFixed(0)}) objReady ${or.win ? "W" : "L"}(mama ${or.mamaHp}, t ${or.time.toFixed(0)})`);
  }
  console.log("WALLS\n" + lines.join("\n") + `\n => arrive負け&ready勝ち ${wallOk}/${wallN}`);
  const nl: string[] = []; let catWins = 0, objWins = 0, n = 0;
  for (const s of STAGES) {
    if (s.wall || ![1, 3, 6, 8].includes(s.index)) continue;
    const a = snaps[s.id + ":arrive"]; if (!a) continue;
    const ca = runBot(buildLoadout(a, s.id)!, { objects: false, maxTime: 1500 });
    const oa = runBot(buildLoadout(a, s.id)!, { objects: true, maxTime: 1500 });
    n++; if (ca.win) catWins++; if (oa.win) objWins++;
    nl.push(`${s.id}:${ca.win ? "W" : "L"}/${oa.win ? "W" : "L"}`);
  }
  console.log("NORMAL catOnly/objs", nl.join(" "), `=> catOnly wins ${catWins}/${n}, objs wins ${objWins}/${n}`);
}, 3000000);
