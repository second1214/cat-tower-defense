// 入口: メニュー（成長・メイン・レリック）から始める。
// 開発用: ?demo で手作りデータの戦闘だけ（?role=ranged|fast|aoe・?seed=N）、?sprites で仮の絵の一覧。
import { startApp } from "./ui/app";
import { startBattle } from "./battle/screen";
import { demoLoadout } from "./battle/demo";
import { debugSpriteSheet } from "./battle/sprites";
import type { CharRole } from "./core/types";

const app = document.getElementById("app")!;
const q = new URLSearchParams(location.search);
if (q.has("sprites")) {
  app.style.overflow = "auto";
  app.appendChild(debugSpriteSheet());
} else if (q.has("demo")) {
  const run = () => {
    const h = startBattle(app, demoLoadout((q.get("role") as CharRole) || "melee"), {
      onEnd: () => { h.destroy(); run(); },
      onQuit: () => { h.destroy(); run(); },
      seed: Number(q.get("seed")) || undefined,
    });
  };
  run();
} else {
  startApp(app);
}
