// 音の入口。効果音・BGM・設定・戦闘の出来事 → 音。
import type { BattleEvent } from "../battle/engine";
import type { CharRole } from "../core/types";
import { sfx, type SfxName } from "./sfx";

export { installAudio, getAudioSettings, setAudioSettings, type AudioSettings } from "./core";
export { sfx, sfxGachaOpen, type SfxName } from "./sfx";
export { setBgm, setBgmIntensity, type BgmMood } from "./bgm";

const ROLE_SFX: Record<CharRole, SfxName> = { melee: "punch", ranged: "throw", aoe: "whoosh", fast: "swish" };

/** 1コマで同じ種類の音を何回まで鳴らすか（たくさん倒しても、うるさくしない）。 */
const counts = new Map<SfxName, number>();
function once(name: SfxName, max: number, pitch = 1): void {
  const n = counts.get(name) ?? 0;
  if (n >= max) return;
  counts.set(name, n + 1);
  sfx(name, pitch);
}

/**
 * 戦闘の出来事から効果音を鳴らす（screen.ts から毎コマ呼ぶ）。
 * roles[i] = i 番目の猫の役割。同じ音の間かくは sfx 側でもしぼっているので、x2・x3 でも増えすぎない。
 */
export function battleSfx(evs: readonly BattleEvent[], roles: readonly CharRole[]): void {
  if (evs.length === 0) return;
  counts.clear();
  for (const e of evs) {
    switch (e.type) {
      case "catAttack": once(ROLE_SFX[roles[e.value] ?? "melee"], 2, e.value === 0 ? 1 : 1.15); break;
      case "hit":
        if (e.x2 === 1) once("crit", 1, 0.9 + Math.random() * 0.2);
        else once("hit", 1, 0.85 + Math.random() * 0.3);
        break;
      case "kill":
        if (e.value === 1) once("bossDeath", 1);
        else once("pop", 2, 0.85 + Math.random() * 0.35);
        break;
      case "kibble": once("kibble", 1, 0.95 + Math.random() * 0.1); break;
      case "zap": once("zap", 1, 0.9 + Math.random() * 0.2); break;
      case "poisonCloud": case "poisonSpread": once("poison", 1, 0.9 + Math.random() * 0.2); break;
      case "poisonBurst": case "mine": once("explode", 1, 0.9 + Math.random() * 0.2); break;
      case "shockwave": case "echo": case "counter": once("shockwave", 1); break;
      case "slam": once("slam", 1); break;
      case "special": once("special", 1); break;
      case "spawn": if (e.value === 1) once("bossAppear", 1); break;
      case "mamaHit": once("mamaHit", 1); break;
      case "catHit": once("catHit", 1); break;
      case "catDown": once("catDown", 1); break;
      case "catUp": case "wakeUp": once("catUp", 1); break;
      case "place": once("place", 1); break;
      case "upgrade": once("upgrade", 1); break;
      case "objectBroken": once("slam", 1, 0.7); break;
      case "wave": once("wave", 1); break;
      case "win": once("win", 1); break;
      case "lose": once("lose", 1); break;
      default: break;
    }
  }
}

let uiInstalled = false;

/**
 * ボタンを押したときの音（メニュー全体）。ボタンの種類で音を変える:
 * 下のタブ → tab、灰色（やめる・閉じる）→ cancel、金・緑（決める）→ confirm、ほか → tap。
 * data-sfx="none" のボタンは鳴らさない（自分で鳴らす所）。
 */
export function installUiSfx(root: HTMLElement): void {
  if (uiInstalled) return;
  uiInstalled = true;
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement | null)?.closest?.("button");
    if (!b || b.disabled) return;
    const want = b.dataset.sfx;
    if (want === "none") return;
    if (want) { sfx(want as SfxName); return; }
    const c = b.classList;
    if (c.contains("nav-btn") || c.contains("subtab") || b.getAttribute("role") === "tab") sfx("tab");
    else if (c.contains("btn-gray") || c.contains("modal-x") || c.contains("bt-btn-sub")) sfx("cancel");
    else if (c.contains("btn-gold") || c.contains("btn-green") || c.contains("bt-btn-main")) sfx("confirm");
    else sfx("tap");
  }, { capture: true });
}
