// 成長 > スキル（スキル盤。家族みんなで1つ）。
// 盤は 850 ノードほどの大きな地図なので、1まいの canvas に描く（画面に見えているところだけ）。
// 指1本で動かす・指2本でひろげる／ちぢめる・PC はホイールでズーム。ノードをタップすると、下のパネルにくわしく出る。
import {
  canLearn, familyLevel, isNodeLinked, isNodeOpen, learnSkill, nextNodeCost, nodeCost, nodeLevel, resetSkills, skillSpent, skillTree,
} from "../core/progress";
import { fmt } from "../core/num";
import { sfx } from "../audio";
import type { SaveData } from "../core/save";
import {
  COMBO_NAMES, REGION_NAMES, RING_R, SKILL_BOARD, SKILL_LINKS, SKILL_MAP, SKILL_REGIONS, effectText, regionDeg,
  type SkillNode, type SkillRegion,
} from "../data/skills";
import type { Ctx } from "./ctx";
import { h, svgIcon } from "./dom";
import { COMBO_ICON, ICONS, regionSvg } from "./icons";

/** 地方の色（styles.css の --br-* と同じ）。 */
const REGION_COLOR: Record<SkillRegion, string> = {
  atk: "#d8664a", def: "#5f9a4c", spd: "#4d8cc4", tech: "#9467c8", support: "#d49a1c",
};
const INK = "#4a3121";
const LINE = "#5a3b27";
const SOFT = "#d4b994";
const PAPER = "#f6ead2";
const CARD = "#fffaf0";
const HONEY = "#f3b843";
const HONEY_D = "#d9951f";
const DANGER = "#b4432c";
const FONT = `"Zen Maru Gothic", "Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Hiragino Sans", "Noto Sans JP", sans-serif`;

const Z_MIN = 0.08;
const Z_MAX = 2.4;

/** カメラ（盤のどこを、どの大きさで見ているか）。描きなおしても残す。 */
const cam = { x: 0, y: 0, z: 0.9, init: false };
/** 前に見たときの盤の大きさ（描きなおしたときに、すぐ描けるように）。 */
let lastSize = { w: 0, h: 0 };
let selNode: string | null = null;

type NodeState = "max" | "has" | "can" | "poor" | "gatelock" | "far";

function nodeState(save: SaveData, n: SkillNode, fam: number): NodeState {
  const lv = nodeLevel(save, n.id);
  if (lv >= n.maxLevel) return "max";
  if (lv > 0) return canLearn(save, n.id).ok ? "can" : "has";
  if (!isNodeLinked(save, n.id)) return "far";
  if (fam < n.minCharLevel) return "gatelock";
  return canLearn(save, n.id).ok ? "can" : "poor";
}

/** ノードの半径（盤の上の大きさ）。 */
function nodeR(n: SkillNode): number {
  if (n.kind === "root") return 30;
  if (n.combo) return 23;
  if (n.gate) return 18;
  return n.id.endsWith(".l") || n.id.endsWith(".c") || n.id.endsWith(".r") ? 19 : 16;
}

// ---- アイコンの画像（SVG → Image。色ごとに1つ） ----
const imgCache = new Map<string, HTMLImageElement>();
let onImgLoad: (() => void) | null = null;
function iconImg(svg: string, color: string): HTMLImageElement {
  const key = svg.length + "|" + svg.slice(0, 40) + "|" + color;
  let img = imgCache.get(key);
  if (!img) {
    img = new Image();
    img.onload = () => onImgLoad?.();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/currentColor/g, color));
    imgCache.set(key, img);
  }
  return img;
}

export function renderSkillTab(ctx: Ctx): HTMLElement {
  const save = ctx.save;
  const fam = familyLevel(save);
  const tree = skillTree();
  const spent = skillSpent(save);
  const got = tree.filter((n) => nodeLevel(save, n.id) > 0).length;
  const comboGot = tree.filter((n) => n.combo && nodeLevel(save, n.id) > 0).length;
  const comboAll = tree.filter((n) => n.combo).length;

  const info = h("div", { class: "sk-info" },
    h("span", { class: "sk-fam" }, "家族 Lv", h("b", null, String(fam))),
    h("span", { class: "sk-got" }, `${got}/${tree.length}`, h("span", { class: "sk-got-star" }, svgIcon(COMBO_ICON), `${comboGot}/${comboAll}`)),
    h("span", { class: "sk-spent" }, svgIcon(ICONS.churu), fmt(spent)),
    h("button", {
      class: "btn btn-small btn-red sk-reset", disabled: spent <= 0,
      onclick: async () => {
        if (await ctx.confirm(`スキルをぜんぶ忘れて、使ったちゅ〜る ${fmt(spent)} を全部もどしますか？`, "リセット", true)) {
          const back = resetSkills(ctx.save);
          selNode = null;
          ctx.commit();
          ctx.toast(`ちゅ〜る ${fmt(back)} がもどりました`);
        }
      },
    }, "リセット"));
  const legend = h("div", { class: "sk-legend" },
    SKILL_REGIONS.map((r) => h("span", { class: `sk-lg lg-${r}` }, svgIcon(regionSvg(r)), REGION_NAMES[r])));

  const panel = h("div", { class: "sk-panel" });
  const board = renderBoard(ctx, (id) => {
    selNode = id;
    panel.replaceChildren(renderNodePanel(ctx, spent));
  });
  panel.append(renderNodePanel(ctx, spent));

  return h("div", { class: "sub sub-skill" },
    h("div", { class: "sk-head" }, info, legend),
    board,
    panel);
}

/** スキル盤（canvas）。onSelect はノードをタップしたとき。 */
function renderBoard(ctx: Ctx, onSelect: (id: string | null) => void): HTMLElement {
  const save = ctx.save;
  const fam = familyLevel(save);
  const tree = skillTree();
  const canvas = h("canvas", { class: "sb-canvas", "aria-label": "スキル盤" }) as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  let W = lastSize.w, H = lastSize.h, dpr = 1;

  // ノードの状態は、描きなおすまで同じ（ちゅ〜る・レベルが変わると画面ごと描きなおす）
  const state = new Map<string, NodeState>();
  for (const n of tree) state.set(n.id, nodeState(save, n, fam));
  const lit = (id: string) => nodeLevel(save, id) > 0;

  if (!cam.init) {
    // はじめは、まん中（取ったノードがあれば、いちばん外のあたり）
    cam.init = true;
    let far: SkillNode | null = null;
    for (const n of tree) if (lit(n.id) && (!far || n.steps > far.steps)) far = n;
    cam.x = far ? far.pos.x * 0.6 : 0;
    cam.y = far ? far.pos.y * 0.6 : 0;
    cam.z = 0.9;
  }

  const toScreen = (x: number, y: number) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });
  const toBoard = (sx: number, sy: number) => ({ x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y });
  const clampCam = () => {
    cam.z = Math.max(Z_MIN, Math.min(Z_MAX, cam.z));
    const m = 200;
    cam.x = Math.max(SKILL_BOARD.minX - m, Math.min(SKILL_BOARD.maxX + m, cam.x));
    cam.y = Math.max(SKILL_BOARD.minY - m, Math.min(SKILL_BOARD.maxY + m, cam.y));
  };

  let raf = 0, timer = 0;
  const draw = () => {
    raf = 0;
    if (!W || !H) return;
    const z = cam.z;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    // 見えているところ（盤の上の座標）
    const v0 = toBoard(-40, -40), v1 = toBoard(W + 40, H + 40);
    const inView = (x: number, y: number, r = 0) => x + r >= v0.x && x - r <= v1.x && y + r >= v0.y && y - r <= v1.y;
    const c0 = toScreen(0, 0);

    // 地方の色（まん中から広がる、うすい扇）
    const outer = RING_R[RING_R.length - 1] + 420;
    SKILL_REGIONS.forEach((r, ri) => {
      const a = regionDeg(ri) * Math.PI / 180;
      const grad = g.createRadialGradient(c0.x, c0.y, 40 * z, c0.x, c0.y, outer * z);
      grad.addColorStop(0, REGION_COLOR[r] + "30");
      grad.addColorStop(1, REGION_COLOR[r] + "08");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(c0.x, c0.y);
      g.arc(c0.x, c0.y, outer * z, a - 36 * Math.PI / 180, a + 36 * Math.PI / 180);
      g.closePath();
      g.fill();
    });
    // 地方のさかいめ（点線）
    g.strokeStyle = "rgba(150,105,60,.18)";
    g.lineWidth = 1.5;
    g.setLineDash([4, 8]);
    for (let ri = 0; ri < 5; ri++) {
      const a = (regionDeg(ri) + 36) * Math.PI / 180;
      g.beginPath();
      g.moveTo(c0.x + Math.cos(a) * 60 * z, c0.y + Math.sin(a) * 60 * z);
      g.lineTo(c0.x + Math.cos(a) * outer * z, c0.y + Math.sin(a) * outer * z);
      g.stroke();
    }
    g.setLineDash([]);

    // 線
    const lw = Math.max(1.5, 5 * z);
    for (const [a, b] of SKILL_LINKS) {
      const A = SKILL_MAP[a], B = SKILL_MAP[b];
      const minX = Math.min(A.pos.x, B.pos.x), maxX = Math.max(A.pos.x, B.pos.x);
      const minY = Math.min(A.pos.y, B.pos.y), maxY = Math.max(A.pos.y, B.pos.y);
      if (maxX < v0.x || minX > v1.x || maxY < v0.y || minY > v1.y) continue;
      const la = lit(a), lb = lit(b);
      const col = REGION_COLOR[(la ? A : B).region];
      if (la && lb) { g.strokeStyle = col; g.lineWidth = lw * 1.3; g.setLineDash([]); }
      else if (la || lb) { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash([lw * 0.6, lw * 1.6]); }
      else { g.strokeStyle = z < 0.32 ? "#cdb596" : "#dccab0"; g.lineWidth = lw * 0.8; g.setLineDash([]); }
      g.beginPath();
      const pa = toScreen(A.pos.x, A.pos.y), pb = toScreen(B.pos.x, B.pos.y);
      // 同じ輪の上なら、輪にそって曲げる
      const ring = A.ring === B.ring && A.ring >= 0 && A.ring < RING_R.length ? RING_R[A.ring] : 0;
      const onRing = ring && Math.abs(Math.hypot(A.pos.x, A.pos.y) - ring) < 3 && Math.abs(Math.hypot(B.pos.x, B.pos.y) - ring) < 3;
      if (onRing) {
        const t1 = Math.atan2(A.pos.y, A.pos.x), t2 = Math.atan2(B.pos.y, B.pos.x);
        let d = t2 - t1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        g.arc(c0.x, c0.y, ring * z, t1, t1 + d, d < 0);
      } else {
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
      }
      g.stroke();
    }
    g.setLineDash([]);

    // 地方の名前（遠くから見たとき）
    if (z < 0.5) {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `900 ${Math.round(Math.max(12, 150 * z))}px ${FONT}`;
      SKILL_REGIONS.forEach((r, ri) => {
        const a = (regionDeg(ri) + 11) * Math.PI / 180;
        const rr = RING_R[RING_R.length - 1] + 200;
        const p = toScreen(Math.cos(a) * rr, Math.sin(a) * rr);
        g.lineWidth = 4;
        g.strokeStyle = "rgba(255,250,240,.9)";
        const half = g.measureText(REGION_NAMES[r]).width / 2 + 6;
        const x = Math.max(half, Math.min(W - half, p.x)); // はしで切れないように
        g.strokeText(REGION_NAMES[r], x, p.y);
        g.fillStyle = REGION_COLOR[r];
        g.fillText(REGION_NAMES[r], x, p.y);
      });
    }

    // ノード
    const detail = z >= 0.32;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    let anyCan = false;
    for (const n of tree) {
      const r0 = nodeR(n);
      if (!inView(n.pos.x, n.pos.y, r0 + 30)) continue;
      const st = state.get(n.id)!;
      const p = toScreen(n.pos.x, n.pos.y);
      const r = Math.max(2.5, r0 * z);
      const col = REGION_COLOR[n.region];
      const lv = nodeLevel(save, n.id);
      if (!detail) {
        // 遠くから見たとき: 点だけ（速く描く）
        if (st === "can") anyCan = true;
        const rr = Math.max(n.combo ? 3.5 : 2.2, r * (n.combo ? 1.4 : 1.15));
        g.globalAlpha = st === "far" ? 0.45 : 1;
        g.fillStyle = lv > 0 ? (n.combo ? HONEY : col) : st === "can" ? HONEY : n.combo ? "#e0b860" : st === "gatelock" || n.gate ? "#a88a6c" : col;
        g.beginPath();
        if (n.combo) starPath(g, p.x, p.y, rr * 1.2, rr * 0.6);
        else if (n.gate) g.rect(p.x - rr, p.y - rr, rr * 2, rr * 2);
        else g.arc(p.x, p.y, rr, 0, Math.PI * 2);
        g.fill();
        if (lv > 0 || st === "can") { g.lineWidth = 1; g.strokeStyle = LINE; g.stroke(); }
        g.globalAlpha = 1;
        continue;
      }
      g.globalAlpha = st === "far" ? 0.6 : 1;
      // 光（取れる・宝）
      if (st === "can") {
        anyCan = true;
        g.fillStyle = `rgba(243,184,67,${0.25 + 0.35 * pulse})`;
        g.beginPath(); g.arc(p.x, p.y, r + (5 + 5 * pulse) * Math.max(0.5, z), 0, Math.PI * 2); g.fill();
      }
      if (n.combo && lv > 0) {
        g.fillStyle = "rgba(243,184,67,.45)";
        g.beginPath(); g.arc(p.x, p.y, r * 1.55, 0, Math.PI * 2); g.fill();
      }
      // かたち
      g.beginPath();
      if (n.combo) starPath(g, p.x, p.y, r * 1.15, r * 0.72);
      else if (n.gate) roundRect(g, p.x - r, p.y - r, r * 2, r * 2, r * 0.45);
      else g.arc(p.x, p.y, r, 0, Math.PI * 2);
      let fill = CARD, stroke = col, sw = Math.max(1, 3 * z);
      if (lv > 0) { fill = n.combo ? HONEY : col; stroke = st === "max" ? HONEY : "#fff"; }
      else if (st === "far") { fill = "#efe2c8"; stroke = n.combo ? "#d8b56a" : SOFT; }
      else if (st === "gatelock") { fill = "#ead9c0"; stroke = "#b99c7c"; }
      else if (n.combo) { fill = "#fff3d2"; stroke = HONEY_D; }
      g.fillStyle = fill;
      g.fill();
      if (detail || lv > 0 || st === "can") {
        g.lineWidth = sw;
        g.strokeStyle = stroke;
        g.stroke();
        if (lv > 0 && detail) {
          g.lineWidth = Math.max(1, 1.5 * z);
          g.strokeStyle = LINE;
          g.beginPath();
          if (n.combo) starPath(g, p.x, p.y, r * 1.15 + sw / 2, r * 0.72 + sw / 2);
          else if (n.gate) roundRect(g, p.x - r - sw / 2, p.y - r - sw / 2, r * 2 + sw, r * 2 + sw, r * 0.5);
          else g.arc(p.x, p.y, r + sw / 2, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // アイコン
      if (detail) {
        const s = r * (n.combo ? 0.95 : n.kind === "root" ? 1.1 : 1.15);
        let img: HTMLImageElement;
        if (n.gate && st !== "max" && lv === 0) img = iconImg(ICONS.lock, "");
        else if (n.combo) img = iconImg(COMBO_ICON, lv > 0 ? "#fff8e0" : st === "far" ? "#d8b56a" : HONEY_D);
        else if (n.kind === "root") img = iconImg(ICONS.paw, lv > 0 ? "#fff" : INK);
        else img = iconImg(regionSvg(n.region), lv > 0 ? "#fff" : st === "far" ? "#cdb596" : col);
        if (img.complete && img.naturalWidth) {
          if (n.gate && st === "gatelock") g.globalAlpha = 1;
          g.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
        }
      }
      g.globalAlpha = 1;
      // ねこドアの家族レベル
      if (n.gate && lv === 0 && fam < n.minCharLevel && z >= 0.18) {
        const fs = Math.max(9, 12 * Math.min(1.3, z));
        g.font = `900 ${fs}px ${FONT}`;
        const text = `Lv${n.minCharLevel}`;
        const tw = g.measureText(text).width + 8;
        const bx = p.x - tw / 2, by = p.y + r + 2;
        g.fillStyle = "#f7d9d2";
        roundRect(g, bx, by, tw, fs + 4, (fs + 4) / 2);
        g.fill();
        g.lineWidth = 1.2; g.strokeStyle = "#d99a8c"; g.stroke();
        g.fillStyle = DANGER;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(text, p.x, by + (fs + 4) / 2 + 0.5);
      }
      // レベルと名前（近くで見たとき）
      if (z >= 0.75 && !n.gate) {
        const fs = Math.round(9.5 * Math.min(1.4, z));
        g.font = `900 ${fs}px ${FONT}`;
        g.textAlign = "center"; g.textBaseline = "middle";
        const text = `${lv}/${n.maxLevel}`;
        const tw = g.measureText(text).width + 7;
        const by = p.y + r - fs * 0.3;
        g.fillStyle = lv >= n.maxLevel ? HONEY : lv > 0 ? col : CARD;
        roundRect(g, p.x - tw / 2, by, tw, fs + 3, (fs + 3) / 2);
        g.fill();
        g.lineWidth = 1; g.strokeStyle = lv > 0 ? LINE : SOFT; g.stroke();
        g.fillStyle = lv >= n.maxLevel ? "#4f2f05" : lv > 0 ? "#fff" : st === "can" ? "#9a6a10" : "#6b4f3c";
        g.fillText(text, p.x, by + (fs + 3) / 2 + 0.5);
      }
      if (z >= 1.15 || (n.combo && z >= 0.6) || n.kind === "root") {
        const fs = Math.round((n.combo ? 10.5 : 9.5) * Math.min(1.3, Math.max(0.9, z)));
        g.font = `900 ${fs}px ${FONT}`;
        g.textAlign = "center"; g.textBaseline = "top";
        const ty = p.y + r + (n.gate ? fs + 8 : fs + 4);
        g.lineWidth = 3.5;
        g.strokeStyle = "rgba(255,250,240,.95)";
        g.strokeText(n.name, p.x, ty);
        g.fillStyle = n.combo ? "#9a6a10" : st === "far" ? "#9a7f68" : INK;
        g.fillText(n.name, p.x, ty);
      }
      // えらんでいる
      if (n.id === selNode) {
        g.lineWidth = 3;
        g.strokeStyle = INK;
        g.setLineDash([5, 4]);
        g.beginPath(); g.arc(p.x, p.y, r * (n.combo ? 1.4 : 1.25) + 6, 0, Math.PI * 2); g.stroke();
        g.setLineDash([]);
      }
    }
    // 取れるノードが見えていれば、ゆっくり光らせる（見えている間だけ）
    if (anyCan && canvas.isConnected && !document.hidden && !timer) timer = window.setTimeout(() => { timer = 0; request(); }, 90);
  };
  const request = () => { if (!raf && canvas.isConnected) raf = requestAnimationFrame(draw); };
  onImgLoad = request;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width; H = rect.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    lastSize = { w: W, h: H };
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    draw();
  };
  const ro = new ResizeObserver(() => { if (canvas.isConnected) resize(); else ro.disconnect(); });
  ro.observe(canvas);

  // ---- さわる（ドラッグ・ピンチ・ホイール・タップ） ----
  const pts = new Map<number, { x: number; y: number }>();
  let gesture: { sx: number; sy: number; moved: boolean; t: number } | null = null;
  let pinch: { d: number; z: number; bx: number; by: number } | null = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const startPinch = () => {
    const [a, b] = [...pts.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const bp = toBoard(mid.x, mid.y);
    pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z: cam.z, bx: bp.x, by: bp.y };
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* 何もしない */ }
    if (pts.size === 1) gesture = { sx: p.x, sy: p.y, moved: false, t: performance.now() };
    if (pts.size === 2) { startPinch(); if (gesture) gesture.moved = true; }
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      cam.z = Math.max(Z_MIN, Math.min(Z_MAX, pinch.z * d / pinch.d));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.x = pinch.bx - (mid.x - W / 2) / cam.z;
      cam.y = pinch.by - (mid.y - H / 2) / cam.z;
      clampCam();
      request();
      return;
    }
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > 7) gesture.moved = true;
    if (gesture.moved) {
      cam.x -= (p.x - prev.x) / cam.z;
      cam.y -= (p.y - prev.y) / cam.z;
      clampCam();
      request();
    }
  });
  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.delete(e.pointerId);
    if (pts.size === 1) { pinch = null; return; } // 1本だけ残ったら、そのままドラッグにもどる
    if (pts.size === 0) {
      pinch = null;
      if (gesture && !gesture.moved && e.type === "pointerup") tap(p.x, p.y);
      gesture = null;
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)));
  }, { passive: false });

  const zoomAt = (sx: number, sy: number, f: number) => {
    const bp = toBoard(sx, sy);
    cam.z = Math.max(Z_MIN, Math.min(Z_MAX, cam.z * f));
    cam.x = bp.x - (sx - W / 2) / cam.z;
    cam.y = bp.y - (sy - H / 2) / cam.z;
    clampCam();
    request();
  };
  const tap = (sx: number, sy: number) => {
    let best: SkillNode | null = null, bd = Infinity;
    for (const n of tree) {
      const p = toScreen(n.pos.x, n.pos.y);
      const d = Math.hypot(p.x - sx, p.y - sy);
      const lim = Math.max(16, nodeR(n) * cam.z * 1.2) + 6;
      if (d < lim && d < bd) { bd = d; best = n; }
    }
    // 遠くから見ているときは、まずそこへ近づく
    if (best && cam.z < 0.45) {
      cam.x = best.pos.x; cam.y = best.pos.y; cam.z = 0.9;
      clampCam();
    }
    selNode = best ? best.id : null;
    onSelect(selNode);
    request();
  };

  // ---- ボタン（ズーム・全体・まん中・取れるところ） ----
  const fit = () => {
    const bw = SKILL_BOARD.maxX - SKILL_BOARD.minX + 120, bh = SKILL_BOARD.maxY - SKILL_BOARD.minY + 120;
    cam.z = Math.max(Z_MIN, Math.min(W / bw, H / bh));
    cam.x = (SKILL_BOARD.minX + SKILL_BOARD.maxX) / 2;
    cam.y = (SKILL_BOARD.minY + SKILL_BOARD.maxY) / 2;
    request();
  };
  const goNext = () => {
    // 取れるノードのうち、いちばん安いもの
    let best: SkillNode | null = null, bc = Infinity;
    for (const n of tree) {
      const st = state.get(n.id);
      if (st !== "can" && st !== "poor") continue;
      const c = nextNodeCost(save, n.id) ?? Infinity;
      if (c < bc) { bc = c; best = n; }
    }
    if (!best) { ctx.toast("いま進めるところはありません", "ng"); return; }
    cam.x = best.pos.x; cam.y = best.pos.y; cam.z = Math.max(cam.z, 0.9);
    clampCam();
    selNode = best.id;
    onSelect(best.id);
    request();
  };
  const btn = (label: string, ico: string | null, title: string, on: () => void, cls = "") =>
    h("button", { class: `sb-btn ${cls}`, "aria-label": title, title, onclick: on }, ico ? svgIcon(ico) : null, label);
  const tools = h("div", { class: "sb-tools" },
    btn("＋", null, "大きく", () => zoomAt(W / 2, H / 2, 1.4)),
    btn("－", null, "小さく", () => zoomAt(W / 2, H / 2, 1 / 1.4)),
    btn("全体", null, "盤の全体を見る", fit, "sb-wide"),
    btn("中心", null, "まん中へ", () => { cam.x = 0; cam.y = 0; cam.z = 0.9; request(); }, "sb-wide"));
  const nextBtn = btn("取れる所へ", ICONS.paw, "いま取れる、いちばん安いスキルへ", goNext, "sb-next");

  const wrap = h("div", { class: "sb-wrap" }, canvas, tools, nextBtn);
  // 前と同じ大きさなら、すぐに描く（描きなおしで一瞬白くならないように）
  if (W && H) {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    queueMicrotask(() => { if (canvas.isConnected) resize(); });
  }
  return wrap;
}

function starPath(g: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number): void {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? ri : ro;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number): void {
  const rr = Math.min(r, w / 2, hh / 2);
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + hh, rr);
  g.arcTo(x + w, y + hh, x, y + hh, rr);
  g.arcTo(x, y + hh, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** そのノードを、ちゅ〜るが足りるあいだ何レベル上げられるか（と、その合計）。 */
function affordable(save: SaveData, n: SkillNode): { levels: number; cost: number } {
  if (!isNodeOpen(save, n.id).ok) return { levels: 0, cost: 0 };
  let lv = nodeLevel(save, n.id);
  let churu = save.churu;
  let levels = 0, cost = 0;
  while (lv < n.maxLevel) {
    const c = nodeCost(n, lv);
    if (c > churu) break;
    churu -= c; cost += c; lv++; levels++;
  }
  return { levels, cost };
}

function kindLabel(n: SkillNode): string {
  if (n.kind === "root") return "はじまり";
  if (n.combo) return "宝";
  if (n.gate) return "ねこドア";
  return n.ring < 9 ? `輪${n.ring + 1}` : "外の道";
}

function renderNodePanel(ctx: Ctx, spent: number): HTMLElement {
  const save = ctx.save;
  const id = selNode;
  const n = id ? SKILL_MAP[id] : undefined;
  if (!n) {
    return h("div", { class: "np np-empty" },
      svgIcon(ICONS.paw, "np-empty-ico"),
      h("div", null,
        h("div", { class: "np-empty-t" }, "スキルをタップしてね"),
        h("div", { class: "muted small" }, "光っているスキルは、いま取れます。線でつながったとなりへ進もう。",
          h("span", { class: "np-star" }, svgIcon(COMBO_ICON)), "は宝（複合効果）、",
          h("span", { class: "np-star lock" }, svgIcon(ICONS.lock)), "は家族のレベルで開くねこドア"),
        h("div", { class: "muted small np-spent" }, "スキルに使った ", svgIcon(ICONS.churu), fmt(spent))));
  }
  const lv = nodeLevel(save, n.id);
  const cost = nextNodeCost(save, n.id);
  const can = canLearn(save, n.id);
  const open = isNodeOpen(save, n.id);
  const many = affordable(save, n);
  const maxed = lv >= n.maxLevel;
  const combo = n.combo ? n.effects.find((e) => e.combo)?.combo : undefined;
  const learnOnce = () => {
    const r = learnSkill(ctx.save, n.id);
    if (r.ok) { sfx("levelUp"); ctx.commit(); } else ctx.toast(r.reason, "ng");
  };
  const learnMax = () => {
    let last = 0;
    for (;;) {
      const r = learnSkill(ctx.save, n.id);
      if (!r.ok) break;
      last = r.value;
    }
    if (last) { sfx("levelUp"); ctx.commit(); }
  };
  const ico = n.combo ? COMBO_ICON : n.gate ? ICONS.lock : n.kind === "root" ? ICONS.paw : regionSvg(n.region);
  return h("div", { class: `np br-${n.region} ${n.combo ? "np-combo" : ""} ${n.gate ? "np-gate" : ""}` },
    h("div", { class: "np-head" },
      h("span", { class: `np-ico ic-${n.region} ${n.combo ? "combo" : ""}` }, svgIcon(ico)),
      h("div", { class: "np-title" },
        h("div", { class: "np-name" }, n.name,
          combo ? h("span", { class: "np-ctag" }, "宝・複合効果") : null,
          n.gate ? h("span", { class: "np-ctag np-gtag" }, `家族 Lv${n.minCharLevel}`) : null),
        h("div", { class: "np-sub" }, combo ? `${COMBO_NAMES[combo]}・` : "",
          `${n.kind === "root" ? "まん中" : REGION_NAMES[n.region]}・${kindLabel(n)}・段${n.tier + 1}・どの猫にも効く`)),
      h("div", { class: `np-lv ${maxed ? "max" : ""}` }, h("small", null, "Lv"), `${lv}`, h("small", null, `/${n.maxLevel}`))),
    h("div", { class: "np-eff" },
      h("span", { class: "np-now" }, lv > 0 ? effectText(n, lv) : "まだなし"),
      !maxed ? h("span", { class: "np-arrow" }, "→") : null,
      !maxed ? h("span", { class: "np-next" }, effectText(n, lv + 1)) : h("span", { class: "np-maxtag" }, "最大")),
    !maxed && !can.ok ? h("div", { class: `np-reason ${open.ok ? "poor" : ""}` }, can.reason) : null,
    maxed ? null : h("div", { class: "np-btns" },
      h("button", { class: `btn ${can.ok ? "btn-gold" : "btn-gray is-off"} np-learn`, disabled: !can.ok, onclick: learnOnce },
        h("span", { class: "np-bt" }, n.gate ? "ドアを開ける" : "習得 +1"),
        h("span", { class: `np-bc ${cost != null && save.churu < cost ? "lack" : ""}` }, svgIcon(ICONS.churu), cost != null ? fmt(cost) : "-")),
      h("button", { class: `btn ${many.levels > 1 ? "btn-purple" : "btn-gray is-off"} np-max`, disabled: many.levels <= 1, onclick: learnMax },
        h("span", { class: "np-bt" }, many.levels > 1 ? `まとめて +${many.levels}` : "まとめて"),
        h("span", { class: "np-bc" }, svgIcon(ICONS.churu), many.levels > 1 ? fmt(many.cost) : "-"))));
}
