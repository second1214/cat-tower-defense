// ステージ（10章 × 10ステージ = 100）。数字から自動で作る。
import type { StageDef, WaveDef } from "../core/types";
import { BUGS } from "./bugs";
import { mulberry32, pick } from "../core/rng";

export const CHAPTERS = 10;
export const STAGES_PER_CHAPTER = 10;

/** 1ステージ進むごとの虫の体力・攻撃の倍率。 */
export const HP_GROWTH = 1.3;
export const ATK_GROWTH = 1.25;

export const CHAPTER_NAMES = [
  "げんかん", "ろうか", "だいどころ", "リビング", "おふろば",
  "ベランダ", "こどもべや", "しんしつ", "おにわ", "やねうら",
];

/** 通し番号（0 始まり）→ "章-番号"。 */
export function stageIdOf(g: number): string {
  return `${Math.floor(g / STAGES_PER_CHAPTER) + 1}-${(g % STAGES_PER_CHAPTER) + 1}`;
}

/** "章-番号" → 通し番号（0 始まり）。ないときは -1。 */
export function stageIndexOf(id: string): number {
  const m = /^(\d+)-(\d+)$/.exec(id);
  if (!m) return -1;
  const c = Number(m[1]), i = Number(m[2]);
  if (c < 1 || c > CHAPTERS || i < 1 || i > STAGES_PER_CHAPTER) return -1;
  return (c - 1) * STAGES_PER_CHAPTER + (i - 1);
}

/** ステージの報酬の目安（core の grantRewards がこれをもとに抽選）。 */
function rewardsOf(g: number, boss: boolean) {
  return {
    exp: Math.round(10 * Math.pow(1.25, g) * (boss ? 2 : 1)),
    coins: Math.round(20 * Math.pow(1.22, g) * (boss ? 2 : 1)),
    relicPoints: 1 + Math.floor(g / 20) + (boss ? 2 : 0),
    equipDrops: 1 + Math.floor(g / 20) + (boss ? 2 : 0),
    objectDrops: 2 + Math.floor(g / 15) + (boss ? 2 : 0),
  };
}

function makeStage(g: number): StageDef {
  const chapter = Math.floor(g / STAGES_PER_CHAPTER) + 1;
  const index = (g % STAGES_PER_CHAPTER) + 1;
  const boss = index === STAGES_PER_CHAPTER;
  const rng = mulberry32(9001 + g * 7919);
  const pool = BUGS.filter((b) => !b.boss && b.from <= g);
  const newest = pool[pool.length - 1];

  const nWaves = Math.min(6, 2 + Math.floor(g / 12)) + (boss ? 1 : 0);
  const waves: WaveDef[] = [];
  let t = 3;
  for (let w = 0; w < nWaves; w++) {
    const last = w === nWaves - 1;
    const groups = g < 3 ? 1 : Math.min(3, 2 + Math.floor(w / 3));
    const bugs: WaveDef["bugs"] = [];
    for (let k = 0; k < groups; k++) {
      // 最初のステージはアリだけ。新しい虫は少しずつ混ぜる。
      const b = g === 0 ? pool[0] : (k === 0 && w === 1 ? newest : pick(rng, pool));
      const count = Math.max(2, Math.round((g === 0 ? 3 : 4) + w * 0.5 + (g % 10) * 0.1 + chapter * 0.3 - b.hp / 20));
      bugs.push({ bug: b.id, count, every: Math.max(0.8, 3.2 - g * 0.02 - w * 0.2) });
    }
    if (boss && last) {
      const bossId = chapter % 2 === 1 ? "suzumebachi" : "mukade";
      bugs.push({ bug: bossId, count: 1 + Math.floor(chapter / 4), every: 6, lanes: [2] });
    }
    waves.push({ at: t, bugs });
    const longest = Math.max(...bugs.map((x) => x.count * x.every));
    t += Math.round(longest + 8);
  }

  return {
    id: stageIdOf(g),
    chapter,
    index,
    name: boss ? `${CHAPTER_NAMES[chapter - 1]}のぬし` : `${CHAPTER_NAMES[chapter - 1]} ${index}`,
    hpMul: Math.pow(HP_GROWTH, g),
    atkMul: Math.pow(ATK_GROWTH, g),
    waves,
    startKibble: 60,
    kibblePerSec: 0,   // カリカリは時間では増えない。虫を倒して落とす（と餌皿）だけ
    rewards: rewardsOf(g, boss),
  };
}

export const STAGES: StageDef[] = Array.from({ length: CHAPTERS * STAGES_PER_CHAPTER }, (_, g) => makeStage(g));

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
