// 仮の入口: いまはデモの戦闘をすぐ始める（メニューができたら差しかえる）。
import { startBattle } from "./battle/screen";
import { demoLoadout } from "./battle/demo";
import { debugSpriteSheet } from "./battle/sprites";
import type { CharRole } from "./core/types";

const app = document.getElementById("app")!;
const q = new URLSearchParams(location.search);
if (q.has("sprites")) {
  app.style.overflow = "auto";
  app.appendChild(debugSpriteSheet());
} else {
  const run = () => {
    const h = startBattle(app, demoLoadout((q.get("role") as CharRole) || "melee"), {
      onEnd: () => { h.destroy(); run(); },
      onQuit: () => { h.destroy(); run(); },
      seed: Number(q.get("seed")) || undefined,
    });
  };
  run();
}
