// 仮の絵（ステッカー風: こげ茶の太いふち＋ベタ塗り）をコードで描いて、オフスクリーン canvas にためておく。
//
// 使い方: getSprite(kind, id) で 128×128 の絵（中心がマスの中心）を受け取り、drawImage で好きな大きさに縮めて描く。
// 絵は SPRITE_SIZE 四方の箱に描かれていて、箱の中心がマス（または猫・虫）の中心。
//
// あとで本物の絵（PNG）に差しかえる方法:
//   1. public/sprites/<id>.png を置く（128×128 推奨・透明背景・中心をそろえる）
//   2. public/sprites/manifest.json に id の配列を書く（例: ["chatora", "ari", "wagomu"]）
//   起動時に loadSpriteOverrides() が manifest を読み、ある PNG だけを読みこむ（無い id はコードの絵のまま）。
//   id の決まり:
//     cat      … 猫の id（例 "chatora"）。休けい中の絵は "<id>_rest"
//     object   … オブジェクトの id（例 "wagomu"）
//     bug      … 虫の id（例 "ari"）
//     projectile … "shot_<kind>"（kind は "cat" または ObjectKind）
//     pickup   … "kibble"
//     mama     … "mama"（ふつう）/ "mama_scared"（びっくり）。正方形でなくてもよい（描く側が縦横比そのままで収める）
//     家具     … "furn_<kind>"（例 "furn_sofa"。drawFurniture が箱に収めて描く）
//   コードから直接差しかえるときは registerSprite(kind, id, img)。
// v5: 家具は drawFurniture(g, kind, l, t, w, h, u) で、どの大きさ（1×1〜4×2・1×4 など）にも描ける（FURNITURE_KINDS すべて）。
//   相棒のひと休みの絵は sprites/cats/manifest.json（カフェと同じ）の "<id>_sit" / "<id>_groom" を loadCatIdlePoses() で読む。
// v5: くせのある虫の絵（シロアリ termite・ハエ fly・ダンゴムシ pillbug・クワガタ stag・ゲジ geji）。id の一部で形を決める（bugShapeOf）。

import { FURNITURE_KINDS } from "../core/types";
import type { CharRole, ObjectKind } from "../core/types";

/** 一覧用（FURNITURE_KINDS ＋ 古いデータの "shoes"）。 */
const FURNITURE_KINDS_LIST: readonly string[] = [...FURNITURE_KINDS, "shoes"];

export type SpriteKind = "cat" | "catRest" | "object" | "bug" | "projectile" | "pickup" | "mama";
export type SpriteImage = HTMLCanvasElement | HTMLImageElement;

export const SPRITE_SIZE = 128;
const S = SPRITE_SIZE;

/** ふちの色（こげ茶）。 */
const OL = "#4a2c1d";
const LW = 6;

const cache = new Map<string, SpriteImage>();
const flashCache = new Map<string, HTMLCanvasElement>();
/** PNG で差しかえる絵（id → 画像）。 */
const overrides = new Map<string, HTMLImageElement>();
/** 絵の版（差しかえがあると増える。カードのアイコンを描き直す合図）。 */
let version = 0;

/** 猫の毛色・虫の形などを決めるための補助情報（id だけで決まらないとき）。 */
export interface SpriteHint {
  role?: CharRole;
  kind?: ObjectKind;
}

export function spriteVersion(): number {
  return version;
}

function overrideKey(kind: SpriteKind, id: string): string {
  switch (kind) {
    case "catRest": return `${id}_rest`;
    case "projectile": return `shot_${id}`;
    case "pickup": return "kibble";
    case "mama": return id === "scared" ? "mama_scared" : "mama";
    default: return id;
  }
}

/** 戦闘中の猫のポーズ。PNG（"<id>_<pose>"）があるときだけ使い、無ければふつうの "cat" の絵。
 *  歩きは walk1〜2（walk3・walk4 があれば 4コマ）、走りは run（run1〜run4 があれば 4コマ）。 */
export type CatPose = "walk1" | "walk2" | "walk3" | "walk4" | "run" | "run1" | "run2" | "run3" | "run4" | "melee" | "ranged" | "aoe" | "hurt" | "win";

export function getCatPose(id: string, pose: CatPose): HTMLImageElement | null {
  return overrides.get(`${id}_${pose}`) ?? null;
}

/** 絵を受け取る（無ければ描いてためる）。hint はコードの絵を選ぶときだけ使う。 */
export function getSprite(kind: SpriteKind, id: string, hint?: SpriteHint): SpriteImage {
  const ov = overrides.get(overrideKey(kind, id));
  if (ov) return ov;
  const key = `${kind}:${id}:${hint?.role ?? ""}:${hint?.kind ?? ""}`;
  let c = cache.get(key);
  if (!c) {
    c = drawSprite(kind, id, hint);
    cache.set(key, c);
  }
  return c;
}

/** 当たったときに光らせる、白い影絵。 */
export function getFlashSprite(kind: SpriteKind, id: string, hint?: SpriteHint): HTMLCanvasElement {
  const key = `${kind}:${id}:${hint?.role ?? ""}:${hint?.kind ?? ""}:${version}`;
  let c = flashCache.get(key);
  if (!c) {
    const src = getSprite(kind, id, hint);
    const [cv, g] = mk();
    g.drawImage(src, 0, 0, S, S);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#fff";
    g.fillRect(0, 0, S, S);
    c = cv;
    flashCache.set(key, c);
  }
  return c;
}

/** コードから絵を差しかえる（id は overrideKey の決まりに従う）。 */
export function registerSprite(kind: SpriteKind, id: string, img: HTMLImageElement): void {
  overrides.set(overrideKey(kind, id), img);
  flashCache.clear();
  version++;
}

let overridesStarted = false;
/** public/sprites/manifest.json に書かれた PNG を読みこむ（無ければ何もしない）。 */
export function loadSpriteOverrides(base = "sprites/"): void {
  if (overridesStarted) return;
  overridesStarted = true;
  fetch(base + "manifest.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((ids: unknown) => {
      if (!Array.isArray(ids)) return;
      for (const id of ids) {
        if (typeof id !== "string") continue;
        const img = new Image();
        img.onload = () => {
          overrides.set(id, img);
          flashCache.clear();
          version++;
        };
        img.src = `${base}${id}.png`;
      }
    })
    .catch(() => { /* manifest が無いときはコードの絵のまま */ });
}

// ---------------------------------------------------------------------------
// 描く道具
// ---------------------------------------------------------------------------

function mk(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  g.lineJoin = "round";
  g.lineCap = "round";
  return [c, g];
}

type G = CanvasRenderingContext2D;

/** 直前に ell / rr / poly / path で作った形（fs の模様の clip とふちに使う）。 */
let cur: Path2D | null = null;

function ell(g: G, x: number, y: number, rx: number, ry: number, rot = 0): void {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  cur = p;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function rr(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  cur = p;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function poly(g: G, pts: number[]): void {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  cur = p;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

/** 自由な形（模様つきで fs したいとき）。 */
function path(build: (p: Path2D) => void): void {
  const p = new Path2D();
  build(p);
  cur = p;
}

/** 今の形を塗って、ふちを描く。deco はその形の内側だけに描く模様。 */
function fs(g: G, fill: string, deco?: () => void, lw = LW): void {
  const p = cur;
  g.fillStyle = fill;
  g.lineWidth = lw;
  g.strokeStyle = OL;
  if (deco && p) {
    g.fill(p);
    g.save();
    g.clip(p);
    deco();
    g.restore();
    g.lineWidth = lw;
    g.strokeStyle = OL;
    g.stroke(p);
    cur = null;
    return;
  }
  g.fill();
  g.stroke();
}

function line(g: G, pts: number[], lw = LW, color = OL): void {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.stroke();
}

function curve(g: G, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, lw = LW, color = OL): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(cx, cy, x1, y1);
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.stroke();
}

function dot(g: G, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

/** かわいい目（白目＋黒目＋光）。 */
function eye(g: G, x: number, y: number, r: number, look = 0.3): void {
  ell(g, x, y, r, r);
  fs(g, "#fff", undefined, 3);
  dot(g, x, y + r * look, r * 0.6, "#2b1a12");
  dot(g, x - r * 0.25, y + r * look - r * 0.3, r * 0.22, "#fff");
}

function blush(g: G, x: number, y: number, r: number): void {
  ell(g, x, y, r, r * 0.6);
  g.fillStyle = "rgba(255,120,130,0.55)";
  g.fill();
}

// ---------------------------------------------------------------------------
// 振り分け
// ---------------------------------------------------------------------------

function drawSprite(kind: SpriteKind, id: string, hint?: SpriteHint): HTMLCanvasElement {
  switch (kind) {
    case "cat": return drawCat(coatOf(id, hint?.role), false);
    case "catRest": return drawCat(coatOf(id, hint?.role), true);
    case "object": return drawObject(id, hint?.kind);
    case "bug": return drawBug(bugShapeOf(id), id);
    case "projectile": return drawShot(id, hint?.kind);
    case "pickup": return drawKibble();
    case "mama": return drawMama(id === "scared");
  }
}

// ---------------------------------------------------------------------------
// 猫
// ---------------------------------------------------------------------------

interface Coat {
  base: string;        // 毛の色
  face?: string;       // 顔の下半分・おなか（白い部分）
  patch?: string;      // ぶち
  patch2?: string;     // 2色目のぶち（三毛）
  stripe?: string;     // しま
  cap?: string;        // はちわれの頭
  eye: string;
  collar: string;
  fluffy?: boolean;
}

const ROLE_COLLAR: Record<CharRole, string> = {
  melee: "#e8524a",
  ranged: "#4a9be8",
  aoe: "#a66ae0",
  fast: "#4cc27a",
};

const COATS: Record<string, Omit<Coat, "collar">> = {
  chatora: { base: "#f4a24c", face: "#fff6ea", stripe: "#d7742a", eye: "#3a2a1a" },
  mike: { base: "#fffaf2", patch: "#f0a04b", patch2: "#3d3433", eye: "#3a2a1a" },
  kuro: { base: "#3b3435", eye: "#e8c43a" },
  shiro: { base: "#fffdf8", eye: "#5aa0e0", fluffy: true },
  hachiware: { base: "#fffaf2", cap: "#36302f", eye: "#3a2a1a" },
  sabatora: { base: "#a3a3a0", face: "#f4f1ea", stripe: "#5f5f5c", eye: "#3a2a1a" },
  omochi: { base: "#fffdf8", face: "#fffdf8", eye: "#3a2a1a", fluffy: true },
  komugi: { base: "#e9c48c", face: "#fff6ea", stripe: "#c99b5c", eye: "#3a2a1a" },
};

const ROLE_COATS: Record<CharRole, Omit<Coat, "collar">> = {
  melee: COATS.chatora,
  ranged: { base: "#f7b866", face: "#fff6ea", patch: "#fffaf2", eye: "#3a2a1a" },
  aoe: { base: "#fffaf2", patch: "#f4a24c", eye: "#3a2a1a", fluffy: true },
  fast: { base: "#f08f3a", face: "#fff6ea", stripe: "#c86720", eye: "#3a2a1a" },
};

function coatOf(id: string, role: CharRole = "melee"): Coat {
  const c = COATS[id] ?? ROLE_COATS[role] ?? COATS.chatora;
  return { ...c, collar: ROLE_COLLAR[role] ?? ROLE_COLLAR.melee };
}

/** 頭の模様（しま・ぶち・はちわれ）。頭のパスで clip された中で呼ぶ。 */
function headDeco(g: G, c: Coat, hx: number, hy: number, r: number): void {
  if (c.face) {
    ell(g, hx, hy + r * 0.55, r * 0.75, r * 0.55);
    g.fillStyle = c.face;
    g.fill();
  }
  if (c.cap) {
    g.beginPath();
    g.moveTo(hx - r * 1.2, hy - r * 1.2);
    g.lineTo(hx + r * 1.2, hy - r * 1.2);
    g.lineTo(hx + r * 1.2, hy + r * 0.1);
    g.lineTo(hx + r * 0.25, hy + r * 0.05);
    g.lineTo(hx, hy - r * 0.45);
    g.lineTo(hx - r * 0.25, hy + r * 0.05);
    g.lineTo(hx - r * 1.2, hy + r * 0.1);
    g.closePath();
    g.fillStyle = c.cap;
    g.fill();
  }
  if (c.patch) {
    ell(g, hx - r * 0.75, hy - r * 0.55, r * 0.6, r * 0.55);
    g.fillStyle = c.patch;
    g.fill();
  }
  if (c.patch2) {
    ell(g, hx + r * 0.8, hy - r * 0.6, r * 0.55, r * 0.5);
    g.fillStyle = c.patch2;
    g.fill();
  }
  if (c.stripe) {
    for (const dx of [-0.28, 0, 0.28]) {
      line(g, [hx + dx * r, hy - r * 0.95, hx + dx * r * 0.8, hy - r * 0.55], 5, c.stripe);
    }
    line(g, [hx - r * 1.0, hy - r * 0.05, hx - r * 0.7, hy + r * 0.0], 4, c.stripe);
    line(g, [hx + r * 1.0, hy - r * 0.05, hx + r * 0.7, hy + r * 0.0], 4, c.stripe);
  }
}

function ears(g: G, c: Coat, hx: number, hy: number, r: number): void {
  const earColor = c.cap ?? c.base;
  for (const s of [-1, 1]) {
    const color = s < 0 && c.patch ? c.patch : s > 0 && c.patch2 ? c.patch2 : earColor;
    poly(g, [hx + s * r * 0.95, hy - r * 0.2, hx + s * r * 0.85, hy - r * 1.25, hx + s * r * 0.25, hy - r * 0.8]);
    fs(g, color);
    poly(g, [hx + s * r * 0.78, hy - r * 0.42, hx + s * r * 0.75, hy - r * 0.98, hx + s * r * 0.42, hy - r * 0.75]);
    g.fillStyle = "#f6a7b0";
    g.fill();
  }
}

function face(g: G, c: Coat, hx: number, hy: number, r: number, sleeping: boolean): void {
  const ex = r * 0.42, ey = hy + r * 0.05;
  if (sleeping) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(hx + s * ex, ey, r * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
      g.lineWidth = 4;
      g.strokeStyle = OL;
      g.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      ell(g, hx + s * ex, ey, r * 0.16, r * 0.2);
      g.fillStyle = c.eye === "#e8c43a" ? c.eye : "#2b1a12";
      g.fill();
      if (c.eye === "#e8c43a") dot(g, hx + s * ex, ey, r * 0.08, "#2b1a12");
      dot(g, hx + s * ex - r * 0.05, ey - r * 0.08, r * 0.06, "#fff");
    }
  }
  // 鼻と口
  poly(g, [hx - r * 0.09, hy + r * 0.3, hx + r * 0.09, hy + r * 0.3, hx, hy + r * 0.4]);
  g.fillStyle = "#f07a8a";
  g.fill();
  g.beginPath();
  g.arc(hx - r * 0.1, hy + r * 0.42, r * 0.1, 0, Math.PI * 0.9);
  g.moveTo(hx + r * 0.2, hy + r * 0.42);
  g.arc(hx + r * 0.1, hy + r * 0.42, r * 0.1, 0, Math.PI * 0.9);
  g.lineWidth = 3;
  g.strokeStyle = OL;
  g.stroke();
  blush(g, hx - r * 0.7, hy + r * 0.32, r * 0.17);
  blush(g, hx + r * 0.7, hy + r * 0.32, r * 0.17);
  // ひげ
  const wc = c.base === "#3b3435" ? "rgba(255,255,255,0.7)" : "rgba(74,44,29,0.6)";
  for (const s of [-1, 1]) {
    line(g, [hx + s * r * 0.6, hy + r * 0.28, hx + s * r * 1.15, hy + r * 0.18], 2, wc);
    line(g, [hx + s * r * 0.6, hy + r * 0.38, hx + s * r * 1.15, hy + r * 0.42], 2, wc);
  }
}

function drawCat(c: Coat, resting: boolean): HTMLCanvasElement {
  const [cv, g] = mk();
  if (!resting) {
    // しっぽ
    curve(g, 84, 98, 116, 92, 108, 58, 16, OL);
    curve(g, 84, 98, 116, 92, 108, 58, 9, c.stripe ? c.base : c.patch2 ?? c.cap ?? c.base);
    // 体
    ell(g, 64, 94, c.fluffy ? 32 : 28, 24);
    fs(g, c.base, () => {
      if (c.face) { ell(g, 64, 100, 15, 18); g.fillStyle = c.face; g.fill(); }
      if (c.patch2) { ell(g, 86, 88, 12, 10); g.fillStyle = c.patch2; g.fill(); }
      if (c.patch) { ell(g, 44, 96, 11, 10); g.fillStyle = c.patch; g.fill(); }
      if (c.stripe) {
        line(g, [36, 88, 46, 92], 5, c.stripe);
        line(g, [92, 88, 82, 92], 5, c.stripe);
      }
    });
    // 前足
    for (const x of [52, 76]) {
      ell(g, x, 114, 9, 7);
      fs(g, c.face ?? c.base, undefined, 5);
    }
    // 頭
    const hx = 64, hy = 54, r = 34;
    ears(g, c, hx, hy, r);
    ell(g, hx, hy, r * (c.fluffy ? 1.08 : 1.02), r * 0.9);
    fs(g, c.base, () => headDeco(g, c, hx, hy, r));
    if (c.fluffy) {
      // もふもふの頬毛
      for (const s of [-1, 1]) {
        poly(g, [hx + s * r * 0.98, hy + r * 0.1, hx + s * r * 1.22, hy + r * 0.32, hx + s * r * 0.95, hy + r * 0.5]);
        fs(g, c.base, undefined, 4);
      }
    }
    face(g, c, hx, hy, r, false);
    // 首輪
    g.beginPath();
    g.arc(64, 70, 22, 0.22 * Math.PI, 0.78 * Math.PI);
    g.lineWidth = 9;
    g.strokeStyle = OL;
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = c.collar;
    g.stroke();
    ell(g, 64, 92, 6, 6);
    fs(g, "#f7d34a", undefined, 3);
  } else {
    // 休けい中: 横になって丸くなる
    curve(g, 104, 104, 122, 84, 106, 70, 15, OL);
    curve(g, 104, 104, 122, 84, 106, 70, 8, c.stripe ? c.base : c.patch2 ?? c.cap ?? c.base);
    ell(g, 72, 94, 42, 22);
    fs(g, c.base, () => {
      if (c.patch2) { ell(g, 92, 84, 14, 10); g.fillStyle = c.patch2; g.fill(); }
      if (c.patch) { ell(g, 72, 82, 12, 8); g.fillStyle = c.patch; g.fill(); }
      if (c.cap) { ell(g, 80, 76, 30, 10); g.fillStyle = c.cap; g.fill(); }
      if (c.stripe) for (const x of [64, 78, 92]) line(g, [x, 74, x + 3, 86], 5, c.stripe);
      if (c.face) { ell(g, 66, 112, 26, 8); g.fillStyle = c.face; g.fill(); }
    });
    for (const x of [44, 60]) {
      ell(g, x, 112, 9, 6);
      fs(g, c.face ?? c.base, undefined, 5);
    }
    const hx = 40, hy = 86, r = 27;
    ears(g, c, hx, hy, r);
    ell(g, hx, hy, r * 1.04, r * 0.88);
    fs(g, c.base, () => headDeco(g, c, hx, hy, r));
    face(g, c, hx, hy, r, true);
  }
  return cv;
}

// ---------------------------------------------------------------------------
// ママ（下から見上げた上半身。こわがっている）
// ---------------------------------------------------------------------------

function drawMama(scared: boolean): HTMLCanvasElement {
  const [cv, g] = mk();
  // 体（エプロン）
  path((p) => {
    p.moveTo(22, 132);
    p.quadraticCurveTo(24, 86, 64, 84);
    p.quadraticCurveTo(104, 86, 106, 132);
    p.closePath();
  });
  fs(g, "#f39bb0", () => {
    rr(g, 44, 96, 40, 40, 8);
    g.fillStyle = "#fff8f0";
    g.fill();
    dot(g, 64, 108, 4, "#f39bb0");
  });
  // 髪（うしろ）
  ell(g, 64, 52, 36, 36);
  fs(g, "#7a4a2e");
  // おだんご
  ell(g, 64, 12, 15, 12);
  fs(g, "#7a4a2e");
  // 顔
  ell(g, 64, 58, 28, 28);
  fs(g, "#ffe0c8", () => {
    // 前髪
    g.beginPath();
    g.moveTo(30, 52);
    g.quadraticCurveTo(40, 26, 64, 28);
    g.quadraticCurveTo(90, 26, 98, 52);
    g.quadraticCurveTo(84, 40, 70, 44);
    g.quadraticCurveTo(60, 36, 46, 46);
    g.quadraticCurveTo(38, 44, 30, 52);
    g.fillStyle = "#7a4a2e";
    g.fill();
  });
  // まゆ（こまり顔: 内側が上がる）
  line(g, [44, 52, 56, 48], 3.5);
  line(g, [84, 52, 72, 48], 3.5);
  if (scared) {
    // ぎゅっとつぶった目 ＞＜
    line(g, [45, 56, 54, 60, 45, 64], 4);
    line(g, [83, 56, 74, 60, 83, 64], 4);
    ell(g, 64, 75, 7, 6);
    fs(g, "#c2404f", undefined, 3);
    // 涙
    line(g, [40, 66, 38, 74], 3, "#6ab8f0");
    line(g, [88, 66, 90, 74], 3, "#6ab8f0");
  } else {
    for (const x of [50, 78]) {
      ell(g, x, 60, 4, 5.5);
      g.fillStyle = "#2b1a12";
      g.fill();
      dot(g, x - 1.2, 58, 1.5, "#fff");
    }
    // 波の口
    g.beginPath();
    g.moveTo(56, 74);
    g.quadraticCurveTo(60, 70, 64, 74);
    g.quadraticCurveTo(68, 78, 72, 74);
    g.lineWidth = 3;
    g.strokeStyle = OL;
    g.stroke();
  }
  blush(g, 42, 68, 5);
  blush(g, 86, 68, 5);
  // あせ
  g.beginPath();
  g.moveTo(102, 36);
  g.quadraticCurveTo(110, 48, 102, 52);
  g.quadraticCurveTo(94, 48, 102, 36);
  fs(g, "#9fd8ff", undefined, 3);
  // ほっぺに手
  for (const s of [-1, 1]) {
    ell(g, 64 + s * 30, 78, 9, 10);
    fs(g, "#ffe0c8", undefined, 4);
  }
  return cv;
}

// ---------------------------------------------------------------------------
// オブジェクト
// ---------------------------------------------------------------------------

/** id から種類を当てる（hint が無いとき用）。 */
function objKindOf(id: string, hint?: ObjectKind): ObjectKind {
  if (hint) return hint;
  const t: [string, ObjectKind][] = [
    ["wagomu", "shooter"], ["deppo", "shooter"], ["senpuki", "shooter"], ["gun", "shooter"],
    ["danboru", "wall"], ["cushion", "wall"], ["wall", "wall"], ["box", "wall"],
    ["soujiki", "aoe"], ["surippa", "aoe"], ["vacuum", "aoe"],
    ["tape", "slow"], ["kirifuki", "slow"],
    ["esara", "producer"], ["oyatsu", "producer"], ["bowl", "producer"],
    ["nezumi", "mine"], ["trap", "mine"],
    ["shitajiki", "zap"], ["moufu", "zap"], ["zap", "zap"],
    ["katori", "poison"], ["spray", "poison"], ["poison", "poison"],
  ];
  for (const [k, v] of t) if (id.includes(k)) return v;
  return "shooter";
}

function drawObject(id: string, hint?: ObjectKind): HTMLCanvasElement {
  const [cv, g] = mk();
  const kind = objKindOf(id, hint);
  // 影
  ell(g, 64, 112, 40, 9);
  g.fillStyle = "rgba(74,44,29,0.18)";
  g.fill();
  switch (kind) {
    case "shooter": drawShooter(g, id); break;
    case "wall": drawWall(g, id); break;
    case "aoe": drawVacuum(g, id); break;
    case "slow": if (id.includes("kirifuki")) drawMist(g); else drawTape(g); break;
    case "producer": drawBowl(g, id); break;
    case "mine": drawTrap(g); break;
    case "zap": drawZap(g, id); break;
    case "poison": drawPoison(g, id); break;
    case "buff": drawPowerStrip(g); break;
  }
  return cv;
}

/** いなずまの形（中心 x,y・大きさ k）。 */
function bolt(g: G, x: number, y: number, k: number, color = "#ffe14a"): void {
  poly(g, [x - 4 * k, y - 14 * k, x + 7 * k, y - 14 * k, x + 2 * k, y - 3 * k, x + 8 * k, y - 3 * k, x - 6 * k, y + 15 * k, x - 1 * k, y + 2 * k, x - 7 * k, y + 2 * k]);
  fs(g, color, undefined, 4);
}

function drawZap(g: G, id: string): void {
  if (id.includes("seijouki")) {
    // 空気清浄機（白い 箱・上の 吹き出し口・青い ランプ・きれいな 風と ぱちぱち）
    rr(g, 32, 26, 64, 86, 16);
    fs(g, "#f7f6f1", () => {
      rr(g, 32, 26, 64, 22, 0);
      g.fillStyle = "#e4e2da";
      g.fill();
      for (let x = 40; x <= 88; x += 8) line(g, [x, 30, x, 44], 3, "#b9b5aa");
      for (let y = 62; y <= 100; y += 7) line(g, [42, y, 86, y], 2, "rgba(150,145,135,0.35)");
      line(g, [40, 54, 40, 104], 4, "rgba(255,255,255,0.8)");
    });
    ell(g, 64, 76, 9, 9);
    fs(g, "#6fd0ff", () => dot(g, 61, 73, 3, "#e8f8ff"), 4);
    // 葉っぱの しるし
    poly(g, [64, 92, 72, 86, 70, 96]);
    fs(g, "#7cc576", undefined, 3);
    // きれいな 風（上へ）と 静電気
    curve(g, 46, 20, 40, 8, 50, 0, 4, "rgba(140,210,255,0.85)");
    curve(g, 82, 20, 90, 8, 80, -2, 4, "rgba(140,210,255,0.85)");
    bolt(g, 106, 40, 0.75);
    bolt(g, 22, 54, 0.6);
    return;
  }
  if (id.includes("moufu")) {
    // フリース毛布（たたんだ毛布から、ぱちぱち）
    rr(g, 14, 46, 100, 62, 18);
    fs(g, "#b9a6e8", () => {
      for (let y = 56; y < 110; y += 12) line(g, [14, y, 114, y], 3, "rgba(255,255,255,0.35)");
    });
    rr(g, 20, 34, 88, 26, 12);
    fs(g, "#cdbcf3", () => { for (let x = 26; x < 108; x += 10) dot(g, x, 47, 2.5, "rgba(255,255,255,0.6)"); });
    bolt(g, 36, 22, 1.1);
    bolt(g, 94, 26, 0.9);
    return;
  }
  // 静電気の下敷き（ななめの板＋いなずま）
  poly(g, [22, 36, 98, 20, 108, 96, 30, 112]);
  fs(g, "#8fd0ff", () => {
    poly(g, [22, 36, 60, 28, 40, 112, 30, 112]);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fill();
    for (const [x, y] of [[54, 60], [80, 52], [70, 86]]) dot(g, x, y, 4, "rgba(255,255,255,0.7)");
  });
  bolt(g, 66, 66, 1.6);
}

function drawPoison(g: G, id: string): void {
  if (id.includes("hotcarpet")) {
    // ホットカーペット（ななめから 見た しきもの・ゆらゆらの 熱・リモコン）
    poly(g, [12, 74, 92, 58, 120, 86, 40, 104]);
    fs(g, "#f39a6a", () => {
      for (let k = 1; k < 4; k++) line(g, [12 + 20 * k, 74 - 4 * k, 40 + 20 * k, 104 - 4.5 * k], 3, "rgba(255,226,190,0.7)");
      for (let k = 1; k < 3; k++) line(g, [12 + 9.3 * k, 74 + 10 * k, 92 + 9.3 * k, 58 + 9.3 * k], 3, "rgba(255,226,190,0.7)");
    });
    poly(g, [40, 104, 120, 86, 120, 92, 40, 110]);
    fs(g, "#d46e44", undefined, 4);
    for (const x of [44, 66, 88]) {
      curve(g, x, 52, x - 8, 40, x, 28, 5, "rgba(255,150,80,0.85)");
      curve(g, x, 28, x + 8, 16, x, 6, 4, "rgba(255,150,80,0.55)");
    }
    // リモコン
    curve(g, 22, 86, 10, 96, 14, 106, 4, OL);
    rr(g, 6, 98, 22, 16, 4);
    fs(g, "#f6f2e8", () => dot(g, 17, 106, 3, "#ff5a3a"), 4);
    return;
  }
  if (id.includes("spray")) {
    // 防虫スプレー
    rr(g, 40, 34, 46, 80, 12);
    fs(g, "#7cc576", () => {
      rr(g, 40, 58, 46, 26, 0);
      g.fillStyle = "#fff6c8";
      g.fill();
      dot(g, 63, 71, 7, "#e86a6a");
    });
    rr(g, 48, 18, 30, 18, 6);
    fs(g, "#f0f0f0");
    rr(g, 70, 20, 14, 8, 3);
    fs(g, "#5a5f6a", undefined, 3);
    for (const [x, y, r] of [[96, 22, 7], [108, 14, 5], [106, 32, 5], [118, 24, 4]]) dot(g, x, y, r, "rgba(170,230,120,0.75)");
    return;
  }
  // 蚊取り線香（うずまき＋けむり）
  ell(g, 64, 96, 44, 14);
  fs(g, "#c9ced6");
  g.beginPath();
  for (let a = 0; a < Math.PI * 7; a += 0.15) {
    const r = 6 + a * 3.6;
    const x = 64 + Math.cos(a) * r, y = 74 + Math.sin(a) * r * 0.62;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.lineWidth = 15;
  g.strokeStyle = OL;
  g.stroke();
  g.lineWidth = 9;
  g.strokeStyle = "#5f9a4a";
  g.stroke();
  dot(g, 64 + Math.cos(Math.PI * 7) * (6 + Math.PI * 7 * 3.6), 74 + Math.sin(Math.PI * 7) * (6 + Math.PI * 7 * 3.6) * 0.62, 6, "#ff7a3a");
  curve(g, 20, 66, 6, 40, 22, 18, 5, "rgba(200,200,210,0.85)");
  curve(g, 22, 18, 34, 4, 26, -4, 4, "rgba(200,200,210,0.6)");
}

/** 電源タップ（白い箱にさしこみ口・オレンジのランプ・コード）。 */
function drawPowerStrip(g: G): void {
  curve(g, 22, 84, 4, 100, 18, 118, 7, OL);
  curve(g, 22, 84, 4, 100, 18, 118, 3, "#d8d2c4");
  rr(g, 22, 46, 84, 40, 10);
  fs(g, "#f6f2e8", () => {
    for (const x of [40, 62]) { rr(g, x - 7, 58, 14, 16, 4); g.fillStyle = "#5a4a3a"; g.fill(); }
    dot(g, 88, 66, 7, "#ffb03d");
    dot(g, 86, 64, 2.5, "#fff6d8");
    line(g, [28, 52, 100, 52], 3, "rgba(255,255,255,0.7)");
  });
}

function drawShooter(g: G, id: string): void {
  if (id === "laser") {
    // レーザーポインター（ペン型。先から赤い光）
    rr(g, 54, 34, 20, 74, 9);
    fs(g, "#8a8fa0", () => { line(g, [60, 42, 60, 100], 3, "rgba(255,255,255,0.45)"); rr(g, 58, 60, 12, 10, 3); g.fillStyle = "#ff5a5a"; g.fill(); });
    const gr = g.createRadialGradient(64, 26, 0, 64, 26, 24);
    gr.addColorStop(0, "rgba(255,70,70,0.95)"); gr.addColorStop(1, "rgba(255,70,70,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(64, 26, 24, 0, Math.PI * 2); g.fill();
    dot(g, 64, 26, 7, "#ffe9e9");
    return;
  }
  if (id === "gatling") {
    // わりばしガトリング（わりばしを 束ねた 3本の 銃身・輪ゴムが 3つ・横の ハンドル）
    poly(g, [50, 76, 78, 76, 84, 110, 60, 112]);
    fs(g, "#a86f3c");
    for (const x of [42, 58, 74]) {
      rr(g, x, 16, 12, 66, 5);
      fs(g, "#e0ad6e", () => line(g, [x + 4, 22, x + 4, 76], 2, "rgba(255,255,255,0.45)"), 4);
    }
    // 束ねる 輪ゴム（銃身の 根元）
    rr(g, 38, 60, 52, 10, 5);
    fs(g, "#f2783a", undefined, 4);
    // 先の 輪ゴム（3つ）
    for (const x of [48, 64, 80]) {
      g.beginPath();
      g.ellipse(x, 18, 10, 5, 0, 0, Math.PI * 2);
      g.lineWidth = 7; g.strokeStyle = OL; g.stroke();
      g.lineWidth = 3.5; g.strokeStyle = x === 64 ? "#ffd23f" : "#f2783a"; g.stroke();
    }
    // 回す ハンドル
    line(g, [90, 50, 106, 50, 106, 64], 7, OL);
    line(g, [90, 50, 106, 50, 106, 64], 3, "#c9ced6");
    ell(g, 106, 68, 6, 6);
    fs(g, "#ff6b6b", undefined, 4);
    // 洗濯ばさみの 引き金
    rr(g, 30, 74, 14, 20, 4);
    fs(g, "#f7d34a", undefined, 4);
    return;
  }
  const water = id.includes("deppo") || id.includes("mizu");
  const fan = id.includes("senpuki");
  if (fan) {
    // 扇風機
    line(g, [64, 74, 64, 104], 10);
    line(g, [64, 74, 64, 104], 4, "#d9e4ee");
    ell(g, 64, 108, 26, 8);
    fs(g, "#bcd4ea");
    ell(g, 64, 52, 36, 36);
    fs(g, "#eaf4ff", () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ell(g, 64 + Math.cos(a) * 16, 52 + Math.sin(a) * 16, 15, 9, a);
        g.fillStyle = "#7cc3f0";
        g.fill();
      }
    });
    for (let i = -2; i <= 2; i++) line(g, [64 + i * 13, 20, 64 + i * 13, 84], 2, "rgba(74,44,29,0.35)");
    ell(g, 64, 52, 8, 8);
    fs(g, "#f7d34a", undefined, 4);
    return;
  }
  const body = water ? "#5ab4f0" : "#d29a5e";
  const dark = water ? "#3a86c8" : "#a86f3c";
  // 持ち手
  poly(g, [52, 70, 78, 70, 82, 108, 60, 110]);
  fs(g, dark);
  // 銃身（上を向く）
  rr(g, 50, 18, 28, 62, 8);
  fs(g, body, () => {
    line(g, [56, 26, 56, 72], 3, "rgba(255,255,255,0.4)");
  });
  if (water) {
    ell(g, 64, 62, 18, 14);
    fs(g, "#f7d34a");
    dot(g, 58, 58, 4, "rgba(255,255,255,0.7)");
  } else {
    // 輪ゴム
    g.beginPath();
    g.ellipse(64, 22, 20, 8, 0, 0, Math.PI * 2);
    g.lineWidth = 9;
    g.strokeStyle = OL;
    g.stroke();
    g.lineWidth = 4.5;
    g.strokeStyle = "#f2783a";
    g.stroke();
    // 洗濯ばさみの引き金
    rr(g, 76, 72, 14, 22, 4);
    fs(g, "#f7d34a", undefined, 4);
  }
}

function drawWall(g: G, id: string): void {
  if (id.includes("cushion")) {
    rr(g, 16, 30, 96, 80, 26);
    fs(g, "#f5a6c0", () => {
      for (const [x, y] of [[44, 56], [84, 56], [44, 86], [84, 86], [64, 71]]) {
        dot(g, x, y, 4, "#d77a9a");
      }
    });
    for (const [x, y] of [[16, 30], [112, 30], [16, 110], [112, 110]]) {
      ell(g, x, y, 7, 7);
      fs(g, "#f5a6c0", undefined, 4);
    }
    return;
  }
  // 段ボール
  poly(g, [18, 46, 64, 30, 110, 46, 64, 60]);
  fs(g, "#e8bd82");
  poly(g, [18, 46, 64, 60, 64, 116, 18, 100]);
  fs(g, "#d9a463");
  poly(g, [64, 60, 110, 46, 110, 100, 64, 116]);
  fs(g, "#c78f4f", () => {
    // ガムテープ
    poly(g, [80, 55, 94, 50, 94, 106, 80, 111]);
    g.fillStyle = "#efdca6";
    g.fill();
  });
  // ふた
  poly(g, [18, 46, 6, 30, 50, 18, 64, 30]);
  fs(g, "#f0cb93", undefined, 5);
  poly(g, [110, 46, 122, 30, 78, 18, 64, 30]);
  fs(g, "#f0cb93", undefined, 5);
  // ねこマーク
  dot(g, 40, 82, 7, "rgba(74,44,29,0.35)");
  poly(g, [34, 78, 35, 70, 40, 76]);
  g.fill();
  poly(g, [46, 78, 45, 70, 40, 76]);
  g.fill();
}

function drawVacuum(g: G, id: string): void {
  if (id.includes("surippa")) {
    // ママのスリッパ（横から: 底・甲の かぶせ・ぽんぽん）
    path((p) => { p.ellipse(64, 92, 50, 15, -0.12, 0, Math.PI * 2); });
    g.beginPath(); g.ellipse(64, 92, 50, 15, -0.12, 0, Math.PI * 2);
    fs(g, "#c85a86");
    path((p) => { p.ellipse(64, 86, 48, 13, -0.12, 0, Math.PI * 2); });
    fs(g, "#ffb3cf", () => line(g, [26, 88, 60, 82], 3, "rgba(255,255,255,0.5)"), 4);
    // 甲の かぶせ（前の 半分）
    path((p) => {
      p.moveTo(56, 88);
      p.quadraticCurveTo(62, 44, 92, 46);
      p.quadraticCurveTo(116, 50, 112, 78);
      p.quadraticCurveTo(88, 90, 56, 88);
      p.closePath();
    });
    fs(g, "#ff8ab8", () => {
      curve(g, 68, 66, 82, 52, 100, 56, 4, "rgba(255,255,255,0.45)");
      for (const [x, y] of [[80, 70], [96, 66], [90, 78]]) dot(g, x, y, 3, "#ffd0e2");
    });
    // ぽんぽん
    ell(g, 88, 46, 13, 11);
    fs(g, "#fff3f8", () => dot(g, 84, 42, 4, "#ffffff"), 4);
    // ばしっ（たたく しるし）
    for (const [x0, y0, x1, y1] of [[20, 50, 30, 60], [14, 66, 28, 70], [30, 36, 38, 50]]) line(g, [x0, y0, x1, y1], 4, "#f7b23a");
    return;
  }
  if (id.includes("robot")) {
    // お掃除ロボ（まるい ロボ・前の バンパー・緑の ランプ・横の ブラシ）
    path((p) => { p.ellipse(64, 86, 48, 22, 0, 0, Math.PI * 2); });
    fs(g, "#3d4250");
    path((p) => { p.ellipse(64, 76, 48, 22, 0, 0, Math.PI * 2); });
    fs(g, "#626a7c", () => {
      g.beginPath(); g.ellipse(64, 76, 30, 13, 0, 0, Math.PI * 2);
      g.fillStyle = "#7a8396"; g.fill();
      g.beginPath(); g.ellipse(52, 70, 16, 5, -0.1, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.3)"; g.fill();
    });
    // バンパー（前）
    g.beginPath(); g.ellipse(64, 80, 48, 22, 0, 0.15, Math.PI - 0.15);
    g.lineWidth = 6; g.strokeStyle = "#2a2e38"; g.stroke();
    // ランプ・ボタン
    ell(g, 64, 66, 7, 4);
    fs(g, "#8fffb0", undefined, 3);
    ell(g, 64, 80, 6, 3);
    fs(g, "#f7d34a", undefined, 3);
    // ブラシ（くるくる）
    for (const [cx, cy] of [[20, 94], [108, 94]]) {
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + 0.4;
        line(g, [cx, cy, cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 5], 3, "#c9ced6");
      }
      dot(g, cx, cy, 3.5, "#5a5f6a");
    }
    // ねこの 耳（かざり）
    poly(g, [44, 62, 48, 46, 58, 58]);
    fs(g, "#626a7c", undefined, 4);
    poly(g, [84, 62, 80, 46, 70, 58]);
    fs(g, "#626a7c", undefined, 4);
    return;
  }
  // ホース
  g.beginPath();
  g.moveTo(80, 70);
  g.bezierCurveTo(118, 64, 112, 18, 82, 22);
  g.lineWidth = 13;
  g.strokeStyle = OL;
  g.stroke();
  g.lineWidth = 7;
  g.strokeStyle = "#8a8f9a";
  g.stroke();
  // ノズル
  rr(g, 54, 12, 34, 16, 6);
  fs(g, "#6a6f7a");
  // 本体
  ell(g, 58, 78, 38, 30);
  fs(g, "#ee6b6b", () => {
    ell(g, 48, 66, 18, 10);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fill();
  });
  // 車輪
  for (const x of [34, 82]) {
    ell(g, x, 104, 9, 9);
    fs(g, "#5a5f6a", undefined, 5);
  }
  // ボタン
  ell(g, 58, 78, 9, 9);
  fs(g, "#f7d34a", undefined, 4);
}

/** 霧吹き（水の 入った ボトル・白い 引き金・しゅっと 霧）。 */
function drawMist(g: G): void {
  rr(g, 40, 50, 46, 62, 14);
  fs(g, "#bfe8ff", () => {
    rr(g, 40, 74, 46, 40, 0);
    g.fillStyle = "#7cc8f2";
    g.fill();
    line(g, [48, 58, 48, 104], 4, "rgba(255,255,255,0.7)");
    for (const [x, y] of [[66, 88], [74, 98], [60, 100]]) dot(g, x, y, 3, "rgba(255,255,255,0.75)");
  });
  rr(g, 52, 38, 22, 14, 4);
  fs(g, "#f0f0f0", undefined, 4);
  // 頭と ノズル
  poly(g, [44, 22, 86, 22, 92, 30, 86, 40, 46, 40]);
  fs(g, "#ffffff", undefined, 5);
  rr(g, 86, 24, 12, 10, 3);
  fs(g, "#5a5f6a", undefined, 3);
  // 引き金
  poly(g, [52, 40, 60, 40, 56, 64, 48, 60]);
  fs(g, "#ffffff", undefined, 4);
  // しゅっ（霧）
  for (const [x, y, r] of [[106, 26, 5], [114, 18, 4], [116, 34, 4], [122, 26, 3], [108, 12, 3], [110, 40, 3]]) dot(g, x, y, r, "rgba(140,210,255,0.8)");
}

function drawTape(g: G): void {
  // テープの帯
  poly(g, [70, 96, 118, 104, 116, 118, 66, 110]);
  fs(g, "#f6e08c", undefined, 5);
  // 輪（真ん中に穴）
  g.beginPath();
  g.arc(58, 62, 42, 0, Math.PI * 2);
  g.moveTo(58 + 18, 62);
  g.arc(58, 62, 18, 0, Math.PI * 2, true);
  g.fillStyle = "#f3d462";
  g.fill("evenodd");
  g.lineWidth = LW;
  g.strokeStyle = OL;
  g.stroke();
  g.beginPath();
  g.arc(58, 62, 30, Math.PI * 1.1, Math.PI * 1.6);
  g.lineWidth = 5;
  g.strokeStyle = "rgba(255,255,255,0.6)";
  g.stroke();
  g.beginPath();
  g.arc(58, 62, 36, 0, Math.PI * 2);
  g.lineWidth = 2;
  g.strokeStyle = "rgba(180,140,40,0.5)";
  g.stroke();
}

function drawBowl(g: G, id: string): void {
  if (id.includes("oyatsu")) {
    // おやつの袋
    poly(g, [30, 30, 98, 30, 106, 112, 22, 112]);
    fs(g, "#7cc3f0", () => {
      rr(g, 36, 56, 56, 34, 10);
      g.fillStyle = "#fff";
      g.fill();
      ell(g, 64, 73, 16, 9);
      g.fillStyle = "#f4a24c";
      g.fill();
    });
    poly(g, [26, 20, 102, 20, 98, 32, 30, 32]);
    fs(g, "#f7d34a", undefined, 5);
    return;
  }
  // カリカリの山
  for (const [x, y, r] of [[44, 56, 9], [60, 48, 10], [78, 52, 9], [52, 62, 9], [70, 60, 10], [86, 62, 8], [36, 66, 7]]) {
    ell(g, x, y, r, r * 0.8);
    fs(g, (x + y) % 2 ? "#c47a3a" : "#a9612a", undefined, 4);
  }
  // 皿
  path((p) => {
    p.moveTo(14, 66);
    p.lineTo(114, 66);
    p.quadraticCurveTo(108, 112, 64, 112);
    p.quadraticCurveTo(20, 112, 14, 66);
    p.closePath();
  });
  fs(g, "#f39bb0", () => {
    // 魚のマーク
    ell(g, 60, 86, 14, 8);
    g.fillStyle = "#fff";
    g.fill();
    poly(g, [72, 86, 84, 78, 84, 94]);
    g.fill();
  });
  rr(g, 10, 60, 108, 12, 6);
  fs(g, "#f7b6c6", undefined, 5);
}

function drawTrap(g: G): void {
  // 板
  poly(g, [14, 64, 100, 44, 116, 88, 30, 112]);
  fs(g, "#dba76a", () => {
    line(g, [24, 80, 106, 60], 2, "rgba(120,70,30,0.4)");
    line(g, [28, 94, 110, 74], 2, "rgba(120,70,30,0.4)");
  });
  // 金具（ばね）
  g.beginPath();
  g.moveTo(30, 82);
  g.lineTo(42, 34);
  g.lineTo(96, 22);
  g.lineTo(104, 70);
  g.lineWidth = 10;
  g.strokeStyle = OL;
  g.stroke();
  g.lineWidth = 5;
  g.strokeStyle = "#c9ced6";
  g.stroke();
  ell(g, 66, 78, 9, 9);
  fs(g, "#c9ced6", undefined, 4);
  // チーズ
  poly(g, [56, 70, 92, 58, 86, 82]);
  fs(g, "#f7d34a", () => {
    dot(g, 74, 68, 3, "#e0b52e");
    dot(g, 83, 72, 2.5, "#e0b52e");
  }, 4);
}

// ---------------------------------------------------------------------------
// 虫（上から見た姿。頭が下＝ママの方を向く）
// ---------------------------------------------------------------------------

export type BugShape =
  | "ant" | "mosquito" | "roach" | "stinkbug" | "spider"
  | "caterpillar" | "centipede" | "beetle" | "horned" | "hornet"
  // v5: くせのある虫（難関で出る）
  | "termite" | "fly" | "pillbug" | "stag" | "geji";

/** id の一部から形を決める（長いものから順に調べる）。 */
export function bugShapeOf(id: string): BugShape {
  const s = id.toLowerCase();
  const t: [string, BugShape][] = [
    ["suzumebachi", "hornet"], ["hornet", "hornet"], ["hachi", "hornet"], ["wasp", "hornet"], ["bee", "hornet"],
    ["mukade", "centipede"], ["centipede", "centipede"],
    ["kamemushi", "stinkbug"], ["stink", "stinkbug"],
    ["gokiburi", "roach"], ["roach", "roach"],
    ["imomushi", "caterpillar"], ["caterpillar", "caterpillar"], ["kemushi", "caterpillar"],
    ["kumo", "spider"], ["spider", "spider"],
    ["kabuto", "horned"], ["kuwagata", "stag"], ["stag", "stag"],
    ["shiroari", "termite"], ["termite", "termite"],
    ["dangomushi", "pillbug"], ["dango", "pillbug"], ["pillbug", "pillbug"],
    ["gejigeji", "geji"], ["geji", "geji"],
    ["kogane", "beetle"], ["beetle", "beetle"], ["tentou", "beetle"],
    ["mosquito", "mosquito"],
    ["ari", "ant"], ["ant", "ant"],
  ];
  for (const [k, v] of t) if (s.includes(k)) return v;
  if (s === "ka" || s.startsWith("ka_") || s.endsWith("_ka")) return "mosquito";
  if (s === "hae" || s.startsWith("hae") || s.endsWith("_hae") || s.includes("fly")) return "fly";
  return "ant";
}

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function legs(g: G, pairs: [number, number, number, number][], lw = 5): void {
  // [付け根x(右), 付け根y, 先x(右), 先y]。左右対称に描く
  for (const [x0, y0, x1, y1] of pairs) {
    line(g, [64 + x0, y0, 64 + (x0 + x1) * 0.55, (y0 + y1) / 2 - 4, 64 + x1, y1], lw);
    line(g, [64 - x0, y0, 64 - (x0 + x1) * 0.55, (y0 + y1) / 2 - 4, 64 - x1, y1], lw);
  }
}

function antennae(g: G, y: number, spread: number, len: number, lw = 4): void {
  for (const s of [-1, 1]) curve(g, 64 + s * 5, y, 64 + s * spread * 0.4, y + len * 0.7, 64 + s * spread, y + len, lw);
}

function bugEyes(g: G, y: number, dx: number, r: number, angry = false): void {
  eye(g, 64 - dx, y, r, 0.35);
  eye(g, 64 + dx, y, r, 0.35);
  if (angry) {
    line(g, [64 - dx - r, y - r - 2, 64 - dx + r, y - r + 3], 3.5);
    line(g, [64 + dx + r, y - r - 2, 64 + dx - r, y - r + 3], 3.5);
  }
}

function wings(g: G, color: string): void {
  for (const s of [-1, 1]) {
    ell(g, 64 + s * 24, 44, 22, 13, s * -0.5);
    fs(g, color, undefined, 4);
  }
}

function drawBug(shape: BugShape, id: string): HTMLCanvasElement {
  const [cv, g] = mk();
  switch (shape) {
    case "ant": {
      const known = id.includes("ari") || id.includes("ant");
      const col = known ? "#4a3434" : `hsl(${hashHue(id)},45%,40%)`;
      legs(g, [[8, 62, 36, 46], [9, 66, 40, 70], [8, 70, 34, 92]]);
      antennae(g, 96, 22, 22);
      ell(g, 64, 36, 19, 24);
      fs(g, col, () => { ell(g, 58, 28, 7, 10); g.fillStyle = "rgba(255,255,255,0.25)"; g.fill(); });
      ell(g, 64, 66, 11, 11);
      fs(g, col);
      ell(g, 64, 90, 16, 14);
      fs(g, col);
      bugEyes(g, 92, 7, 5.5);
      break;
    }
    case "mosquito": {
      for (const [a, b, c, d] of [[6, 66, 44, 40], [6, 70, 48, 78], [6, 74, 38, 110]]) {
        line(g, [64 + a, b, 64 + c, d], 3);
        line(g, [64 - a, b, 64 - c, d], 3);
      }
      wings(g, "rgba(210,235,255,0.75)");
      ell(g, 64, 42, 9, 22);
      fs(g, "#6d6a7c", () => {
        for (const y of [30, 40, 50]) line(g, [52, y, 76, y], 3, "rgba(255,255,255,0.5)");
      });
      ell(g, 64, 70, 10, 9);
      fs(g, "#6d6a7c");
      line(g, [64, 92, 64, 120], 3);
      ell(g, 64, 86, 11, 9);
      fs(g, "#7d7a8c");
      bugEyes(g, 86, 6, 5);
      break;
    }
    case "roach": {
      legs(g, [[16, 58, 44, 36], [18, 70, 48, 72], [16, 82, 42, 106]]);
      for (const s of [-1, 1]) curve(g, 64 + s * 6, 104, 64 + s * 30, 118, 64 + s * 50, 100, 3.5);
      ell(g, 64, 58, 27, 40);
      fs(g, "#8a4a26", () => {
        line(g, [64, 30, 64, 96], 3, "rgba(60,25,10,0.6)");
        ell(g, 52, 44, 8, 18, 0.15);
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.fill();
      });
      ell(g, 64, 96, 22, 13);
      fs(g, "#6b3519", () => { ell(g, 64, 94, 12, 6); g.fillStyle = "#c98a4a"; g.fill(); });
      bugEyes(g, 101, 8, 5);
      break;
    }
    case "stinkbug": {
      legs(g, [[14, 56, 40, 44], [16, 68, 44, 74], [14, 80, 38, 100]]);
      antennae(g, 98, 26, 18);
      poly(g, [30, 50, 98, 50, 92, 74, 64, 100, 36, 74]);
      fs(g, "#6aa84f", () => {
        poly(g, [46, 54, 82, 54, 64, 86]);
        g.fillStyle = "#86c46a";
        g.fill();
        rr(g, 28, 24, 72, 28, 10);
        g.fillStyle = "#5a9442";
        g.fill();
      });
      rr(g, 30, 22, 68, 30, 12);
      fs(g, "#5a9442");
      ell(g, 64, 98, 12, 10);
      fs(g, "#5a9442");
      bugEyes(g, 98, 6, 4.5);
      // におい
      for (const x of [40, 88]) curve(g, x, 18, x + 6, 10, x, 2, 3, "rgba(160,190,90,0.8)");
      break;
    }
    case "spider": {
      const pairs: [number, number, number, number][] = [[10, 70, 46, 46], [12, 74, 52, 66], [12, 78, 50, 92], [10, 82, 40, 112]];
      for (const [x0, y0, x1, y1] of pairs) {
        for (const s of [-1, 1]) {
          line(g, [64 + s * x0, y0, 64 + s * (x1 - 4), y0 - 18 + (y1 - y0) * 0.3, 64 + s * x1, y1], 5);
        }
      }
      ell(g, 64, 46, 26, 28);
      fs(g, "#5d4b72", () => {
        poly(g, [64, 30, 72, 44, 64, 58, 56, 44]);
        g.fillStyle = "#f2c12e";
        g.fill();
      });
      ell(g, 64, 82, 18, 16);
      fs(g, "#4c3c60");
      bugEyes(g, 86, 7, 5.5);
      dot(g, 56, 77, 2.2, "#fff");
      dot(g, 72, 77, 2.2, "#fff");
      break;
    }
    case "caterpillar":
    case "centipede": {
      const centi = shape === "centipede";
      const body = centi ? "#b04a2a" : "#8bc34a";
      const alt = centi ? "#8a3418" : "#7cb342";
      const ys = [18, 34, 50, 66, 82];
      if (centi) for (const y of ys) {
        line(g, [52, y, 30, y + 6], 4);
        line(g, [76, y, 98, y + 6], 4);
        line(g, [52, y, 30, y + 6], 2, "#f2c12e");
        line(g, [76, y, 98, y + 6], 2, "#f2c12e");
      }
      for (let i = 0; i < ys.length; i++) {
        const x = 64 + Math.sin(i * 1.3) * 5;
        ell(g, x, ys[i], 16, 13);
        fs(g, i % 2 ? alt : body, () => {
          if (!centi) dot(g, x + 6, ys[i] - 3, 3, "#f7d34a");
        });
        if (!centi) for (const s of [-1, 1]) dot(g, x + s * 15, ys[i] + 6, 3.5, OL);
      }
      ell(g, 64, 100, 20, 17);
      fs(g, centi ? "#d0602e" : "#a5d66a");
      if (centi) for (const s of [-1, 1]) curve(g, 64 + s * 8, 114, 64 + s * 16, 122, 64 + s * 22, 116, 4);
      else antennae(g, 90, 18, -14, 3.5);
      bugEyes(g, 100, 8, 6, centi);
      blush(g, 48, 108, 4);
      blush(g, 80, 108, 4);
      break;
    }
    case "beetle":
    case "horned": {
      const horned = shape === "horned";
      const col = horned ? "#6d3b1e" : "#3f9b6b";
      const hi = horned ? "rgba(255,200,150,0.35)" : "rgba(200,255,220,0.45)";
      legs(g, [[16, 54, 46, 38], [18, 68, 50, 70], [16, 80, 44, 102]]);
      if (horned) {
        line(g, [64, 96, 64, 124], 12);
        line(g, [64, 96, 64, 122], 6, "#5a2e15");
        line(g, [56, 122, 72, 122], 8);
      } else antennae(g, 98, 20, 16);
      ell(g, 64, 52, 30, 36);
      fs(g, col, () => {
        line(g, [64, 18, 64, 88], 3.5, "rgba(30,20,10,0.55)");
        ell(g, 50, 40, 8, 16, 0.2);
        g.fillStyle = hi;
        g.fill();
      });
      ell(g, 64, 90, 20, 13);
      fs(g, horned ? "#5a2e15" : "#2f7d55");
      bugEyes(g, 96, 9, 5, horned);
      break;
    }
    case "termite": {
      // シロアリ: 白っぽいクリーム色・大きな頭とあご（かじる）
      legs(g, [[8, 56, 34, 44], [9, 62, 38, 64], [8, 68, 32, 86]], 4);
      antennae(g, 102, 20, 16, 3.5);
      ell(g, 64, 34, 17, 26);
      fs(g, "#f1e3c4", () => {
        for (const y of [22, 32, 42]) line(g, [52, y, 76, y], 2.5, "rgba(150,120,80,0.45)");
      });
      ell(g, 64, 62, 10, 9);
      fs(g, "#ead7b0");
      ell(g, 64, 88, 17, 15);
      fs(g, "#e2a85a");
      // あご（ぎざぎざ）
      for (const sx of [-1, 1]) {
        curve(g, 64 + sx * 6, 100, 64 + sx * 14, 112, 64 + sx * 4, 120, 4.5);
      }
      bugEyes(g, 88, 7, 4);
      break;
    }
    case "fly": {
      // ハエ: まるい黒い体・大きな赤い目・すきとおった羽
      for (const [a, b, c, d] of [[10, 62, 40, 48], [12, 68, 44, 72], [10, 74, 36, 98]]) {
        line(g, [64 + a, b, 64 + c, d], 3.5);
        line(g, [64 - a, b, 64 - c, d], 3.5);
      }
      for (const sx of [-1, 1]) {
        ell(g, 64 + sx * 26, 46, 24, 14, sx * -0.35);
        fs(g, "rgba(215,230,240,0.7)", () => line(g, [64 + sx * 10, 48, 64 + sx * 44, 40], 2, "rgba(120,140,160,0.6)"), 4);
      }
      ell(g, 64, 50, 20, 24);
      fs(g, "#3c3f48", () => {
        for (const y of [38, 50]) line(g, [48, y, 80, y], 3, "rgba(140,200,160,0.55)");
      });
      ell(g, 64, 84, 18, 15);
      fs(g, "#4a4d58");
      for (const sx of [-1, 1]) { ell(g, 64 + sx * 13, 92, 10, 11); fs(g, "#c8392f", () => dot(g, 64 + sx * 15, 88, 3, "rgba(255,255,255,0.8)"), 3.5); }
      break;
    }
    case "pillbug": {
      // ダンゴムシ: 灰色のかたいからが何枚も重なる
      legs(g, [[22, 44, 40, 40], [24, 58, 44, 58], [24, 72, 44, 76], [22, 86, 40, 92]], 3.5);
      antennae(g, 104, 22, 12, 3.5);
      ell(g, 64, 62, 30, 44);
      fs(g, "#7d8794", () => {
        for (let k = 0; k < 6; k++) {
          const y = 28 + k * 12;
          curve(g, 36, y + 4, 64, y - 6, 92, y + 4, 3, "rgba(40,45,55,0.55)");
        }
        ell(g, 52, 40, 8, 16, 0.2);
        g.fillStyle = "rgba(255,255,255,0.28)";
        g.fill();
      });
      ell(g, 64, 102, 16, 9);
      fs(g, "#69727e");
      bugEyes(g, 101, 7, 3.8);
      break;
    }
    case "stag": {
      // クワガタ: こげ茶のつやつや・大きなはさみのあご
      legs(g, [[16, 50, 46, 36], [18, 64, 50, 66], [16, 76, 44, 100]]);
      for (const sx of [-1, 1]) {
        curve(g, 64 + sx * 10, 96, 64 + sx * 30, 112, 64 + sx * 10, 126, 8);
        curve(g, 64 + sx * 10, 96, 64 + sx * 30, 112, 64 + sx * 10, 126, 4, "#3a1e10");
        line(g, [64 + sx * 24, 110, 64 + sx * 16, 112], 3);
      }
      ell(g, 64, 48, 28, 34);
      fs(g, "#4a2a18", () => {
        line(g, [64, 16, 64, 80], 3.5, "rgba(0,0,0,0.5)");
        ell(g, 50, 36, 7, 15, 0.2);
        g.fillStyle = "rgba(255,210,170,0.35)";
        g.fill();
      });
      rr(g, 42, 80, 44, 18, 8);
      fs(g, "#3a1e10");
      bugEyes(g, 90, 14, 4.5, true);
      break;
    }
    case "geji": {
      // ゲジ: うすい黄土色・とても長い足がたくさん
      for (let k = 0; k < 7; k++) {
        const y = 30 + k * 11, len = 46 + (k % 2) * 6;
        for (const sx of [-1, 1]) curve(g, 64 + sx * 8, y, 64 + sx * (len * 0.6), y - 12, 64 + sx * len, y + 14, 2.5);
      }
      for (let k = 0; k < 6; k++) {
        ell(g, 64, 32 + k * 12, 9, 7);
        fs(g, k % 2 ? "#c9a46a" : "#b8925a", () => dot(g, 64, 30 + k * 12, 2.2, "#6b4a2a"), 3);
      }
      ell(g, 64, 102, 10, 9);
      fs(g, "#c9a46a");
      antennae(g, 108, 30, 16, 2.5);
      bugEyes(g, 102, 5, 3.2);
      break;
    }
    case "hornet": {
      wings(g, "rgba(220,235,255,0.8)");
      legs(g, [[8, 70, 30, 60], [9, 74, 32, 84], [8, 78, 26, 100]], 4);
      line(g, [64, 14, 64, 4], 5);
      ell(g, 64, 38, 21, 26);
      fs(g, "#f2c12e", () => {
        for (const y of [22, 36, 50]) { rr(g, 30, y, 68, 7, 3); g.fillStyle = "#3a2a1a"; g.fill(); }
      });
      ell(g, 64, 72, 15, 12);
      fs(g, "#c9772e");
      ell(g, 64, 94, 18, 15);
      fs(g, "#f2a83a");
      antennae(g, 104, 16, 14);
      bugEyes(g, 94, 8, 6.5, true);
      break;
    }
  }
  return cv;
}

// ---------------------------------------------------------------------------
// 弾・カリカリ
// ---------------------------------------------------------------------------

/** オブジェクトごとの弾（id で決まるものは id の絵、それ以外は種類の絵）。 */
function drawShot(id: string, kind?: string): HTMLCanvasElement {
  const [cv, g] = mk();
  const glow = (color: string, r: number) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, r);
    gr.addColorStop(0, color); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill();
  };
  switch (id) {
    case "mizudeppo": {
      // 水のしずく（光って立体的に）
      path((p) => { p.moveTo(64, 18); p.bezierCurveTo(96, 60, 96, 104, 64, 106); p.bezierCurveTo(32, 104, 32, 60, 64, 18); });
      fs(g, "#6ec4f5", () => { ell(g, 54, 70, 9, 14, -0.4); g.fillStyle = "rgba(255,255,255,0.75)"; g.fill(); });
      return cv;
    }
    case "senpuki": {
      // 風のうず
      glow("rgba(200,235,255,0.9)", 54);
      for (let i = 0; i < 3; i++) curve(g, 20 + i * 6, 44 + i * 18, 64, 20 + i * 18, 108 - i * 6, 44 + i * 18, 7, i === 1 ? "#5aa8e0" : "#9fd3f5");
      return cv;
    }
    case "laser": {
      // 赤い光の点
      glow("rgba(255,60,60,0.95)", 58);
      dot(g, 64, 64, 18, "#ff3b3b");
      dot(g, 60, 60, 8, "#fff2f2");
      return cv;
    }
    case "oyatsu": case "esara": break;
  }
  return drawProjectile(kind ?? id);
}

function drawProjectile(kind: string): HTMLCanvasElement {
  const [cv, g] = mk();
  switch (kind) {
    case "cat": {
      // 毛糸玉
      ell(g, 64, 64, 40, 40);
      fs(g, "#f58fb0", () => {
        for (const d of [-20, 0, 20]) curve(g, 24, 64 + d, 64, 40 + d, 104, 64 + d, 4, "#d6658e");
      }, 8);
      break;
    }
    case "shooter": {
      g.beginPath();
      g.ellipse(64, 64, 40, 22, 0, 0, Math.PI * 2);
      g.lineWidth = 22;
      g.strokeStyle = OL;
      g.stroke();
      g.lineWidth = 12;
      g.strokeStyle = "#f2783a";
      g.stroke();
      break;
    }
    case "slow": {
      path((p) => {
        p.moveTo(64, 14);
        p.quadraticCurveTo(108, 70, 64, 112);
        p.quadraticCurveTo(20, 70, 64, 14);
      });
      fs(g, "#8fd0ff", () => { dot(g, 52, 70, 10, "rgba(255,255,255,0.6)"); }, 8);
      break;
    }
    default: {
      ell(g, 64, 64, 32, 32);
      fs(g, "#fff6c8", undefined, 8);
    }
  }
  return cv;
}

function drawKibble(): HTMLCanvasElement {
  const [cv, g] = mk();
  // 魚の形のカリカリ3つ
  const pieces: [number, number, number, string][] = [[44, 74, -0.4, "#c47a3a"], [82, 76, 0.5, "#b0662c"], [62, 46, 0.1, "#d38a48"]];
  for (const [x, y, a, col] of pieces) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath();
    g.ellipse(-4, 0, 22, 15, 0, 0, Math.PI * 2);
    g.moveTo(14, 0);
    g.lineTo(30, -13);
    g.lineTo(30, 13);
    g.closePath();
    fs(g, col, undefined, 6);
    dot(g, -14, -3, 3.5, OL);
    g.restore();
  }
  return cv;
}

// ---------------------------------------------------------------------------
// 家具（ステージの障害物）。大きさ（w×h マス）がいろいろなので、キャッシュの絵ではなく、渡された箱にそのまま描く。
// 上から少しななめに見た形（上の面＋手前の面）。PNG の差しかえは "furn_<kind>"（箱に収まるように、縦横比はそのまま）。
// ---------------------------------------------------------------------------

/** 向きのある家具（縦長の箱のときは 90 度まわして描く）。 */
const FURN_ORIENTED = new Set([
  "sofa", "bed", "counter", "tv", "desk", "shelf", "bookshelf", "partition", "piano", "bathtub", "tansu", "stove", "sink", "table",
]);

/** 家具の PNG（"furn_<kind>"）があれば返す。 */
export function getFurnitureOverride(kind: string): HTMLImageElement | null {
  return overrides.get(`furn_${kind}`) ?? null;
}

/** 決まった乱数（家具の模様が毎回同じになるように）。 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 家具を、箱 (l, t, w, h)（CSS px）に描く。u はマスの大きさ（px）。faceLeft なら、縦長のときに手前を左へ向ける。
 * 影は呼ぶ側で描く。g の状態（transform など）は元に戻す。
 */
export function drawFurniture(g: G, kind: string, l: number, t: number, w: number, h: number, u: number, faceLeft = false, seed = 1): void {
  const ov = getFurnitureOverride(kind);
  if (ov && ov.naturalWidth > 0) {
    const k = Math.min(w / ov.naturalWidth, h / ov.naturalHeight);
    const iw = ov.naturalWidth * k, ih = ov.naturalHeight * k;
    g.drawImage(ov, l + (w - iw) / 2, t + (h - ih) / 2, iw, ih);
    return;
  }
  g.save();
  g.lineJoin = "round";
  g.lineCap = "round";
  let W = w, H = h;
  if (FURN_ORIENTED.has(kind) && h > w * 1.2) {
    // 縦長: まわして、横長として描く
    g.translate(l + w / 2, t + h / 2);
    g.rotate(faceLeft ? Math.PI / 2 : -Math.PI / 2);
    W = h; H = w;
    g.translate(-W / 2, -H / 2);
  } else {
    g.translate(l, t);
  }
  furnitureBody(g, kind, W, H, u, seeded(seed * 7919 + kind.length * 31));
  g.restore();
}

const FOL = "#3a2214";

function furnitureBody(g: G, kind: string, w: number, h: number, u: number, rnd: () => number): void {
  const lw = Math.max(1.2, u * 0.055);
  const m = Math.min(w, h);
  const rad = Math.max(2, u * 0.12);
  const R = (x: number, y: number, ww: number, hh: number, fill: string, r = rad) => {
    g.beginPath(); g.roundRect(x, y, Math.max(0.5, ww), Math.max(0.5, hh), Math.min(r, ww / 2, hh / 2)); g.fillStyle = fill; g.fill();
    g.lineWidth = lw; g.strokeStyle = FOL; g.stroke();
  };
  const F = (x: number, y: number, ww: number, hh: number, fill: string, r = 0) => {
    g.beginPath(); g.roundRect(x, y, Math.max(0.5, ww), Math.max(0.5, hh), Math.min(r, ww / 2, hh / 2)); g.fillStyle = fill; g.fill();
  };
  const E = (x: number, y: number, rx: number, ry: number, fill: string, stroke = true) => {
    g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
    if (stroke) { g.lineWidth = lw; g.strokeStyle = FOL; g.stroke(); }
  };
  const Ln = (x0: number, y0: number, x1: number, y1: number, color: string, width = lw) => {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = color; g.lineWidth = width; g.stroke();
  };
  /** 上の面＋手前の面（fh = 手前の面の高さ）。 */
  const slab = (x: number, y: number, ww: number, hh: number, fh: number, top: string, front: string, r = rad) => {
    R(x, y + hh - fh - r, ww, fh + r, front, r);
    R(x, y, ww, hh - fh, top, r);
  };
  const shine = (x: number, y: number, ww: number, hh: number) => F(x, y, ww, hh, "rgba(255,255,255,0.28)", hh / 2);
  const cellsW = Math.max(1, Math.round(w / u)), cellsH = Math.max(1, Math.round(h / u));

  switch (kind) {
    case "table": {
      const fh = Math.min(h * 0.16, u * 0.2);
      // 脚
      for (const x of [w * 0.1, w * 0.86]) F(x, h - fh * 1.2, w * 0.05, fh * 1.2, "#5a3418");
      slab(0, 0, w, h - fh * 0.2, fh, "#b97a46", "#7f4c26");
      for (let k = 1; k < 4; k++) Ln(w * 0.06, (h - fh) * (k / 4), w * 0.94, (h - fh) * (k / 4) + (rnd() - 0.5) * 2, "rgba(90,50,20,0.25)", lw * 0.8);
      // テーブルクロスのランナー
      F(w * 0.08, (h - fh) * 0.36, w * 0.84, (h - fh) * 0.26, "rgba(255,240,220,0.55)");
      const n = Math.max(1, Math.min(4, cellsW));
      for (let k = 0; k < n; k++) {
        const cx = w * ((k + 0.5) / n), cy = (h - fh) * (k % 2 ? 0.62 : 0.36);
        E(cx, cy, m * 0.13, m * 0.1, "#fff8ec");
        E(cx, cy, m * 0.07, m * 0.05, k % 2 ? "#f2a65a" : "#e86a6a", false);
      }
      E(w * 0.82, (h - fh) * 0.25, m * 0.06, m * 0.06, "#7cc3f0");
      break;
    }
    case "plant": {
      const nx = Math.min(3, cellsW), ny = Math.min(2, cellsH);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cw = w / nx, ch = h / ny;
        const cx = cw * (i + 0.5), cy = ch * (j + 0.5);
        const s = Math.min(cw, ch);
        // 鉢
        g.beginPath();
        g.moveTo(cx - s * 0.24, cy + s * 0.08); g.lineTo(cx + s * 0.24, cy + s * 0.08);
        g.lineTo(cx + s * 0.18, cy + s * 0.44); g.lineTo(cx - s * 0.18, cy + s * 0.44); g.closePath();
        g.fillStyle = (i + j) % 2 ? "#d88a55" : "#c8794a"; g.fill(); g.lineWidth = lw; g.strokeStyle = FOL; g.stroke();
        F(cx - s * 0.26, cy + s * 0.04, s * 0.52, s * 0.08, "#e09a66", 2);
        // 葉
        const leaves: [number, number, number, string][] = [[0, -0.16, 0.25, "#5fa85a"], [-0.2, -0.02, 0.19, "#4f9a4c"], [0.2, -0.03, 0.19, "#6ab866"], [0, -0.36, 0.16, "#7cc576"], [-0.12, -0.28, 0.13, "#5fa85a"]];
        for (const [dx, dy, r, c] of leaves) E(cx + dx * s, cy + dy * s, r * s, r * s * 0.9, c);
        Ln(cx, cy - s * 0.3, cx, cy + s * 0.05, "rgba(40,80,30,0.5)", lw);
      }
      break;
    }
    case "shelf": {
      const fh = h * 0.55;
      slab(0, 0, w, h, fh, "#93603a", "#7a4a2a");
      // 上の面の小物
      const n = Math.max(2, cellsW * 2);
      for (let k = 0; k < n; k++) {
        const x = w * ((k + 0.5) / n), y = (h - fh) * 0.5;
        if (k % 3 === 0) E(x, y, m * 0.09, m * 0.09, "#7cc576");
        else if (k % 3 === 1) R(x - m * 0.08, y - m * 0.1, m * 0.16, m * 0.18, "#fff3d6", 2);
        else E(x, y, m * 0.07, m * 0.05, "#f7d34a");
      }
      // 手前: 2段の本
      const y0 = h - fh + fh * 0.12;
      for (let row = 0; row < 2; row++) {
        const yy = y0 + row * fh * 0.42, bh = fh * 0.34;
        F(w * 0.05, yy - 1, w * 0.9, bh + 2, "#4f2c16");
        const nb = Math.max(4, Math.round(w / (u * 0.2)));
        for (let j = 0; j < nb; j++) {
          const bw = (w * 0.9) / nb;
          const hh = bh * (0.7 + rnd() * 0.3);
          F(w * 0.05 + j * bw + 0.5, yy + bh - hh, bw - 1.2, hh, ["#e86a6a", "#6ab0e8", "#f2c14e", "#7cc576", "#c08af0"][(j + row * 2) % 5]);
        }
      }
      break;
    }
    case "sofa": {
      const fh = Math.min(h * 0.2, u * 0.25), arm = Math.min(w * 0.14, m * 0.24);
      slab(0, 0, w, h, fh, "#5a74a8", "#3f5788");
      // 背もたれ
      R(arm * 0.4, h * 0.02, w - arm * 0.8, h * 0.3, "#4a6398");
      // ひじかけ
      R(0, h * 0.08, arm, h - fh - h * 0.06, "#6680b8");
      R(w - arm, h * 0.08, arm, h - fh - h * 0.06, "#6680b8");
      // 座るところ
      const n = Math.max(1, cellsW);
      const sx = arm, sw = (w - arm * 2) / n;
      for (let k = 0; k < n; k++) {
        R(sx + k * sw + 1, h * 0.3, sw - 2, h * 0.62 - fh, "#7390c8");
        shine(sx + k * sw + sw * 0.15, h * 0.36, sw * 0.5, Math.max(2, h * 0.06));
      }
      // クッション
      E(arm + m * 0.3, h * 0.24, m * 0.2, m * 0.14, "#f5a6c0");
      if (n > 1) E(w - arm - m * 0.3, h * 0.24, m * 0.2, m * 0.14, "#f7d34a");
      break;
    }
    case "basket": {
      // 大きい箱には、かごをいくつか（横は2つ・縦は2つまで）
      const nx = Math.min(2, cellsW), ny = Math.min(2, cellsH);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const bw = w / nx, bh = h / ny, x0 = bw * i, y0 = bh * j, bm = Math.min(bw, bh);
        const cx = x0 + bw / 2, cy = y0 + bh / 2;
        R(x0 + bw * 0.08, y0 + bh * 0.16, bw * 0.84, bh * 0.76, "#d9a85e", bm * 0.2);
        // あみめ
        g.save();
        g.beginPath(); g.roundRect(x0 + bw * 0.08, y0 + bh * 0.16, bw * 0.84, bh * 0.76, bm * 0.2); g.clip();
        for (let y = y0 + bh * 0.2; y < y0 + bh; y += bm * 0.12) Ln(x0, y, x0 + bw, y, "rgba(120,70,20,0.45)", lw * 0.8);
        for (let x = x0 + bw * 0.1; x < x0 + bw; x += bm * 0.14) Ln(x, y0 + bh * 0.16, x, y0 + bh, "rgba(255,230,170,0.35)", lw * 0.7);
        g.restore();
        // ふち
        R(x0 + bw * 0.04, y0 + bh * 0.1, bw * 0.92, bh * 0.16, "#c8904a", bm * 0.08);
        // 洗たく物
        E(cx - bm * 0.16, cy - bm * 0.12, bm * 0.2, bm * 0.13, (i + j) % 2 ? "#c9f0a0" : "#8fd0ff");
        E(cx + bm * 0.14, cy - bm * 0.16, bm * 0.17, bm * 0.12, "#ffb3c8");
      }
      break;
    }
    case "bed": {
      const fh = Math.min(h * 0.12, u * 0.18);
      slab(0, 0, w, h, fh, "#a86b3c", "#7a4a26");
      // ヘッドボード
      R(0, 0, w, h * 0.14, "#8a5530");
      // マットレス
      R(w * 0.05, h * 0.12, w * 0.9, h * 0.82 - fh, "#fbf6ee");
      // まくら
      const np = w > u * 1.6 ? 2 : 1;
      for (let k = 0; k < np; k++) {
        const pw = (w * 0.8) / np;
        R(w * 0.1 + k * pw + pw * 0.06, h * 0.16, pw * 0.88, h * 0.18, "#ffffff", m * 0.1);
      }
      // 掛けぶとん（水玉）
      const by = h * 0.4;
      g.save();
      g.beginPath(); g.roundRect(w * 0.04, by, w * 0.92, h - by - fh * 0.8, rad); g.closePath();
      g.fillStyle = "#f39bb0"; g.fill(); g.lineWidth = lw; g.strokeStyle = FOL; g.stroke();
      g.clip();
      for (let y = by + m * 0.12; y < h; y += m * 0.22) for (let x = w * 0.08 + ((y / (m * 0.22)) % 2) * m * 0.11; x < w; x += m * 0.22) E(x, y, m * 0.04, m * 0.04, "rgba(255,255,255,0.7)", false);
      g.restore();
      F(w * 0.04, by, w * 0.92, Math.max(2, h * 0.07), "#ffd0dc", 2);
      break;
    }
    case "counter":
    case "sink":
    case "stove": {
      const fh = h * 0.42;
      slab(0, 0, w, h, fh, kind === "stove" ? "#d9dde3" : "#ece6da", "#c9a27a");
      // 手前のとびら
      const nd = Math.max(1, cellsW);
      for (let k = 0; k < nd; k++) {
        const dw = w / nd;
        R(k * dw + dw * 0.08, h - fh + fh * 0.12, dw * 0.84, fh * 0.72, "#d8b48a", 3);
        E(k * dw + dw * (k % 2 ? 0.2 : 0.8), h - fh * 0.5, m * 0.035, m * 0.035, "#f2e2c0");
      }
      const th = h - fh;
      if (kind === "sink") {
        const bw = Math.min(w * 0.6, u * 1.2), bx = (w - bw) / 2;
        R(bx, th * 0.18, bw, th * 0.66, "#b9c3cc", m * 0.12);
        F(bx + bw * 0.1, th * 0.26, bw * 0.8, th * 0.5, "#9aa8b4", m * 0.08);
        E(bx + bw / 2, th * 0.5, m * 0.04, m * 0.04, "#5a6470", false);
        // 蛇口
        g.beginPath(); g.moveTo(bx + bw / 2, th * 0.12); g.quadraticCurveTo(bx + bw / 2, -th * 0.05, bx + bw / 2 + m * 0.14, th * 0.08);
        g.lineWidth = lw * 3; g.strokeStyle = FOL; g.stroke(); g.lineWidth = lw * 1.6; g.strokeStyle = "#dfe6ec"; g.stroke();
        // スポンジ
        R(bx + bw + m * 0.06, th * 0.3, m * 0.18, m * 0.12, "#f7d34a", 2);
        F(bx + bw + m * 0.06, th * 0.3, m * 0.18, m * 0.05, "#7cc576");
      } else if (kind === "stove") {
        const nb = Math.min(4, Math.max(2, cellsW * cellsH));
        const cols = nb > 2 ? 2 : nb, rows = nb > 2 ? 2 : 1;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const cx = w * ((i + 0.5) / cols), cy = th * ((j + 0.5) / rows);
          const r = Math.min(w / cols, th / rows) * 0.32;
          E(cx, cy, r, r * 0.8, "#3a3e46");
          g.beginPath(); g.ellipse(cx, cy, r * 0.6, r * 0.48, 0, 0, Math.PI * 2); g.strokeStyle = "#7a808a"; g.lineWidth = lw; g.stroke();
          if (i === 0 && j === 0) {
            // おなべ
            E(cx, cy - r * 0.15, r * 0.95, r * 0.75, "#e8524a");
            E(cx, cy - r * 0.3, r * 0.65, r * 0.42, "#c2403a", false);
            E(cx, cy - r * 0.35, r * 0.15, r * 0.12, "#f2e2c0");
          }
        }
        for (let k = 0; k < Math.min(4, nd * 2); k++) E(w * ((k + 0.5) / Math.min(4, nd * 2)), h - fh * 0.92, m * 0.04, m * 0.04, "#5a5f6a");
      } else {
        // まな板とやかん
        R(w * 0.12, th * 0.25, Math.min(w * 0.35, u * 0.7), th * 0.5, "#e8c48c", 3);
        E(w * 0.18 + Math.min(w * 0.35, u * 0.7) * 0.6, th * 0.5, m * 0.06, m * 0.04, "#7cc576", false);
        if (w > u * 1.4) { E(w * 0.75, th * 0.5, m * 0.16, m * 0.14, "#bcd4ea"); E(w * 0.75, th * 0.42, m * 0.05, m * 0.04, FOL, false); }
      }
      break;
    }
    case "fridge": {
      const fh = h * 0.62;
      slab(w * 0.04, 0, w * 0.92, h, fh, "#f4f6f8", "#e2e8ee");
      // 冷凍庫とのさかい
      Ln(w * 0.06, h - fh * 0.66, w * 0.94, h - fh * 0.66, FOL, lw);
      // とって
      R(w * 0.78, h - fh * 0.92, Math.max(2, w * 0.06), fh * 0.2, "#b9c3cc", 2);
      R(w * 0.78, h - fh * 0.56, Math.max(2, w * 0.06), fh * 0.3, "#b9c3cc", 2);
      // マグネット・メモ
      R(w * 0.2, h - fh * 0.5, m * 0.22, m * 0.18, "#fff6c8", 1);
      E(w * 0.31, h - fh * 0.5, m * 0.04, m * 0.04, "#e86a6a", false);
      E(w * 0.35, h - fh * 0.86, m * 0.05, m * 0.05, "#7cc3f0");
      shine(w * 0.12, h * 0.04, w * 0.5, Math.max(2, (h - fh) * 0.3));
      break;
    }
    case "tv": {
      const fh = Math.min(h * 0.3, u * 0.32);
      slab(0, h * 0.35, w, h * 0.65, fh, "#93603a", "#6b4228");
      // 引き出し
      const nd = Math.max(2, cellsW);
      for (let k = 0; k < nd; k++) E(w * ((k + 0.5) / nd), h - fh * 0.5, m * 0.035, m * 0.035, "#e2c79c");
      // テレビ（奥に立っている）
      const tw = w * 0.8, tx = (w - tw) / 2, ty = 0, thh = h * 0.5;
      F(w / 2 - w * 0.06, ty + thh - 2, w * 0.12, h * 0.1, "#2b2430");
      R(tx, ty, tw, thh, "#2b2430", 3);
      F(tx + tw * 0.05, ty + thh * 0.12, tw * 0.9, thh * 0.72, "#3d5a80", 2);
      g.beginPath(); g.moveTo(tx + tw * 0.12, ty + thh * 0.2); g.lineTo(tx + tw * 0.3, ty + thh * 0.2); g.lineTo(tx + tw * 0.16, ty + thh * 0.72); g.lineTo(tx + tw * 0.08, ty + thh * 0.72); g.closePath();
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fill();
      break;
    }
    case "desk": {
      const fh = Math.min(h * 0.22, u * 0.28);
      slab(0, 0, w, h, fh, "#b98a56", "#8a5a34");
      // 引き出し
      R(w * 0.62, h - fh * 0.92, w * 0.32, fh * 0.75, "#9a6a40", 2);
      E(w * 0.78, h - fh * 0.55, m * 0.03, m * 0.03, "#f2e2c0", false);
      const th = h - fh;
      // ノートパソコン
      const lw2 = Math.min(w * 0.36, u * 0.75);
      R(w * 0.1, th * 0.12, lw2, th * 0.36, "#5a6470", 2);
      F(w * 0.1 + lw2 * 0.08, th * 0.16, lw2 * 0.84, th * 0.26, "#8fd0ff", 1);
      R(w * 0.08, th * 0.48, lw2 + w * 0.04, th * 0.22, "#c9ced6", 2);
      // ノート・えんぴつ立て
      R(w * 0.55, th * 0.3, Math.min(w * 0.18, u * 0.4), th * 0.45, "#fff8ec", 1);
      Ln(w * 0.57, th * 0.42, w * 0.55 + Math.min(w * 0.18, u * 0.4) * 0.8, th * 0.42, "rgba(90,140,200,0.6)", lw * 0.7);
      E(w * 0.86, th * 0.32, m * 0.08, m * 0.08, "#e86a6a");
      Ln(w * 0.84, th * 0.32, w * 0.82, th * 0.1, "#f7d34a", lw * 1.4);
      Ln(w * 0.88, th * 0.32, w * 0.9, th * 0.12, "#6ab0e8", lw * 1.4);
      break;
    }
    case "chair": {
      const nx = Math.min(3, cellsW), ny = Math.min(3, cellsH);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cw = w / nx, ch = h / ny, x = cw * i, y = ch * j;
        const s = Math.min(cw, ch);
        const ox = x + (cw - s) / 2, oy = y + (ch - s) / 2;
        for (const lx of [0.2, 0.74]) F(ox + s * lx, oy + s * 0.7, s * 0.07, s * 0.24, "#6b4228");
        R(ox + s * 0.14, oy + s * 0.36, s * 0.72, s * 0.42, "#c98e5a");
        F(ox + s * 0.2, oy + s * 0.42, s * 0.6, s * 0.12, "rgba(255,255,255,0.25)", 3);
        R(ox + s * 0.16, oy + s * 0.06, s * 0.68, s * 0.3, "#b07a4a");
        Ln(ox + s * 0.36, oy + s * 0.1, ox + s * 0.36, oy + s * 0.32, "rgba(60,30,10,0.4)");
        Ln(ox + s * 0.64, oy + s * 0.1, ox + s * 0.64, oy + s * 0.32, "rgba(60,30,10,0.4)");
      }
      break;
    }
    case "bookshelf":
    case "tansu": {
      const fh = h * 0.68;
      const tansu = kind === "tansu";
      slab(0, 0, w, h, fh, tansu ? "#a8703e" : "#8a5530", tansu ? "#8f5a2e" : "#6b3f20");
      const top = h - fh;
      if (tansu) {
        const cols = Math.max(1, Math.min(3, cellsW)), rows = Math.max(2, Math.min(4, Math.round(fh / (u * 0.28))));
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const dw = w / cols, dh = (fh * 0.9) / rows;
          const x = i * dw + dw * 0.06, y = top + fh * 0.04 + j * dh + dh * 0.08;
          R(x, y, dw * 0.88, dh * 0.84, "#b57e48", 2);
          g.beginPath(); g.arc(x + dw * 0.44, y + dh * 0.42, Math.max(1.5, m * 0.05), 0, Math.PI); g.strokeStyle = "#3a2a1a"; g.lineWidth = lw * 1.2; g.stroke();
        }
        // 上の面の小物（ねこの置物）
        E(w * 0.25, top * 0.55, m * 0.08, m * 0.07, "#fffaf2");
      } else {
        const rows = Math.max(2, Math.min(5, Math.round(fh / (u * 0.32))));
        const sh = (fh * 0.92) / rows;
        for (let j = 0; j < rows; j++) {
          const yy = top + fh * 0.04 + j * sh;
          F(w * 0.05, yy, w * 0.9, sh - 2, "#3e2312");
          const nb = Math.max(4, Math.round(w / (u * 0.16)));
          const bw = (w * 0.9) / nb;
          for (let k = 0; k < nb; k++) {
            if (rnd() < 0.12) continue;
            const hh = (sh - 3) * (0.62 + rnd() * 0.36);
            F(w * 0.05 + k * bw + 0.4, yy + sh - 2 - hh, bw - 1, hh, ["#e86a6a", "#6ab0e8", "#f2c14e", "#7cc576", "#c08af0", "#f4a24c", "#fffaf2"][Math.floor(rnd() * 7)]);
          }
          F(w * 0.04, yy + sh - 2.5, w * 0.92, 2.5, "#8a5530");
        }
      }
      break;
    }
    case "partition": {
      const n = Math.max(2, Math.round(w / (u * 0.7)));
      const pw = w / n;
      for (let k = 0; k < n; k++) {
        const x = k * pw;
        const dy = k % 2 ? h * 0.12 : 0;
        R(x + 0.5, dy + h * 0.04, pw - 1, h * 0.84, k % 2 ? "#e9dcc4" : "#f6eedd", 2);
        // しょうじのます目
        g.strokeStyle = "rgba(120,80,40,0.45)"; g.lineWidth = Math.max(0.8, lw * 0.6);
        g.beginPath();
        for (let i = 1; i < 3; i++) { g.moveTo(x + (pw * i) / 3, dy + h * 0.08); g.lineTo(x + (pw * i) / 3, dy + h * 0.84); }
        for (let i = 1; i < 4; i++) { g.moveTo(x + 2, dy + h * 0.04 + (h * 0.84 * i) / 4); g.lineTo(x + pw - 2, dy + h * 0.04 + (h * 0.84 * i) / 4); }
        g.stroke();
        F(x + 0.5, dy + h * 0.8, pw - 1, h * 0.08, "#8a5530");
      }
      break;
    }
    case "piano": {
      const fh = h * 0.36;
      slab(0, 0, w, h, fh, "#2b2430", "#1e1a22");
      shine(w * 0.08, h * 0.06, w * 0.5, Math.max(2, (h - fh) * 0.16));
      // けんばん
      const ky = h - fh - h * 0.12, kh = h * 0.2;
      R(w * 0.06, ky, w * 0.88, kh, "#fffdf6", 2);
      const nk = Math.max(7, Math.round(w / (u * 0.13)));
      const kw = (w * 0.88) / nk;
      for (let k = 1; k < nk; k++) Ln(w * 0.06 + k * kw, ky + 1, w * 0.06 + k * kw, ky + kh - 1, "rgba(40,30,30,0.35)", Math.max(0.6, lw * 0.5));
      for (let k = 0; k < nk - 1; k++) if (k % 7 !== 2 && k % 7 !== 6) F(w * 0.06 + (k + 0.65) * kw, ky + 1, kw * 0.7, kh * 0.58, "#1e1a22");
      // 楽ふ
      R(w * 0.36, h * 0.08, w * 0.28, (h - fh) * 0.4, "#fffaf0", 1);
      Ln(w * 0.39, h * 0.14, w * 0.6, h * 0.14, "rgba(40,30,30,0.5)", lw * 0.6);
      E(w * 0.48, h * 0.18, m * 0.025, m * 0.02, "#2b2430", false);
      break;
    }
    case "bathtub": {
      R(0, 0, w, h * 0.96, "#fbfbf8", m * 0.3);
      F(w * 0.02, h * 0.7, w * 0.96, h * 0.24, "rgba(0,0,0,0.06)", m * 0.2);
      R(w * 0.08, h * 0.12, w * 0.84, h * 0.66, "#8fd0ff", m * 0.24);
      // 波・あわ
      g.save();
      g.beginPath(); g.roundRect(w * 0.08, h * 0.12, w * 0.84, h * 0.66, m * 0.24); g.clip();
      for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = 0; x <= w; x += m * 0.12) { const y = h * (0.3 + k * 0.16) + Math.sin(x / (m * 0.12)) * m * 0.03; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = lw; g.stroke(); }
      for (let k = 0; k < 6; k++) E(w * (0.2 + rnd() * 0.6), h * (0.2 + rnd() * 0.5), m * (0.03 + rnd() * 0.04), m * (0.03 + rnd() * 0.04), "rgba(255,255,255,0.85)", false);
      g.restore();
      // アヒル
      const dx = w * 0.66, dy = h * 0.45, ds = m * 0.12;
      E(dx, dy, ds * 1.1, ds * 0.8, "#f7d34a");
      E(dx + ds * 0.6, dy - ds * 0.6, ds * 0.55, ds * 0.5, "#f7d34a");
      E(dx + ds * 1.1, dy - ds * 0.5, ds * 0.3, ds * 0.15, "#f2783a", false);
      // 蛇口
      R(w * 0.02, h * 0.36, w * 0.06, h * 0.2, "#b9c3cc", 2);
      break;
    }
    case "washer": {
      const fh = h * 0.6;
      slab(w * 0.04, 0, w * 0.92, h, fh, "#f4f6f8", "#e6ebf0");
      // ボタン
      for (let k = 0; k < 3; k++) E(w * (0.25 + k * 0.14), (h - fh) * 0.5, m * 0.04, m * 0.04, ["#7cc576", "#f7d34a", "#e86a6a"][k], false);
      R(w * 0.62, (h - fh) * 0.25, w * 0.26, (h - fh) * 0.5, "#9fd8ff", 2);
      // まるいとびら
      const cx = w / 2, cy = h - fh / 2, r = Math.min(w * 0.36, fh * 0.42);
      E(cx, cy, r, r, "#c9ced6");
      E(cx, cy, r * 0.76, r * 0.76, "#6ab0e8");
      g.beginPath(); g.arc(cx, cy, r * 0.5, 0.3, 2.4); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = lw * 1.3; g.stroke();
      E(cx - r * 0.2, cy + r * 0.25, r * 0.22, r * 0.14, "#ffb3c8", false);
      break;
    }
    case "kotatsu": {
      // ふとん
      R(0, 0, w, h, "#e0703e", m * 0.3);
      g.save();
      g.beginPath(); g.roundRect(0, 0, w, h, m * 0.3); g.clip();
      for (let y = m * 0.14; y < h; y += m * 0.28) for (let x = ((y / (m * 0.28)) % 2) * m * 0.14 + m * 0.1; x < w; x += m * 0.28) {
        E(x, y, m * 0.05, m * 0.05, "rgba(255,230,180,0.6)", false);
      }
      g.restore();
      // 天板
      const iw = w * 0.66, ih = h * 0.62;
      R((w - iw) / 2, (h - ih) / 2 - h * 0.03, iw, ih, "#b97a46", m * 0.08);
      F((w - iw) / 2 + iw * 0.06, (h - ih) / 2 + ih * 0.06 - h * 0.03, iw * 0.88, Math.max(2, ih * 0.1), "rgba(255,255,255,0.2)", 2);
      // みかん
      const cx = w / 2, cy = h / 2 - h * 0.03;
      R(cx - m * 0.2, cy - m * 0.1, m * 0.4, m * 0.24, "#d9a85e", m * 0.1);
      for (const [dx, dy] of [[-0.1, -0.04], [0.1, -0.05], [0, -0.13]]) {
        E(cx + dx * m, cy + dy * m, m * 0.08, m * 0.075, "#ff9a2a");
        E(cx + dx * m, cy + dy * m - m * 0.06, m * 0.02, m * 0.015, "#5fa85a", false);
      }
      break;
    }
    case "boxes": {
      const cols = Math.min(4, cellsW);
      const rows = cols * Math.min(3, cellsH) === 1 ? 2 : Math.min(3, cellsH);
      const bw = w / cols, bh = h / rows;
      const skip = cols * rows > 3 ? Math.floor(rnd() * cols * rows) : -1;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (j * cols + i === skip) continue;
        const jx = (rnd() - 0.5) * bw * 0.1, jy = (rnd() - 0.5) * bh * 0.08;
        const x = i * bw + bw * 0.05 + jx, y = j * bh + bh * 0.05 + jy, ww = bw * 0.9, hh = bh * 0.88;
        const fh = hh * 0.36;
        slab(x, y, ww, hh, fh, (i + j) % 2 ? "#e8bd82" : "#f0cb93", "#c78f4f", 2);
        F(x + ww * 0.42, y + 1, ww * 0.16, hh - fh - 1, "#efdca6");
        Ln(x + 2, y + (hh - fh) / 2, x + ww - 2, y + (hh - fh) / 2, "rgba(120,70,30,0.35)", lw * 0.7);
      }
      break;
    }
    case "pillar": {
      const s = Math.min(w, h);
      const nx = Math.max(1, Math.round(w / Math.max(1, h))), ny = Math.max(1, Math.round(h / Math.max(1, w)));
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const cx = (w / nx) * (i + 0.5), cy = (h / ny) * (j + 0.5);
        const pw = s * 0.72;
        slab(cx - pw / 2, cy - pw / 2, pw, pw, pw * 0.3, "#c08a58", "#8a5a34", 2);
        for (let k = 1; k < 4; k++) Ln(cx - pw / 2 + (pw * k) / 4, cy - pw / 2 + 2, cx - pw / 2 + (pw * k) / 4 + (rnd() - 0.5) * 2, cy + pw * 0.15, "rgba(90,50,20,0.3)", lw * 0.7);
      }
      break;
    }
    case "shoes": {
      R(w * 0.08, h * 0.3, w * 0.38, h * 0.5, "#5b6b8a", u * 0.18);
      R(w * 0.54, h * 0.25, w * 0.38, h * 0.5, "#5b6b8a", u * 0.18);
      F(w * 0.12, h * 0.34, w * 0.28, h * 0.1, "rgba(255,255,255,0.4)", 2);
      F(w * 0.58, h * 0.29, w * 0.28, h * 0.1, "rgba(255,255,255,0.4)", 2);
      break;
    }
    default: {
      R(w * 0.08, h * 0.2, w * 0.84, h * 0.65, "#d9b06a", u * 0.2);
      g.beginPath();
      for (let k = 1; k < 4; k++) { g.moveTo(w * (0.08 + k * 0.21), h * 0.22); g.lineTo(w * (0.08 + k * 0.21), h * 0.83); }
      g.strokeStyle = "rgba(74,44,29,0.5)"; g.lineWidth = lw; g.stroke();
    }
  }
}

/** 戦闘でひと休みしている猫の絵（sprites/cats/<id>_<pose>.png。カフェの絵と同じもの）。無ければ null。 */
export function getCatIdlePose(id: string, pose: "sit" | "groom"): HTMLImageElement | null {
  return idlePoses.get(`${id}_${pose}`) ?? null;
}

const idlePoses = new Map<string, HTMLImageElement>();
let idleStarted = false;
/** sprites/cats/manifest.json（["chatora_sit", …] か { "chatora": ["sit", …] }）から、座る・毛づくろいの絵を読む。 */
export function loadCatIdlePoses(base = "sprites/cats/"): void {
  if (idleStarted) return;
  idleStarted = true;
  fetch(base + "manifest.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((m: unknown) => {
      const ids: string[] = [];
      if (Array.isArray(m)) { for (const v of m) if (typeof v === "string") ids.push(v); }
      else if (m && typeof m === "object") {
        for (const [id, poses] of Object.entries(m as Record<string, unknown>)) {
          if (Array.isArray(poses)) for (const p of poses) if (typeof p === "string") ids.push(`${id}_${p}`);
        }
      }
      for (const id of ids) {
        if (!/_(sit|groom)$/.test(id)) continue;
        const img = new Image();
        img.onload = () => { idlePoses.set(id, img); version++; };
        img.src = `${base}${id}.png`;
      }
    })
    .catch(() => { /* 無ければコードの絵のまま */ });
}

/** 絵の縦横の大きさ（PNG は元の大きさ、コードの絵は SPRITE_SIZE）。 */
export function imageSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth || img.width || S, h: img.naturalHeight || img.height || S };
  if (img instanceof HTMLCanvasElement) return { w: img.width || S, h: img.height || S };
  return { w: S, h: S };
}

/** 開発用: すべての絵を並べた一覧（絵の差しかえ確認用）。 */
export function debugSpriteSheet(): HTMLCanvasElement {
  const items: [SpriteKind, string, SpriteHint?][] = [
    ["cat", "chatora"], ["cat", "mike"], ["cat", "kuro"], ["cat", "shiro"], ["cat", "hachiware"], ["cat", "sabatora"],
    ["cat", "omochi"], ["cat", "komugi"], ["catRest", "chatora"], ["catRest", "mike"], ["mama", "normal"], ["mama", "scared"],
    ["object", "wagomu"], ["object", "danboru"], ["object", "soujiki"], ["object", "tape"], ["object", "esara"], ["object", "nezumitori"],
    ["object", "mizudeppo"], ["object", "cushion"], ["object", "senpuki"], ["object", "surippa"], ["object", "oyatsu"], ["object", "kirifuki"],
    ["object", "shitajiki"], ["object", "moufu"], ["object", "katorisenko"], ["object", "spray"],
    ["bug", "ari"], ["bug", "ka"], ["bug", "gokiburi"], ["bug", "kamemushi"], ["bug", "kumo"], ["bug", "imomushi"],
    ["bug", "kogane"], ["bug", "kabuto"], ["bug", "suzumebachi"], ["bug", "mukade"], ["bug", "unknown"], ["pickup", "kibble"],
    ["bug", "shiroari"], ["bug", "hae"], ["bug", "dangomushi"], ["bug", "kuwagata"], ["bug", "gejigeji"],
    ["projectile", "cat"], ["projectile", "shooter"], ["projectile", "slow"],
  ];
  const cols = 6, cell = 100;
  // 家具（いろいろな大きさ）: 1行に 1 種類
  const fu = 30;
  const sizes: [number, number][] = [[1, 1], [2, 1], [2, 2], [3, 1], [4, 2], [1, 3], [1, 4]];
  const furnRowH = fu * 4 + 22;
  const top = Math.ceil(items.length / cols) * cell;
  const c = document.createElement("canvas");
  c.width = Math.max(cols * cell, 20 + sizes.reduce((a, [w]) => a + w * fu + 14, 0) + 80);
  c.height = top + FURNITURE_KINDS_LIST.length * furnRowH;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f3e6d0";
  g.fillRect(0, 0, c.width, c.height);
  items.forEach(([k, id, h], i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
    g.drawImage(getSprite(k, id, h), x + 6, y + 2, 88, 88);
    g.fillStyle = "#4a2c1d";
    g.font = "10px sans-serif";
    g.fillText(`${k}:${id}`, x + 4, y + 96);
  });
  FURNITURE_KINDS_LIST.forEach((kind, r) => {
    const y = top + r * furnRowH;
    g.fillStyle = "#4a2d1e";
    g.fillRect(0, y, c.width, furnRowH - 4);
    g.fillStyle = "#fff";
    g.font = "bold 11px sans-serif";
    g.fillText(kind, 6, y + 14);
    let x = 80;
    for (const [w, h] of sizes) {
      const l = x, t = y + 18, bw = w * fu - 3, bh = h * fu - 3;
      g.fillStyle = "rgba(10,5,2,0.45)";
      g.beginPath(); g.roundRect(l + 3, t + 4, bw, bh, 4); g.fill();
      drawFurniture(g, kind, l, t, bw, bh, fu, false, r + 1);
      x += w * fu + 14;
    }
  });
  return c;
}
