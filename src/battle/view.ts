// 戦闘の盤面を Canvas 2D で描く（エンジンの state を読むだけ。状態は変えない）。
//
// 盤面の並び（上から）: 壁と窓（虫が出てくる所）→ 5列×9行の床 → ママのいる所。
// マスは横長になってもよい（画面の横幅を使い切るため）。絵の大きさは u = min(マスの幅, マスの高さ) で決める。
// 背景（床・壁・マス目）は大きさが変わったときだけオフスクリーンに描いておき、毎コマはそれを貼るだけ。

import { COLS, ROWS } from "../core/types";
import type { Battle, BattleEvent } from "./engine";
import { FLOAT_LIFE, PICKUP_AUTO_TIME, SPAWN_Y } from "./engine";
import { getFlashSprite, getSprite, type SpriteHint } from "./sprites";
import { fmt } from "../core/num";

/** 壁（虫の出てくる所）の高さ（マスの高さに対する割合）。 */
const TOP_PAD = 0.8;
/** ママのいる所の高さ。 */
const BOT_PAD = 1.25;
/** マスの横幅は高さの何倍まで広げてよいか。 */
const MAX_ASPECT = 1.5;

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

  constructor(canvas: HTMLCanvasElement, private readonly battle: Battle) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false })!;
    const ch = battle.loadout.char;
    this.catId = ch.id;
    this.catHint = { role: ch.role };
  }

  /** 縮小ずみの絵（大きさごと）。毎コマの drawImage で縮小しないため（遅い端末で効く）。 */
  private scaled = new Map<CanvasImageSource, Map<number, HTMLCanvasElement>>();

  /** 絵を、中心 (cx, cy)・一辺 css の大きさで描く（縮小ずみの絵を使う）。 */
  private blit(img: CanvasImageSource, cx: number, cy: number, css: number): void {
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
    const s = px / this.dpr;
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
    let cw = w / COLS;
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
        case "aoe":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.35, color: "rgba(255,255,255,0.9)" });
          break;
        case "mine":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.5, color: "#ffb84a" });
          this.addFx({ type: "text", x: e.x, y: e.y - 0.2, r: 0.42, life: 0.7, color: "#ff8a3a", text: "ばちん!" });
          this.shake = Math.max(this.shake, 0.18);
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
          this.addFx({ type: "text", x: COLS / 2, y: ROWS + 0.1, r: 0.42, life: 0.9, color: "#ff5a6a", text: "きゃー!" });
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
    const { w, h, cw, ch, ox, oy } = this.L;
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext("2d")!;
    g.scale(this.dpr, this.dpr);
    const bw = cw * COLS;
    const top = oy - TOP_PAD * ch;
    const floorBottom = oy + ROWS * ch;

    // 外側（部屋の端の壁）
    g.fillStyle = "#c8ad8c";
    g.fillRect(0, 0, w, h);

    // 上の壁（壁紙）
    g.fillStyle = "#f4e7d2";
    g.fillRect(0, 0, w, oy);
    g.fillStyle = "rgba(200,170,130,0.25)";
    for (let x = 0; x < w; x += 14) g.fillRect(x, 0, 6, oy);
    // 窓（左）とドア（右）
    const wy = Math.max(2, top + ch * 0.06);
    const wh = oy - wy - ch * 0.16;
    const winX = ox + cw * 0.35, winW = cw * 2.3;
    g.fillStyle = "#fff";
    g.strokeStyle = OL;
    g.lineWidth = 3;
    g.beginPath(); g.roundRect(winX, wy, winW, wh, 6); g.fill(); g.stroke();
    const glass = g.createLinearGradient(0, wy, 0, wy + wh);
    glass.addColorStop(0, "#a9dcf7");
    glass.addColorStop(1, "#dff3ff");
    g.fillStyle = glass;
    g.fillRect(winX + 5, wy + 5, winW - 10, wh - 10);
    g.fillStyle = OL;
    g.fillRect(winX + winW / 2 - 1.5, wy + 3, 3, wh - 6);
    // カーテン
    g.fillStyle = "#f7b6c6";
    for (const s of [0, 1]) {
      g.beginPath();
      const x0 = s ? winX + winW - cw * 0.35 : winX - cw * 0.05;
      g.roundRect(x0, wy - 3, cw * 0.4, wh + 4, 6);
      g.fill();
      g.lineWidth = 2.5;
      g.stroke();
    }
    // ドア
    const doorX = ox + cw * 3.35, doorW = cw * 1.3;
    g.fillStyle = "#c98f58";
    g.beginPath(); g.roundRect(doorX, wy - 4, doorW, oy - wy + 4, [8, 8, 0, 0]); g.fill(); g.lineWidth = 3; g.stroke();
    g.fillStyle = "#dba870";
    g.fillRect(doorX + doorW * 0.15, wy + wh * 0.1, doorW * 0.7, wh * 0.35);
    g.fillStyle = "#f7d34a";
    g.beginPath(); g.arc(doorX + doorW * 0.82, wy + wh * 0.62, Math.max(2, cw * 0.05), 0, Math.PI * 2); g.fill(); g.stroke();
    // 幅木と、虫が出てくるすきま
    g.fillStyle = "#a8794f";
    g.fillRect(0, oy - ch * 0.14, w, ch * 0.14);
    g.fillStyle = "#3a2418";
    for (let c2 = 0; c2 < COLS; c2++) {
      g.beginPath();
      g.ellipse(ox + (c2 + 0.5) * cw, oy - ch * 0.06, cw * 0.22, ch * 0.05, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 床: 列ごとに板の間と畳を交互に
    for (let col = 0; col < COLS; col++) {
      const x = ox + col * cw;
      if (col % 2 === 0) {
        g.fillStyle = "#e9c896";
        g.fillRect(x, oy, cw, ROWS * ch);
        g.strokeStyle = "rgba(150,100,55,0.22)";
        g.lineWidth = 1;
        for (let k = 1; k < 3; k++) {
          g.beginPath(); g.moveTo(x + (cw * k) / 3, oy); g.lineTo(x + (cw * k) / 3, floorBottom); g.stroke();
        }
        for (let r = 0; r < ROWS; r++) {
          const yy = oy + (r + (col % 4 === 0 ? 0.3 : 0.7)) * ch;
          g.beginPath(); g.moveTo(x + (cw * (r % 3)) / 3, yy); g.lineTo(x + (cw * ((r % 3) + 1)) / 3, yy); g.stroke();
        }
      } else {
        g.fillStyle = "#dcd6a0";
        g.fillRect(x, oy, cw, ROWS * ch);
        g.strokeStyle = "rgba(130,130,60,0.18)";
        g.lineWidth = 1;
        for (let yy = oy + 3; yy < floorBottom; yy += 4) {
          g.beginPath(); g.moveTo(x, yy); g.lineTo(x + cw, yy); g.stroke();
        }
        // 畳のへり
        g.fillStyle = "rgba(70,95,60,0.55)";
        g.fillRect(x, oy, 3, ROWS * ch);
        g.fillRect(x + cw - 3, oy, 3, ROWS * ch);
      }
    }
    // マス目（うすく）
    g.strokeStyle = "rgba(90,55,30,0.13)";
    g.lineWidth = 1.5;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        g.beginPath();
        g.roundRect(ox + col * cw + 3, oy + r * ch + 3, cw - 6, ch - 6, Math.min(cw, ch) * 0.16);
        g.stroke();
      }
    }
    // 盤面の外側の影
    g.fillStyle = "rgba(60,35,20,0.18)";
    g.fillRect(ox - 4, oy, 4, ROWS * ch);
    g.fillRect(ox + bw, oy, 4, ROWS * ch);

    // ママのいる所（ラグ）
    g.fillStyle = "#e9d2b2";
    g.fillRect(0, floorBottom, w, h - floorBottom);
    g.fillStyle = "#f2a0a8";
    g.beginPath();
    g.ellipse(ox + bw / 2, floorBottom + BOT_PAD * ch * 0.62, bw * 0.42, BOT_PAD * ch * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "#e07a88";
    g.setLineDash([6, 5]);
    g.beginPath();
    g.ellipse(ox + bw / 2, floorBottom + BOT_PAD * ch * 0.62, bw * 0.37, BOT_PAD * ch * 0.33, 0, 0, Math.PI * 2);
    g.stroke();
    // ここまで来たらママが…の線
    g.strokeStyle = "rgba(230,80,90,0.55)";
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.beginPath(); g.moveTo(ox, floorBottom); g.lineTo(ox + bw, floorBottom); g.stroke();
    g.setLineDash([]);
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
    // 盤面座標で描くための変換（マス → px）
    const X = (x: number) => ox + x * cw;
    const Y = (y: number) => oy + y * ch;

    const cat = b.cat;
    // 猫のマスの強調（置ける・強化できる・休けい中）
    const cell = b.catCell();
    const occupied = b.objectAt(cell.col, cell.row);
    const cx0 = X(cell.col), cy0 = Y(cell.row);
    let fill: string, stroke: string;
    if (cat.resting) { fill = "rgba(120,120,140,0.2)"; stroke = "rgba(110,110,130,0.7)"; }
    else if (occupied) { fill = "rgba(255,210,70,0.28)"; stroke = "#f0b020"; }
    else { fill = "rgba(110,220,130,0.25)"; stroke = "#4cbf6a"; }
    g.fillStyle = fill;
    g.beginPath(); g.roundRect(cx0 + 2, cy0 + 2, cw - 4, ch - 4, u * 0.16); g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 3;
    g.setLineDash(occupied ? [] : [7, 5]);
    g.lineDashOffset = -this.clock * 20;
    g.stroke();
    g.setLineDash([]);

    // 猫の攻撃が届く範囲（うすく）
    if (!cat.resting) {
      const rng = b.loadout.char.range;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(X(cat.x), Y(cat.y), rng * cw, rng * ch, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // ママ
    this.drawMama(g, X(COLS / 2), oy + ROWS * ch + BOT_PAD * ch, BOT_PAD * ch * 1.3);

    // オブジェクト
    for (const o of b.objects) this.drawObject(g, o, X(o.col + 0.5), Y(o.row + 0.5));

    // カリカリ
    const kib = getSprite("pickup", "kibble");
    const ks = u * 0.42;
    for (const p of b.pickups) {
      if (p.age > PICKUP_AUTO_TIME - 1.5 && Math.floor(p.age * 8) % 2 === 0) continue;
      const bob = Math.sin(this.clock * 5 + p.uid) * u * 0.04;
      const pop = p.age < 0.2 ? 0.6 + p.age * 2 : 1;
      if (pop < 1) g.drawImage(kib, X(p.x) - (ks * pop) / 2, Y(p.y) - (ks * pop) / 2 + bob, ks * pop, ks * pop);
      else this.blit(kib, X(p.x), Y(p.y) + bob, ks);
    }

    // 虫（地面の虫 → 猫 → 飛ぶ虫）
    for (const bug of b.bugs) if (!bug.def.fly) this.drawBug(g, bug, X(bug.x), Y(bug.y));
    this.drawCat(g, dt, X(cat.x), Y(cat.y));
    for (const bug of b.bugs) if (bug.def.fly) this.drawBug(g, bug, X(bug.x), Y(bug.y));

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
        this.blit(img, X(p.x), Y(p.y), s);
      }
    }

    // 演出
    this.drawFx(g, dt);

    // ダメージの数字
    const fs = Math.max(11, u * 0.3);
    g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = Math.max(3, fs * 0.22);
    g.strokeStyle = OL;
    for (const f of b.floats) {
      const k = f.age / FLOAT_LIFE;
      const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const sc = k < 0.15 ? 0.7 + k * 3 : 1.15 - Math.min(0.15, (k - 0.15) * 0.4);
      const x = X(f.x), y = Y(f.y) - k * ch * 0.6;
      g.globalAlpha = Math.max(0, alpha);
      const t = dmgText(f.value);
      if (sc !== 1) {
        g.save();
        g.translate(x, y);
        g.scale(sc, sc);
        g.strokeText(t, 0, 0);
        g.fillStyle = f.kind === "bug" ? "#fff" : f.kind === "cat" ? "#ff6b6b" : "#ffb35a";
        g.fillText(t, 0, 0);
        g.restore();
      } else {
        g.strokeText(t, x, y);
        g.fillStyle = f.kind === "bug" ? "#fff" : f.kind === "cat" ? "#ff6b6b" : "#ffb35a";
        g.fillText(t, x, y);
      }
    }
    g.globalAlpha = 1;

    // 波の文字
    this.drawBanner(g, dt);
  }

  private drawMama(g: CanvasRenderingContext2D, cx: number, bottom: number, size: number): void {
    const scared = this.mamaScared > 0;
    const img = getSprite("mama", scared ? "scared" : "normal");
    const b = this.battle;
    const low = b.mamaHp / Math.max(1, b.mamaMaxHp) < 0.4;
    const tremble = scared ? Math.sin(this.clock * 60) * size * 0.03 : low ? Math.sin(this.clock * 30) * size * 0.012 : Math.sin(this.clock * 2) * size * 0.01;
    g.drawImage(img, cx - size / 2 + tremble, bottom - size * 0.98, size, size);
  }

  private drawObject(g: CanvasRenderingContext2D, o: Battle["objects"][number], x: number, y: number): void {
    const { u } = this.L;
    const hint: SpriteHint = { kind: o.def.kind };
    let s = u * 0.9;
    // 撃った直後は少しはねる
    if ((o.def.kind === "shooter" || o.def.kind === "slow" || o.def.kind === "aoe") && o.timer < 0.12) s *= 1.08 - o.timer * 0.6;
    let dx = 0;
    if (o.hurt > 0) dx = Math.sin(this.clock * 80) * u * 0.03;
    if (o.def.kind === "aoe" && o.timer < 0.25) {
      // 掃除機が吸いこむ
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, u * o.def.range * (1 - o.timer * 3), 0, Math.PI * 2);
      g.stroke();
    }
    this.blit(getSprite("object", o.def.id, hint), x + dx, y, s);
    if (o.hurt > 0) {
      g.globalAlpha = Math.min(1, o.hurt / 0.15) * 0.7;
      this.blit(getFlashSprite("object", o.def.id, hint), x + dx, y, s);
      g.globalAlpha = 1;
    }
    // 強化の星
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

  private drawBug(g: CanvasRenderingContext2D, bug: Battle["bugs"][number], x: number, y: number): void {
    const { u } = this.L;
    const boss = !!bug.def.boss;
    const s = u * (boss ? 1.35 : 0.84);
    const id = bug.def.id;
    let yy = y;
    // 出てきたばかりの虫は、すきまから少しずつ現れる
    const fade = bug.y < 0 ? Math.max(0, Math.min(1, (bug.y - SPAWN_Y) / 0.5 + 0.2)) : 1;
    if (fade < 1) g.globalAlpha = fade;
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
      g.ellipse(x, y + s * 0.15, s * 0.42, s * 0.18, 0, 0, Math.PI * 2);
      g.fill();
    }
    const wob = bug.mode === "bite"
      ? Math.sin(this.clock * 30 + bug.uid) * 0.12
      : Math.sin(this.clock * 12 * bug.speed * bug.slowMul + bug.uid) * 0.09;
    const by = bug.mode === "bite" ? Math.abs(Math.sin(this.clock * 15 + bug.uid)) * s * 0.06 : 0;
    // 回転は重いので、左右のゆれで歩いているように見せる
    const bx = x + wob * s * 0.3;
    this.blit(getSprite("bug", id), bx, yy + by, s);
    if (bug.hurt > 0) {
      g.globalAlpha = Math.min(1, bug.hurt / 0.12) * 0.85 * fade;
      this.blit(getFlashSprite("bug", id), bx, yy + by, s);
    }
    g.globalAlpha = 1;
    if (bug.hp < bug.maxHp) hpBar(g, x, yy - s * 0.48, s * 0.7, Math.max(3, u * 0.065), bug.hp / bug.maxHp, boss ? "#ff4a6a" : "#ff8a4a");
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
      // 残り時間のわっか
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
      // Zzz
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
    // ねこパンチの線
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
