// 戦闘の盤面を Canvas 2D で描く（エンジンの state を読むだけ。状態は変えない）。
//
// v3: 焦げ茶のフローリングの大きな部屋（14列 × 18行）。上の壁に虫の出てくる穴（章 3 からは左右の壁の上の方にも）、
// 一番下の真ん中の 2×2 にママ。マスは正方形で、幅と高さの小さい方に合わせる（390px 幅のスマホで 1 マス 27px ほど）。
// オブジェクトは大きさ（w×h マス）どおりに描く。通れないものは影つきで立体に、通れるものは床に平たく。
// 虫の通り道（出口からママまでの最短の道）をうすい点線と矢印で出す（showPath で切りかえ）。
// 置こうとしているカードの「影」（ghost）を、置ける＝緑・置けない＝赤（理由つき）で出す。
// 電撃のぎざぎざの線・毒の雲・範囲の輪・会心の「!」つき数字。
// 背景（床・壁・マス目）は大きさが変わったときだけオフスクリーンに描いておき、毎コマはそれを貼るだけ。
// v4: 相棒（battle.cats[1]〜）も描く（主人公の 85% の大きさ。絵は char.look）。手前（下）の猫ほどあとに描く。
// 複合効果の見た目: frenzy・kibbleFever の重ね（猫の上の小さな点）、wakeUp の光、lastStand の赤い気配、partyLink の線、
// 毒の爆発・衝撃波・反撃・余ったダメージ（オレンジの電撃）・連続攻撃のこだま など。
// v5: 虫の通り道は、置いているあいだだけ出す（showPath は画面が毎コマ決める）。かじる虫がいるステージでは、かじる道もオレンジで。
// battle.held（止めている）のあいだは、虫・猫・弾の動き（ゆれ・歩き）も止める（simClock）。
// 家具は sprites.drawFurniture で、大きさごとに一度だけ描いてためておく。床は StageDef.theme で変わる
// （なし・living: 焦げ茶のフローリング / kitchen: タイル / bedroom: じゅうたん / washitsu: たたみ / study: 木の床 / bath: 明るいタイル）。
// ママは PNG（mama / mama_scared）があれば縦横比そのままで 2×2 に収める（虫が着いた・負けたときは scared）。
// かたい虫（catResist < 1）には小さな盾。オブジェクトがかじられると、くず・HP バー・こわれる演出。相棒のひと休み（座る・毛づくろい）。

import { COLS, ROWS } from "../core/types";
import type { Battle, BattleEvent, BugState, CatState, ObjState } from "./engine";
import { FEVER_MAX, FLOAT_LIFE, FRENZY_MAX, GOAL_COL, GOAL_H, GOAL_ROW, GOAL_W, GOAL_X, KNOCK_TIME, SIDE_SPAWN_ROWS, SPAWN_Y } from "./engine";
import { drawFurniture, getCatIdlePose, getCatPose, getFlashSprite, getSprite, imageSize, spriteVersion, type CatPose, type SpriteHint } from "./sprites";
import { fmt } from "../core/num";

/** 上の壁（虫の出てくる所）の、少なくともの高さ（マスに対する割合）。 */
const TOP_PAD = 0.6;
/** 下の幅木の高さ。 */
const BOT_PAD = 0.2;
/** 左右の壁の厚さ。 */
const SIDE_PAD = 0.14;

const OL = "#2a170d";

interface Fx {
  type: "pop" | "ring" | "spark" | "puff" | "text" | "debris" | "cloud" | "flash";
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

interface Bolt { x0: number; y0: number; x1: number; y1: number; t: number; life: number; k: number; hot?: boolean }

/** 相棒の大きさ（主人公に対する割合）。 */
const COMPANION_SCALE = 0.85;

const MAX_FX = 360;
const MAX_BOLTS = 80;

export interface Layout {
  w: number;      // canvas の CSS 幅
  h: number;
  cw: number;     // マスの幅（CSS px）
  ch: number;
  u: number;      // 絵の基準の大きさ（= マスの大きさ）
  ox: number;     // 列 0 の左端
  oy: number;     // 行 0 の上端
}

/** 置こうとしているカードの影。 */
export interface Ghost {
  slot: number;
  col: number;    // 左上のマス
  row: number;
  ok: boolean;
  reason?: string;
}

export class BattleView {
  readonly canvas: HTMLCanvasElement;
  /** 虫の通り道を出すか（v5: 画面が、置いているあいだだけ true にする）。 */
  showPath = false;
  /** 置こうとしているカードの影（null なら無し）。 */
  ghost: Ghost | null = null;
  /** 情報を出しているオブジェクト（強調して射程を出す）。 */
  selectedUid = -1;
  private readonly g: CanvasRenderingContext2D;
  private dpr = 1;
  private bg: HTMLCanvasElement | null = null;
  L: Layout = { w: 1, h: 1, cw: 1, ch: 1, u: 1, ox: 0, oy: 0 };
  private fx: Fx[] = [];
  private bolts: Bolt[] = [];
  private shake = 0;
  private shx = 0;
  private shy = 0;
  private mamaScared = 0;
  private banner = { text: "", sub: "", t: 99 };
  private clock = 0;
  /** 戦闘が進んでいるあいだだけ進む時計（止めているあいだは、虫のゆれ・猫の歩きも止める）。 */
  private simClock = 0;
  /** 家具の絵（ステージの障害物ごと。大きさが変わったとき・絵が差しかわったときに描きなおす）。 */
  private furn: { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
  private furnVer = -1;
  /** 猫ごとの見た目の状態（battle.cats と同じ順）。 */
  private lastCats: { x: number; y: number; moving: number; atkHold: number }[] = [];
  private catHints: SpriteHint[] = [];
  private catLooks: string[] = [];
  private catOrder: CatState[] = [];
  private readonly topHoles: number[];
  private readonly sideHoles: boolean;
  /** 通り道（マスからマスへの線）。flowVersion が変わったら作りなおす。 */
  private route: { edges: [number, number, number, number][]; chew: [number, number, number, number][]; starts: [number, number][]; ver: number } = { edges: [], chew: [], starts: [], ver: -1 };
  /** 虫の向き（なめらかに回す）。 */
  private bugAngle = new Map<number, number>();

  constructor(canvas: HTMLCanvasElement, private readonly battle: Battle) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false })!;
    for (const c of battle.cats) {
      this.catLooks.push(c.char.look || c.char.id);
      this.catHints.push({ role: c.char.role });
      this.lastCats.push({ x: c.x, y: c.y, moving: 0, atkHold: 0 });
    }
    const st = battle.loadout.stage;
    const lanes = new Set<number>();
    let any = false;
    for (const w of st.waves) for (const e of w.bugs) {
      if (e.lanes && e.lanes.length > 0) e.lanes.forEach((l) => lanes.add(Math.max(0, Math.min(COLS - 1, Math.floor(l)))));
      else any = true;
    }
    this.topHoles = any || lanes.size === 0 ? Array.from({ length: COLS }, (_, i) => i) : [...lanes];
    this.sideHoles = battle.hasSideSpawns && (any || lanes.size === 0);
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
    const cell = Math.max(1, Math.min(w / (COLS + SIDE_PAD * 2), h / rows));
    const ox = (w - cell * COLS) / 2;
    // 床は下にそろえる（あまった高さは上の壁になる。親指から近く、ママのまわりが見やすい）
    const oy = h - cell * (ROWS + BOT_PAD);
    this.L = { w, h, cw: cell, ch: cell, u: cell, ox, oy };
    this.scaled.clear();
    this.bg = this.renderBackground();
    this.furnVer = -1;
  }

  /** 家具の絵をためておく（影つき。少しはみ出してもよいように、まわりに余白）。 */
  private buildFurniture(): void {
    const { cw, ch, u, ox, oy } = this.L;
    const pad = Math.ceil(u * 0.3);
    const d = this.dpr;
    this.furn = this.battle.obstacles.map((ob, i) => {
      const w = Math.max(1, ob.w ?? 1), h = Math.max(1, ob.h ?? 1);
      const bw = w * cw - u * 0.1, bh = h * ch - u * 0.1;
      const cssW = bw + pad * 2, cssH = bh + pad * 2;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(cssW * d));
      c.height = Math.max(1, Math.round(cssH * d));
      const g = c.getContext("2d")!;
      g.scale(d, d);
      g.fillStyle = "rgba(10,5,2,0.45)";
      g.beginPath(); g.roundRect(pad + u * 0.1, pad + u * 0.15, bw, bh, u * 0.14); g.fill();
      const faceLeft = ob.col + w / 2 > COLS / 2;
      drawFurniture(g, ob.kind, pad, pad, bw, bh, u, faceLeft, i + ob.col * 31 + ob.row * 7);
      return { c, x: ox + ob.col * cw + u * 0.05 - pad, y: oy + ob.row * ch + u * 0.05 - pad, w: cssW, h: cssH };
    });
    this.furnVer = spriteVersion();
  }

  /** 盤面の座標 → canvas の CSS 座標。 */
  toPx(x: number, y: number): { x: number; y: number } {
    return { x: this.L.ox + x * this.L.cw, y: this.L.oy + y * this.L.ch };
  }

  /** canvas の CSS 座標 → 盤面の座標（マス単位。外もそのまま返す）。 */
  fromPx(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.L.ox) / this.L.cw, y: (py - this.L.oy) / this.L.ch };
  }

  /** 波の始まりなどの大きな文字。 */
  showBanner(text: string, sub = ""): void {
    this.banner = { text, sub, t: 0 };
  }

  /** エンジンの出来事から、演出を足す。 */
  onEvents(events: readonly BattleEvent[]): void {
    let kills = 0;
    for (const e of events) {
      switch (e.type) {
        case "kill": {
          kills++;
          if (kills > 24) break;
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.4, life: 0.3, color: "#fff" });
          const n = this.fx.length > 220 ? 1 : 4;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2;
            this.addFx({ type: "pop", x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 0.08, life: 0.4, color: POP_COLORS[i % POP_COLORS.length] });
          }
          break;
        }
        case "kibble":
          if (this.fx.length < 200 && kills < 12) this.addFx({ type: "text", x: e.x, y: e.y - 0.35, vy: -0.6, r: 0.42, life: 0.6, color: "#ffd84a", text: `+${dmgText(e.value)}` });
          break;
        case "aoe":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.35, color: "rgba(255,255,255,0.9)" });
          break;
        case "splash":
          if (this.fx.length < 300) this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.3, color: "#ffb04a" });
          break;
        case "slow":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.4, color: "rgba(140,210,255,0.9)" });
          break;
        case "mine":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.5, color: "#ffb84a" });
          this.addFx({ type: "text", x: e.x, y: e.y - 0.2, r: 0.6, life: 0.7, color: "#ff8a3a", text: "ばちん!" });
          this.shake = Math.max(this.shake, 0.18);
          break;
        case "zap":
          if (this.bolts.length >= MAX_BOLTS) this.bolts.shift();
          this.bolts.push({ x0: e.x, y0: e.y, x1: e.x2, y1: e.y2, t: 0, life: 0.3, k: e.value });
          if (this.fx.length < 300) this.addFx({ type: "spark", x: e.x2, y: e.y2, r: 0.16, life: 0.25, color: "#bfe8ff" });
          break;
        case "poisonCloud":
          for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * e.value * 0.6;
            this.addFx({ type: "cloud", x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, r: e.value * (0.45 + Math.random() * 0.3), life: 0.9 + Math.random() * 0.4, color: i % 2 ? "120,200,90" : "160,110,210" });
          }
          break;
        case "poisonSpread":
          if (this.fx.length < 300) {
            this.addFx({ type: "cloud", x: e.x, y: e.y, r: e.value * 0.8, life: 0.6, color: "120,210,90" });
            this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.35, color: "#8fe070" });
          }
          break;
        case "dodge":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.55, r: 0.4, life: 0.6, color: "#bfe8ff", text: "ひらり" });
          break;
        case "poisonBurst": {
          // 毒の爆発（緑と紫の雲＋輪＋かけら）
          if (this.fx.length > 320) break;
          this.addFx({ type: "flash", x: e.x, y: e.y, r: e.value * 0.9, life: 0.18, color: "#e6ffb0" });
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.4, color: "#9cf060" });
          this.addFx({ type: "cloud", x: e.x, y: e.y, r: e.value * 0.7, life: 0.7, color: "150,90,210" });
          const n = this.fx.length > 220 ? 2 : 6;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 2.5;
            this.addFx({ type: "pop", x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, r: 0.09, life: 0.45, color: i % 2 ? "#9cf060" : "#c08af0" });
          }
          this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case "slam":
          if (this.fx.length > 300) break;
          this.addFx({ type: "spark", x: e.x, y: e.y, r: 0.3, life: 0.25, color: "#fff2b0" });
          this.addFx({ type: "text", x: e.x, y: e.y - 0.3, r: 0.42, life: 0.5, color: "#ffcf5a", text: "ドン!" });
          this.shake = Math.max(this.shake, 0.08);
          break;
        case "shockwave":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value * 1.5, life: 0.45, color: "rgba(150,220,255,0.95)" });
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value * 1.1, life: 0.3, color: "#ffffff" });
          break;
        case "counter":
          this.addFx({ type: "flash", x: e.x, y: e.y, r: e.value * 1.1, life: 0.2, color: "#ffffff" });
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.3, color: "#bfe8ff" });
          this.addFx({ type: "text", x: e.x, y: e.y - 0.9, r: 0.42, life: 0.6, color: "#ffffff", text: "カウンター!" });
          break;
        case "echo":
          this.addFx({ type: "ring", x: e.x, y: e.y, r: e.value, life: 0.35, color: "#ffb04a" });
          this.addFx({ type: "spark", x: e.x, y: e.y, r: 0.25, life: 0.25, color: "#ffd84a" });
          break;
        case "overkill":
          if (this.bolts.length >= MAX_BOLTS) this.bolts.shift();
          this.bolts.push({ x0: e.x, y0: e.y, x1: e.x2, y1: e.y2, t: 0, life: 0.3, k: 0, hot: true });
          break;
        case "wakeUp":
          this.addFx({ type: "flash", x: e.x, y: e.y, r: 1.2, life: 0.35, color: "#fff6c0" });
          this.addFx({ type: "text", x: e.x, y: e.y - 1, r: 0.48, life: 1, color: "#ffe14a", text: "めざめた!" });
          break;
        case "objectSync":
          if (this.fx.length < 240) this.addFx({ type: "spark", x: e.x, y: e.y - 0.3, r: 0.16, life: 0.3, color: "#8fffd8" });
          break;
        case "knockback":
          if (this.fx.length < 260) this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.3, life: 0.22, color: "#fff2b0" });
          break;
        case "push":
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 0.35, life: 0.3, color: "#ffffff" });
          break;
        case "place":
          this.addFx({ type: "puff", x: e.x, y: e.y, r: 1, life: 0.35, color: "#fff" });
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.addFx({ type: "debris", x: e.x, y: e.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1, r: 0.07, life: 0.4, color: "#e8d2b0" });
          }
          break;
        case "upgrade":
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.addFx({ type: "spark", x: e.x, y: e.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, r: 0.18, life: 0.5, color: "#ffd84a" });
          }
          this.addFx({ type: "text", x: e.x, y: e.y - 0.4, r: 0.55, life: 0.8, color: "#ffd84a", text: "UP!" });
          break;
        case "objectBroken": {
          // こわれた: ぽふっと煙＋かけらが飛び散る
          const sz = Math.max(1, e.value);
          this.addFx({ type: "flash", x: e.x, y: e.y, r: sz * 0.6, life: 0.18, color: "#fff2d8" });
          this.addFx({ type: "puff", x: e.x, y: e.y, r: sz * 0.9, life: 0.45, color: "#e8d2b0" });
          this.addFx({ type: "cloud", x: e.x, y: e.y, r: sz * 0.55, life: 0.7, color: "200,180,150" });
          for (let i = 0; i < 8 + sz * 3; i++) {
            const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
            this.addFx({ type: "debris", x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.8, r: 0.07 + Math.random() * 0.07, life: 0.55 + Math.random() * 0.25, color: i % 3 ? "#c98f4f" : "#f0dcc0" });
          }
          this.addFx({ type: "text", x: e.x, y: e.y - 0.4, r: 0.48, life: 0.9, color: "#ffb35a", text: "こわれた!" });
          this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case "objectHit":
          // かじられた所から、くずがこぼれる
          if (this.fx.length < 240 && Math.random() < 0.6) {
            const mx = (e.x + e.x2) / 2, my = (e.y + e.y2) / 2;
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2;
              this.addFx({ type: "debris", x: mx, y: my, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2 - 1, r: 0.05, life: 0.35, color: "#e8d2b0" });
            }
          }
          break;
        case "resist":
          if (this.fx.length < 260) this.addFx({ type: "text", x: e.x, y: e.y - 0.6, r: 0.36, life: 0.7, color: "#c8c8c8", text: "かたい" });
          break;
        case "catDown":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.6, r: 0.5, life: 1.2, color: "#9fd8ff", text: "きゅう…" });
          break;
        case "catUp":
          this.addFx({ type: "text", x: e.x, y: e.y - 0.6, r: 0.5, life: 0.9, color: "#ffd84a", text: "ふっかつ!" });
          break;
        case "mamaHit":
          this.shake = Math.max(this.shake, 0.35);
          this.mamaScared = 0.9;
          this.addFx({ type: "text", x: GOAL_X, y: GOAL_ROW - 0.4, r: 0.65, life: 0.9, color: "#ff5a6a", text: "きゃー!" });
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
    const top = 0;
    const floorBottom = oy + bh;
    const side = Math.max(3, SIDE_PAD * cw);
    const rnd = mulberry(7);

    // 外側
    g.fillStyle = "#1c120c";
    g.fillRect(0, 0, w, h);

    // 床（StageDef.theme で変わる。なければ焦げ茶のフローリング）
    const theme = this.battle.loadout.stage.theme;
    if (theme === "kitchen" || theme === "bath") this.tileFloor(g, theme === "bath", ox, oy, bw, bh, rnd);
    else if (theme === "bedroom") this.carpetFloor(g, ox, oy, bw, bh, rnd);
    else if (theme === "washitsu") this.tatamiFloor(g, ox, oy, bw, bh);
    else this.woodFloor(g, theme === "study", ox, oy, bw, bh, floorBottom, rnd);
    // マス目（ごくうすく）
    g.strokeStyle = "rgba(255,225,190,0.07)";
    g.lineWidth = 1;
    g.beginPath();
    for (let col = 1; col < COLS; col++) { g.moveTo(ox + col * cw + 0.5, oy); g.lineTo(ox + col * cw + 0.5, floorBottom); }
    for (let r = 1; r < ROWS; r++) { g.moveTo(ox, oy + r * ch + 0.5); g.lineTo(ox + bw, oy + r * ch + 0.5); }
    g.stroke();

    // ママのラグ（2×2 のまわり）
    const mx = ox + (GOAL_COL + GOAL_W / 2) * cw, my = oy + (GOAL_ROW + GOAL_H / 2) * ch;
    g.fillStyle = "#e88d9c";
    g.beginPath(); g.ellipse(mx, my, cw * 1.55, ch * 1.15, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffd0d8";
    g.lineWidth = 2;
    g.setLineDash([5, 4]);
    g.beginPath(); g.ellipse(mx, my, cw * 1.3, ch * 0.95, 0, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "rgba(255,120,140,0.6)";
    g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(ox + GOAL_COL * cw + 2, oy + GOAL_ROW * ch + 2, cw * GOAL_W - 4, ch * GOAL_H - 4, u * 0.25); g.stroke();

    // 上の壁（壁紙）
    g.fillStyle = WALL_COLORS[theme ?? ""] ?? "#efe0c6";
    g.fillRect(ox - side, top, bw + side * 2, oy - top);
    g.fillStyle = "rgba(190,160,120,0.22)";
    for (let x = ox - side; x < ox + bw + side; x += 10) g.fillRect(x, top, 4, oy - top);
    // 窓（壁が高いとき）
    const wallH = oy - top;
    if (wallH > ch * 1.8) {
      const wh = Math.min(wallH - ch * 0.9, ch * 3.2), wy = oy - ch * 0.45 - wh;
      for (const [wx0, ww0] of [[2, 3.2], [8.8, 3.2]] as const) {
        const wx = ox + wx0 * cw, ww = ww0 * cw;
        g.fillStyle = "#fff"; g.strokeStyle = "#6b4228"; g.lineWidth = 3;
        g.beginPath(); g.roundRect(wx, wy, ww, wh, 5); g.fill(); g.stroke();
        const glass = g.createLinearGradient(0, wy, 0, wy + wh);
        glass.addColorStop(0, "#9fd3f2"); glass.addColorStop(1, "#e2f4ff");
        g.fillStyle = glass;
        g.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);
        g.fillStyle = "#6b4228";
        g.fillRect(wx + ww / 2 - 1.5, wy + 2, 3, wh - 4);
        g.fillRect(wx + 2, wy + wh / 2 - 1.5, ww - 4, 3);
        // カーテン
        g.fillStyle = "rgba(240,150,160,0.85)";
        g.beginPath(); g.moveTo(wx - 4, wy - 4); g.quadraticCurveTo(wx + ww * 0.2, wy + wh * 0.5, wx + 2, wy + wh + 4); g.lineTo(wx - 6, wy + wh + 4); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(wx + ww + 4, wy - 4); g.quadraticCurveTo(wx + ww * 0.8, wy + wh * 0.5, wx + ww - 2, wy + wh + 4); g.lineTo(wx + ww + 6, wy + wh + 4); g.closePath(); g.fill();
      }
    }
    // 幅木
    const bbH = ch * 0.2;
    g.fillStyle = "#6b4228";
    g.fillRect(ox - side, oy - bbH, bw + side * 2, bbH);
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(ox - side, oy - 2, bw + side * 2, 2);
    // 虫の出てくる穴（すきま）
    for (const col of this.topHoles) {
      const hx = ox + (col + 0.5) * cw, hw = cw * 0.55, hh = ch * 0.4;
      g.fillStyle = "#120a05";
      g.beginPath();
      g.moveTo(hx - hw / 2, oy);
      g.lineTo(hx - hw / 2, oy - hh + hw / 2);
      g.arc(hx, oy - hh + hw / 2, hw / 2, Math.PI, 0);
      g.lineTo(hx + hw / 2, oy);
      g.closePath();
      g.fill();
    }

    // 左右の壁
    g.fillStyle = "#6b4228";
    g.fillRect(ox - side, oy, side, bh);
    g.fillRect(ox + bw, oy, side, bh);
    if (this.sideHoles) {
      for (let r = 0; r < SIDE_SPAWN_ROWS; r++) {
        for (const left of [true, false]) {
          const hy = oy + (r + 0.5) * ch, hh = ch * 0.55;
          g.fillStyle = "#120a05";
          g.beginPath(); g.roundRect(left ? ox - side : ox + bw, hy - hh / 2, side, hh, 2); g.fill();
        }
      }
    }
    // 下の幅木
    g.fillStyle = "#6b4228";
    g.fillRect(ox - side, floorBottom, bw + side * 2, Math.max(3, BOT_PAD * ch * 0.8));
    return c;
  }

  /** 板の床（焦げ茶のフローリング。study は明るめの木）。横長の板を、ずらして並べる。 */
  private woodFloor(g: CanvasRenderingContext2D, light: boolean, ox: number, oy: number, bw: number, bh: number, floorBottom: number, rnd: () => number): void {
    const { cw, ch } = this.L;
    g.fillStyle = light ? "#6e4a2c" : "#4a2d1e";
    g.fillRect(ox, oy, bw, bh);
    const plankH = ch * (light ? 0.42 : 0.5);
    const tones = light ? ["#74502f", "#7b5634", "#6a462a", "#805a37", "#714c2d"] : ["#4f3020", "#553424", "#47291b", "#5b3926", "#4b2c1d"];
    for (let i = 0, y = oy; y < floorBottom - 0.5; i++, y += plankH) {
      const ph = Math.min(plankH, floorBottom - y);
      let x = ox - rnd() * cw * 3;
      while (x < ox + bw) {
        const len = cw * (2.5 + rnd() * 3);
        const x0 = Math.max(ox, x), x1 = Math.min(ox + bw, x + len);
        g.fillStyle = tones[Math.floor(rnd() * tones.length)];
        g.fillRect(x0, y, x1 - x0, ph);
        // 木目
        g.strokeStyle = "rgba(255,210,160,0.05)";
        g.lineWidth = 1;
        for (let k = 0; k < 2; k++) {
          const gy = y + ph * (0.25 + rnd() * 0.5);
          g.beginPath();
          g.moveTo(x0, gy);
          g.bezierCurveTo(x0 + (x1 - x0) * 0.3, gy + (rnd() - 0.5) * 3, x0 + (x1 - x0) * 0.7, gy + (rnd() - 0.5) * 3, x1, gy);
          g.stroke();
        }
        // 継ぎ目（たて）
        if (x1 < ox + bw) {
          g.fillStyle = "rgba(15,7,3,0.6)";
          g.fillRect(x1 - 0.5, y, 1.2, ph);
        }
        x += len;
      }
      // 継ぎ目（よこ）
      g.fillStyle = "rgba(15,7,3,0.55)";
      g.fillRect(ox, y, bw, 1.2);
      g.fillStyle = "rgba(255,220,180,0.05)";
      g.fillRect(ox, y + 1.2, bw, 1);
    }
  }

  /** タイルの床（kitchen: テラコッタの市松 / bath: 明るい水色の小さなタイル）。 */
  private tileFloor(g: CanvasRenderingContext2D, bath: boolean, ox: number, oy: number, bw: number, bh: number, rnd: () => number): void {
    const { cw } = this.L;
    const t = bath ? cw * 0.5 : cw;
    g.fillStyle = bath ? "#7f9ea8" : "#4e3a30";
    g.fillRect(ox, oy, bw, bh);
    const a = bath ? ["#a9c4cc", "#b3ccd3", "#a2bec7"] : ["#7a5a48", "#6c4e3e"];
    const gap = Math.max(1, t * (bath ? 0.06 : 0.05));
    for (let r = 0, y = oy; y < oy + bh - 0.5; r++, y += t) {
      for (let c = 0, x = ox; x < ox + bw - 0.5; c++, x += t) {
        g.fillStyle = bath ? a[Math.floor(rnd() * a.length)] : a[(r + c) % 2];
        g.fillRect(x + gap / 2, y + gap / 2, Math.min(t, ox + bw - x) - gap, Math.min(t, oy + bh - y) - gap);
        // つや
        g.fillStyle = bath ? "rgba(255,255,255,0.14)" : "rgba(255,220,180,0.06)";
        g.fillRect(x + gap, y + gap, t * 0.35, t * 0.12);
      }
    }
  }

  /** じゅうたん（bedroom。くすんだ紫の毛足＋ふちの模様）。 */
  private carpetFloor(g: CanvasRenderingContext2D, ox: number, oy: number, bw: number, bh: number, rnd: () => number): void {
    const { cw } = this.L;
    g.fillStyle = "#4f3b52";
    g.fillRect(ox, oy, bw, bh);
    // 毛足（小さな点）
    for (let k = 0; k < (bw * bh) / 18; k++) {
      g.fillStyle = rnd() < 0.5 ? "rgba(255,220,240,0.05)" : "rgba(0,0,0,0.08)";
      g.fillRect(ox + rnd() * bw, oy + rnd() * bh, 1.5, 1.5);
    }
    // ふちの模様
    const m = cw * 0.35;
    g.strokeStyle = "rgba(240,190,140,0.28)";
    g.lineWidth = Math.max(1.5, cw * 0.06);
    g.strokeRect(ox + m, oy + m, bw - m * 2, bh - m * 2);
    g.strokeStyle = "rgba(240,190,140,0.14)";
    g.strokeRect(ox + m * 1.6, oy + m * 1.6, bw - m * 3.2, bh - m * 3.2);
  }

  /** たたみ（washitsu。1×2 マスの畳を、たて・よこ交互に。黒っぽいへり）。 */
  private tatamiFloor(g: CanvasRenderingContext2D, ox: number, oy: number, bw: number, bh: number): void {
    const { cw, ch } = this.L;
    g.fillStyle = "#4a4628";
    g.fillRect(ox, oy, bw, bh);
    const heri = Math.max(1.5, cw * 0.07);
    const mat = (x: number, y: number, w: number, h: number, vert: boolean) => {
      g.fillStyle = vert ? "#7d7a46" : "#78763f";
      g.fillRect(x, y, w, h);
      // い草のすじ
      g.strokeStyle = "rgba(255,250,200,0.07)";
      g.lineWidth = 1;
      g.beginPath();
      if (vert) for (let xx = x + 2; xx < x + w; xx += 3) { g.moveTo(xx, y); g.lineTo(xx, y + h); }
      else for (let yy = y + 2; yy < y + h; yy += 3) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
      g.stroke();
      // へり（長い辺）
      g.fillStyle = "#454a2a";
      if (vert) { g.fillRect(x, y, heri, h); g.fillRect(x + w - heri, y, heri, h); }
      else { g.fillRect(x, y, w, heri); g.fillRect(x, y + h - heri, w, heri); }
      g.strokeStyle = "rgba(20,15,5,0.4)";
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    for (let r = 0; r < ROWS; r += 2) {
      for (let c = 0; c < COLS; c += 2) {
        const x = ox + c * cw, y = oy + r * ch;
        const w2 = Math.min(2, COLS - c) * cw, h2 = Math.min(2, ROWS - r) * ch;
        // 2×2 を、2 枚の畳（たて2つ か よこ2つ）で
        if (((r + c) / 2) % 2 === 0) { mat(x, y, w2 / 2, h2, true); mat(x + w2 / 2, y, w2 / 2, h2, true); }
        else { mat(x, y, w2, h2 / 2, false); mat(x, y + h2 / 2, w2, h2 / 2, false); }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 毎コマ
  // -------------------------------------------------------------------------

  render(dt: number): void {
    const g = this.g;
    const b = this.battle;
    const { cw, ch, u, ox, oy } = this.L;
    this.clock += dt;
    const sdt = b.held ? 0 : dt;
    this.simClock += sdt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    if (this.mamaScared > 0) this.mamaScared -= dt;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.bg) g.drawImage(this.bg, 0, 0, this.L.w, this.L.h);
    this.shx = 0; this.shy = 0;
    if (this.shake > 0) {
      const m = this.shake * u * 0.3;
      this.shx = (Math.random() - 0.5) * m;
      this.shy = (Math.random() - 0.5) * m;
      g.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.shx, this.dpr * this.shy);
    }
    const X = (x: number) => ox + x * cw;
    const Y = (y: number) => oy + y * ch;

    // 虫の通り道
    if (this.showPath) this.drawRoute(g);

    // 猫の攻撃が届く範囲（うすく）
    const cat = b.cat;
    if (!cat.resting) {
      const rng = cat.char.range;
      g.strokeStyle = "rgba(255,255,255,0.3)";
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(X(cat.x), Y(cat.y), rng * u, 0, Math.PI * 2);
      g.stroke();
    }

    // オブジェクト: 通れるもの（床）→ 通れないもの・家具（上の行から。下の行が手前）
    for (const o of b.objects) if (!o.def.block) this.drawFlatObject(g, o);
    const items: { row: number; o?: ObjState; ob?: { col: number; row: number; kind: string; w?: number; h?: number }; fi?: number }[] = [];
    for (const o of b.objects) if (o.def.block) items.push({ row: o.row + o.h, o });
    if (this.furnVer !== spriteVersion() || this.furn.length !== b.obstacles.length) this.buildFurniture();
    b.obstacles.forEach((ob, i) => items.push({ row: ob.row + (ob.h ?? 1), ob, fi: i }));
    items.sort((p, q) => p.row - q.row);
    for (const it of items) {
      if (it.o) this.drawSolidObject(g, it.o);
      else if (it.fi !== undefined) {
        const f = this.furn[it.fi];
        if (f) g.drawImage(f.c, f.x, f.y, f.w, f.h);
      }
    }
    // 選んでいるオブジェクトの射程
    if (this.selectedUid >= 0) {
      const o = b.objectByUid(this.selectedUid);
      if (o) this.drawRangeHighlight(g, o.col, o.row, o.w, o.h, o.def.range, o.def.kind, "#ffd84a");
    }

    // ママ
    this.drawMama(g, X(GOAL_X), Y(GOAL_ROW + GOAL_H) - ch * 0.05, u * 2.3);

    // 虫 → 猫
    const bugs = b.bugs;
    for (let i = 0; i < bugs.length; i++) this.drawBug(g, bugs[i], sdt);
    this.resetTf();
    this.drawLinks(g);
    // 猫（上にいる猫から。主人公は同じ高さなら手前）
    const order = this.catOrder;
    order.length = 0;
    for (const c of b.cats) order.push(c);
    order.sort((p, q) => p.y - q.y || q.index - p.index);
    for (const c of order) this.drawCat(g, sdt, c, X(c.x), Y(c.y));
    if (this.bugAngle.size > bugs.length * 2 + 64) {
      const alive = new Set(bugs.map((x) => x.uid));
      for (const k of this.bugAngle.keys()) if (!alive.has(k)) this.bugAngle.delete(k);
    }

    // 弾
    const ps = b.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const s = (p.fromCat ? u * 0.4 : u * 0.42) * (p.crit ? 1.3 : 1);
      const img = this.scaledOf(getSprite("projectile", p.kind), s);
      const sw = img.width / this.dpr;
      if (p.kind === "shooter") {
        const a = this.simClock * 14 + p.uid;
        this.tf(X(p.x), Y(p.y), a);
        g.drawImage(img, -sw / 2, -sw / 2, sw, sw);
      } else {
        g.drawImage(img, X(p.x) - sw / 2, Y(p.y) - sw / 2, sw, sw);
      }
    }
    this.resetTf();

    // 電撃
    this.drawBolts(g, dt);
    // 演出
    this.drawFx(g, dt);

    // ダメージの数字
    const fs = Math.max(10, u * 0.42);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.strokeStyle = OL;
    g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif`;
    g.lineWidth = Math.max(2.5, fs * 0.22);
    for (const f of b.floats) {
      const k = f.age / FLOAT_LIFE;
      const alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      const crit = f.kind === "crit";
      const big = crit ? 1.6 : f.kind === "poison" || f.kind === "resist" ? 0.8 : f.kind === "object" ? 0.75 : 1;
      const sc = (k < 0.15 ? 0.7 + k * 3 : 1.15 - Math.min(0.15, (k - 0.15) * 0.4)) * big;
      const x = X(f.x), y = Y(f.y) - k * ch * 0.8;
      g.globalAlpha = Math.max(0, alpha);
      const t = (f.kind === "heal" ? "+" : "") + dmgText(f.value) + (crit ? "!" : "");
      this.tf(x, y, crit ? Math.sin(f.age * 40) * 0.08 : 0, sc);
      if (crit) { g.strokeStyle = "#c2300a"; g.lineWidth = Math.max(3, fs * 0.3); }
      g.strokeText(t, 0, 0);
      g.fillStyle = FLOAT_COLORS[f.kind];
      g.fillText(t, 0, 0);
      if (crit) { g.strokeStyle = OL; g.lineWidth = Math.max(2.5, fs * 0.22); }
    }
    this.resetTf();
    g.globalAlpha = 1;

    // 置こうとしているカードの影
    if (this.ghost) this.drawGhost(g, this.ghost);

    // 波の文字
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBanner(g, dt);
  }

  /** 回転・拡大つきで描く準備（setTransform で、save/restore を使わない）。 */
  private tf(x: number, y: number, ang: number, sc = 1): void {
    const d = this.dpr, c = Math.cos(ang) * sc * d, s = Math.sin(ang) * sc * d;
    this.g.setTransform(c, s, -s, c, d * (x + this.shx), d * (y + this.shy));
  }

  private resetTf(): void {
    this.g.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * this.shx, this.dpr * this.shy);
  }

  /** 置こうとしているカードの影（足もとのマス・絵・射程・理由）。 */
  private drawGhost(g: CanvasRenderingContext2D, gh: Ghost): void {
    const d = this.battle.loadout.objects[gh.slot];
    if (!d) return;
    const { cw, ch, u, ox, oy } = this.L;
    const w = Math.max(1, Math.floor(d.w || 1)), h = Math.max(1, Math.floor(d.h || 1));
    const x0 = ox + gh.col * cw, y0 = oy + gh.row * ch;
    const fill = gh.ok ? "rgba(90,220,120,0.35)" : "rgba(255,70,70,0.38)";
    const stroke = gh.ok ? "#5ee07a" : "#ff4a4a";
    if (gh.ok && d.range > 0 && d.kind !== "wall" && d.kind !== "producer") this.drawRangeHighlight(g, gh.col, gh.row, w, h, d.range, d.kind, stroke);
    g.fillStyle = fill;
    g.strokeStyle = stroke;
    g.lineWidth = 2;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      g.beginPath(); g.roundRect(x0 + c * cw + 1.5, y0 + r * ch + 1.5, cw - 3, ch - 3, u * 0.15); g.fill();
    }
    g.lineWidth = 2.5;
    g.setLineDash([6, 4]);
    g.lineDashOffset = -this.clock * 20;
    g.beginPath(); g.roundRect(x0, y0, cw * w, ch * h, u * 0.2); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.75;
    this.blit(getSprite("object", d.id, { kind: d.kind }), x0 + (cw * w) / 2, y0 + (ch * h) / 2 - u * 0.08, u * Math.min(w, h) * 0.95);
    g.globalAlpha = 1;
    if (!gh.ok) {
      // ×じるし
      const k = u * 0.25, mx = x0 + (cw * w) / 2, my = y0 + (ch * h) / 2;
      g.strokeStyle = "#ff4a4a";
      g.lineWidth = Math.max(3, u * 0.12);
      g.lineCap = "round";
      g.beginPath(); g.moveTo(mx - k, my - k); g.lineTo(mx + k, my + k); g.moveTo(mx + k, my - k); g.lineTo(mx - k, my + k); g.stroke();
      g.lineCap = "butt";
    }
    if (gh.reason && !gh.ok) {
      const fs = Math.max(12, u * 0.5);
      g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const tw = g.measureText(gh.reason).width + fs;
      let tx = x0 + (cw * w) / 2;
      tx = Math.max(tw / 2 + 4, Math.min(this.L.w - tw / 2 - 4, tx));
      let ty = y0 - fs * 0.9;
      if (ty < fs) ty = y0 + ch * h + fs * 0.9;
      g.fillStyle = "rgba(40,10,10,0.85)";
      g.beginPath(); g.roundRect(tx - tw / 2, ty - fs * 0.75, tw, fs * 1.5, fs * 0.75); g.fill();
      g.fillStyle = "#fff";
      g.fillText(gh.reason, tx, ty + 1);
    }
  }

  /** 射程の円。 */
  private drawRangeHighlight(g: CanvasRenderingContext2D, col: number, row: number, w: number, h: number, range: number, kind: string, color: string): void {
    if (!(range > 0) || kind === "wall" || kind === "producer") return;
    const { u, ox, oy, cw, ch } = this.L;
    const cx = ox + (col + w / 2) * cw, cy = oy + (row + h / 2) * ch;
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.arc(cx, cy, range * u, 0, Math.PI * 2); g.fill(); g.stroke();
    g.setLineDash([]);
  }

  /** 出口からママまでの道を点線と矢印で。 */
  private drawRoute(g: CanvasRenderingContext2D): void {
    const b = this.battle;
    if (this.route.ver !== b.flowVersion) {
      const seen = new Set<string>();
      const edges: [number, number, number, number][] = [];
      const starts: [number, number][] = [];
      const chew: [number, number, number, number][] = [];
      const spawns = b.spawnCells();
      for (const s of spawns) {
        starts.push([s.col, s.row]);
        const r = b.routeFrom(s.col, s.row);
        for (let i = 0; i + 1 < r.length; i++) {
          const k = `${r[i].col},${r[i].row}>${r[i + 1].col},${r[i + 1].row}`;
          if (seen.has(k)) break;
          seen.add(k);
          edges.push([r[i].col, r[i].row, r[i + 1].col, r[i + 1].row]);
        }
      }
      // かじる虫の道（ふつうの道と違うところだけ）
      if (b.hasChewers) {
        const cseen = new Set<string>();
        for (const s of spawns) {
          const r = b.routeFrom(s.col, s.row, true);
          for (let i = 0; i + 1 < r.length; i++) {
            const k = `${r[i].col},${r[i].row}>${r[i + 1].col},${r[i + 1].row}`;
            if (cseen.has(k)) break;
            cseen.add(k);
            if (!seen.has(k)) chew.push([r[i].col, r[i].row, r[i + 1].col, r[i + 1].row]);
          }
        }
      }
      this.route = { edges, chew, starts, ver: b.flowVersion };
    }
    const { cw, ch, u, ox, oy } = this.L;
    const X = (c: number) => ox + (c + 0.5) * cw;
    const Y = (r: number) => oy + (r + 0.5) * ch;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "rgba(255,230,200,0.13)";
    g.lineWidth = Math.max(3, u * 0.22);
    g.beginPath();
    for (const [c0, r0, c1, r1] of this.route.edges) { g.moveTo(X(c0), Y(r0)); g.lineTo(X(c1), Y(r1)); }
    for (const [c, r] of this.route.starts) if (r === 0) { g.moveTo(X(c), oy + SPAWN_Y * ch * 0.4); g.lineTo(X(c), Y(r)); }
    g.stroke();
    g.strokeStyle = "rgba(255,120,130,0.5)";
    g.lineWidth = Math.max(1.5, u * 0.07);
    g.setLineDash([u * 0.1, u * 0.22]);
    g.lineDashOffset = -this.clock * u * 0.6;
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "rgba(255,120,130,0.55)";
    const a = u * 0.13;
    g.beginPath();
    for (const [c0, r0, c1, r1] of this.route.edges) {
      if ((c0 + r0) % 3 !== 0) continue;
      const mx = (X(c0) + X(c1)) / 2, my = (Y(r0) + Y(r1)) / 2;
      const ang = Math.atan2(Y(r1) - Y(r0), X(c1) - X(c0));
      g.moveTo(mx + Math.cos(ang) * a, my + Math.sin(ang) * a);
      g.lineTo(mx + Math.cos(ang + 2.5) * a, my + Math.sin(ang + 2.5) * a);
      g.lineTo(mx + Math.cos(ang - 2.5) * a, my + Math.sin(ang - 2.5) * a);
      g.closePath();
    }
    g.fill();
    if (this.route.chew.length > 0) {
      // かじる虫の道（オレンジの点線。オブジェクトのマスを通りぬける）
      g.strokeStyle = "rgba(255,170,60,0.75)";
      g.lineWidth = Math.max(1.5, u * 0.08);
      g.setLineDash([u * 0.16, u * 0.18]);
      g.lineDashOffset = -this.clock * u * 0.5;
      g.beginPath();
      for (const [c0, r0, c1, r1] of this.route.chew) { g.moveTo(X(c0), Y(r0)); g.lineTo(X(c1), Y(r1)); }
      g.stroke();
      g.setLineDash([]);
    }
    g.lineCap = "butt";
  }

  /** ママ（2×2 の下にそろえる）。PNG は縦横比そのままで、size×size の箱に収める（切らない）。 */
  private drawMama(g: CanvasRenderingContext2D, cx: number, bottom: number, size: number): void {
    const b = this.battle;
    const lost = !!b.result && !b.result.win;
    const scared = this.mamaScared > 0 || lost;
    const img = getSprite("mama", scared ? "scared" : "normal");
    const low = b.mamaHp / Math.max(1, b.mamaMaxHp) < 0.4;
    const t = this.simClock;
    const tremble = scared ? Math.sin(this.clock * 60) * size * 0.03 * (lost ? 0.4 : 1) : low ? Math.sin(t * 30) * size * 0.012 : Math.sin(t * 2) * size * 0.01;
    g.fillStyle = "rgba(20,10,5,0.35)";
    g.beginPath(); g.ellipse(cx, bottom - size * 0.04, size * 0.34, size * 0.08, 0, 0, Math.PI * 2); g.fill();
    const { w: iw, h: ih } = imageSize(img);
    if (iw === ih) {
      g.drawImage(img, cx - size / 2 + tremble, bottom - size * 0.98, size, size);
      return;
    }
    const k = Math.min(size / iw, size / ih);
    const dw = iw * k, dh = ih * k;
    const c = this.scaledFit(img, dw, dh);
    g.drawImage(c, cx - dw / 2 + tremble, bottom - size * 0.02 - dh, dw, dh);
  }

  /** 縦横比のある絵を、縮小ずみでためる（毎コマ大きな PNG を縮めないため）。 */
  private scaledFit(img: CanvasImageSource, wCss: number, hCss: number): HTMLCanvasElement {
    const pw = Math.max(1, Math.round(wCss * this.dpr)), ph = Math.max(1, Math.round(hCss * this.dpr));
    let m = this.scaled.get(img);
    if (!m) { m = new Map(); this.scaled.set(img, m); }
    const key = pw * 100000 + ph;
    let c = m.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = pw; c.height = ph;
      const g = c.getContext("2d")!;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, pw, ph);
      m.set(key, c);
    }
    return c;
  }

  /** 撃った直後のはね・ゆれ（共通）。 */
  private objBounce(o: ObjState): { s: number; dx: number } {
    const { u } = this.L;
    let s = 1;
    const k = o.def.kind;
    const since = o.def.interval - o.timer;
    if (k !== "wall" && k !== "producer" && k !== "mine" && o.timer < 0.12 && since > 0) s = 1.08 - o.timer * 0.6;
    const dx = o.hurt > 0 ? Math.sin(this.clock * 80) * u * 0.03 : 0;
    return { s, dx };
  }

  /** 通れないオブジェクト: 床に影を落として、少し浮かせて立体に。大きさどおりの台の上に絵。 */
  private drawSolidObject(g: CanvasRenderingContext2D, o: ObjState): void {
    const { u, cw, ch, ox, oy } = this.L;
    const { s: bounce, dx } = this.objBounce(o);
    const x = ox + o.cx * cw, y = oy + o.cy * ch;
    const fw = cw * o.w - u * 0.1, fh = ch * o.h - u * 0.1;
    const rad = u * 0.18;
    g.fillStyle = "rgba(10,5,2,0.45)";
    g.beginPath(); g.roundRect(x - fw / 2 + u * 0.08, y - fh / 2 + u * 0.12, fw, fh, rad); g.fill();
    g.fillStyle = PLATE[o.def.kind] ?? "#e9d6b6";
    g.strokeStyle = OL;
    g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x - fw / 2, y - fh / 2, fw, fh, rad); g.fill(); g.stroke();
    g.fillStyle = "rgba(0,0,0,0.14)";
    g.fillRect(x - fw / 2 + 2, y + fh / 2 - u * 0.12, fw - 4, u * 0.09);
    if (this.battle.auraActive(o)) {
      g.strokeStyle = `rgba(255,216,74,${0.55 + Math.sin(this.clock * 6) * 0.25})`;
      g.lineWidth = 2.5;
      g.beginPath(); g.roundRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 4, fh + 4, rad); g.stroke();
    }
    if (o.uid === this.selectedUid) {
      g.strokeStyle = "#ffd84a";
      g.lineWidth = 3;
      g.beginPath(); g.roundRect(x - fw / 2 - 3, y - fh / 2 - 3, fw + 6, fh + 6, rad); g.stroke();
    }
    const hint: SpriteHint = { kind: o.def.kind };
    const s = u * Math.min(o.w, o.h) * 1.02 * bounce;
    const sy = y - u * 0.1;
    this.blit(getSprite("object", o.def.id, hint), x + dx, sy, s);
    if (o.hurt > 0) {
      g.globalAlpha = Math.min(1, o.hurt / 0.15) * 0.7;
      this.blit(getFlashSprite("object", o.def.id, hint), x + dx, sy, s);
      g.globalAlpha = 1;
    }
    if (o.def.kind === "zap" && o.timer < 0.15) {
      g.fillStyle = `rgba(180,230,255,${0.5 - o.timer * 3})`;
      g.beginPath(); g.arc(x, sy, s * 0.45, 0, Math.PI * 2); g.fill();
    }
    this.drawObjExtras(g, o, x, y - fh / 2, y + fh / 2);
  }

  /** 通れるオブジェクト: 床に平たく（影なし・下にうすい敷物）。 */
  private drawFlatObject(g: CanvasRenderingContext2D, o: ObjState): void {
    const { u, cw, ch, ox, oy } = this.L;
    const { s: bounce, dx } = this.objBounce(o);
    const x = ox + o.cx * cw, y = oy + o.cy * ch;
    const fw = cw * o.w - u * 0.14, fh = ch * o.h - u * 0.14;
    g.fillStyle = FLAT_TINT[o.def.kind] ?? "rgba(255,255,255,0.18)";
    g.strokeStyle = "rgba(255,230,200,0.35)";
    g.lineWidth = 1.2;
    g.setLineDash([4, 3]);
    g.beginPath(); g.roundRect(x - fw / 2, y - fh / 2, fw, fh, u * 0.2); g.fill(); g.stroke();
    g.setLineDash([]);
    if (o.uid === this.selectedUid) {
      g.strokeStyle = "#ffd84a";
      g.lineWidth = 3;
      g.beginPath(); g.roundRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 4, fh + 4, u * 0.2); g.stroke();
    }
    const hint: SpriteHint = { kind: o.def.kind };
    const s = u * Math.min(o.w, o.h) * 0.85 * bounce;
    const c = this.scaledOf(getSprite("object", o.def.id, hint), s);
    const sw = c.width / this.dpr;
    g.drawImage(c, x + dx - sw / 2, y - sw * 0.38, sw, sw * 0.76);
    if (o.hurt > 0) {
      g.globalAlpha = Math.min(1, o.hurt / 0.15) * 0.7;
      const f = this.scaledOf(getFlashSprite("object", o.def.id, hint), s);
      g.drawImage(f, x + dx - sw / 2, y - sw * 0.38, sw, sw * 0.76);
      g.globalAlpha = 1;
    }
    if (o.def.kind === "zap" && o.timer < 0.15) {
      g.fillStyle = `rgba(180,230,255,${0.45 - o.timer * 3})`;
      g.beginPath(); g.roundRect(x - fw / 2, y - fh / 2, fw, fh, u * 0.2); g.fill();
    }
    this.drawObjExtras(g, o, x, y - fh / 2, y + fh / 2);
  }

  /** 強化の星・HP バー。 */
  private drawObjExtras(g: CanvasRenderingContext2D, o: ObjState, x: number, top: number, bottom: number): void {
    const { u } = this.L;
    if (o.level > 0) {
      const sr = u * 0.13;
      const sy = top + sr * 0.6;
      if (o.level <= 3) {
        for (let i = 0; i < o.level; i++) star(g, x + (i - (o.level - 1) / 2) * sr * 2.1, sy, sr);
      } else {
        star(g, x - sr * 1.1, sy, sr * 1.2);
        g.font = `900 ${Math.max(9, u * 0.36)}px system-ui, sans-serif`;
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.lineWidth = 3;
        g.strokeStyle = OL;
        g.strokeText(String(o.level), x, sy);
        g.fillStyle = "#ffd84a";
        g.fillText(String(o.level), x, sy);
      }
    }
    if (o.hp < o.maxHp && o.def.kind !== "mine") hpBar(g, x, bottom - u * 0.1, u * 0.8 * o.w, Math.max(3, u * 0.1), o.hp / o.maxHp, "#5ad0ff");
  }

  private drawBug(g: CanvasRenderingContext2D, bug: BugState, dt: number): void {
    const { u, ox, oy, cw, ch } = this.L;
    const boss = !!bug.def.boss;
    const s = u * (boss ? 1.35 : 0.72);
    const id = bug.def.id;
    const kk = bug.knock > 0 ? bug.knock / KNOCK_TIME : 0;
    const bx = bug.x + bug.knockX * kk * kk, by = bug.y + bug.knockY * kk * kk;
    const x = ox + bx * cw, y = oy + by * ch;
    // 出てきたばかりの虫は、穴から少しずつ現れる
    const fade = bug.y < 0 ? Math.max(0, Math.min(1, (bug.y - SPAWN_Y) / 0.5 + 0.2))
      : bug.x < 0 ? Math.max(0, Math.min(1, bug.x + 0.7)) : bug.x > COLS ? Math.max(0, Math.min(1, COLS + 0.7 - bug.x)) : 1;
    g.globalAlpha = fade;
    this.resetTf();
    if (bug.slowMul < 1) {
      g.fillStyle = "rgba(120,200,255,0.4)";
      g.beginPath(); g.ellipse(x, y + s * 0.15, s * 0.45, s * 0.22, 0, 0, Math.PI * 2); g.fill();
    }
    if (bug.poisonTimer > 0) {
      g.fillStyle = "rgba(130,220,90,0.38)";
      g.beginPath(); g.arc(x, y, s * 0.5, 0, Math.PI * 2); g.fill();
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
      ? Math.sin(this.simClock * 30 + bug.uid) * 0.12
      : bug.mode === "chew" ? Math.sin(this.simClock * 22 + bug.uid) * 0.16
      : Math.sin(this.simClock * 12 * bug.speed * bug.slowMul + bug.uid) * 0.08;
    const img = this.scaledOf(getSprite("bug", id), s);
    const sw = img.width / this.dpr;
    this.tf(x, y, ang + wob);
    g.drawImage(img, -sw / 2, -sw / 2, sw, sw);
    if (bug.hurt > 0) {
      g.globalAlpha = Math.min(1, bug.hurt / 0.12) * 0.85 * fade;
      g.drawImage(this.scaledOf(getFlashSprite("bug", id), s), -sw / 2, -sw / 2, sw, sw);
    }
    g.globalAlpha = 1;
    this.resetTf();
    if (bug.hp < bug.maxHp) {
      hpBar(g, x, y - s * 0.55, s * (boss ? 0.8 : 0.9), Math.max(2, u * 0.09), bug.hp / bug.maxHp, boss ? "#ff4a6a" : "#ff8a4a");
    }
    // かたい虫（猫の攻撃が効きにくい）の小さな盾
    if (bug.resist < 1 && fade > 0.5) shield(g, x + s * 0.4, y - s * 0.3, Math.max(4, u * 0.2));
    // オブジェクトをかじっているときの「かじかじ」
    if (bug.mode === "chew" && Math.floor(this.simClock * 4 + bug.uid) % 3 === 0) {
      g.fillStyle = "#e8d2b0";
      g.beginPath(); g.arc(x + bug.dirX * s * 0.5, y + bug.dirY * s * 0.5, Math.max(1.5, u * 0.06), 0, Math.PI * 2); g.fill();
    }
  }

  /** partyLink が効いている猫どうしを、うすい線でつなぐ。 */
  private drawLinks(g: CanvasRenderingContext2D): void {
    const cats = this.battle.cats;
    if (cats.length < 2) return;
    const { cw, ch, u, ox, oy } = this.L;
    let drew = false;
    for (let i = 0; i < cats.length; i++) {
      const a = cats[i];
      if (!a.linked || !(a.char.combos?.partyLink ?? 0)) continue;
      for (let j = 0; j < cats.length; j++) {
        if (j === i) continue;
        const b = cats[j];
        if (b.resting || Math.hypot(a.x - b.x, a.y - b.y) > 2) continue;
        if (!drew) {
          g.strokeStyle = `rgba(255,170,220,${0.35 + Math.sin(this.clock * 6) * 0.15})`;
          g.lineWidth = Math.max(2, u * 0.08);
          g.setLineDash([u * 0.18, u * 0.14]);
          drew = true;
        }
        g.beginPath();
        g.moveTo(ox + a.x * cw, oy + a.y * ch);
        g.lineTo(ox + b.x * cw, oy + b.y * ch);
        g.stroke();
      }
    }
    if (drew) g.setLineDash([]);
  }

  /** 1匹の猫（主人公・相棒）。相棒は少し小さい。 */
  private drawCat(g: CanvasRenderingContext2D, dt: number, cat: CatState, x: number, y: number): void {
    const i = cat.index;
    const look = this.catLooks[i] ?? cat.char.look;
    const hint = this.catHints[i] ?? { role: cat.char.role };
    let lc = this.lastCats[i];
    if (!lc) { lc = { x: cat.x, y: cat.y, moving: 0, atkHold: 0 }; this.lastCats[i] = lc; }
    const { u } = this.L;
    const moved = Math.hypot(cat.x - lc.x, cat.y - lc.y);
    lc.x = cat.x;
    lc.y = cat.y;
    lc.moving = moved > 0.002 ? Math.min(1, lc.moving + dt * 8) : Math.max(0, lc.moving - dt * 8);
    const sc = cat.companion ? COMPANION_SCALE : 1;
    const s = u * 1.3 * sc;
    g.fillStyle = "rgba(10,5,2,0.4)";
    g.beginPath();
    g.ellipse(x, y + s * 0.4, s * 0.34, s * 0.1, 0, 0, Math.PI * 2);
    g.fill();

    if (cat.resting) {
      g.drawImage(getSprite("catRest", look, hint), x - s / 2, y - s / 2, s, s);
      const total = cat.char.restTime || 1;
      const k = Math.max(0, Math.min(1, cat.restTimer / total));
      const rx = x + s * 0.4, ry = y - s * 0.45, rr = u * 0.28 * sc;
      g.fillStyle = "rgba(40,30,60,0.7)";
      g.beginPath(); g.arc(rx, ry, rr + 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#9fd8ff";
      g.lineWidth = 3;
      g.beginPath(); g.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      g.fillStyle = "#fff";
      g.font = `900 ${Math.max(9, u * 0.32 * sc)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(Math.ceil(cat.restTimer)), rx, ry + 1);
      return;
    }

    // wakeUp の光・lastStand の赤い気配（猫の下に）
    if (cat.wakeUp > 0) {
      const pulse = 0.55 + Math.sin(this.clock * 10) * 0.2;
      const grd = g.createRadialGradient(x, y, s * 0.1, x, y, s * 0.75);
      grd.addColorStop(0, `rgba(255,240,150,${pulse})`);
      grd.addColorStop(1, "rgba(255,240,150,0)");
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, s * 0.75, 0, Math.PI * 2); g.fill();
    } else if (cat.desperate && (cat.char.combos?.lastStand ?? 0) > 0) {
      g.strokeStyle = `rgba(255,70,70,${0.45 + Math.sin(this.clock * 12) * 0.25})`;
      g.lineWidth = Math.max(2, u * 0.09);
      g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI * 2); g.stroke();
    }

    const hop = lc.moving * Math.abs(Math.sin(this.simClock * 14 + i * 1.7)) * s * 0.08;
    const atk = cat.attackAnim > 0 ? 1 + (cat.attackAnim / 0.15) * 0.14 : 1;
    const flip = cat.facingX < -0.1 ? -1 : 1;
    const d = this.dpr;
    // ひと休み（座る・毛づくろい）: PNG があればその絵（縦横比そのまま）、無ければ少しつぶす・かしげる
    const resting = cat.idle !== "none" && cat.attackAnim <= 0 && cat.hurt <= 0;
    if (resting) {
      const pimg = getCatIdlePose(look, cat.idle === "groom" ? "groom" : "sit");
      if (pimg) {
        const { w: iw, h: ih } = imageSize(pimg);
        const box = s * 1.05, k = Math.min(box / iw, box / ih);
        const dw = iw * k, dh = ih * k;
        g.setTransform(d * flip, 0, 0, d, d * (x + this.shx), d * (y + this.shy));
        g.drawImage(this.scaledFit(pimg, dw, dh), -dw / 2, s * 0.46 - dh, dw, dh);
        this.resetTf();
        hpBar(g, x, y + s * 0.52, s * 0.7, Math.max(3, u * 0.12 * sc), cat.hp / cat.maxHp, cat.companion ? "#7cc8ff" : "#5ee07a");
        this.drawStacks(g, cat, x, y - s * 0.55, s);
        return;
      }
    }
    const ang = resting && cat.idle === "groom" ? Math.sin(this.simClock * 5 + i) * 0.14 : 0;
    const sy = resting && cat.idle === "sit" ? 0.92 : 1;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const fx = d * flip * atk, fy = d * atk * sy;
    g.setTransform(fx * ca, fx * sa, -fy * sa, fy * ca, d * (x + this.shx), d * (y - hop + this.shy + (1 - sy) * s * 0.5));
    const pose = this.catPose(cat, lc, dt);
    const img = pose ? getCatPose(look, pose) : null;
    g.drawImage(img ?? getSprite("cat", look, hint), -s / 2, -s / 2, s, s);
    if (cat.hurt > 0 && !(img && pose === "hurt")) {
      g.globalAlpha = Math.min(1, cat.hurt / 0.15) * 0.8;
      g.drawImage(getFlashSprite("cat", look, hint), -s / 2, -s / 2, s, s);
      g.globalAlpha = 1;
    }
    this.resetTf();
    const role = cat.char.role;
    if (cat.attackAnim > 0 && role !== "ranged") {
      const a = Math.atan2(cat.facingY, cat.facingX);
      const k = 1 - cat.attackAnim / 0.15;
      const R = role === "aoe" ? (cat.char.aoe || 1) * u : u * 0.8 * sc;
      g.strokeStyle = `rgba(255,255,255,${0.9 - k * 0.7})`;
      g.lineWidth = Math.max(2.5, u * 0.1 * sc);
      g.beginPath();
      if (role === "aoe") g.arc(x, y, R * (0.5 + k * 0.5), 0, Math.PI * 2);
      else g.arc(x, y, R, a - 0.9 + k * 0.6, a + 0.3 + k * 0.6);
      g.stroke();
    }
    hpBar(g, x, y + s * 0.52, s * 0.7, Math.max(3, u * 0.12 * sc), cat.hp / cat.maxHp, cat.companion ? "#7cc8ff" : "#5ee07a");
    this.drawStacks(g, cat, x, y - s * 0.55, s);
  }

  /** frenzy（赤）・kibbleFever（黄）の重ねを、猫の上に小さな点で出す。 */
  private drawStacks(g: CanvasRenderingContext2D, cat: CatState, x: number, y: number, s: number): void {
    const rows: [number, number, string][] = [];
    if (cat.frenzy > 0) rows.push([cat.frenzy, FRENZY_MAX, "#ff6a4a"]);
    if (cat.fever > 0) rows.push([cat.fever, FEVER_MAX, "#ffd84a"]);
    if (rows.length === 0) return;
    const r = Math.max(1.6, s * 0.035);
    const gap = r * 2.4;
    g.strokeStyle = OL;
    g.lineWidth = 1;
    rows.forEach(([n, max, color], k) => {
      const cnt = Math.min(n, max);
      const x0 = x - ((cnt - 1) * gap) / 2;
      const yy = y - k * gap;
      g.fillStyle = color;
      for (let j = 0; j < cnt; j++) {
        g.beginPath(); g.arc(x0 + j * gap, yy, n >= max ? r * 1.25 : r, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    });
  }

  /** 今のポーズ（攻撃 > 被弾 > 移動 > 待機）。攻撃の絵は attackAnim より長めに見せる。 */
  private catPose(cat: CatState, lc: { moving: number; atkHold: number }, dt: number): CatPose | null {
    lc.atkHold = cat.attackAnim > 0 ? 0.3 : Math.max(0, lc.atkHold - dt);
    const role = cat.char.role;
    if (lc.atkHold > 0) return role === "ranged" ? "ranged" : role === "aoe" ? "aoe" : "melee";
    if (cat.hurt > 0) return "hurt";
    if (lc.moving > 0.3) {
      if (role === "fast") return "run";
      return Math.floor(this.simClock * 6 + cat.index * 0.5) % 2 ? "walk2" : "walk1";
    }
    return null;
  }

  /** 電撃（ぎざぎざの線。毎コマ形が変わってちらつく）。 */
  private drawBolts(g: CanvasRenderingContext2D, dt: number): void {
    if (this.bolts.length === 0) return;
    const { cw, ch, u, ox, oy } = this.L;
    let w = 0;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < this.bolts.length; i++) {
      const bl = this.bolts[i];
      bl.t += dt;
      if (bl.t >= bl.life) continue;
      this.bolts[w++] = bl;
      const k = bl.t / bl.life;
      const x0 = ox + bl.x0 * cw, y0 = oy + bl.y0 * ch, x1 = ox + bl.x1 * cw, y1 = oy + bl.y1 * ch;
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const segs = Math.max(3, Math.min(8, Math.round(len / (u * 0.35))));
      g.beginPath();
      g.moveTo(x0, y0);
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const off = (Math.random() - 0.5) * u * 0.55;
        g.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
      }
      g.lineTo(x1, y1);
      const a = 1 - k;
      g.strokeStyle = bl.hot ? `rgba(255,150,60,${0.45 * a})` : `rgba(110,190,255,${0.45 * a})`;
      g.lineWidth = Math.max(4, u * 0.28);
      g.stroke();
      g.strokeStyle = bl.hot ? `rgba(255,220,150,${0.95 * a})` : `rgba(190,235,255,${0.95 * a})`;
      g.lineWidth = Math.max(2, u * 0.1);
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${a})`;
      g.lineWidth = Math.max(1, u * 0.04);
      g.stroke();
    }
    this.bolts.length = w;
    g.lineCap = "butt";
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
          g.lineWidth = Math.max(1.5, u * 0.1 * (1 - k));
          g.beginPath();
          g.arc(x, y, f.r * u * (0.4 + k * 0.8), 0, Math.PI * 2);
          g.stroke();
          break;
        }
        case "ring": {
          g.globalAlpha = 1 - k;
          g.strokeStyle = f.color;
          g.lineWidth = Math.max(1.5, u * 0.12 * (1 - k));
          g.beginPath();
          g.arc(x, y, f.r * u * (0.3 + k * 0.7), 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = f.color;
          g.globalAlpha = (1 - k) * 0.15;
          g.fill();
          break;
        }
        case "flash": {
          // 一瞬の光（中が明るい円）
          g.globalAlpha = (1 - k) * 0.7;
          g.fillStyle = f.color;
          g.beginPath(); g.arc(x, y, f.r * u * (0.6 + k * 0.6), 0, Math.PI * 2); g.fill();
          break;
        }
        case "cloud": {
          // 毒の雲（ふくらんで、うすれていく）
          const a = (k < 0.2 ? k / 0.2 : (1 - k) / 0.8) * 0.32;
          g.globalAlpha = 1;
          g.fillStyle = `rgba(${f.color},${a.toFixed(3)})`;
          const r = f.r * u * (0.6 + k * 0.5);
          g.beginPath(); g.arc(x, y - k * u * 0.2, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = `rgba(${f.color},${(a * 0.8).toFixed(3)})`;
          g.beginPath(); g.arc(x + r * 0.45, y - r * 0.2 - k * u * 0.3, r * 0.55, 0, Math.PI * 2); g.fill();
          break;
        }
        case "text": {
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          const fs = f.r * u * (k < 0.15 ? 0.6 + k * 2.7 : 1);
          g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.lineWidth = Math.max(2.5, fs * 0.2);
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
    const y = oy + ch * 5;
    const bu = Math.max(u * 1.6, 40);
    g.globalAlpha = Math.max(0, alpha) * 0.85;
    g.fillStyle = "#2a170d";
    g.fillRect(0, y - bu * 0.55, w, bu * (bn.sub ? 1.3 : 1.1));
    g.globalAlpha = Math.max(0, alpha);
    const sc = k < 0.1 ? 1.4 - k * 4 : 1;
    const fs = bu * 0.55 * sc;
    g.font = `900 ${fs}px system-ui, "Hiragino Maru Gothic ProN", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#ffd84a";
    g.fillText(bn.text, w / 2, y);
    if (bn.sub) {
      g.font = `800 ${bu * 0.26}px system-ui, sans-serif`;
      g.fillStyle = "#fff";
      g.fillText(bn.sub, w / 2, y + bu * 0.48);
    }
    g.globalAlpha = 1;
  }
}

/** ダメージの数字。10 より小さい端数は小数1けたで出す（0.5 が "0" にならないように）。 */
function dmgText(v: number): string {
  if (v < 10 && v % 1 !== 0) return String(Math.round(v * 10) / 10);
  return fmt(v);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 部屋ごとの壁紙の色。 */
const WALL_COLORS: Record<string, string> = {
  living: "#efe0c6", kitchen: "#f3ead8", bedroom: "#efdde6", washitsu: "#eee3c8", study: "#e9dcc4", bath: "#dcecf0",
};

const POP_COLORS = ["#ffd84a", "#ff8fb0", "#8fd0ff", "#ffffff", "#a8e070"];
const FLOAT_COLORS: Record<string, string> = {
  bug: "#fff", crit: "#ffe14a", poison: "#b8f08a", cat: "#ff6b6b", heal: "#7cf09a", object: "#ffb35a", resist: "#a9a9a9",
};
const PLATE: Partial<Record<string, string>> = {
  wall: "#c99a62",
  shooter: "#efdcbc",
  aoe: "#f2d0d0",
  zap: "#d6e8f6",
  poison: "#d8ecc8",
  producer: "#f6d8e2",
};
const FLAT_TINT: Partial<Record<string, string>> = {
  slow: "rgba(150,210,255,0.22)",
  mine: "rgba(255,190,120,0.2)",
  zap: "rgba(170,200,255,0.22)",
  poison: "rgba(150,230,120,0.2)",
  wall: "rgba(255,255,255,0.15)",
  shooter: "rgba(255,230,180,0.2)",
  aoe: "rgba(255,190,190,0.2)",
  producer: "rgba(255,200,220,0.22)",
};

function hpBar(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, ratio: number, color: string): void {
  const r = Math.max(0, Math.min(1, ratio));
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle = OL;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = r < 0.3 ? "#ff5a5a" : color;
  g.fillRect(x, y, w * r, h);
}

/** 小さな盾（かたい虫のしるし）。 */
function shield(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.5, y - r * 0.7, x + r * 0.9, y - r * 0.75);
  g.quadraticCurveTo(x + r * 0.95, y + r * 0.35, x, y + r);
  g.quadraticCurveTo(x - r * 0.95, y + r * 0.35, x - r * 0.9, y - r * 0.75);
  g.quadraticCurveTo(x - r * 0.5, y - r * 0.7, x, y - r);
  g.closePath();
  g.fillStyle = "#c9d3dc";
  g.fill();
  g.lineWidth = Math.max(1.2, r * 0.22);
  g.strokeStyle = OL;
  g.stroke();
  g.beginPath(); g.moveTo(x, y - r * 0.6); g.lineTo(x, y + r * 0.6);
  g.strokeStyle = "#8a98a6"; g.lineWidth = Math.max(1, r * 0.18); g.stroke();
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
  g.lineWidth = Math.max(1, r * 0.3);
  g.strokeStyle = OL;
  g.stroke();
  g.fillStyle = fill;
}
