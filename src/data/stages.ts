// ステージ（10章 × 10ステージ = 100）。数字から自動で作る。
// 盤面は 7×11 の迷路タワーディフェンス。虫は長い道をくねくね進むので、倒す時間はたっぷり。そのぶん波は大きめ。
import { COLS, ROWS, type Obstacle, type StageDef, type WaveDef } from "../core/types";
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
    churu: Math.round((4 + g * 0.15) * Math.pow(1.02, g) * (boss ? 2 : 1)),
    exp: Math.round(10 * Math.pow(1.25, g) * (boss ? 2 : 1)),
    coins: Math.round(20 * Math.pow(1.22, g) * (boss ? 2 : 1)),
    relicPoints: 1 + Math.floor(g / 20) + (boss ? 2 : 0),
    equipDrops: 1 + Math.floor(g / 20) + (boss ? 2 : 0),
    objectDrops: 2 + Math.floor(g / 15) + (boss ? 2 : 0),
  };
}

/** 章ごとの家具（部屋の雰囲気）。 */
const FURNITURE: string[][] = [
  ["basket", "plant", "shoes"], ["shelf", "plant", "basket"], ["table", "sofa", "plant"], ["table", "chair", "shelf"],
  ["shelf", "chair", "basket"], ["sofa", "table", "plant"], ["shelf", "basket", "chair"], ["table", "plant", "shelf"],
  ["sofa", "shelf", "basket"], ["basket", "shelf", "chair"],
];

/** 一番上の全部のマスからママ（下の真ん中）へ行けるか。 */
function connected(blocked: boolean[]): boolean {
  const goal = (ROWS - 1) * COLS + (COLS >> 1), seen = new Array(COLS * ROWS).fill(false), q = [goal];
  seen[goal] = true;
  while (q.length) {
    const i = q.pop()!, c = i % COLS, r = (i / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, n = nr * COLS + nc;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[n] || blocked[n]) continue;
      seen[n] = true; q.push(n);
    }
  }
  for (let c = 0; c < COLS; c++) if (!seen[c]) return false;
  return true;
}

/** 障害物を置く（上の2行・ママのまわりには置かない。道は必ず残す）。進むほど少し増える。 */
function makeObstacles(g: number, chapter: number, rng: () => number): Obstacle[] {
  const want = Math.min(9, 3 + Math.floor(g / 12) + Math.floor(rng() * 3));
  const kinds = FURNITURE[(chapter - 1) % FURNITURE.length];
  const blocked: boolean[] = new Array(COLS * ROWS).fill(false), out: Obstacle[] = [];
  for (let tries = 0; out.length < want && tries < 200; tries++) {
    const col = Math.floor(rng() * COLS), row = 2 + Math.floor(rng() * (ROWS - 5));
    const i = row * COLS + col;
    if (blocked[i]) continue;
    blocked[i] = true;
    if (!connected(blocked)) { blocked[i] = false; continue; }
    out.push({ col, row, kind: kinds[Math.floor(rng() * kinds.length)] });
  }
  return out;
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
      const count = Math.max(3, Math.round(((g === 0 ? 4 : 6) + w * 0.8 + (g % 10) * 0.15 + chapter * 0.5 - b.hp / 15)));
      bugs.push({ bug: b.id, count, every: Math.max(0.6, 2.6 - g * 0.015 - w * 0.15) });
    }
    if (boss && last) {
      const bossId = chapter % 2 === 1 ? "suzumebachi" : "mukade";
      bugs.push({ bug: bossId, count: 1 + Math.floor(chapter / 4), every: 6, lanes: [3] });
    }
    waves.push({ at: t, bugs });
    const longest = Math.max(...bugs.map((x) => x.count * x.every));
    t += Math.round(longest + 10);
  }

  return {
    id: stageIdOf(g),
    chapter,
    index,
    name: boss ? `${CHAPTER_NAMES[chapter - 1]}のぬし` : `${CHAPTER_NAMES[chapter - 1]} ${index}`,
    hpMul: Math.pow(HP_GROWTH, g),
    atkMul: Math.pow(ATK_GROWTH, g),
    waves,
    obstacles: makeObstacles(g, chapter, mulberry32(4242 + g * 131)),
    startKibble: 60,
    kibblePerSec: 0,   // カリカリは時間では増えない。虫を倒して落とす（と餌皿）だけ
    rewards: rewardsOf(g, boss),
  };
}

export const STAGES: StageDef[] = Array.from({ length: CHAPTERS * STAGES_PER_CHAPTER }, (_, g) => makeStage(g));

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
