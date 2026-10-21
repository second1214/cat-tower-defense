import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { simulate } from "./sim";
import { winScale } from "./bot";
import { buildLoadout, catEffDps, charDps, objectDps, stageKibble, stageCrowd, stageLoad, inBattleObjects } from "../src/core/progress";
import { mazeLength } from "../src/data/stages";
import { bugDefs } from "../src/data/bugs";
import type { SaveData } from "../src/core/save";
test("p13", () => {
  const snaps: [string, SaveData][] = [];
  const every = Number(process.env.EVERY ?? 3);
  simulate(100, undefined, undefined, 42, 0.35, (id, save, ph) => {
    const [c, i] = id.split("-").map(Number); const g = (c - 1) * 10 + i - 1;
    if (ph === "arrive" && (g % every === 0 || i === 5 || i === 10)) snaps.push([id, structuredClone(save)]);
  });
  const bugs = bugDefs();
  const out: any[] = [];
  for (const [id, s] of snaps) {
    const lo = buildLoadout(s, id)!; const st = lo.stage;
    const L = stageLoad(st); const cr = stageCrowd(st);
    let reg = 0, boss = 0, bossN = 0, bossSpeed = 0.25, sp = 0, n = 0, lastSpawn = 0;
    for (const w of st.waves) for (const g of w.bugs) {
      const b = bugs[g.bug]; const cnt = g.count * Math.max(1, b.pack ?? 1);
      if (b.boss) { boss = b.hp * st.hpMul; bossN += g.count; bossSpeed = b.speed; } else { reg += b.hp * st.hpMul * cnt; sp += b.speed * cnt; n += cnt; }
      lastSpawn = Math.max(lastSpawn, w.at + g.count * g.every);
    }
    const kib = stageKibble(st, lo.global.kibbleMul);
    const ib = inBattleObjects(lo.objects, kib, cr.crowd);
    const ib1 = inBattleObjects(lo.objects, kib, 1);
    const single = lo.objects.filter(o => o.kind !== "producer" && o.kind !== "wall").map(o => o.atk / o.interval);
    const perks = lo.objects.reduce((a, o) => a + o.perks.length, 0);
    const slowObjs = lo.objects.filter(o => o.kind === "slow").length;
    const kb = lo.objects.reduce((a, o) => a + (o.knockback ?? 0), 0);
    const k = winScale(lo, { objects: true, maxTime: Number(process.env.MAXT ?? 400) }, 1/2048, 1024, 7);
    out.push({ id, wall: st.wall, k, reg, boss, bossN, bossSpeed, regSpeed: sp / n, n, lastSpawn, dur: L.duration, maze: mazeLength(st.obstacles!), kib,
      objD: ib.dps, objD1: ib1.dps, placed: ib.placed, upMul: ib.upMul, crowd: cr.crowd, util: cr.util, single: Math.max(...single), perks, slowObjs, kb,
      cat: catEffDps(lo.char, st), catRaw: charDps(lo.char), comps: lo.companions.reduce((a, c) => a + catEffDps(c, st), 0), compsRaw: lo.companions.reduce((a, c) => a + charDps(c), 0) });
    writeFileSync(process.env.OUT ?? "/tmp/claude-0/-home-user/0075c996-82ce-54dd-9f46-e781bbb290b5/scratchpad/fit2.json", JSON.stringify(out));
  }
}, 3000000);
