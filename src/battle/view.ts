// 戦闘の盤面を Canvas 2D で描く（エンジンの state を読むだけ。状態は変えない）。
//
// v2: 家の中の部屋を上から見た盤面（7列 × 11行）。上の壁に虫の出てくる穴（章 3 からは左右の壁にも）、
// 一番下の真ん中のマスにママ（大きめに描く）。マスはだいたい正方形で、横幅に合わせる。
// 通れないオブジェクトは影つきで立体に、通れるものは床に平たく描く。虫の通り道（出口からママまでの最短の道）を
// うすい点線と矢印で出す（showPath で切りかえ）。猫のマスに通れないものを置くと道がなくなるときは、そのマスを赤くする。
// 背景（床・壁・マス目）は大きさが変わったときだけオフスクリーンに描いておき、毎コマはそれを貼るだけ。

import { COLS, ROWS } from "../core/types";
import type { Battle, BattleEvent, BugState, ObjState } from "./engine";
import { FLOAT_LIFE, GOAL_COL, GOAL_ROW, SIDE_SPAWN_CHAPTER, SPAWN_Y } from "./engine";
import { getFlashSprite, getSprite, type SpriteHint } from "./sprites";
import { fmt } from "../core/num";

/** 上の壁（虫の出てくる所）の高さ（マスに対する割合）。 */
const TOP_PAD = 0.7;
/** 下の幅木の高さ。 */
const BOT_PAD = 0.28;
/** 左右の壁の厚さ。 */
const SIDE_PAD = 0.16;
/** マスの横幅は高さの何倍まで広げてよいか。 */
const MAX_ASPECT = 1.12;

const OL = "#4a2c1d";

interface Fx {
  type: "pop" | "ring" | "spark" | "puff" | "text" | "debris";
  x: number;      // 盤面の座標（マス）
  y: number;
  vx: number;
  vy: number;
  t: number;      // 経過秒
  life: number;
  r: number;      // 大きさ（マス）
  color: string;
  text?: string;
}

const MAX_FX = 320;

export interface Layout {
  w: number;      // canvas の CSS 幅
  h: number;
  cw: number;     // マスの幅（CSS px）
  ch: number;
  u: number;      // 絵の基準の大きさ
  ox: number;     // 列 0 の左端
  oy: number;     // 行 0 の上端
}

export class BattleView {
  readonly canvas: HTMLCanvasElement;
  /** 虫の通り道を出すか。 */
  showPath = true;
  private readonly g: CanvasRenderingContext2D;
  private dpr = 1;
  private bg: HTMLCanvasElement | null = null;
  L: Layout = { w: 1, h: 1, cw: 1, ch: 1, u: 1, ox: 0, oy: 0 };
  private fx: Fx[] = [];
  private shake = 0;
  private mamaScared = 0;
  private banner = { text: "", sub: "", t: 99 };
  private clock = 0;
  private lastCat = { x: 0, y: 0, moving: 0 };
  private catHint: SpriteHint;
  private catId: string;
  private readonly topHoles: number[];
  private readonly sideHoles: boolean;
  private readonly hasBlocker: boolean;
  /** 通り道（マスからマスへの線）。flowVersion が変わったら作りなおす。 */
  private route: { edges: [number, number, number, number][]; starts: [number, number][]; ver: number } = { edges: [], starts: [], ver: -1 };
  /** 虫の向き（なめらかに回す）。 */
  private bugAngle = new Map<number, number>();

  constructor(canvas: HTMLCanvasElement, private readonly battle: Battle) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false })!;
    const ch = battle.loadout.char;
    this.catId = ch.id;
    this.catHint = { role: ch.role };
    // 出口の穴: lanes 指定の列＋（lanes 無しの虫がいれば）全部の列
    const st = battle.loadout.stage;
    const lanes = new Set<number>();
    let any = false;
    for (const w of st.waves) for (const e of w.bugs) {
      if (e.lanes && e.lanes.length > 0) e.lanes.forEach((l) => lanes.add(Math.max(0, Math.min(COLS - 1, Math.floor(l)))));
      else any = true;
    }
    this.topHoles = any ? Array.from({ length: COLS }, (_, i) => i) : [...lanes];
    this.sideHoles = any && st.chapter >= SIDE_SPAWN_CHAPTER;
    this.hasBlocker = battle.loadout.objects.some((o) => o.block);
  }

  /** 縮小ずみの絵（大きさごと）。毎コマの drawImage で縮小しないため（遅い端末で効く）。 */
  private scaled = new Map<CanvasImageSource, Map<number, HTMLCanvasElement>>();

  private scaledOf(img: CanvasImageSource, css: number): HTMLCanvasElement {
    const px = Math.max(1, Math.round(css * this.dpr));
    let m = this.scaled.get(img);
    if (!m) { m = new Map(); this.scaled.set(img, m); }
    let c = m.get(px);
    if (!c) {
      c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, px, px);
      m.set(px, c);
    }
    return c;
  }

  /** 絵を、中心 (cx, cy)・一辺 css の大きさで描く（縮小ずみの絵を使う）。 */
  private blit(img: CanvasImageSource, cx: number, cy: number, css: number): void {
    const c = this.scaledOf(img, css);
    const s = c.width / this.dpr;
    this.g.drawImage(c, cx - s / 2, cy - s / 2, s, s);
  }

  /** CSS の大きさが変わったとき。 */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = Math.min(2, Math.max(1, dpr || 1));
    const w = Math.max(1, cssW), h = Math.max(1, cssH);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const rows = ROWS + TOP_PAD + BOT_PAD;
    let ch = h / rows;
    let cw = w / (COLS + SIDE_PAD * 2);
    if (cw < ch) ch = cw;
    else cw = Math.min(cw, ch * MAX_ASPECT);
    const ox = (w - cw * COLS) / 2;
    const oy = (h - ch * rows) / 2 + TOP_PAD * ch;
    this.L = { w, h, cw, ch, u: Math.min(cw, ch), ox, oy };
    this.scaled.clear();
    this.bg = this.renderBackground();
  }

  /** 盤面の座標 → canvas の CSS 座標。 */
  toPx(x: number, y: number): { x: number; y: number } {
    return { x: this.L.ox + x * this.L.cw, y: this.L.oy + y * this.L.ch };
  }

  /** 波の始まりなどの大きな文字。 */
  showBanner(text: string, sub = ""): void {
    this.banner = { text, sub, t: 0 };
  }

  /** エンジンの出来事から、演出を足す。 */
  onEvents(events: readonly BattleEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "kill": {
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.45, life: 0.35, color: "#fff" });
          const n = this.fx.length > 200 ? 2 : 5;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2;
            this.addFx({ type: "pop", x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 0.09, life: 0.45, color: POP_COLORS[i % POP_COLORS.length] });
          }
          break;
        }
        case "kibble":
          if (this.fx.length < 260) this.addFx({ type: "text", x: e.x, y: e.y - 0.35, vy: -0.6, r: 0.28, life: 0.7, color: "#ffd84a", text: `+${dmgText(e.value)}` });
          break;
        case "aoe":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.35, color: "rgba(255,255,255,0.9)" });
          break;
        case "slow":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.4, color: "rgba(140,210,255,0.9)" });
          break;
        case "mine":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.5, color: "#ffb84a" });
          this.addFx({ type: "text", x: e.x, y: e.y - 0.2, r: 0.42, life: 0.7, color: "#ff8a3a", text: "ばちん!" });
          this.shake = Math.max(this.shake, 0.18);
          break;
        case "dodge":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.55, r: 0.28, life: 0.6, color: "#bfe8ff", text: "ひらり" });
          break;
        case "knockback":
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.35, life: 0.25, color: "#fff2b0" });
          break;
        case "place":
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.6, life: 0.3, color: "#fff" });
          break;
        case "upgrade":
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.addFx({ type: "spark", x: e.x, y: e.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, r: 0.12, life: 0.5, color: "#ffd84a" });
          }
          this.addFx({ type: "text", x: e.x, y: e.y - 0.3, r: 0.36, life: 0.8, color: "#ffd84a", text: "UP!" });
          break;
        case "objectBroken":
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            this.addFx({ type: "debris", x: e.x, y: e.y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2 - 1.5, r: 0.1, life: 0.6, color: "#c98f4f" });
          }
          break;
        case "catDown":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.5, r: 0.34, life: 1.2, color: "#9fd8ff", text: "きゅう…" });
          break;
        case "catUp":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.5, r: 0.34, life: 0.9, color: "#ffd84a", text: "ふっかつ!" });
          break;
        case "mamaHit":
          this.shake = Math.max(this.shake, 0.35);
          this.mamaScared = 0.9;
          this.addFx({ type: "text", x: GOAL_COL + 0.5, y: GOAL_ROW - 0.6, r: 0.42, life: 0.9, color: "#ff5a6a", text: "きゃー!" });
          break;
        default:
          break;
      }
    }
  }

  private addFx(f: Partial<Fx> & Pick<Fx, "type" | "x" | "y" | "life" | "color">): void {
    if (this.fx.length >= MAX_FX) this.fx.shift();
    this.fx.push({ vx: 0, vy: 0, t: 0, r: 0.2, ...f });
  }

  // -------------------------------------------------------------------------
  // 背景
  // -------------------------------------------------------------------------

  private renderBackground(): HTMLCanvasElement {
    const { w, h, cw, ch, u, ox, oy } = this.L;
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(this.dpr, this.dpr);
    const bw = cw * COLS;
    const bh = ch * ROWS;
    const top = oy - TOP_PAD * ch;
    const floorBottom = oy + bh;
    const side = Math.max(4, SIDE_PAD * cw);

    // 外側（となりの部屋の壁）
    g.fillStyle = "#b99a78";
    g.fillRect(0, 0, w, h);

    // 床（板の間。横長の板を、ずらして並べる）
    g.fillStyle = "#e7c391";
    g.fillRect(ox, oy, bw, bh);
    const plankH = ch / 2;
    g.strokeStyle = "rgba(140,90,45,0.22)";
    g.lineWidth = 1;
    for (let i = 0, y = oy; y < floorBottom; i++, y += plankH) {
      g.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.07)" : i % 3 === 1 ? "rgba(120,70,30,0.05)" : "rgba(0,0,0,0)";
      g.fillRect(ox, y, bw, plankH);
      g.beginPath(); g.moveTo(ox, y); g.lineTo(ox + bw, y); g.stroke();
      const shift = ((i * 37) % 100) / 100;
      for (let x = ox + shift * cw * 2.2; x < ox + bw; x += cw * 2.2) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + plankH); g.stroke();
      }
    }
    // マス目（うすく）
    g.strokeStyle = "rgba(90,55,30,0.12)";
    g.lineWidth = 1.2;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        g.beginPath();
        g.roundRect(ox + col * cw + 2.5, oy + r * ch + 2.5, cw - 5, ch - 5, u * 0.14);
        g.stroke();
      }
    }

    // ママのラグ（ゴールのマスのまわり）
    const mx = ox + (GOAL_COL + 0.5) * cw, my = oy + (GOAL_ROW + 0.45) * ch;
    g.fillStyle = "#f6a9b4";
    g.beginPath(); g.ellipse(mx, my, cw * 1.25, ch * 0.75, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#e07a88";
    g.lineWidth = 2.5;
    g.setLineDash([6, 5]);
    g.beginPath(); g.ellipse(mx, my, cw * 1.05, ch * 0.6, 0, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    // ゴールのマス
    g.strokeStyle = "rgba(220,70,90,0.55)";
    g.lineWidth = 2;
    g.beginPath(); g.roundRect(ox + GOAL_COL * cw + 3, oy + GOAL_ROW * ch + 3, cw - 6, ch - 6, u * 0.14); g.stroke();

    // 上の壁（壁紙）
    g.fillStyle = "#f4e7d2";
    g.fillRect(ox - side, top, bw + side * 2, oy - top);
    g.fillStyle = "rgba(200,170,130,0.25)";
    for (let x = ox - side; x < ox + bw + side; x += 14) g.fillRect(x, top, 6, oy - top);
    // 窓（左右の端の上のほう、穴のじゃまにならないように小さく）
    const wy = top + ch * 0.06, wh = (oy - top) * 0.55;
    for (const wx of [ox + cw * 1.1, ox + cw * 4.3]) {
      const ww = cw * 1.6;
      g.fillStyle = "#fff"; g.strokeStyle = OL; g.lineWidth = 2.5;
      g.beginPath(); g.roundRect(wx, wy, ww, wh, 5); g.fill(); g.stroke();
      const glass = g.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, "#a9dcf7"); glass.addColorStop(1, "#dff3ff");
      g.fillStyle = glass;
      g.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
      g.fillStyle = OL;
      g.fillRect(wx + ww / 2 - 1, wy + 2, 2, wh - 4);
    }
    // 幅木
    const bbH = ch * 0.22;
    g.fillStyle = "#a8794f";
    g.fillRect(ox - side, oy - bbH, bw + side * 2, bbH);
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.fillRect(ox - side, oy - 3, bw + side * 2, 3);
    // 虫の出てくる穴（ねずみ穴のようなアーチ）
    for (const col of this.topHoles) {
      const hx = ox + (col + 0.5) * cw, hw = cw * 0.5, hh = ch * 0.42;
      g.fillStyle = "#2c1a10";
      g.beginPath();
      g.moveTo(hx - hw / 2, oy);
      g.lineTo(hx - hw / 2, oy - hh + hw / 2);
      g.arc(hx, oy - hh + hw / 2, hw / 2, Math.PI, 0);
      g.lineTo(hx + hw / 2, oy);
      g.closePath();
      g.fill();
      g.strokeStyle = "#7a5233"; g.lineWidth = 2; g.stroke();
      // 床にこぼれる影
      g.fillStyle = "rgba(40,20,10,0.18)";
      g.beginPath(); g.ellipse(hx, oy + 2, hw * 0.6, ch * 0.08, 0, 0, Math.PI * 2); g.fill();
    }

    // 左右の壁
    g.fillStyle = "#c9a57c";
    g.fillRect(ox - side, oy, side, bh);
    g.fillRect(ox + bw, oy, side, bh);
    g.fillStyle = "rgba(60,35,20,0.25)";
    g.fillRect(ox - 3, oy, 3, bh);
    g.fillRect(ox + bw, oy, 3, bh);
    if (this.sideHoles) {
      for (let r = 0; r < 3; r++) {
        for (const left of [true, false]) {
          const hy = oy + (r + 0.5) * ch, hh = ch * 0.5;
          const x0 = left ? ox - side : ox + bw;
          g.fillStyle = "#2c1a10";
          g.beginPath(); g.roundRect(x0, hy - hh / 2, side, hh, 3); g.fill();
        }
      }
    }

    // 下の幅木
    g.fillStyle = "#a8794f";
    g.fillRect(ox - side, floorBottom, bw + side * 2, Math.max(3, BOT_PAD * ch * 0.7));
    g.fillStyle = "rgba(0,0,0,0.15)";
    g.fillRect(ox - side, floorBottom, bw + side * 2, 2);
    return c;
  }

  // -------------------------------------------------------------------------
  // 毎コマ
  // -------------------------------------------------------------------------

  render(dt: number): void {
    const g = this.g;
    const b = this.battle;
    const { cw, ch, u, ox, oy } = this.L;
    this.clock += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.mamaScared > 0) this.mamaScared -= dt;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.bg) g.drawImage(this.bg, 0, 0, this.L.w, this.L.h);
    if (this.shake > 0) {
      const m = this.shake * u * 0.25;
      g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    const X = (x: number) => ox + x * cw;
    const Y = (y: number) => oy + y * ch;

    // 虫の通り道
    if (this.showPath) this.drawRoute(g);

    const cat = b.cat;
    // 猫のマスの強調（置ける・強化できる・ふさげない・休けい中）
    const cell = b.catCell();
    const occupied = b.objectAt(cell.col, cell.row);
    const isGoal = cell.col === GOAL_COL && cell.row === GOAL_ROW;
    const sealed = !occupied && !isGoal && this.hasBlocker && b.wouldSeal(cell.col, cell.row);
    const cx0 = X(cell.col), cy0 = Y(cell.row);
    let fill: string, stroke: string;
    if (cat.resting) { fill = "rgba(120,120,140,0.2)"; stroke = "rgba(110,110,130,0.7)"; }
    else if (occupied) { fill = "rgba(255,210,70,0.28)"; stroke = "#f0b020"; }
    else if (isGoal || sealed) { fill = "rgba(255,70,70,0.3)"; stroke = "#e0403a"; }
    else { fill = "rgba(110,220,130,0.25)"; stroke = "#4cbf6a"; }
    g.fillStyle = fill;
    g.beginPath(); g.roundRect(cx0 + 2, cy0 + 2, cw - 4, ch - 4, u * 0.16); g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 3;
    g.setLineDash(occupied || sealed ? [] : [7, 5]);
    g.lineDashOffset = -this.clock * 20;
    g.stroke();
    g.setLineDash([]);
    if (sealed && !cat.resting) {
      // ×じるし
      const k = u * 0.16, mx = cx0 + cw / 2, my = cy0 + ch / 2;
      g.strokeStyle = "rgba(224,64,58,0.8)";
      g.lineWidth = Math.max(3, u * 0.07);
      g.lineCap = "round";
      g.beginPath(); g.moveTo(mx - k, my - k); g.lineTo(mx + k, my + k); g.moveTo(mx + k, my - k); g.lineTo(mx - k, my + k); g.stroke();
      g.lineCap = "butt";
    }

    // 猫の攻撃が届く範囲（うすく）
    if (!cat.resting) {
      const rng = b.loadout.char.range;
      g.strokeStyle = "rgba(255,255,255,0.4)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(X(cat.x), Y(cat.y), rng * cw, rng * ch, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // オブジェクト: 通れるもの（床）→ 通れないもの（上の行から。下の行が手前）
    for (const o of b.objects) if (!o.def.block) this.drawFlatObject(g, o, X(o.col + 0.5), Y(o.row + 0.5));
    const solids = b.objects.filter((o) => o.def.block).sort((p, q) => p.row - q.row);
    // ステージの障害物（家具）とオブジェクトを、上の行から順に（下の行が手前）
    const items: { row: number; draw: () => void }[] = solids.map((o) => ({ row: o.row, draw: () => this.drawSolidObject(g, o, X(o.col + 0.5), Y(o.row + 0.5)) }));
    for (const ob of b.obstacles) items.push({ row: ob.row, draw: () => this.drawObstacle(g, ob.kind, X(ob.col + 0.5), Y(ob.row + 0.5)) });
    items.sort((p, q) => p.row - q.row);
    for (const it of items) it.draw();

    // ママ
    this.drawMama(g, X(GOAL_COL + 0.5), Y(GOAL_ROW + 1) - ch * 0.04, u * 1.75);

    // 虫（地面の虫 → 猫 → 飛ぶ虫）
    for (const bug of b.bugs) if (!bug.def.fly) this.drawBug(g, bug, dt);
    this.drawCat(g, dt, X(cat.x), Y(cat.y));
    for (const bug of b.bugs) if (bug.def.fly) this.drawBug(g, bug, dt);
    if (this.bugAngle.size > b.bugs.length * 2 + 32) {
      const alive = new Set(b.bugs.map((x) => x.uid));
      for (const k of this.bugAngle.keys()) if (!alive.has(k)) this.bugAngle.delete(k);
    }

    // 弾
    for (const p of b.projectiles) {
      const s = p.fromCat ? u * 0.26 : u * 0.3;
      const img = getSprite("projectile", p.kind);
      if (p.kind === "shooter") {
        g.save();
        g.translate(X(p.x), Y(p.y));
        g.rotate(this.clock * 14 + p.uid);
        g.drawImage(img, -s / 2, -s / 2, s, s);
        g.restore();
      } else {
        this.blit(img, X(p.x), Y(p.y), p.crit ? s * 1.3 : s);
      }
    }

    // 演出
    this.drawFx(g, dt);

    // ダメージの数字
    const fs = Math.max(11, u * 0.3);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.strokeStyle = OL;
    for (const f of b.floats) {
      const k = f.age / FLOAT_LIFE;
      const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const big = f.kind === "crit" ? 1.35 : f.kind === "poison" ? 0.8 : 1;
      const sc = (k < 0.15 ? 0.7 + k * 3 : 1.15 - Math.min(0.15, (k - 0.15) * 0.4)) * big;
      const x = X(f.x), y = Y(f.y) - k * ch * 0.6;
      g.globalAlpha = Math.max(0, alpha);
      const t = (f.kind === "heal" ? "+" : "") + dmgText(f.value) + (f.kind === "crit" ? "!" : "");
      g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif`;
      g.lineWidth = Math.max(3, fs * 0.22);
      g.save();
      g.translate(x, y);
      g.scale(sc, sc);
      g.strokeText(t, 0, 0);
      g.fillStyle = FLOAT_COLORS[f.kind];
      g.fillText(t, 0, 0);
      g.restore();
    }
    g.globalAlpha = 1;

    // 波の文字
    this.drawBanner(g, dt);
  }

  /** 出口からママまでの道を点線と矢印で。 */
  private drawRoute(g: CanvasRenderingContext2D): void {
    const b = this.battle;
    if (this.route.ver !== b.flowVersion) {
      const seen = new Set<string>();
      const edges: [number, number, number, number][] = [];
      const starts: [number, number][] = [];
      for (const s of b.spawnCells()) {
        starts.push([s.col, s.row]);
        const r = b.routeFrom(s.col, s.row);
        for (let i = 0; i + 1 < r.length; i++) {
          const k = `${r[i].col},${r[i].row}>${r[i + 1].col},${r[i + 1].row}`;
          if (seen.has(k)) break; // ここから先は、もう描く道に合流している
          seen.add(k);
          edges.push([r[i].col, r[i].row, r[i + 1].col, r[i + 1].row]);
        }
      }
      this.route = { edges, starts, ver: b.flowVersion };
    }
    const { cw, ch, u, ox, oy } = this.L;
    const X = (c: number) => ox + (c + 0.5) * cw;
    const Y = (r: number) => oy + (r + 0.5) * ch;
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    // 下地（太めのうすい帯）
    g.strokeStyle = "rgba(255,255,255,0.28)";
    g.lineWidth = Math.max(4, u * 0.16);
    g.beginPath();
    for (const [c0, r0, c1, r1] of this.route.edges) { g.moveTo(X(c0), Y(r0)); g.lineTo(X(c1), Y(r1)); }
    for (const [c, r] of this.route.starts) if (r === 0) { g.moveTo(X(c), oy + SPAWN_Y * ch * 0.4); g.lineTo(X(c), Y(r)); }
    g.stroke();
    // 流れる点線
    g.strokeStyle = "rgba(214,80,96,0.55)";
    g.lineWidth = Math.max(2, u * 0.05);
    g.setLineDash([u * 0.08, u * 0.18]);
    g.lineDashOffset = -this.clock * u * 0.6;
    g.stroke();
    g.setLineDash([]);
    // 矢印（辺のまんなか）
    g.fillStyle = "rgba(214,80,96,0.6)";
    const a = u * 0.1;
    for (const [c0, r0, c1, r1] of this.route.edges) {
      const mx = (X(c0) + X(c1)) / 2, my = (Y(r0) + Y(r1)) / 2;
      const ang = Math.atan2(Y(r1) - Y(r0), X(c1) - X(c0));
      g.beginPath();
      g.moveTo(mx + Math.cos(ang) * a, my + Math.sin(ang) * a);
      g.lineTo(mx + Math.cos(ang + 2.5) * a, my + Math.sin(ang + 2.5) * a);
      g.lineTo(mx + Math.cos(ang - 2.5) * a, my + Math.sin(ang - 2.5) * a);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  private drawMama(g: CanvasRenderingContext2D, cx: number, bottom: number, size: number): void {
    const scared = this.mamaScared > 0;
    const img = getSprite("mama", scared ? "scared" : "normal");
    const b = this.battle;
    const low = b.mamaHp / Math.max(1, b.mamaMaxHp) < 0.4;
    const tremble = scared ? Math.sin(this.clock * 60) * size * 0.03 : low ? Math.sin(this.clock * 30) * size * 0.012 : Math.sin(this.clock * 2) * size * 0.01;
    g.fillStyle = "rgba(60,35,20,0.22)";
    g.beginPath(); g.ellipse(cx, bottom - size * 0.04, size * 0.36, size * 0.08, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(img, cx - size / 2 + tremble, bottom - size * 0.98, size, size);
  }

  /** 撃った直後のはね・ゆれ（共通）。 */
  private objBounce(o: ObjState): { s: number; dx: number } {
    const { u } = this.L;
    let s = 1;
    const k = o.def.kind;
    if ((k === "shooter" || k === "slow" || k === "aoe") && o.timer < 0.12) s = 1.08 - o.timer * 0.6;
    const dx = o.hurt > 0 ? Math.sin(this.clock * 80) * u * 0.03 : 0;
    return { s, dx };
  }

  /** 通れないオブジェクト: 床に影を落として、少し浮かせて立体に。 */
  private drawSolidObject(g: CanvasRenderingContext2D, o: ObjState, x: number, y: number): void {
    const { u, cw, ch } = this.L;
    const { s: bounce, dx } = this.objBounce(o);
    const fw = cw * 0.9, fh = ch * 0.9;
    // 床の影（右下へずらす）
    g.fillStyle = "rgba(60,35,20,0.28)";
    g.beginPath(); g.roundRect(x - fw / 2 + u * 0.06, y - fh / 2 + u * 0.1, fw, fh, u * 0.14); g.fill();
    // 台（足もと）
    g.fillStyle = o.def.kind === "wall" ? "#d7a86e" : "#f1dfc2";
    g.strokeStyle = OL;
    g.lineWidth = 2;
    g.beginPath(); g.roundRect(x - fw / 2, y - fh / 2, fw, fh, u * 0.14); g.fill(); g.stroke();
    g.fillStyle = "rgba(0,0,0,0.12)";
    g.beginPath(); g.roundRect(x - fw / 2 + 2, y + fh / 2 - u * 0.12, fw - 4, u * 0.1, u * 0.05); g.fill();
    if (this.battle.auraActive(o)) {
      g.strokeStyle = `rgba(255,216,74,${0.55 + Math.sin(this.clock * 6) * 0.25})`;
      g.lineWidth = 3;
      g.beginPath(); g.roundRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 4, fh + 4, u * 0.16); g.stroke();
    }
    if (o.def.kind === "aoe" && o.timer < 0.25) {
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, u * o.def.range * (1 - o.timer * 3), 0, Math.PI * 2);
      g.stroke();
    }
    const hint: SpriteHint = { kind: o.def.kind };
    const s = u * 0.98 * bounce;
    const sy = y - u * 0.1;
    this.blit(getSprite("object", o.def.id, hint), x + dx, sy, s);
    if (o.hurt > 0) {
      g.globalAlpha = Math.min(1, o.hurt / 0.15) * 0.7;
      this.blit(getFlashSprite("object", o.def.id, hint), x + dx, sy, s);
      g.globalAlpha = 1;
    }
    this.drawObjExtras(g, o, x, sy);
  }

  /** ステージの障害物（家具）。虫も猫のオブジェクトも置けない。仮の絵（あとで画像に差し替えられる）。 */
  private drawObstacle(g: CanvasRenderingContext2D, kind: string, x: number, y: number): void {
    const { u, cw, ch } = this.L;
    const w = cw * 0.92, h = ch * 0.92, l = x - w / 2, t = y - h / 2;
    g.lineWidth = 2; g.strokeStyle = OL;
    g.fillStyle = "rgba(60,35,20,0.3)";
    g.beginPath(); g.roundRect(l + u * 0.07, t + u * 0.12, w, h, u * 0.12); g.fill();
    const box = (bx: number, by: number, bw: number, bh: number, c: string, r = u * 0.1) => { g.fillStyle = c; g.beginPath(); g.roundRect(bx, by, bw, bh, r); g.fill(); g.stroke(); };
    switch (kind) {
      case "plant":   // 観葉植物
        box(x - w * 0.24, y + h * 0.05, w * 0.48, h * 0.4, "#c8794a");
        g.fillStyle = "#5fa85a";
        for (const [dx, dy, r] of [[0, -0.18, 0.26], [-0.2, -0.05, 0.2], [0.2, -0.05, 0.2], [0, -0.38, 0.17]]) { g.beginPath(); g.arc(x + dx * w, y + dy * h, r * w, 0, Math.PI * 2); g.fill(); g.stroke(); }
        break;
      case "sofa":    // ソファ
        box(l, t + h * 0.15, w, h * 0.7, "#6f8fc9");
        box(l + w * 0.12, t + h * 0.38, w * 0.76, h * 0.38, "#86a6dd");
        break;
      case "table":   // ローテーブル
        box(l + w * 0.04, t + h * 0.12, w * 0.92, h * 0.62, "#a86b3c");
        g.fillStyle = "#fff4e0"; g.beginPath(); g.arc(x - w * 0.15, y - h * 0.08, w * 0.1, 0, Math.PI * 2); g.fill(); g.stroke();
        break;
      case "shelf":   // 本棚
        box(l + w * 0.06, t, w * 0.88, h * 0.95, "#8a5a34");
        for (let k = 0; k < 3; k++) { const yy = t + h * (0.1 + k * 0.28); for (let j = 0; j < 4; j++) { g.fillStyle = ["#e86a6a", "#6ab0e8", "#f2c14e", "#7cc576"][(j + k) % 4]; g.fillRect(l + w * (0.14 + j * 0.18), yy, w * 0.13, h * 0.2); } }
        break;
      case "chair":   // いす
        box(l + w * 0.15, t + h * 0.05, w * 0.7, h * 0.3, "#b07a4a");
        box(l + w * 0.12, t + h * 0.35, w * 0.76, h * 0.42, "#c98e5a");
        break;
      case "shoes":   // くつ
        box(l + w * 0.08, t + h * 0.3, w * 0.38, h * 0.5, "#5b6b8a", u * 0.18);
        box(l + w * 0.54, t + h * 0.25, w * 0.38, h * 0.5, "#5b6b8a", u * 0.18);
        break;
      default:        // かご（basket）
        box(l + w * 0.08, t + h * 0.2, w * 0.84, h * 0.65, "#d9b06a", u * 0.2);
        g.strokeStyle = "rgba(74,44,29,0.5)"; g.beginPath();
        for (let k = 1; k < 4; k++) { g.moveTo(l + w * (0.08 + k * 0.21), t + h * 0.22); g.lineTo(l + w * (0.08 + k * 0.21), t + h * 0.83); }
        g.stroke();
    }
  }

  /** 通れるオブジェクト: 床に平たく（影なし・小さめ・下にうすい敷物）。 */
  private drawFlatObject(g: CanvasRenderingContext2D, o: ObjState, x: number, y: number): void {
    const { u, cw, ch } = this.L;
    const { s: bounce, dx } = this.objBounce(o);
    g.fillStyle = FLAT_TINT[o.def.kind] ?? "rgba(255,255,255,0.3)";
    g.strokeStyle = "rgba(74,44,29,0.35)";
    g.lineWidth = 1.5;
    g.setLineDash([4, 3]);
    g.beginPath(); g.roundRect(x - cw * 0.42, y - ch * 0.42, cw * 0.84, ch * 0.84, u * 0.2); g.fill(); g.stroke();
    g.setLineDash([]);
    if (this.battle.auraActive(o)) {
      g.strokeStyle = `rgba(255,216,74,${0.55 + Math.sin(this.clock * 6) * 0.25})`;
      g.lineWidth = 3;
      g.beginPath(); g.roundRect(x - cw * 0.45, y - ch * 0.45, cw * 0.9, ch * 0.9, u * 0.2); g.stroke();
    }
    const hint: SpriteHint = { kind: o.def.kind };
    const s = u * 0.74 * bounce;
    // 平たく見せるため、縦を少しつぶす
    const c = this.scaledOf(getSprite("object", o.def.id, hint), s);
    const sw = c.width / this.dpr;
    g.drawImage(c, x + dx - sw / 2, y - sw * 0.36, sw, sw * 0.76);
    if (o.hurt > 0) {
      g.globalAlpha = Math.min(1, o.hurt / 0.15) * 0.7;
      const f = this.scaledOf(getFlashSprite("object", o.def.id, hint), s);
      g.drawImage(f, x + dx - sw / 2, y - sw * 0.36, sw, sw * 0.76);
      g.globalAlpha = 1;
    }
    this.drawObjExtras(g, o, x, y);
  }

  /** 強化の星・HP バー。 */
  private drawObjExtras(g: CanvasRenderingContext2D, o: ObjState, x: number, y: number): void {
    const { u } = this.L;
    if (o.level > 0) {
      const sr = u * 0.085;
      const n = Math.min(o.level, 5);
      const sy = y - u * 0.42;
      if (o.level <= 5) {
        for (let i = 0; i < n; i++) star(g, x + (i - (n - 1) / 2) * sr * 2.1, sy, sr);
      } else {
        star(g, x - sr * 1.2, sy, sr * 1.2);
        g.font = `900 ${Math.max(10, u * 0.2)}px system-ui, sans-serif`;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.lineWidth = 3;
        g.strokeStyle = OL;
        g.strokeText(String(o.level), x, sy);
        g.fillStyle = "#ffd84a";
        g.fillText(String(o.level), x, sy);
      }
    }
    if (o.hp < o.maxHp && o.def.kind !== "mine") hpBar(g, x, y + u * 0.42, u * 0.72, Math.max(4, u * 0.08), o.hp / o.maxHp, "#5ad0ff");
  }

  private drawBug(g: CanvasRenderingContext2D, bug: BugState, dt: number): void {
    const { u, ox, oy, cw, ch } = this.L;
    const boss = !!bug.def.boss;
    const s = u * (boss ? 1.3 : 0.8);
    const id = bug.def.id;
    // 押し戻された直後は、元の位置から飛ばされるように
    const kk = bug.knock > 0 ? bug.knock / 0.15 : 0;
    const bx = bug.x + bug.knockX * kk * kk, by = bug.y + bug.knockY * kk * kk;
    const x = ox + bx * cw, y = oy + by * ch;
    // 出てきたばかりの虫は、穴から少しずつ現れる
    const fade = bug.y < 0 ? Math.max(0, Math.min(1, (bug.y - SPAWN_Y) / 0.5 + 0.2))
      : bug.x < 0 ? Math.max(0, Math.min(1, bug.x + 0.7)) : bug.x > COLS ? Math.max(0, Math.min(1, COLS + 0.7 - bug.x)) : 1;
    if (fade < 1) g.globalAlpha = fade;
    let yy = y;
    if (bug.def.fly) {
      g.fillStyle = "rgba(60,35,20,0.2)";
      g.beginPath();
      g.ellipse(x, y + s * 0.3, s * 0.3, s * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      yy = y - s * 0.18 + Math.sin(this.clock * 8 + bug.uid) * s * 0.05;
    }
    if (bug.slowMul < 1) {
      g.fillStyle = "rgba(120,200,255,0.45)";
      g.beginPath();
      g.ellipse(x, y + s * 0.15, s * 0.42, s * 0.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (bug.poisonTimer > 0) {
      g.fillStyle = "rgba(150,90,220,0.35)";
      g.beginPath();
      g.arc(x, yy, s * 0.42, 0, Math.PI * 2);
      g.fill();
    }
    // 向き（絵は下向き）。なめらかに回す
    const want = Math.atan2(-bug.dirX, bug.dirY);
    let ang = this.bugAngle.get(bug.uid);
    if (ang === undefined) ang = want;
    else {
      let d = want - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      ang += d * Math.min(1, dt * 12);
    }
    this.bugAngle.set(bug.uid, ang);
    const wob = bug.mode === "bite"
      ? Math.sin(this.clock * 30 + bug.uid) * 0.12
      : Math.sin(this.clock * 12 * bug.speed * bug.slowMul + bug.uid) * 0.08;
    const hop = bug.mode === "bite" ? Math.abs(Math.sin(this.clock * 15 + bug.uid)) * s * 0.06 : 0;
    const img = this.scaledOf(getSprite("bug", id), s);
    const sw = img.width / this.dpr;
    g.save();
    g.translate(x, yy - hop);
    g.rotate(ang + wob);
    g.drawImage(img, -sw / 2, -sw / 2, sw, sw);
    if (bug.hurt > 0) {
      g.globalAlpha = Math.min(1, bug.hurt / 0.12) * 0.85 * fade;
      g.drawImage(this.scaledOf(getFlashSprite("bug", id), s), -sw / 2, -sw / 2, sw, sw);
    }
    g.restore();
    g.globalAlpha = 1;
    if (bug.hp < bug.maxHp) hpBar(g, x, yy - s * 0.5, s * 0.7, Math.max(3, u * 0.065), bug.hp / bug.maxHp, boss ? "#ff4a6a" : "#ff8a4a");
  }

  private drawCat(g: CanvasRenderingContext2D, dt: number, x: number, y: number): void {
    const b = this.battle;
    const cat = b.cat;
    const { u } = this.L;
    const moved = Math.hypot(cat.x - this.lastCat.x, cat.y - this.lastCat.y);
    this.lastCat.x = cat.x;
    this.lastCat.y = cat.y;
    this.lastCat.moving = moved > 0.002 ? Math.min(1, this.lastCat.moving + dt * 8) : Math.max(0, this.lastCat.moving - dt * 8);
    const s = u * 1.0;
    // 影
    g.fillStyle = "rgba(60,35,20,0.22)";
    g.beginPath();
    g.ellipse(x, y + s * 0.4, s * 0.34, s * 0.1, 0, 0, Math.PI * 2);
    g.fill();

    if (cat.resting) {
      g.drawImage(getSprite("catRest", this.catId, this.catHint), x - s / 2, y - s / 2, s, s);
      const total = b.loadout.char.restTime || 1;
      const k = Math.max(0, Math.min(1, cat.restTimer / total));
      const rx = x + s * 0.36, ry = y - s * 0.4, rr = u * 0.17;
      g.fillStyle = "rgba(40,30,60,0.6)";
      g.beginPath(); g.arc(rx, ry, rr + 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#9fd8ff";
      g.lineWidth = 4;
      g.beginPath(); g.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      g.fillStyle = "#fff";
      g.font = `900 ${Math.max(10, u * 0.17)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(Math.ceil(cat.restTimer)), rx, ry + 1);
      g.font = `900 ${Math.max(10, u * 0.2)}px system-ui, sans-serif`;
      g.lineWidth = 3;
      g.strokeStyle = OL;
      for (let i = 0; i < 3; i++) {
        const t = (this.clock * 0.8 + i / 3) % 1;
        g.globalAlpha = 1 - t;
        const zx = x - s * 0.15 + t * s * 0.3 + Math.sin(t * 6) * 3, zy = y - s * 0.35 - t * s * 0.5;
        g.strokeText("Z", zx, zy);
        g.fillStyle = "#cfe9ff";
        g.fillText("Z", zx, zy);
      }
      g.globalAlpha = 1;
      return;
    }

    const hop = this.lastCat.moving * Math.abs(Math.sin(this.clock * 14)) * s * 0.08;
    const atk = cat.attackAnim > 0 ? 1 + (cat.attackAnim / 0.15) * 0.14 : 1;
    const flip = cat.facingX < -0.1 ? -1 : 1;
    g.save();
    g.translate(x, y - hop);
    g.scale(flip * atk, atk);
    g.drawImage(getSprite("cat", this.catId, this.catHint), -s / 2, -s / 2, s, s);
    if (cat.hurt > 0) {
      g.globalAlpha = Math.min(1, cat.hurt / 0.15) * 0.8;
      g.drawImage(getFlashSprite("cat", this.catId, this.catHint), -s / 2, -s / 2, s, s);
      g.globalAlpha = 1;
    }
    g.restore();
    const role = b.loadout.char.role;
    if (cat.attackAnim > 0 && role !== "ranged") {
      const a = Math.atan2(cat.facingY, cat.facingX);
      const k = 1 - cat.attackAnim / 0.15;
      const R = role === "aoe" ? (b.loadout.char.aoe || 1) * u : u * 0.6;
      g.strokeStyle = `rgba(255,255,255,${0.9 - k * 0.7})`;
      g.lineWidth = Math.max(3, u * 0.08);
      g.beginPath();
      if (role === "aoe") g.arc(x, y, R * (0.5 + k * 0.5), 0, Math.PI * 2);
      else g.arc(x, y, R, a - 0.9 + k * 0.6, a + 0.3 + k * 0.6);
      g.stroke();
    }
    hpBar(g, x, y + s * 0.52, s * 0.66, Math.max(4, u * 0.08), cat.hp / cat.maxHp, "#5ee07a");
  }

  private drawFx(g: CanvasRenderingContext2D, dt: number): void {
    const { cw, ch, u, ox, oy } = this.L;
    let w = 0;
    for (let i = 0; i < this.fx.length; i++) {
      const f = this.fx[i];
      f.t += dt;
      if (f.t >= f.life) continue;
      this.fx[w++] = f;
      const k = f.t / f.life;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.type === "pop" || f.type === "debris") f.vy += 6 * dt;
      const x = ox + f.x * cw, y = oy + f.y * ch;
      switch (f.type) {
        case "pop":
        case "debris":
        case "spark": {
          g.globalAlpha = 1 - k;
          g.fillStyle = f.color;
          const r = f.r * u * (f.type === "spark" ? 1 - k * 0.5 : 1);
          if (f.type === "spark") star(g, x, y, r);
          else { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
          break;
        }
        case "puff": {
          g.globalAlpha = (1 - k) * 0.8;
          g.strokeStyle = f.color;
          g.lineWidth = Math.max(2, u * 0.08 * (1 - k));
          g.beginPath();
          g.arc(x, y, f.r * u * (0.4 + k * 0.8), 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case "ring": {
          g.globalAlpha = 1 - k;
          g.strokeStyle = f.color;
          g.lineWidth = Math.max(2, u * 0.1 * (1 - k));
          g.beginPath();
          g.ellipse(x, y, f.r * cw * (0.3 + k * 0.7), f.r * ch * (0.3 + k * 0.7), 0, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = f.color;
          g.globalAlpha = (1 - k) * 0.15;
          g.fill();
          break;
        }
        case "text": {
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          const fs = f.r * u * (k < 0.15 ? 0.6 + k * 2.7 : 1);
          g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.lineWidth = Math.max(3, fs * 0.2);
          g.strokeStyle = OL;
          const ty = y - k * ch * 0.4;
          g.strokeText(f.text ?? "", x, ty);
          g.fillStyle = f.color;
          g.fillText(f.text ?? "", x, ty);
          break;
        }
      }
    }
    this.fx.length = w;
    g.globalAlpha = 1;
  }

  private drawBanner(g: CanvasRenderingContext2D, dt: number): void {
    const bn = this.banner;
    if (bn.t > 1.8) return;
    bn.t += dt;
    const k = bn.t / 1.8;
    const { w, oy, ch, u } = this.L;
    const alpha = k < 0.1 ? k / 0.1 : k > 0.75 ? (1 - k) / 0.25 : 1;
    const y = oy + ch * 3.2;
    g.globalAlpha = Math.max(0, alpha) * 0.85;
    g.fillStyle = "#4a2c1d";
    g.fillRect(0, y - u * 0.55, w, u * (bn.sub ? 1.3 : 1.1));
    g.globalAlpha = Math.max(0, alpha);
    const sc = k < 0.1 ? 1.4 - k * 4 : 1;
    const fs = u * 0.55 * sc;
    g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffd84a";
    g.fillText(bn.text, w / 2, y);
    if (bn.sub) {
      g.font = `800 ${u * 0.26}px system-ui, sans-serif`;
      g.fillStyle = "#fff";
      g.fillText(bn.sub, w / 2, y + u * 0.48);
    }
    g.globalAlpha = 1;
  }
}

/** ダメージの数字。10 より小さい端数は小数1けたで出す（0.5 が "0" にならないように）。 */
function dmgText(v: number): string {
  if (v < 10 && v % 1 !== 0) return String(Math.round(v * 10) / 10);
  return fmt(v);
}

const POP_COLORS = ["#ffd84a", "#ff8fb0", "#8fd0ff", "#ffffff", "#a8e070"];
const FLOAT_COLORS: Record<string, string> = {
  bug: "#fff", crit: "#ffd84a", poison: "#d8a8ff", cat: "#ff6b6b", heal: "#7cf09a", object: "#ffb35a",
};
const FLAT_TINT: Partial<Record<string, string>> = {
  slow: "rgba(150,210,255,0.35)",
  mine: "rgba(255,190,120,0.3)",
  wall: "rgba(255,255,255,0.25)",
  shooter: "rgba(255,230,180,0.35)",
  aoe: "rgba(255,190,190,0.3)",
  producer: "rgba(255,200,220,0.35)",
};

function hpBar(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, ratio: number, color: string): void {
  const r = Math.max(0, Math.min(1, ratio));
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle = OL;
  g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  g.fillStyle = r < 0.3 ? "#ff5a5a" : color;
  g.fillRect(x, y, w * r, h);
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  const fill = g.fillStyle;
  g.fillStyle = "#ffd84a";
  g.fill();
  g.lineWidth = Math.max(1.5, r * 0.3);
  g.strokeStyle = OL;
  g.stroke();
  g.fillStyle = fill;
}
