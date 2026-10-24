// ステージ（10章 × 10ステージ = 100）。数字から自動で作る。
// 盤面は 14×18。ママは下の真ん中（2×2）。虫は上の端（後半は左右の上の方も）から次々にたくさん出てくる。
// 家具（大きさのある障害物）をよけて、ママへ最短の道で集まる。
//
// 難しさの山（のこぎりの歯）:
// - 虫の体力（stageHpMul）= 1章の練習の小ささ × HP_GROWTH^通し番号 × IN_CHAPTER_GROWTH^章の中の番号 × CHAPTER_HP_MUL[章] × 難関の上乗せ。
//   章の5番目（難関・wall 1）と10番目（大難関・wall 2・ぬし）は WALL_HP_MUL 倍だけ一気に強くなり、
//   次のステージ（6番目・次の章の1番目）は、ふつうの伸びにもどる（ぐっと楽になる）。
// - 難関は体力だけでなく「くせ」でも難しい: 新しいくせの虫（かたい・かじる・群れ・速い）が初めて出る・多めに出る、
//   出口（列）が多い、家具の仕切りで道が長い迷路になる。大難関は、群れのあとに「ぬしの波」が来る。
// - 猫だけでは難関は勝てない（かたい虫・いくつもの列）。オブジェクトを置いて、育てて（前のステージを回して）こえる。
// - CHAPTER_HP_MUL・bugs.ts の BOSS_HP_SCALE は、ふつうに進めるプレイヤー（tests/sim.ts）が、難関で止まって
//   何回か回せばこえられるように合わせた表（オブジェクトの特殊効果・装備の合成・レリックで、章ごとに強くなり方がちがうため）。
//
// 部屋（theme）: 章ごとに部屋が変わる（床と家具）。後半の章は、いくつかの部屋がまざった大きな家。
import { COLS, ROWS, type Obstacle, type StageDef, type WaveDef } from "../core/types";
import { BUGS, bossIdOf, isTraitBug, type BugInfo } from "./bugs";
import { mulberry32, pick } from "../core/rng";

export const CHAPTERS = 10;
export const STAGES_PER_CHAPTER = 10;

/** 1ステージ進むごとの虫の体力・攻撃の倍率。 */
export const HP_GROWTH = 1.34;
/** 虫の体力の基本の倍率。1章は練習なので小さめから始めて、2章の頭で HP_BASE になる。 */
export const HP_BASE = 3.4;
export const HP_BASE_START = 1;
export const ATK_GROWTH = 1.25;

/** 難関の、ふつうの伸びに上乗せする体力の倍率（[ふつう, 難関, 大難関]）。大難関は、このほかに「ぬしの波」がある。 */
export const WALL_HP_MUL = [1, 6, 4.5] as const;
/** 後の章ほど、難関の上乗せを大きくする（1章ごとに +この割合）。後半は成長の山（装備の合成・レリック）が大きいので。 */
export const WALL_HP_PER_CHAPTER = 0.1;
/** 難関の、虫の攻撃の上乗せ。 */
export const WALL_ATK_MUL = [1, 1.3, 1.6] as const;

/** 章の名前（部屋の名前）。 */
export const CHAPTER_NAMES = [
  "リビング", "だいどころ", "しんしつ", "わしつ", "しょさい",
  "おふろば", "こどもべや", "ひろいリビング", "はなれ", "やねうら",
];

/** 章ごとの部屋（床の見た目と家具）。いくつかあるときは、ステージごとに床を変え、家具はまぜる。 */
export const CHAPTER_THEMES: string[][] = [
  ["living"], ["kitchen"], ["bedroom"], ["washitsu"], ["study"], ["bath"],
  ["bedroom", "study"], ["living", "kitchen"], ["washitsu", "living"], ["study", "kitchen", "bedroom", "bath"],
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

/** 通し番号 → 難しさの山（0 ふつう / 1 難関 / 2 大難関）。 */
export function wallOf(g: number): 0 | 1 | 2 {
  const i = (g % STAGES_PER_CHAPTER) + 1;
  return i === STAGES_PER_CHAPTER ? 2 : i === 5 ? 1 : 0;
}

/** 章の中で、1ステージごとに上乗せする体力の倍率（章が変わると元にもどる → 章の頭は少し楽）。 */
export const IN_CHAPTER_GROWTH = 1.1;
/** 章ごとの体力の倍率（ふつうに進めたときの成長のしかた（特殊効果・装備の合成・レリック）に合わせて、ならした表）。 */
/** 難関ごとの上乗せ（本物の戦闘のボットで、来たときに勝ててしまう難関をならす）。[難関, 大難関] × 章。 */
export const WALL_EXTRA: number[][] = [[], [1, 2.5, 1, 1, 1, 1, 1, 0.6, 0.8, 1], [1, 1, 2.5, 1, 1, 1, 1, 1, 1, 1]];
export const CHAPTER_HP_MUL = [1, 4.5, 6, 17, 26, 130, 820, 2200, 2600, 1800];

/** 虫の体力の倍率（ふつうの伸び × 章の中の伸び × 章の倍率 × 難関の上乗せ）。 */
export function stageHpMul(g: number): number {
  const ch = Math.floor(g / STAGES_PER_CHAPTER), i = g % STAGES_PER_CHAPTER;
  const base = HP_BASE_START + (HP_BASE - HP_BASE_START) * Math.pow(Math.min(1, g / STAGES_PER_CHAPTER), 2);
  const w = wallOf(g);
  const spike = w > 0 ? WALL_HP_MUL[w] * (1 + WALL_HP_PER_CHAPTER * ch) * (WALL_EXTRA[w][ch] ?? 1) : 1;
  return base * Math.pow(HP_GROWTH, g) * Math.pow(IN_CHAPTER_GROWTH, i) * (CHAPTER_HP_MUL[ch] ?? 1) * spike;
}

/** ステージの報酬の目安（core の grantRewards がこれをもとに抽選）。難関は多め。 */
function rewardsOf(g: number, wall: 0 | 1 | 2) {
  const m = [1, 1.5, 2][wall];
  return {
    // ちゅ〜るは後半ほどふえる（連続周回でまとめて集められるので、1回ぶんはひかえめ）
    churu: Math.round((5 + g * 0.3) * Math.pow(1.028, g) * m),
    exp: Math.round(10 * Math.pow(1.25, g) * m),
    coins: Math.round(20 * Math.pow(1.22, g) * m),
    relicPoints: 1 + Math.floor(g / 20) + [0, 1, 2][wall],
    // 装備は少なめ（合成で一気に強くなりすぎないように、ゆっくり集まる）
    equipDrops: Math.round((0.5 + g / 50 + [0, 0.5, 1][wall]) * 10) / 10,
    objectDrops: 2 + Math.floor(g / 15) + [0, 1, 2][wall],
  };
}

// ================= 家具 =================

/** 家具の大きさ（w×h マス）。いくつかあるものは抽選。1×1 〜 4×2、仕切りは 1×3・1×4・3×1・4×1 など。 */
export const FURNITURE_SIZES: Record<string, [number, number][]> = {
  sofa: [[3, 1], [2, 2], [3, 2]],
  table: [[2, 2], [3, 2], [2, 1]],
  shelf: [[2, 1], [3, 1], [1, 2], [1, 3]],
  plant: [[1, 1]],
  chair: [[1, 1]],
  basket: [[1, 1]],
  shoes: [[1, 1]],
  bed: [[2, 3], [3, 2]],
  counter: [[3, 1], [4, 1], [1, 3], [1, 4]],
  fridge: [[1, 2], [2, 2]],
  tv: [[2, 1], [3, 1]],
  desk: [[2, 1], [3, 1]],
  bookshelf: [[3, 1], [4, 1], [1, 3], [1, 4]],
  partition: [[3, 1], [4, 1], [1, 3], [1, 4]],
  piano: [[3, 1], [3, 2]],
  bathtub: [[3, 2], [2, 3]],
  washer: [[1, 1], [2, 2]],
  kotatsu: [[2, 2], [3, 2]],
  tansu: [[2, 1], [3, 1], [1, 2]],
  boxes: [[1, 1], [2, 1], [2, 2]],
  pillar: [[1, 1]],
  stove: [[2, 1]],
  sink: [[2, 1]],
};

/** 部屋ごとの家具。lines: 仕切りの列に使う横長のもの / tall: 縦の仕切り / big: 大きい家具 / small: 1×1 の小物。 */
interface RoomDef { lines: string[]; tall: string[]; big: string[]; small: string[] }

const ROOMS: Record<string, RoomDef> = {
  living: { lines: ["sofa", "shelf", "tv", "partition"], tall: ["partition", "bookshelf"], big: ["sofa", "table", "piano", "tv"], small: ["plant", "basket", "chair", "boxes"] },
  kitchen: { lines: ["counter", "sink", "stove", "shelf"], tall: ["counter", "fridge"], big: ["table", "fridge", "counter"], small: ["chair", "boxes", "basket", "plant"] },
  bedroom: { lines: ["tansu", "desk", "bookshelf", "partition"], tall: ["bookshelf", "partition"], big: ["bed", "tansu", "desk"], small: ["chair", "basket", "plant", "boxes"] },
  washitsu: { lines: ["partition", "tansu"], tall: ["partition", "tansu"], big: ["kotatsu", "tansu", "table"], small: ["pillar", "plant", "basket", "boxes"] },
  study: { lines: ["bookshelf", "desk", "shelf"], tall: ["bookshelf", "shelf"], big: ["desk", "piano", "boxes"], small: ["chair", "boxes", "plant"] },
  bath: { lines: ["sink", "shelf", "partition"], tall: ["partition", "shelf"], big: ["bathtub", "washer"], small: ["basket", "boxes", "plant"] },
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

/** 家具がしめるマスの目安（盤面 14×18 に対する割合。[ふつう, 難関, 大難関]）。 */
export const FURNITURE_COVER = [0.15, 0.19, 0.21] as const;

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

/** 上の端（行 0）からママまでの、いちばん短い道のりの平均（マス。4方向）。迷路の長さの目安。 */
export function mazeLength(obstacles: Obstacle[]): number {
  const blocked = stageBlocked(obstacles);
  const dist = new Array(COLS * ROWS).fill(Infinity), q: number[] = [];
  for (let r = MAMA_ROW; r < MAMA_ROW + MAMA_H; r++) {
    for (let c = MAMA_COL; c < MAMA_COL + MAMA_W; c++) { const i = r * COLS + c; dist[i] = 0; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], c = i % COLS, r = (i / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, n = nr * COLS + nc;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || blocked[n] || dist[n] <= dist[i] + 1) continue;
      dist[n] = dist[i] + 1; q.push(n);
    }
  }
  let s = 0, n = 0;
  for (let c = 0; c < COLS; c++) if (Number.isFinite(dist[c])) { s += dist[c]; n++; }
  return n ? s / n : 0;
}

/** 大きさの候補から、条件に合うものを選ぶ（なければ null）。 */
function sizeOf(kind: string, rng: () => number, ok: (w: number, h: number) => boolean): [number, number] | null {
  const list = (FURNITURE_SIZES[kind] ?? [[1, 1]]).filter(([w, h]) => ok(w, h));
  return list.length ? pick(rng, list) : null;
}

/**
 * 家具を置く。行 3〜14 のあいだ。空いたマスはすべてママへつながる。同じステージなら毎回同じ。
 * 1. 仕切りの列（横長の家具をならべた列。すきま＝出入り口を残す）で部屋に分ける。難関は列が多く、すきまがせまく、左右交互（長い迷路）
 * 2. 縦の仕切り（1×3・1×4 など）で、ろうかをせまくする
 * 3. 大きい家具・小物を、目安のマス数になるまで散らす
 */
function makeObstacles(g: number, chapter: number, wall: 0 | 1 | 2, themes: string[], floor: string, rng: () => number): Obstacle[] {
  const N = COLS * ROWS;
  const blocked: boolean[] = new Array(N).fill(false);
  const reserved: boolean[] = new Array(N).fill(false); // 出入り口とその上下（ふさがない）
  const out: Obstacle[] = [];
  const rooms = themes.map((t) => ROOMS[t] ?? ROOMS.living);
  const main = ROOMS[floor] ?? rooms[0];
  let cover = 0;

  const put = (kind: string, col: number, row: number, w: number, h: number, spacing: boolean): boolean => {
    if (col < 0 || col + w > COLS || row < OBSTACLE_ROW_MIN || row + h - 1 > OBSTACLE_ROW_MAX) return false;
    const o: Obstacle = { col, row, kind, w, h };
    const cells = obstacleCells(o);
    if (cells.some((i) => blocked[i] || reserved[i])) return false;
    if (spacing) {
      // となりの家具とくっつきすぎない（まわり1マスに別の家具があれば、ときどきやめる）
      let touching = false;
      for (const i of cells) {
        const c = i % COLS, r = (i / COLS) | 0;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && blocked[nr * COLS + nc] && !cells.includes(nr * COLS + nc)) touching = true;
        }
      }
      if (touching && rng() < 0.6) return false;
    }
    for (const i of cells) blocked[i] = true;
    if (!boardConnected(blocked)) { for (const i of cells) blocked[i] = false; return false; }
    out.push(o);
    cover += cells.length;
    return true;
  };

  // 1. 仕切りの列
  const nBars = wall === 2 ? 3 : wall === 1 ? 2 : (chapter >= 3 && rng() < 0.4 ? 2 : 1);
  const barRows = nBars === 3 ? [5, 8, 11] : nBars === 2 ? [6, 10] : [7 + Math.floor(rng() * 4)];
  const jitter = nBars >= 2 ? Math.floor(rng() * 2) : 0;
  let side = rng() < 0.5 ? 0 : 1; // 出入り口の側（0 = 左、1 = 右）。列ごとに交互
  barRows.forEach((r0, bi) => {
    const row = r0 + jitter;
    // 出入り口: 難関は端に1つ（左右交互 → 長い迷路）、ふつうは2つ（どちらかを通る）
    const gw = wall === 2 ? (chapter <= 1 ? 2 : 1 + Math.floor(rng() * 2)) : wall === 1 ? 2 : 2 + Math.floor(rng() * 2);
    const gaps: number[] = [];
    if (wall > 0) {
      const at = side === 0 ? Math.floor(rng() * 2) : COLS - gw - Math.floor(rng() * 2);
      for (let k = 0; k < gw; k++) gaps.push(at + k);
    } else {
      const a = 1 + Math.floor(rng() * 4), b = COLS - gw - 1 - Math.floor(rng() * 4);
      for (let k = 0; k < gw; k++) { gaps.push(a + k); gaps.push(b + k); }
      // ふつうのステージの仕切りは、ときどき短い（はしが空いている）
      if (rng() < 0.5) { gaps.push(0); if (rng() < 0.5) gaps.push(COLS - 1); }
    }
    side = 1 - side;
    for (const c of gaps) for (const dr of [-1, 0, 1]) {
      const rr = row + dr;
      if (rr >= 0 && rr < ROWS) reserved[rr * COLS + c] = true;
    }
    // すきま以外を、横長の家具でうめる
    let c = 0;
    while (c < COLS) {
      if (gaps.includes(c)) { c++; continue; }
      let len = 0;
      while (c + len < COLS && !gaps.includes(c + len)) len++;
      // 長さ len のすきまを、横長の家具（なければ小物）でうめる
      const kinds = bi % 2 === 0 ? main.lines : pick(rng, rooms).lines;
      let done = false;
      for (let t = 0; t < 8 && !done; t++) {
        const kind = pick(rng, kinds);
        const sz = sizeOf(kind, rng, (w, h) => h === 1 && w <= len);
        if (sz && put(kind, c, row, sz[0], 1, false)) { c += sz[0]; done = true; }
      }
      if (!done) {
        put(pick(rng, main.small), c, row, 1, 1, false);
        c++;
      }
    }
  });

  // 2. 縦の仕切り（列と列のあいだのろうかを、せまくする・小部屋に分ける）
  const nTall = wall === 2 ? 2 : wall === 1 ? 2 : Math.floor(rng() * 2);
  for (let k = 0, tries = 0; k < nTall && tries < 40; tries++) {
    const room = pick(rng, rooms);
    const kind = pick(rng, room.tall);
    const sz = sizeOf(kind, rng, (w, h) => w === 1 && h >= 2);
    if (!sz) continue;
    const col = 2 + Math.floor(rng() * (COLS - 4));
    const row = OBSTACLE_ROW_MIN + Math.floor(rng() * (OBSTACLE_ROW_MAX - OBSTACLE_ROW_MIN - sz[1] + 2));
    if (put(kind, col, row, 1, sz[1], false)) k++;
  }

  // 3. 大きい家具・小物を散らす
  const want = Math.round(COLS * ROWS * FURNITURE_COVER[wall] + Math.min(4, chapter * 0.4) + rng() * 3);
  for (let tries = 0; cover < want && tries < 600; tries++) {
    const room = pick(rng, rooms);
    const big = rng() < 0.55;
    const kind = pick(rng, big ? room.big : room.small);
    const sz = sizeOf(kind, rng, (w, h) => cover + w * h <= want + 2);
    if (!sz) continue;
    const [w, h] = sz;
    const col = Math.floor(rng() * (COLS - w + 1));
    const row = OBSTACLE_ROW_MIN + Math.floor(rng() * (OBSTACLE_ROW_MAX - OBSTACLE_ROW_MIN - h + 2));
    put(kind, col, row, w, h, true);
  }
  return out;
}

// ================= 虫の波 =================

/** 出てくる上の端の列をいくつか選ぶ（同時にいくつもの所から出る）。 */
function pickLanes(rng: () => number, n: number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const c = Math.floor(rng() * COLS);
    if (!out.includes(c)) out.push(c);
  }
  return out.sort((a, b) => a - b);
}

/** 1つの群れの数の目安（体力の高い虫は少なめ。体力の合計は虫の種類であまり変わらないように）。 */
export const SWARM_BASE = 9;

/** 1ステージの中での虫の数の伸び（最初の波は少なく、最後の波ほど多い）。p は 0〜1 の進み具合。 */
export function waveRamp(p: number): number {
  return 0.3 + 1.5 * Math.pow(p, 1.4);
}

/** くせのある虫を選ぶ割合（[ふつう（2章から）, 難関, 大難関]）。 */
export const WALL_TRAIT_SHARE = [0.25, 0.55, 0.45] as const;

function makeStage(g: number): StageDef {
  const chapter = Math.floor(g / STAGES_PER_CHAPTER) + 1;
  const index = (g % STAGES_PER_CHAPTER) + 1;
  const wall = wallOf(g);
  const boss = wall === 2;
  const rng = mulberry32(9001 + g * 7919);
  const pool = BUGS.filter((b) => !b.boss && b.from <= g);
  const traits = pool.filter((b) => isTraitBug(b));
  // このステージで初めて出る虫（難関で出す）。なければ、いちばん新しい虫
  const fresh: BugInfo[] = pool.filter((b) => b.from === g);
  const newest = fresh[0] ?? pool[pool.length - 1];

  // 大難関は、群れの波のあとに「ぬしの波」（ぬしとお供の少しの群れ）が来る
  const nWaves = Math.min(8, 3 + Math.floor(g / 14));
  const waves: WaveDef[] = [];
  let t = 3;
  for (let w = 0; w < nWaves; w++) {
    const last = w === nWaves - 1;
    const p = nWaves > 1 ? w / (nWaves - 1) : 1;
    // 群れの数も、最初は1つから最後の波へ向けて増やす（1-1〜1-4 は1つだけ）
    const maxGroups = g < 4 && wall === 0 ? 1 : Math.min(3, 2 + Math.floor(g / 40));
    const groups = Math.max(1, Math.round(1 + (maxGroups - 1) * p));
    const bugs: WaveDef["bugs"] = [];
    for (let k = 0; k < groups; k++) {
      // 最初のステージはアリだけ。新しい虫は少しずつ混ぜる。難関は、くせのある虫が多い
      let b: BugInfo;
      if (g === 0) b = pool[0];
      else if (k === 0 && (w === 1 || (wall > 0 && w >= 1 && fresh.length > 0 && w % 2 === 1))) b = newest;
      else if (traits.length > 0 && g >= 10 - 5 * Math.min(1, wall) && rng() < WALL_TRAIT_SHARE[wall]) b = pick(rng, traits);
      else b = pick(rng, pool);
      const pack = Math.max(1, b.pack ?? 1);
      const size = (g < 4 ? 6 : SWARM_BASE) + w * 1.5 + chapter * 1.8 + (g % 10) * 0.4;
      // 群れの虫は、1回に pack 匹出るので回数を減らす（それでも数は多め）
      const count = Math.max(3, Math.round((size * waveRamp(p) * Math.pow(2 / b.hp, 0.5) * (pack > 1 ? 1.5 : 1)) / pack));
      // 出てくる間かくも、最初はゆっくり・最後はびっしり
      const every = Math.round(Math.max(0.25, (1.4 - g * 0.009) * (1.4 - 0.8 * p) * (pack > 1 ? 1.6 : 1)) * 100) / 100;
      // はじめは1か所から。進むと、いくつもの所から同時に出てくる（lanes なしは、ばらばら）。難関は出口が多い
      const nLanes = g < 3 ? 1
        : wall > 0 ? Math.min(5, 2 + Math.floor(chapter / 3) + wall - 1 + Math.floor(rng() * 2))
        : Math.min(4, 1 + Math.floor(rng() * (2 + g / 30)));
      const lanes = rng() < (wall > 0 ? 0.35 : 0.25) && g >= 10 ? undefined : pickLanes(rng, nLanes);
      bugs.push(lanes ? { bug: b.id, count, every, lanes } : { bug: b.id, count, every });
    }
    waves.push({ at: t, bugs });
    // 次の波は前の波が出きる前から（とぎれずに次々と）
    const longest = Math.max(...bugs.map((x) => x.count * x.every));
    t += Math.max(8, Math.round(longest * 0.7));
    if (boss && last) {
      // ぬしの波: 群れが出きったあと、ぬし（とお供の群れ少し）がまっすぐママへ
      const escort = pick(rng, traits.length ? traits : pool);
      waves.push({
        at: t,
        bugs: [
          { bug: bossIdOf(chapter), count: 1 + Math.floor(chapter / 4), every: 8, lanes: [MAMA_COL, MAMA_COL + 1] },
          { bug: escort.id, count: Math.max(3, Math.round(4 + chapter / 2)), every: 1.5 },
        ],
      });
    }
  }

  const themes = CHAPTER_THEMES[(chapter - 1) % CHAPTER_THEMES.length];
  const theme = themes[(index - 1) % themes.length];
  return {
    id: stageIdOf(g),
    chapter,
    index,
    name: boss ? `${CHAPTER_NAMES[chapter - 1]}のぬし` : `${CHAPTER_NAMES[chapter - 1]} ${index}`,
    hpMul: stageHpMul(g),
    atkMul: Math.pow(ATK_GROWTH, g) * WALL_ATK_MUL[wall],
    waves,
    obstacles: makeObstacles(g, chapter, wall, themes, theme, mulberry32(4242 + g * 131)),
    // 序盤（1・2章）はカリカリを多めに（はじめの手持ちと、虫が落とす量）
    startKibble: g < 10 ? 100 : g < 20 ? 85 : 60,
    kibbleMul: g < 10 ? 1.5 : g < 20 ? 1.3 : 1,
    kibblePerSec: 0,   // カリカリは時間では増えない。虫を倒して落とす（と餌皿）だけ
    rewards: rewardsOf(g, wall),
    wall,
    theme,
  };
}

export const STAGES: StageDef[] = Array.from({ length: CHAPTERS * STAGES_PER_CHAPTER }, (_, g) => makeStage(g));

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));

// ================= エンドレス =================

/** エンドレスで、1つ波が進むごとに虫の体力に掛ける倍率。 */
export const ENDLESS_HP_GROWTH = 1.2;
/** エンドレスで、1つ波が進むごとに虫の攻撃に掛ける倍率。 */
export const ENDLESS_ATK_GROWTH = 1.12;
/** 1回のエンドレスで用意する波の数（ふつうは、その前にママがやられる）。 */
export const ENDLESS_WAVES = 300;
/** エンドレスの id。 */
export const ENDLESS_ID = "endless";

/**
 * エンドレスのステージ。波の番号 w（0 始まり・全員共通のものさし）で強さが決まる。start 番目の波から始める
 * （自分の記録の少し手前から始められる。ランキングは「何番目の波までこえたか」）。10波ごとに、ぬし。
 */
export function makeEndlessStage(start = 0): StageDef {
  const rng = mulberry32(777 + start * 31);
  const waves: WaveDef[] = [];
  let t = 3;
  for (let k = 0; k < ENDLESS_WAVES; k++) {
    const w = start + k;
    const g = Math.min(CHAPTERS * STAGES_PER_CHAPTER - 1, w);   // 出てくる虫の種類（ステージの通し番号と同じ）
    const pool = BUGS.filter((b) => !b.boss && b.from <= g);
    const groups = Math.min(3, 1 + Math.floor(w / 15));
    const bugs: WaveDef["bugs"] = [];
    for (let j = 0; j < groups; j++) {
      const b = pick(rng, pool);
      const pack = Math.max(1, b.pack ?? 1);
      const count = Math.max(3, Math.round((8 + Math.min(20, w * 0.25)) * Math.pow(2 / b.hp, 0.5) / pack));
      bugs.push({ bug: b.id, count, every: pack > 1 ? 1.4 : 0.8, lanes: pickLanes(rng, Math.min(4, 1 + Math.floor(w / 20))) });
    }
    if (w % 10 === 9) {
      const ch = Math.min(CHAPTERS, 1 + Math.floor(w / 10));
      bugs.push({ bug: bossIdOf(ch), count: 1, every: 1, lanes: [MAMA_COL, MAMA_COL + 1] });
    }
    waves.push({ at: t, bugs, hpMul: Math.pow(ENDLESS_HP_GROWTH, w), atkMul: Math.pow(ENDLESS_ATK_GROWTH, w) });
    const longest = Math.max(...bugs.map((x) => x.count * x.every));
    t += Math.max(10, Math.round(longest * 0.8));
  }
  return {
    id: ENDLESS_ID,
    chapter: 0,
    index: start,
    name: "エンドレス",
    hpMul: 1,
    atkMul: 1,
    waves,
    obstacles: makeObstacles(12, 2, 0, CHAPTER_THEMES[0], "living", mulberry32(9090)),
    startKibble: 60 + start * 15,
    kibblePerSec: 0,
    rewards: { exp: 0, coins: 0, relicPoints: 0, churu: 0, equipDrops: 0, objectDrops: 0 },
    wall: 0,
    theme: "living",
    endless: true,
  };
}

// ================= 連続周回 =================

/** 連続周回の上限。 */
export const MAX_LAPS = 99;
/** 1周ごとに虫の体力に足す割合（10周で +27%・99周で約 ×3.9）。 */
export const LOOP_HP_PER_LAP = 0.03;
/** 1周ごとに、ママが回復する量。 */
export const LOOP_HEAL = 3;
/** 連続周回の報酬の上乗せ（ふつうに1回ずつ回すより少し多い）。 */
export const LOOP_BONUS = 1.2;

/** 連続周回のステージ（stage の波を laps 回つなげる。周ごとに少しずつ強くなる）。 */
export function makeLoopStage(stage: StageDef, laps: number): StageDef {
  const n = Math.max(1, Math.min(MAX_LAPS, Math.floor(laps)));
  const last = stage.waves[stage.waves.length - 1];
  const lastLen = Math.max(...last.bugs.map((b) => b.count * b.every));
  const lapLen = last.at + Math.max(8, Math.round(lastLen * 0.7));
  const waves: WaveDef[] = [];
  for (let k = 0; k < n; k++) {
    for (const w of stage.waves) {
      waves.push({ ...w, at: w.at + k * lapLen, hpMul: (w.hpMul ?? 1) * (1 + LOOP_HP_PER_LAP * k) });
    }
  }
  return { ...stage, waves, loop: { lapWaves: stage.waves.length, laps: n, heal: LOOP_HEAL } };
}
