import { test } from "vitest";
import { simulate, SIM_NEED, SIM_MAX_GRIND } from "/home/user/cat-tower-defense/tests/sim";
import { SKILL_TREE } from "/home/user/cat-tower-defense/src/data/skills";
test("sim", () => {
  console.log("nodes", SKILL_TREE.length, "combos", SKILL_TREE.filter(n=>n.combo).length);
  for (const share of [0.35, 0]) {
    const { rows, save, st } = simulate(100, SIM_NEED, SIM_MAX_GRIND, 42, share);
    const isWall = (g: number) => g % 10 === 4 || g % 10 === 9;
    const tg = rows.reduce((s, r) => s + r.grinds, 0);
    const wall = rows.filter((_, g) => isWall(g)), norm = rows.filter((_, g) => !isWall(g));
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    console.log(share, "cleared", save.cleared, "grinds", tg, "wallStops", wall.filter(r=>r.grinds>0).length, "normGr", norm.reduce((s,r)=>s+r.grinds,0),
      "maxG", Math.max(...rows.map(r=>r.grinds)), "medW", med(wall.map(r=>r.ratio)).toFixed(2), "medN", med(norm.map(r=>r.ratio)).toFixed(2),
      "skillLv", rows[99].skillLv, "combos", rows[99].combos, "lvl", rows[99].level, "skillCh", Math.round(st.churuOnSkills), "earned", Math.round(st.churuEarned),
      "r4", rows[4].grinds, "r9", rows[9].grinds, "minR", Math.min(...rows.slice(10).map(r=>r.ratio)).toFixed(3), "maxR", Math.max(...rows.slice(10).map(r=>r.ratio)).toFixed(1),
      "objOK", rows.slice(10).every(r=>r.objDps > (r.charDps+r.compDps)*3), "pulls", st.pulls, "wazas", rows[99].wazas, "learned", Object.keys(save.skills).length);
  }
}, 600000);
