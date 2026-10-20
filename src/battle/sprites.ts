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
//     mama     … "mama"（ふつう）/ "mama_scared"（びっくり）
//   コードから直接差しかえるときは registerSprite(kind, id, img)。

import type { CharRole, ObjectKind } from "../core/types";

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
    case "projectile": return drawProjectile(id);
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
    case "slow": drawTape(g); break;
    case "producer": drawBowl(g, id); break;
    case "mine": drawTrap(g); break;
  }
  return cv;
}

function drawShooter(g: G, id: string): void {
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
    // ママのスリッパ
    ell(g, 64, 70, 30, 46, 0.25);
    fs(g, "#ff9ac0");
    ell(g, 60, 52, 26, 22, 0.25);
    fs(g, "#ffffff", () => {
      ell(g, 60, 52, 18, 14, 0.25);
      g.fillStyle = "#ffd0e0";
      g.fill();
    });
    dot(g, 60, 48, 6, "#f7d34a");
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
  | "caterpillar" | "centipede" | "beetle" | "horned" | "hornet";

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
    ["kabuto", "horned"], ["kuwagata", "horned"],
    ["kogane", "beetle"], ["beetle", "beetle"], ["tentou", "beetle"],
    ["mosquito", "mosquito"],
    ["ari", "ant"], ["ant", "ant"],
  ];
  for (const [k, v] of t) if (s.includes(k)) return v;
  if (s === "ka" || s.startsWith("ka_") || s.endsWith("_ka")) return "mosquito";
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

/** 開発用: すべての絵を並べた一覧（絵の差しかえ確認用）。 */
export function debugSpriteSheet(): HTMLCanvasElement {
  const items: [SpriteKind, string, SpriteHint?][] = [
    ["cat", "chatora"], ["cat", "mike"], ["cat", "kuro"], ["cat", "shiro"], ["cat", "hachiware"], ["cat", "sabatora"],
    ["cat", "omochi"], ["cat", "komugi"], ["catRest", "chatora"], ["catRest", "mike"], ["mama", "normal"], ["mama", "scared"],
    ["object", "wagomu"], ["object", "danboru"], ["object", "soujiki"], ["object", "tape"], ["object", "esara"], ["object", "nezumitori"],
    ["object", "mizudeppo"], ["object", "cushion"], ["object", "senpuki"], ["object", "surippa"], ["object", "oyatsu"], ["object", "kirifuki"],
    ["bug", "ari"], ["bug", "ka"], ["bug", "gokiburi"], ["bug", "kamemushi"], ["bug", "kumo"], ["bug", "imomushi"],
    ["bug", "kogane"], ["bug", "kabuto"], ["bug", "suzumebachi"], ["bug", "mukade"], ["bug", "unknown"], ["pickup", "kibble"],
    ["projectile", "cat"], ["projectile", "shooter"], ["projectile", "slow"],
  ];
  const cols = 6, cell = 100;
  const c = document.createElement("canvas");
  c.width = cols * cell;
  c.height = Math.ceil(items.length / cols) * cell;
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
  return c;
}
