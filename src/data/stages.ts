// ステージ（10章 × 10ステージ = 100）。数字から自動で作る。
// 盤面は 14×18。ママは下の真ん中（2×2）。虫は上の端（後半は左右の上の方も）から次々にたくさん出てくる。
// 家具（大きさのある障害物）をよけて、ママへ最短の道で集まる。
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

/** 家具の大きさ（w×h マス）。いくつかあるものは抽選。 */
export const FURNITURE_SIZES: Record<string, [number, number][]> = {
  sofa: [[3, 1], [2, 2]],
  table: [[2, 2]],
  shelf: [[2, 1]],
  plant: [[1, 1]],
  chair: [[1, 1]],
  basket: [[1, 1]],
  shoes: [[1, 1]],
};

/** ママのいるマス（下の真ん中の 2×2）。 */
export const MAMA_COL = (COLS >> 1) - 1;   // 6
export const MAMA_ROW = ROWS - 2;          // 16
export const MAMA_W = 2;
export const MAMA_H = 2;

/** 家具を置いてよい行（上の3行と、ママのまわりはあける）。 */
export const OBSTACLE_ROW_MIN = 3;
export const OBSTACLE_ROW_MAX = ROWS - 4;  // 14

/** 左右の端で、虫が出てくることがある行（上の方）。 */
export const SIDE_SPAWN_ROWS = 6;

/** 障害物がしめるマス（i = row * COLS + col）。 */
export function obstacleCells(o: Obstacle): number[] {
  const out: number[] = [];
  for (let r = o.row; r < o.row + (o.h ?? 1); r++) {
    for (let c = o.col; c < o.col + (o.w ?? 1); c++) out.push(r * COLS + c);
  }
  return out;
}

/** 通れないマスのとき、空いているマスがすべてママへつながっているか（上の端・左右の上の方からも行ける）。 */
export function boardConnected(blocked: boolean[]): boolean {
  const seen = new Array(COLS * ROWS).fill(false), q: number[] = [];
  for (let r = MAMA_ROW; r < MAMA_ROW + MAMA_H; r++) {
    for (let c = MAMA_COL; c < MAMA_COL + MAMA_W; c++) { const i = r * COLS + c; seen[i] = true; q.push(i); }
  }
  while (q.length) {
    const i = q.pop()!, c = i % COLS, r = (i / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, n = nr * COLS + nc;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[n] || blocked[n]) continue;
      seen[n] = true; q.push(n);
    }
  }
  for (let i = 0; i < COLS * ROWS; i++) if (!blocked[i] && !seen[i]) return false;
  return true;
}

/** ステージの障害物の通れないマス。 */
export function stageBlocked(obstacles: Obstacle[]): boolean[] {
  const blocked: boolean[] = new Array(COLS * ROWS).fill(false);
  for (const o of obstacles) for (const i of obstacleCells(o)) blocked[i] = true;
  return blocked;
}

/** 障害物（家具）を置く。行 3〜14 のあいだ。空いたマスはすべてママへつながる。進むほど少し増える。 */
function makeObstacles(g: number, chapter: number, rng: () => number): Obstacle[] {
  const want = Math.min(12, 5 + Math.floor(g / 12) + Math.floor(rng() * 3));
  const kinds = FURNITURE[(chapter - 1) % FURNITURE.length];
  const blocked: boolean[] = new Array(COLS * ROWS).fill(false), out: Obstacle[] = [];
  for (let tries = 0; out.length < want && tries < 400; tries++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const sizes = FURNITURE_SIZES[kind] ?? [[1, 1]];
    const [w, h] = sizes[Math.floor(rng() * sizes.length)];
    const col = Math.floor(rng() * (COLS - w + 1));
    const row = OBSTACLE_ROW_MIN + Math.floor(rng() * (OBSTACLE_ROW_MAX - OBSTACLE_ROW_MIN - h + 2));
    const o: Obstacle = { col, row, kind, w, h };
    const cells = obstacleCells(o);
    // 重ならない・となりの家具とくっつきすぎない（まわり1マスに別の家具があれば、ときどきやめる）
    if (cells.some((i) => blocked[i])) continue;
    let touching = false;
    for (const i of cells) {
      const c = i % COLS, r = (i / COLS) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && blocked[nr * COLS + nc]) touching = true;
      }
    }
    if (touching && rng() < 0.7) continue;
    for (const i of cells) blocked[i] = true;
    if (!boardConnected(blocked)) { for (const i of cells) blocked[i] = false; continue; }
    out.push(o);
  }
  return out;
}

/** 出てくる上の端の列をいくつか選ぶ（同時にいくつもの所から出る）。 */
function pickLanes(rng: () => number, n: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const c = Math.floor(rng() * COLS);
    if (!out.includes(c)) out.push(c);
  }
  return out.sort((a, b) => a - b);
}

/** 1つの群れの数の目安（体力の高い虫は少なめ）。 */
export const SWARM_BASE = 7;

/** 虫の数の倍率。序盤は少なく、後半ほど一気に増える（1-1 で 0.45、10-10 で 1.8）。 */
export function swarmMul(g: number): number {
  return 0.45 + 1.35 * Math.pow(g / (CHAPTERS * STAGES_PER_CHAPTER - 1), 1.6);
}

function makeStage(g: number): StageDef {
  const chapter = Math.floor(g / STAGES_PER_CHAPTER) + 1;
  const index = (g % STAGES_PER_CHAPTER) + 1;
  const boss = index === STAGES_PER_CHAPTER;
  const rng = mulberry32(9001 + g * 7919);
  const pool = BUGS.filter((b) => !b.boss && b.from <= g);
  const newest = pool[pool.length - 1];

  const nWaves = Math.min(8, 3 + Math.floor(g / 14)) + (boss ? 1 : 0);
  const waves: WaveDef[] = [];
  let t = 3;
  for (let w = 0; w < nWaves; w++) {
    const last = w === nWaves - 1;
    const groups = g < 2 ? 1 : Math.min(3, 2 + Math.floor((w + g / 20) / 4));
    const bugs: WaveDef["bugs"] = [];
    for (let k = 0; k < groups; k++) {
      // 最初のステージはアリだけ。新しい虫は少しずつ混ぜる。
      const b = g === 0 ? pool[0] : (k === 0 && w === 1 ? newest : pick(rng, pool));
      const size = (g === 0 ? 6 : SWARM_BASE) + w * 1.5 + chapter * 1.8 + (g % 10) * 0.4;
      const count = Math.max(3, Math.round(size * swarmMul(g) * Math.pow(2 / b.hp, 0.3)));
      const every = Math.round(Math.max(0.25, 1.4 - g * 0.009 - w * 0.06) * 100) / 100;
      // はじめは1か所から。進むと、いくつもの所から同時に出てくる（lanes なしは、ばらばら）
      const nLanes = g < 3 ? 1 : Math.min(4, 1 + Math.floor(rng() * (2 + g / 30)));
      const lanes = rng() < 0.25 && g >= 10 ? undefined : pickLanes(rng, nLanes);
      bugs.push(lanes ? { bug: b.id, count, every, lanes } : { bug: b.id, count, every });
    }
    if (boss && last) {
      const bossId = chapter % 2 === 1 ? "suzumebachi" : "mukade";
      bugs.push({ bug: bossId, count: 1 + Math.floor(chapter / 4), every: 8, lanes: [MAMA_COL, MAMA_COL + 1] });
    }
    waves.push({ at: t, bugs });
    // 次の波は前の波が出きる前から（とぎれずに次々と）
    const longest = Math.max(...bugs.map((x) => x.count * x.every));
    t += Math.max(8, Math.round(longest * 0.7));
  }

  return {
    id: stageIdOf(g),
    chapter,
    index,
    name: boss ? `${CHAPTER_NAMES[chapter - 1]}のぬし` : `${CHAPTER_NAMES[chapter - 1]} ${index}`,
    // 数が増えたぶん、1匹の体力を少し下げる（まとめて倒す気持ちよさを残す）
    hpMul: Math.pow(HP_GROWTH, g) / Math.sqrt(Math.max(1, swarmMul(g))),
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
