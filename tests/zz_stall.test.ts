import { test } from "vitest";
import { simulate } from "./sim";
import { Battle } from "../src/battle/engine";
import { buildLoadout } from "../src/core/progress";
import type { SaveData } from "../src/core/save";
import * as botmod from "./bot";
test("stall", () => {
  const ID = process.env.ID ?? "3-10";
  let snap: SaveData | null = null;
  simulate(100, undefined, undefined, 42, 0.35, (id, save, ph) => { if (id === ID && ph === (process.env.PH ?? "ready")) snap = structuredClone(save); });
  const lo = buildLoadout(snap!, ID)!;
  // runBot と同じ動きを、途中のようすを見るために少しだけまねる
  const orig = Battle.prototype.step;
  let b: Battle | null = null; let last = 0;
  (Battle.prototype as any).step = function (dt: number, input: any) {
    b = this; orig.call(this, dt, input);
    if (this.time - last >= Number(process.env.EVERY ?? 100)) {
      last = this.time;
      const alive = this.bugs.filter((x: any) => x.alive);
      const byMode: Record<string, number> = {};
      for (const x of alive) byMode[x.def.id + ":" + x.mode] = (byMode[x.def.id + ":" + x.mode] ?? 0) + 1;
      const hpf = alive.map((x: any) => x.hp / x.maxHp);
      console.log(`t ${this.time.toFixed(0)} alive ${alive.length} mama ${this.mamaHp} wave ${this.waveIndex}/${this.waveTotal} kibble ${this.kibble.toFixed(0)} objs ${this.objects.length} hp% avg ${(hpf.reduce((a: number, c: number) => a + c, 0) / Math.max(1, hpf.length)).toFixed(2)}`, JSON.stringify(byMode),
        alive.slice(0, 6).map((x: any) => `${x.def.id}@${x.x.toFixed(1)},${x.y.toFixed(1)} slow ${x.slowMul.toFixed(2)}`).join(" | "));
    }
  };
  const r = botmod.runBot(lo, { objects: true, maxTime: 600 });
  (Battle.prototype as any).step = orig;
  console.log("result", JSON.stringify(r));
}, 600000);
