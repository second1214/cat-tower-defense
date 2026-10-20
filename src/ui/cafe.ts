// メインの猫カフェ（窓からのぞいているような部屋）。DOM と CSS アニメーションだけで、JS は1秒に1回の見回りだけ（軽い）。
// - 選んでいる猫は手前の真ん中（名前の札は tab-main がのせる）。ほかのお迎えした猫は、キャットタワー・棚・クッションなどでくつろぐ
// - 窓の外: いまの時刻（朝・昼・夕方・夜）と月（春夏秋冬）で景色が変わる。ときどき虫が飛んでいき、猫たちが目で追う
// - ときどきママの手がごはんを入れて、猫が食べに来る
// 開発用: ?cafeTime=morning|day|evening|night・?cafeSeason=spring|summer|autumn|winter・?cafeFast（できごとを早く）
// 絵の差しかえ: sprites/cats/manifest.json に "<id>_<pose>" があれば <img src="sprites/cats/<id>_<pose>.png"> を使う。
import { CHAR_MAP } from "../data/chars";
import type { Ctx } from "./ctx";
import { h } from "./dom";
import { catFur, catSvg } from "./icons";

export type CatPose = "sit" | "loaf" | "sleep" | "groom" | "eat" | "walk";
export type CafeTime = "morning" | "day" | "evening" | "night";
export type CafeSeason = "spring" | "summer" | "autumn" | "winter";

const OUT = "#2a1d14";

/** 絵（SVG 文字列）を入れた span。メニューの .ico とは別（大きさは CSS で決める）。 */
const art = (svg: string, cls: string): HTMLElement => h("span", { class: `art ${cls}`, html: svg, "aria-hidden": "true" });

// ================= 時刻・季節 =================

export function timeOfDay(d: Date = new Date()): CafeTime {
  const hr = d.getHours() + d.getMinutes() / 60;
  if (hr >= 5 && hr < 9) return "morning";
  if (hr >= 9 && hr < 16) return "day";
  if (hr >= 16 && hr < 19) return "evening";
  return "night";
}

export function seasonOf(d: Date = new Date()): CafeSeason {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

const TIMES: CafeTime[] = ["morning", "day", "evening", "night"];
const SEASONS: CafeSeason[] = ["spring", "summer", "autumn", "winter"];

function query(): URLSearchParams {
  try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); }
}

function overrideTime(): CafeTime | null {
  const v = query().get("cafeTime");
  return v && (TIMES as string[]).includes(v) ? (v as CafeTime) : null;
}

function overrideSeason(): CafeSeason | null {
  const v = query().get("cafeSeason");
  return v && (SEASONS as string[]).includes(v) ? (v as CafeSeason) : null;
}

// ================= 猫の絵（ポーズごと） =================

let spriteSet: Set<string> | null = null;
let spriteTried = false;

/** sprites/cats/manifest.json を一度だけ読む（なければ何もしない）。形: ["chatora_sit", …] か { "chatora": ["sit", …] }。 */
function loadCatSprites(onReady: () => void): void {
  if (spriteTried) return;
  spriteTried = true;
  if (typeof fetch !== "function") return;
  fetch("sprites/cats/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => {
      const set = new Set<string>();
      if (Array.isArray(j)) for (const k of j) { if (typeof k === "string") set.add(k.replace(/\.png$/, "")); }
      else if (j && typeof j === "object") {
        const o = (j as { cats?: unknown }).cats ?? j;
        for (const [id, poses] of Object.entries(o as Record<string, unknown>)) {
          if (Array.isArray(poses)) for (const p of poses) if (typeof p === "string") set.add(`${id}_${p}`);
        }
      }
      if (set.size) { spriteSet = set; onReady(); }
    })
    .catch(() => undefined);
}

/** 絵が用意されているか。 */
export function hasCatSprite(id: string, pose: CatPose): boolean {
  return !!spriteSet?.has(`${id}_${pose}`);
}

const tail = (d: string, fur: string, w = 7) =>
  `<g class="tail"><path d="${d}" stroke="${OUT}" stroke-width="${w + 5}"/><path d="${d}" stroke="${fur}" stroke-width="${w}"/></g>`;

const SV = (vb: string, body: string) =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

function sitBody(fur: string): string {
  return SV("0 0 100 115", `
    ${tail("M70 106 Q98 108 94 82 Q92 72 85 76", fur)}
    <path d="M28 112 Q13 106 20 78 Q26 46 50 44 Q74 46 80 78 Q87 106 72 112 Z" fill="${fur}" stroke="${OUT}" stroke-width="3"/>
    <path d="M38 62 Q50 74 62 62 Q61 86 50 94 Q39 86 38 62 Z" fill="#fff" opacity=".35"/>
    <path d="M40 86 V105 M60 86 V105" stroke="${OUT}" stroke-width="2" opacity=".45"/>
    <ellipse cx="40" cy="109" rx="8.5" ry="5" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>
    <ellipse cx="60" cy="109" rx="8.5" ry="5" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>`);
}

function loafBody(fur: string): string {
  return SV("0 0 140 90", `
    <path d="M14 86 Q4 50 40 40 Q80 30 114 40 Q138 50 132 86 Z" fill="${fur}" stroke="${OUT}" stroke-width="3"/>
    <path d="M70 44 Q92 40 110 46" stroke="${OUT}" stroke-width="2" opacity=".3"/>
    ${tail("M128 82 Q104 92 78 86", fur, 6)}
    <ellipse cx="34" cy="85" rx="9" ry="4.5" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>
    <ellipse cx="54" cy="86" rx="9" ry="4.5" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>`);
}

function sleepBody(fur: string): string {
  return SV("0 0 140 80", `
    <g class="breath"><ellipse cx="80" cy="52" rx="55" ry="26" fill="${fur}" stroke="${OUT}" stroke-width="3"/>
    <path d="M52 34 Q80 24 112 34" stroke="${OUT}" stroke-width="2" opacity=".3"/></g>
    ${tail("M132 58 Q124 80 74 78 Q46 77 34 68", fur)}`);
}

function standBody(fur: string): string {
  const leg = (x: number, cls: string) => `<rect class="${cls}" x="${x}" y="56" width="12" height="40" rx="6" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>`;
  return SV("0 0 150 100", `
    ${tail("M128 46 Q150 32 140 10", fur)}
    ${leg(64, "leg leg-b")}${leg(112, "leg leg-a")}
    <ellipse cx="90" cy="50" rx="46" ry="22" fill="${fur}" stroke="${OUT}" stroke-width="3"/>
    ${leg(50, "leg leg-a")}${leg(98, "leg leg-b")}
    <path d="M58 60 Q90 70 122 58" stroke="#fff" stroke-width="5" opacity=".25"/>`);
}

function pawSvg(fur: string): string {
  return SV("0 0 40 56", `<path d="M12 54 Q8 24 16 10 Q26 2 32 12 Q35 30 28 54 Z" fill="${fur}" stroke="${OUT}" stroke-width="2.5"/>
    <ellipse cx="24" cy="12" rx="4" ry="3" fill="#ff9ab0"/>`);
}

/** 猫1匹のポーズ（絵があれば画像、なければ顔＋かんたんな体）。 */
export function catPoseEl(id: string, pose: CatPose): HTMLElement {
  if (hasCatSprite(id, pose)) {
    return h("div", { class: `kc-cat pose-${pose} kc-img` },
      h("img", { src: `sprites/cats/${id}_${pose}.png`, alt: CHAR_MAP[id]?.name ?? "", draggable: "false" }));
  }
  const { fur } = catFur(id);
  const body = pose === "sit" || pose === "groom" ? sitBody(fur) : pose === "loaf" ? loafBody(fur) : pose === "sleep" ? sleepBody(fur) : standBody(fur);
  return h("div", { class: `kc-cat pose-${pose}` },
    art(body, "kc-body"),
    art(catSvg(id, false, pose === "sleep"), "kc-head"),
    pose === "groom" ? art(pawSvg(fur), "kc-paw") : null,
    pose === "sleep" ? h("span", { class: "kc-zzz" }, h("i", null, "z"), h("i", null, "z"), h("i", null, "Z")) : null);
}

// ================= 部屋の物 =================

const treeSvg = () => SV("0 0 60 80", `
  <path d="M30 78 V40 M30 52 L18 38 M30 46 L42 34 M30 60 L40 52" stroke="#6b4a2e" stroke-width="5"/>
  <g class="crown"><circle cx="30" cy="28" r="20"/><circle cx="16" cy="38" r="12"/><circle cx="44" cy="38" r="12"/><circle cx="30" cy="12" r="11"/></g>
  <g class="snowcap"><path d="M14 33 q8 -7 16 -2 q8 -7 16 2" stroke="#fff" stroke-width="4"/></g>`);

const houseSvg = () => SV("0 0 60 50", `
  <path d="M6 22 L30 4 L54 22 Z" fill="#b5584a"/><rect x="10" y="22" width="40" height="28" fill="#f2e0c4"/>
  <rect class="hw" x="18" y="28" width="9" height="9" fill="#8fb4d8"/><rect class="hw" x="33" y="28" width="9" height="9" fill="#8fb4d8"/>
  <path class="roof-snow" d="M6 22 L30 4 L54 22" stroke="#fff" stroke-width="4"/>`);

const sunflowerSvg = () => SV("0 0 20 50", `<path d="M10 50 V16" stroke="#3f8a3a" stroke-width="2.5"/><path d="M10 34 q-6 -2 -8 -8 q6 0 8 6" fill="#4fae4a"/>
  <g fill="#ffd23f"><circle cx="10" cy="5" r="3.5"/><circle cx="15" cy="9" r="3.5"/><circle cx="15" cy="15" r="3.5"/><circle cx="10" cy="19" r="3.5"/><circle cx="5" cy="15" r="3.5"/><circle cx="5" cy="9" r="3.5"/></g>
  <circle cx="10" cy="12" r="4" fill="#7a4a1e"/>`);

const bugSvg = () => SV("0 0 40 32", `
  <g class="wing w1"><ellipse cx="14" cy="9" rx="9" ry="6" fill="#ffffff" opacity=".8" stroke="${OUT}" stroke-width="1.5"/></g>
  <g class="wing w2"><ellipse cx="25" cy="9" rx="9" ry="6" fill="#ffffff" opacity=".8" stroke="${OUT}" stroke-width="1.5"/></g>
  <ellipse cx="20" cy="20" rx="11" ry="9" fill="var(--bug, #e8463a)" stroke="${OUT}" stroke-width="2"/>
  <path d="M20 12 V29" stroke="${OUT}" stroke-width="1.5"/><circle cx="15" cy="19" r="2" fill="${OUT}"/><circle cx="25" cy="23" r="2" fill="${OUT}"/>
  <circle cx="9" cy="20" r="4.5" fill="${OUT}"/><circle cx="7.6" cy="18.8" r="1.2" fill="#fff"/>
  <path d="M6 16 q-3 -5 -6 -5 M8 15 q-1 -6 -4 -8" stroke="${OUT}" stroke-width="1.4"/>`);

const towerSvg = () => SV("0 0 100 200", `
  <rect x="22" y="20" width="12" height="176" fill="#e8d2a8" stroke="${OUT}" stroke-width="2.5"/>
  <rect x="66" y="96" width="12" height="100" fill="#e8d2a8" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M22 40 h12 M22 52 h12 M22 64 h12 M22 76 h12 M22 120 h12 M22 132 h12 M22 144 h12 M22 156 h12 M22 168 h12 M66 120 h12 M66 140 h12 M66 160 h12 M66 180 h12" stroke="#b89a6a" stroke-width="2"/>
  <rect x="2" y="12" width="86" height="12" rx="6" fill="#c98b5e" stroke="${OUT}" stroke-width="2.5"/>
  <rect x="34" y="84" width="64" height="14" rx="6" fill="#c98b5e" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M40 98 Q66 122 92 98" fill="#f2b8c8" stroke="${OUT}" stroke-width="2.5"/>
  <rect x="0" y="186" width="100" height="12" rx="5" fill="#a86e44" stroke="${OUT}" stroke-width="2.5"/>
  <circle cx="58" cy="108" r="0"/>
  <path d="M74 24 V40" stroke="#ff7eb6" stroke-width="2"/><circle cx="74" cy="44" r="5" fill="#ff7eb6" stroke="${OUT}" stroke-width="2" class="pom"/>`);

const handSvg = () => SV("0 0 120 70", `
  <path d="M0 20 H62 Q70 20 70 30 V42 Q70 50 62 50 H0 Z" fill="#ff8fb1" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M58 22 V48" stroke="#fff" stroke-width="4" opacity=".6"/>
  <path d="M68 24 Q84 22 88 30 Q90 40 82 46 Q72 50 68 46 Z" fill="#ffd9c2" stroke="${OUT}" stroke-width="2.5"/>
  <g class="scoop"><path d="M84 30 L96 22 Q116 22 118 38 Q112 50 96 46 Z" fill="#7fd4ff" stroke="${OUT}" stroke-width="2.5"/>
  <g fill="#c98a4b" stroke="${OUT}" stroke-width="1"><circle cx="102" cy="30" r="3.5"/><circle cx="109" cy="32" r="3.5"/><circle cx="105" cy="36" r="3.5"/></g></g>`);

const bowlSvg = () => SV("0 0 80 40", `
  <g class="food" fill="#c98a4b" stroke="${OUT}" stroke-width="1.2">
    <circle class="k3" cx="28" cy="12" r="5"/><circle class="k3" cx="40" cy="9" r="5"/><circle class="k3" cx="52" cy="12" r="5"/>
    <circle class="k2" cx="22" cy="17" r="5"/><circle class="k2" cx="34" cy="15" r="5"/><circle class="k2" cx="46" cy="15" r="5"/><circle class="k2" cx="58" cy="17" r="5"/>
    <circle class="k1" cx="28" cy="19" r="5"/><circle class="k1" cx="40" cy="18" r="5"/><circle class="k1" cx="52" cy="19" r="5"/></g>
  <path d="M6 18 H74 Q72 38 40 38 Q8 38 6 18 Z" fill="#ff8fb1" stroke="${OUT}" stroke-width="2.5"/>
  <ellipse cx="40" cy="18" rx="34" ry="5" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M18 27 q8 4 16 4" stroke="#fff" stroke-width="3" opacity=".6"/>
  <path d="M28 30 q4 -3 8 0 M44 30 q4 -3 8 0" stroke="#fff" stroke-width="0" />`);

const clockSvg = () => SV("0 0 40 40", `<circle cx="20" cy="20" r="17" fill="#fff6ea" stroke="${OUT}" stroke-width="3"/>
  <path d="M20 6 v3 M34 20 h-3 M20 34 v-3 M6 20 h3" stroke="${OUT}" stroke-width="2"/>
  <path d="M8 6 L4 0 L13 3 Z M32 6 L36 0 L27 3 Z" fill="#c98b5e" stroke="${OUT}" stroke-width="2"/>
  <path class="hand-h" d="M20 20 V11" stroke="${OUT}" stroke-width="3"/><path class="hand-m" d="M20 20 V7" stroke="#e0334f" stroke-width="2"/>
  <circle cx="20" cy="20" r="2" fill="${OUT}"/>`);

const plantSvg = () => SV("0 0 40 50", `<path d="M10 30 H30 L27 48 H13 Z" fill="#d07a4a" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M20 30 Q8 20 6 6 Q18 10 20 30 Q24 14 34 8 Q34 24 20 30" fill="#5fbf5a" stroke="${OUT}" stroke-width="2"/>`);

const yarnSvg = () => SV("0 0 40 30", `<circle cx="16" cy="16" r="12" fill="#7fb8ff" stroke="${OUT}" stroke-width="2.5"/>
  <path d="M7 10 Q16 18 25 10 M6 18 Q16 26 26 18 M12 5 Q20 16 14 28" stroke="#4a7ad0" stroke-width="1.6"/><path d="M27 20 Q34 26 40 22" stroke="#7fb8ff" stroke-width="2"/>`);

// ================= 場所 =================

interface Spot { id: string; x: number; b: number; u: string; pose: CatPose; z: number; look: number; perch: boolean }

/** ほかの猫のいる場所（すき間が多い順に使う）。x は中心（%）、b は下から（%）。 */
const SPOTS: Spot[] = [
  { id: "tower", x: 16, b: 79.5, u: "min(16cqw, 14cqh)", pose: "loaf", z: 16, look: 1, perch: true },
  { id: "cushion", x: 83, b: 13, u: "min(18cqw, 16cqh)", pose: "groom", z: 26, look: -1, perch: false },
  { id: "shelf", x: 87, b: 61.5, u: "min(13cqw, 12cqh)", pose: "sleep", z: 14, look: -1, perch: true },
  { id: "rug", x: 66, b: 33, u: "min(12cqw, 11cqh)", pose: "sit", z: 12, look: -1, perch: false },
  { id: "tower2", x: 22, b: 62.5, u: "min(12cqw, 11cqh)", pose: "sleep", z: 17, look: 1, perch: true },
  { id: "sill", x: 64, b: 62.5, u: "min(10cqw, 9cqh)", pose: "sit", z: 9, look: -1, perch: true },
];

const FLOOR_U = "min(17cqw, 15cqh)";
const BOWLS = [{ x: 11, b: 6 }, { x: 25, b: 4.5 }];

interface CatEl { id: string; spot: Spot; wrap: HTMLElement; pose: CatPose; busy: boolean }

// ================= 本体 =================

interface Cache { key: string; ctx: Ctx; el: HTMLElement; stop(): void }
let cache: Cache | null = null;

/** 猫カフェの部屋。同じ猫たちなら前の DOM をそのまま使う（ごはん・虫の途中で描きなおしても続く）。 */
export function renderCafe(ctx: Ctx, onCatTap: (id: string) => void): HTMLElement {
  const save = ctx.save;
  const others = Object.keys(save.chars).filter((id) => id !== save.selectedChar && CHAR_MAP[id]);
  const key = [save.selectedChar, ...others].join(",");
  if (cache && cache.key === key && cache.ctx === ctx) return cache.el;
  cache?.stop();
  const built = buildCafe(save.selectedChar, others, onCatTap, () => { if (cache?.key === key) { cache.stop(); cache = null; ctx.rerender(); } });
  cache = { key, ctx, el: built.el, stop: built.stop };
  return built.el;
}

function buildCafe(selected: string, others: string[], onCatTap: (id: string) => void, onSprites: () => void): { el: HTMLElement; stop(): void } {
  const q = query();
  const fast = q.has("cafeFast");
  const tO = overrideTime();
  const sO = overrideSeason();

  // ---- 窓 ----
  const falls = h("div", { class: "cf-fall" }, Array.from({ length: 9 }, (_, i) => h("i", { style: `--i:${i}` })));
  const bug = h("div", { class: "cf-bug" }, art(bugSvg(), "cf-bug-ico"));
  const view = h("div", { class: "cf-view" },
    h("div", { class: "cf-sun" }), h("div", { class: "cf-moon" }), h("div", { class: "cf-stars" }),
    h("div", { class: "cf-cloud c1" }), h("div", { class: "cf-cloud c2" }),
    h("div", { class: "cf-hill h1" }),
    art(houseSvg(), "cf-house"),
    h("div", { class: "cf-hill h2" }),
    art(treeSvg(), "cf-tree t1"), art(treeSvg(), "cf-tree t2"), art(treeSvg(), "cf-tree t3"),
    art(sunflowerSvg(), "cf-sunflower f1"), art(sunflowerSvg(), "cf-sunflower f2"), art(sunflowerSvg(), "cf-sunflower f3"),
    h("div", { class: "cf-fence" }),
    falls, bug,
    h("div", { class: "cf-glass" }));
  const win = h("div", { class: "cf-window" },
    view, h("div", { class: "cf-mullion" }),
    h("div", { class: "cf-curtain l" }), h("div", { class: "cf-curtain r" }),
    h("div", { class: "cf-sill" }, h("div", { class: "cf-sill-snow" })),
    art(plantSvg(), "cf-sill-plant"));

  const clock = art(clockSvg(), "cf-clock");

  // ---- 物 ----
  const bowls = BOWLS.map((b) => {
    const el = art(bowlSvg(), "cf-bowl f0");
    el.style.left = `${b.x}%`;
    el.style.bottom = `${b.b}%`;
    return el;
  });
  const hand = art(handSvg(), "cf-hand");

  // ---- 猫 ----
  const cats: CatEl[] = [];
  const makeCat = (id: string, spot: Spot, hero: boolean): CatEl => {
    const wrap = h("button", {
      class: `cf-cat ${hero ? "hero" : ""}`, "aria-label": CHAR_MAP[id]?.name ?? id,
      style: `left:${spot.x}%;bottom:${spot.b}%;--u:${spot.u};z-index:${spot.z};--look:${spot.look};--d:${(cats.length * 0.37) % 2}s`,
      onclick: (e: Event) => { e.stopPropagation(); onCatTap(id); },
    }, catPoseEl(id, spot.pose));
    const c: CatEl = { id, spot, wrap, pose: spot.pose, busy: false };
    cats.push(c);
    return c;
  };
  const heroSpot: Spot = { id: "hero", x: 50, b: 14, u: "min(30cqw, 27cqh)", pose: "sit", z: 40, look: 0, perch: false };
  makeCat(selected, heroSpot, true);
  const lounging = others.slice(0, SPOTS.length).map((id, i) => makeCat(id, SPOTS[i], false));

  const room = h("div", { class: "cf-room" },
    h("div", { class: "cf-wall" }), h("div", { class: "cf-wains" }), h("div", { class: "cf-floor" }),
    win, clock,
    h("div", { class: "cf-shelf s1" }), art(plantSvg(), "cf-shelf-plant"),
    h("div", { class: "cf-shelf s2" }),
    art(towerSvg().replace("<svg ", '<svg preserveAspectRatio="none" '), "cf-tower"),
    h("div", { class: "cf-rug" }),
    h("div", { class: "cf-cushion" }),
    art(yarnSvg(), "cf-yarn"),
    h("div", { class: "cf-mat" }),
    ...bowls, hand,
    ...cats.map((c) => c.wrap),
    h("div", { class: "cf-tint" }));
  const el = h("div", { class: "cafe" }, room);

  // ---- 時刻・季節 ----
  const applyTime = () => {
    const now = new Date();
    const t = tO ?? timeOfDay(now);
    const s = sO ?? seasonOf(now);
    for (const x of TIMES) el.classList.toggle(`t-${x}`, x === t);
    for (const x of SEASONS) el.classList.toggle(`s-${x}`, x === s);
    const hh = now.getHours() % 12 + now.getMinutes() / 60;
    clock.querySelector<SVGElement>(".hand-h")?.setAttribute("transform", `rotate(${hh * 30} 20 20)`);
    clock.querySelector<SVGElement>(".hand-m")?.setAttribute("transform", `rotate(${now.getMinutes() * 6} 20 20)`);
    const bugColors: Record<CafeSeason, string> = { spring: "#e8463a", summer: "#3fae5a", autumn: "#e8902a", winter: "#8a7ad8" };
    bug.style.setProperty("--bug", t === "night" ? "#b9a4ff" : bugColors[s]);
  };
  applyTime();

  // ---- できごと ----
  let alive = true;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const wait = (ms: number) => new Promise<void>((res, rej) => {
    const t = setTimeout(() => { timers.delete(t); if (alive) res(); else rej(new Error("stop")); }, ms);
    timers.add(t);
  });
  const sp = fast ? 0.35 : 1;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  const setPose = (c: CatEl, pose: CatPose) => {
    if (c.pose === pose) return;
    c.pose = pose;
    c.wrap.replaceChildren(catPoseEl(c.id, pose));
  };

  // 虫が窓の外を飛ぶ → 猫たちが目で追う
  let watching = false;
  const flyBug = async () => {
    if (watching) return;
    watching = true;
    const ltr = Math.random() < 0.5;
    bug.style.setProperty("--y", `${rnd(12, 48).toFixed(0)}%`);
    bug.className = `cf-bug fly ${ltr ? "ltr" : "rtl"}`;
    el.classList.add("watch", ltr ? "watch-ltr" : "watch-rtl");
    try { await wait(4800); } finally {
      bug.className = "cf-bug";
      el.classList.remove("watch", "watch-ltr", "watch-rtl");
      watching = false;
    }
  };

  // ごはん
  let feeding = false;
  const move = async (c: CatEl, left: string, bottom: string, ms: number, cls: string) => {
    c.wrap.style.transition = `left ${ms}ms ${cls}, bottom ${ms}ms ${cls}, --u ${ms}ms ease`;
    c.wrap.style.left = left;
    c.wrap.style.bottom = bottom;
    await wait(ms + 40);
  };
  const xOf = (c: CatEl) => c.wrap.style.left;
  const feed = async () => {
    if (feeding) return;
    feeding = true;
    const order = ["cushion", "rug", "tower", "sill", "shelf", "tower2"];
    const eaters = order.map((sid) => lounging.find((c) => c.spot.id === sid)).filter((c): c is CatEl => !!c).slice(0, 2);
    if (!eaters.length) { feeding = false; return; }
    try {
      // ママの手がごはんを入れる
      hand.classList.remove("pour1", "pour2");
      void hand.getBoundingClientRect();
      hand.classList.add(eaters.length > 1 ? "pour2" : "pour1");
      await wait(1100);
      bowls[0].classList.replace("f0", "f3");
      if (eaters.length > 1) { await wait(800); bowls[1].classList.replace("f0", "f3"); }
      await wait(900);
      hand.classList.remove("pour1", "pour2");
      el.classList.add("dinner");
      await Promise.all(eaters.map(async (c, i) => {
        c.busy = true;
        await wait(i * 700 + 300);
        const bowl = BOWLS[i];
        if (c.pose === "sleep" || c.pose === "loaf") { setPose(c, "sit"); await wait(500); }
        // 高い所からは、まず床へぴょん
        if (c.spot.perch) {
          c.wrap.classList.add("hop");
          await move(c, xOf(c), "30%", 480, "cubic-bezier(.5,0,.9,.6)");
          c.wrap.classList.remove("hop");
        }
        setPose(c, "walk");
        const tx = `calc(${bowl.x}% + ${FLOOR_U} * 0.42)`;
        c.wrap.style.setProperty("--u", FLOOR_U);
        c.wrap.style.zIndex = "30";
        c.wrap.classList.toggle("flip", parseFloat(xOf(c)) < bowl.x + 4);
        await move(c, tx, `${bowl.b + 2.5}%`, 1700, "linear");
        c.wrap.classList.remove("flip");
        setPose(c, "eat");
        for (const f of ["f2", "f1", "f0"]) {
          await wait(2400 * sp);
          bowls[i].classList.remove("f3", "f2", "f1", "f0");
          bowls[i].classList.add(f);
        }
        setPose(c, "sit");
        c.wrap.classList.add("happy");
        await wait(1300);
        c.wrap.classList.remove("happy");
        // もどる
        setPose(c, "walk");
        const backX = `${c.spot.x}%`;
        c.wrap.classList.toggle("flip", c.spot.x > bowl.x);
        await move(c, backX, c.spot.perch ? "30%" : `${c.spot.b}%`, 1700, "linear");
        c.wrap.classList.remove("flip");
        c.wrap.style.setProperty("--u", c.spot.u);
        c.wrap.style.zIndex = String(c.spot.z);
        if (c.spot.perch) {
          setPose(c, "sit");
          c.wrap.classList.add("hop");
          await move(c, backX, `${c.spot.b}%`, 480, "cubic-bezier(.1,.4,.5,1)");
          c.wrap.classList.remove("hop");
        }
        setPose(c, c.spot.pose);
        c.wrap.style.transition = "";
        c.busy = false;
      }));
    } catch { /* 止めたとき */ } finally {
      el.classList.remove("dinner");
      feeding = false;
    }
  };

  // 1秒に1回の見回り（見えていないときは何もしない）
  let nextBug = (fast ? 3 : rnd(6, 12));
  let nextFeed = (fast ? 2 : rnd(5, 9));
  let nextClock = 60;
  const iv = setInterval(() => {
    if (!alive) return;
    if (!el.isConnected || el.offsetParent === null || (typeof document !== "undefined" && document.hidden)) return;
    if (--nextClock <= 0) { nextClock = 60; applyTime(); }
    if (--nextBug <= 0) { nextBug = fast ? 7 : rnd(14, 26); void flyBug(); }
    if (!feeding && --nextFeed <= 0) { nextFeed = fast ? 6 : rnd(30, 50); void feed(); }
  }, 1000);

  loadCatSprites(onSprites);

  return {
    el,
    stop() {
      alive = false;
      clearInterval(iv);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
