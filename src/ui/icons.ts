// メニュー用の、かんたんな手描き風アイコン（SVG 文字列）。絵文字は使わない。
import type { CharRole, ObjectKind } from "../core/types";
import type { EquipSlot } from "../data/equips";
import type { SkillRegion } from "../data/skills";

const S = (body: string, vb = "0 0 64 64") =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const OUT = "#2a1d14";

// ---------------- 猫 ----------------

interface CatLook { fur: string; ear: string; eye: string; extra?: string }

const CAT_LOOKS: Record<string, CatLook> = {
  chatora: {
    fur: "#f4a64a", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M26 17l2 7M32 15v8M38 17l-2 7" stroke="#c46a1e" stroke-width="3"/>`,
  },
  mike: {
    fur: "#fff6ea", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M12 16 L22 30 Q14 36 11 33 Z" fill="#f2a24a"/><path d="M52 16 L42 30 Q52 34 53 31 Z" fill="#3a3030"/><ellipse cx="44" cy="27" rx="7" ry="5" fill="#3a3030"/><ellipse cx="20" cy="28" rx="7" ry="5" fill="#f2a24a"/>`,
  },
  kuro: { fur: "#2b2730", ear: "#6b4a5a", eye: "#ffd84a" },
  shiro: { fur: "#fbfbff", ear: "#ffc9d6", eye: "#4aa3ff" },
  hachiware: {
    fur: "#fbfbff", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M11 33 Q12 14 32 13 Q52 14 53 33 Q46 26 40 28 L32 40 L24 28 Q18 26 11 33 Z" fill="#2b2730"/>`,
  },
  sabatora: {
    fur: "#9aa3ad", ear: "#ffc9b0", eye: "#3b6a2a",
    extra: `<path d="M24 16l3 8M32 14v9M40 16l-3 8M12 34h7M45 34h7" stroke="#4c545e" stroke-width="3"/>`,
  },
  omochi: {
    fur: "#fff1d6", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M8 40 l-3 3 4 1 -2 4 5 -1 M56 40 l3 3 -4 1 2 4 -5 -1" stroke="#e8d3ad" stroke-width="2.5"/>`,
  },
  komugi: {
    fur: "#d9a96a", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M27 18l1 6M32 16v7M37 18l-1 6" stroke="#9c6a2e" stroke-width="2.5"/>`,
  },
  kijitora: {
    fur: "#a8794a", ear: "#e8b090", eye: "#3b6a2a",
    extra: `<path d="M24 16l3 8M32 14v9M40 16l-3 8M11 30h7M46 30h7M12 36h6M46 36h6" stroke="#5a3a1e" stroke-width="3"/>`,
  },
  sabi: {
    fur: "#3a2a24", ear: "#8a5a4a", eye: "#e8b04a",
    extra: `<path d="M30 14 Q42 14 46 24 Q40 30 34 26 Z" fill="#c8672a"/><ellipse cx="18" cy="42" rx="6" ry="5" fill="#b05a26"/><ellipse cx="44" cy="46" rx="5" ry="4" fill="#d07a3a"/>`,
  },
  leo: {
    fur: "#c9ccd2", ear: "#ffc9b0", eye: "#3f8a3a",
    extra: `<path d="M26 16 q6 6 12 0 M24 22 q8 6 16 0 M11 32 q5 -2 8 2 M53 32 q-5 -2 -8 2" stroke="#4a4e58" stroke-width="3"/>`,
  },
  luna: {
    fur: "#f6ead8", ear: "#5a4030", eye: "#3a8cff",
    extra: `<ellipse cx="32" cy="41" rx="11" ry="9" fill="#6a4c38"/><path d="M15 13 L16 23 L23 18 Z M49 13 L48 23 L41 18 Z" fill="#5a4030"/>`,
  },
  chibi: {
    fur: "#f2c99a", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<ellipse cx="32" cy="44" rx="10" ry="7" fill="#fff6ea"/><path d="M29 16l1 5M35 16l-1 5" stroke="#c98a4a" stroke-width="2.5"/>`,
  },
  kuma: {
    fur: "#8a5a3a", ear: "#e8b090", eye: "#e8c04a",
    extra: `<path d="M12 6 l-2 -5 M52 6 l2 -5" stroke="#8a5a3a" stroke-width="3"/><path d="M10 40 l-5 4 6 1 -3 5 7 -2 M54 40 l5 4 -6 1 3 5 -7 -2" fill="#a8744a" stroke="#5a3a20" stroke-width="1.6"/><ellipse cx="32" cy="45" rx="10" ry="7" fill="#e8d3ad"/>`,
  },
  sora: { fur: "#8fa4bf", ear: "#c9b0c8", eye: "#4fd67a" },
  purin: {
    fur: "#fbf3e6", ear: "#a88a70", eye: "#3a8cff",
    extra: `<path d="M20 22 Q32 30 44 22 Q46 34 40 40 Q32 34 24 40 Q18 34 20 22 Z" fill="#c8ad92" opacity=".8"/><path d="M15 13 L16 23 L23 18 Z M49 13 L48 23 L41 18 Z" fill="#a88a70"/>`,
  },
  kotetsu: {
    fur: "#e8a85a", ear: "#ffc9b0", eye: "#3f8a3a",
    extra: `<circle cx="24" cy="20" r="2.6" fill="#6a3a1a"/><circle cx="40" cy="20" r="2.6" fill="#6a3a1a"/><circle cx="32" cy="17" r="2.2" fill="#6a3a1a"/><circle cx="15" cy="34" r="2.4" fill="#6a3a1a"/><circle cx="49" cy="34" r="2.4" fill="#6a3a1a"/><circle cx="18" cy="46" r="2" fill="#6a3a1a"/><circle cx="46" cy="46" r="2" fill="#6a3a1a"/>`,
  },
  hime: {
    fur: "#fffaf6", ear: "#ffc9d6", eye: "#ff9a3a",
    extra: `<path d="M8 36 l-4 3 5 1 -3 4 6 -1 M56 36 l4 3 -5 1 3 4 -6 -1" stroke="#e8dcd6" stroke-width="2.5"/><path d="M40 12 l6 -4 0 8 Z M40 12 l-6 -4 0 8 Z" fill="#ff7eb6" stroke="#2a1d14" stroke-width="1.5"/>`,
  },
  taisho: {
    fur: "#6a6a72", ear: "#b09090", eye: "#ffd84a",
    extra: `<path d="M50 8 l-3 4 3 2" stroke="#2a1d14" stroke-width="2"/><path d="M38 26 l8 10 M41 25 l1 4" stroke="#e8c0b0" stroke-width="2.2"/><path d="M14 22 Q32 26 50 22" stroke="#4a4a52" stroke-width="3"/>`,
  },
  tama: {
    fur: "#efe8dc", ear: "#ffc9b0", eye: "#3c2a12",
    extra: `<path d="M12 16 L22 30 Q14 36 11 33 Z" fill="#9a8a7a"/><ellipse cx="44" cy="22" rx="7" ry="5" fill="#d8a060"/><path d="M19 28 q4 -3 8 0 M37 28 q4 -3 8 0" stroke="#7a6a5a" stroke-width="1.6"/>`,
  },
};

/** 猫の毛の色（体を描くとき用）。 */
export function catFur(id: string): { fur: string; ear: string } {
  const l = CAT_LOOKS[id] ?? CAT_LOOKS.chatora;
  return { fur: l.fur, ear: l.ear };
}

/** 猫の顔。silhouette なら黒いかげだけ。closed なら目をつむる（ねむっている）。 */
export function catSvg(id: string, silhouette = false, closed = false): string {
  const l = CAT_LOOKS[id] ?? CAT_LOOKS.chatora;
  if (silhouette) {
    return S(`<path d="M10 30 L12 6 L26 16 Q32 14 38 16 L52 6 L54 30 Q56 52 32 54 Q8 52 10 30 Z" fill="#120c26" stroke="#3b2f74" stroke-width="2.5"/>
      <text x="32" y="44" text-anchor="middle" font-size="20" font-weight="900" fill="#5b4cad" font-family="sans-serif">?</text>`);
  }
  return S(`
    <path d="M10 30 L12 6 L26 16 Q32 14 38 16 L52 6 L54 30 Q56 52 32 54 Q8 52 10 30 Z" fill="${l.fur}" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M15 13 L16 23 L23 18 Z M49 13 L48 23 L41 18 Z" fill="${l.ear}"/>
    ${l.extra ?? ""}
    <path d="M10 30 L12 6 L26 16 Q32 14 38 16 L52 6 L54 30 Q56 52 32 54 Q8 52 10 30 Z" stroke="${OUT}" stroke-width="2.5"/>
    ${closed
    ? `<path d="M19 33 q4 3.4 8 0 M37 33 q4 3.4 8 0" stroke="${OUT}" stroke-width="2.2"/>`
    : `<g class="eyes"><ellipse cx="23" cy="33" rx="3.6" ry="4.4" fill="${l.eye}"/><ellipse cx="41" cy="33" rx="3.6" ry="4.4" fill="${l.eye}"/>
    <circle cx="24.2" cy="31.4" r="1.3" fill="#fff"/><circle cx="42.2" cy="31.4" r="1.3" fill="#fff"/></g>`}
    <path d="M30 40 h4 l-2 2.4 Z" fill="#ff8aa0" stroke="#ff8aa0" stroke-width="1.5"/>
    <path d="M32 42.4 q-2 3 -5 2 M32 42.4 q2 3 5 2" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M6 38 l11 1.5 M6 44 l11 -1 M58 38 l-11 1.5 M58 44 l-11 -1" stroke="${OUT}" stroke-width="1.4" opacity=".6"/>
    <ellipse cx="18" cy="41" rx="3.5" ry="2" fill="#ff9ab0" opacity=".45"/><ellipse cx="46" cy="41" rx="3.5" ry="2" fill="#ff9ab0" opacity=".45"/>`);
}

// ---------------- オブジェクト ----------------

const OBJ_SVG: Record<string, string> = {
  wagomu: `<path d="M10 40 L44 26 L48 34 L22 44 L26 56 L16 58 Z" fill="#c98b4e" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M40 22 Q56 22 54 34" stroke="#ff4d6d" stroke-width="3.5"/><circle cx="17" cy="47" r="2" fill="${OUT}"/>`,
  danboru: `<path d="M8 22 L32 12 L56 22 L56 48 L32 58 L8 48 Z" fill="#d6a463" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M8 22 L32 32 L56 22 M32 32 V58" stroke="${OUT}" stroke-width="2.5"/><path d="M20 17 L44 27" stroke="#f3d39a" stroke-width="4"/>`,
  esara: `<path d="M8 36 H56 Q54 54 32 54 Q10 54 8 36 Z" fill="#ff8fb1" stroke="${OUT}" stroke-width="2.5"/>
    <circle cx="22" cy="32" r="4" fill="#b8763a" stroke="${OUT}" stroke-width="1.6"/><circle cx="31" cy="30" r="4" fill="#b8763a" stroke="${OUT}" stroke-width="1.6"/><circle cx="40" cy="32" r="4" fill="#b8763a" stroke="${OUT}" stroke-width="1.6"/>
    <path d="M18 44 h4 M28 46 h8" stroke="#fff" stroke-width="2.5" opacity=".7"/>`,
  mizudeppo: `<path d="M8 26 H46 Q52 26 52 32 V34 H24 L22 50 H12 L14 34 H8 Z" fill="#3ec7b5" stroke="${OUT}" stroke-width="2.5"/>
    <rect x="22" y="16" width="14" height="10" rx="3" fill="#ffd23f" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M56 24 q4 6 0 8 q-4 -2 0 -8 Z" fill="#7fd4ff" stroke="${OUT}" stroke-width="1.8"/>`,
  tape: `<circle cx="32" cy="34" r="20" fill="#f5deb0" stroke="${OUT}" stroke-width="2.5"/><circle cx="32" cy="34" r="9" fill="#5b4cad" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M50 42 L60 56 L52 58 Z" fill="#f5deb0" stroke="${OUT}" stroke-width="2.5"/>`,
  nezumitori: `<rect x="8" y="30" width="48" height="22" rx="3" fill="#d29a5a" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M14 30 V18 H50 V30" stroke="#c9d1d9" stroke-width="3.5"/><path d="M26 42 h12" stroke="#ffd23f" stroke-width="5"/>`,
  soujiki: `<ellipse cx="22" cy="42" rx="14" ry="12" fill="#ff6b6b" stroke="${OUT}" stroke-width="2.5"/>
    <circle cx="16" cy="52" r="4" fill="#444" stroke="${OUT}" stroke-width="2"/><path d="M34 36 Q50 30 50 14" stroke="#7a8696" stroke-width="5"/>
    <path d="M44 12 H58" stroke="${OUT}" stroke-width="5"/><circle cx="22" cy="40" r="4" fill="#fff" opacity=".6"/>`,
  cushion: `<path d="M10 18 Q32 10 54 18 Q60 34 54 50 Q32 58 10 50 Q4 34 10 18 Z" fill="#ff9ec4" stroke="${OUT}" stroke-width="2.5"/>
    <circle cx="32" cy="34" r="3" fill="#e0609a"/><path d="M20 26 l4 4 M44 26 l-4 4 M20 42 l4 -4 M44 42 l-4 -4" stroke="#e0609a" stroke-width="2.5"/>`,
  kirifuki: `<rect x="18" y="26" width="22" height="30" rx="5" fill="#7fd4ff" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M22 26 V18 H40 L46 22 H36 V26" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>
    <circle cx="52" cy="18" r="2" fill="#7fd4ff"/><circle cx="56" cy="24" r="2" fill="#7fd4ff"/><circle cx="54" cy="12" r="1.6" fill="#7fd4ff"/>`,
  oyatsu: `<path d="M14 14 H50 L54 56 H10 Z" fill="#ffd23f" stroke="${OUT}" stroke-width="2.5"/><path d="M14 14 l4 -4 h28 l4 4" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M22 36 Q32 26 42 36 Q32 46 22 36 Z M42 36 l6 -5 v10 Z" fill="#4aa3ff" stroke="${OUT}" stroke-width="2"/>`,
  senpuki: `<circle cx="32" cy="26" r="18" fill="#dff3ff" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M32 26 Q30 12 38 12 Q40 22 32 26 Q46 26 44 34 Q36 34 32 26 Q22 36 18 30 Q24 22 32 26" fill="#4aa3ff" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M32 44 V54 M22 56 H42" stroke="${OUT}" stroke-width="4"/>`,
  shitajiki: `<rect x="10" y="12" width="40" height="44" rx="5" fill="#9fd8ff" stroke="${OUT}" stroke-width="2.5" transform="rotate(-8 30 34)"/>
    <path d="M18 20 L40 16" stroke="#fff" stroke-width="3" opacity=".8"/><path d="M50 10 L44 22 H52 L46 34" stroke="#ffd23f" stroke-width="3.5"/>`,
  katorisenko: `<path d="M32 32 m-4 0 a4 4 0 1 1 8 0 a9 9 0 1 1 -18 0 a14 14 0 1 1 28 0 a19 19 0 1 1 -38 0" stroke="#3f8a3a" stroke-width="5" transform="translate(0 6)"/>
    <path d="M52 34 q4 -8 0 -14 q-4 -6 2 -12" stroke="#c9d1d9" stroke-width="2.5" opacity=".9"/><circle cx="52" cy="37" r="3" fill="#ff6b3d"/>`,
  moufu: `<path d="M6 22 Q20 14 32 22 Q44 30 58 22 V48 Q44 56 32 48 Q20 40 6 48 Z" fill="#c9a8ff" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M12 30 Q22 26 32 32 Q42 38 52 32" stroke="#fff" stroke-width="2.5" opacity=".7"/><path d="M44 6 L38 16 H45 L40 26" stroke="#ffd23f" stroke-width="3"/>`,
  spray: `<rect x="20" y="20" width="22" height="38" rx="6" fill="#7bd94a" stroke="${OUT}" stroke-width="2.5"/>
    <rect x="25" y="10" width="12" height="10" rx="2" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><path d="M37 13 h6" stroke="${OUT}" stroke-width="3"/>
    <circle cx="50" cy="10" r="2" fill="#b8f08a"/><circle cx="55" cy="16" r="2.4" fill="#b8f08a"/><circle cx="52" cy="22" r="1.8" fill="#b8f08a"/><path d="M24 34 h14" stroke="#fff" stroke-width="3" opacity=".7"/>`,
  dengen: `<rect x="10" y="22" width="44" height="22" rx="6" fill="#f4f0e6" stroke="${OUT}" stroke-width="2.5"/><circle cx="22" cy="33" r="4" fill="#5a4a3a"/><circle cx="34" cy="33" r="4" fill="#5a4a3a"/><circle cx="46" cy="33" r="3" fill="#ffb03d"/><path d="M10 33 Q2 33 4 50 Q6 58 16 58" stroke="${OUT}" stroke-width="3" fill="none"/>`,
  // EX（2026-10-26: 仮置きだった 物を ちゃんと した 絵に）
  gatling: `<path d="M22 40 h20 l4 18 h-16 Z" fill="#a86f3c" stroke="${OUT}" stroke-width="2.5"/>
    <rect x="16" y="10" width="8" height="34" rx="3" fill="#e0ad6e" stroke="${OUT}" stroke-width="2.2"/><rect x="28" y="8" width="8" height="36" rx="3" fill="#e0ad6e" stroke="${OUT}" stroke-width="2.2"/><rect x="40" y="10" width="8" height="34" rx="3" fill="#e0ad6e" stroke="${OUT}" stroke-width="2.2"/>
    <rect x="14" y="32" width="36" height="6" rx="3" fill="#ff7a3a" stroke="${OUT}" stroke-width="2"/>
    <ellipse cx="32" cy="9" rx="7" ry="3" stroke="#ffd23f" stroke-width="3"/><path d="M50 26 h8 v8" stroke="${OUT}" stroke-width="3"/><circle cx="58" cy="37" r="3.5" fill="#ff6b6b" stroke="${OUT}" stroke-width="2"/>`,
  laser: `<rect x="26" y="20" width="12" height="38" rx="5" fill="#9aa0b2" stroke="${OUT}" stroke-width="2.5"/>
    <rect x="28" y="32" width="8" height="6" rx="2" fill="#ff5a5a"/><circle cx="32" cy="12" r="9" fill="#ff5a5a" opacity=".35"/><circle cx="32" cy="12" r="4" fill="#ff3d3d" stroke="${OUT}" stroke-width="2"/>
    <path d="M44 8 l10 -4 M46 16 l12 0" stroke="#ff5a5a" stroke-width="2.5"/>`,
  hotcarpet: `<path d="M6 36 L44 28 L58 44 L20 54 Z" fill="#f39a6a" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M18 34 L32 52 M30 31 L44 49 M12 44 L50 36" stroke="#ffe2be" stroke-width="2" opacity=".85"/>
    <path d="M22 24 q-4 -6 0 -12 M34 22 q-4 -6 0 -12 M46 24 q-4 -6 0 -12" stroke="#ff7a3a" stroke-width="2.8"/>`,
  robot: `<ellipse cx="32" cy="40" rx="24" ry="12" fill="#3d4250" stroke="${OUT}" stroke-width="2.5"/>
    <ellipse cx="32" cy="35" rx="24" ry="12" fill="#6a7284" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M18 30 L20 20 L26 27 M46 30 L44 20 L38 27" fill="#6a7284" stroke="${OUT}" stroke-width="2.2"/>
    <ellipse cx="32" cy="31" rx="4" ry="2.4" fill="#8fffb0" stroke="${OUT}" stroke-width="1.6"/>`,
  seijouki: `<rect x="16" y="12" width="32" height="46" rx="8" fill="#f7f6f1" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M22 18 v8 M28 18 v8 M34 18 v8 M40 18 v8" stroke="#b9b5aa" stroke-width="2.2"/><circle cx="32" cy="40" r="5" fill="#6fd0ff" stroke="${OUT}" stroke-width="2"/>
    <path d="M22 8 q-4 -4 0 -6 M42 8 q4 -4 0 -6" stroke="#8cd2ff" stroke-width="2.5"/><path d="M54 30 l-4 6 h4 l-3 6" stroke="#ffd23f" stroke-width="2.5"/>`,
  surippa: `<ellipse cx="32" cy="46" rx="26" ry="8" fill="#c85a86" stroke="${OUT}" stroke-width="2.5"/><ellipse cx="32" cy="43" rx="25" ry="7" fill="#ffb3cf" stroke="${OUT}" stroke-width="2.2"/>
    <path d="M28 44 Q30 22 46 23 Q58 25 56 40 Q44 46 28 44 Z" fill="#ff8ab8" stroke="${OUT}" stroke-width="2.5"/><circle cx="46" cy="22" r="6" fill="#fff3f8" stroke="${OUT}" stroke-width="2.2"/>
    <path d="M8 20 l6 6 M4 30 l8 2" stroke="#f7b23a" stroke-width="2.5"/>`,
};

const KIND_COLOR: Record<ObjectKind, string> = {
  shooter: "#ff6b6b", wall: "#c98b4e", aoe: "#b46bff", slow: "#4aa3ff", producer: "#ffd23f", mine: "#ff9f43",
  zap: "#ffe14a", poison: "#7bd94a", buff: "#ffb03d",
};

export function objectSvg(id: string, kind: ObjectKind = "shooter"): string {
  const body = OBJ_SVG[id] ?? `<rect x="12" y="12" width="40" height="40" rx="10" fill="${KIND_COLOR[kind]}" stroke="${OUT}" stroke-width="2.5"/>`;
  return S(body);
}

/** オブジェクトの種類の小さなマーク。 */
export function kindSvg(kind: ObjectKind): string {
  const c = KIND_COLOR[kind];
  const body: Record<ObjectKind, string> = {
    shooter: `<path d="M32 8 L50 30 H38 V56 H26 V30 H14 Z" fill="${c}"/>`,
    wall: `<path d="M8 20 H56 V48 H8 Z M8 34 H56 M24 20 V34 M40 34 V48" fill="${c}" stroke="#2a1d14" stroke-width="3"/>`,
    aoe: `<circle cx="32" cy="32" r="22" stroke="${c}" stroke-width="6"/><circle cx="32" cy="32" r="8" fill="${c}"/>`,
    slow: `<path d="M10 40 Q20 18 36 26 Q50 32 54 22" stroke="${c}" stroke-width="7"/><circle cx="16" cy="48" r="5" fill="${c}"/>`,
    producer: `<circle cx="22" cy="36" r="10" fill="${c}"/><circle cx="40" cy="28" r="10" fill="${c}"/><circle cx="38" cy="48" r="8" fill="${c}"/>`,
    mine: `<path d="M32 6 L38 24 L58 26 L42 38 L48 58 L32 46 L16 58 L22 38 L6 26 L26 24 Z" fill="${c}"/>`,
    zap: `<path d="M36 4 L14 36 H30 L24 60 L50 26 H34 Z" fill="${c}" stroke="#2a1d14" stroke-width="3"/>`,
    buff: `<path d="M32 6 L32 30 M20 30 H44 V44 Q44 54 32 54 Q20 54 20 44 Z" stroke="#2a1d14" stroke-width="3" fill="${c}"/><path d="M26 30 V20 M38 30 V20" stroke="#2a1d14" stroke-width="4"/>`,
    poison: `<path d="M32 6 Q50 30 48 42 Q46 58 32 58 Q18 58 16 42 Q14 30 32 6 Z" fill="${c}" stroke="#2a1d14" stroke-width="3"/><circle cx="26" cy="42" r="4" fill="#fff" opacity=".6"/>`,
  };
  return S(body[kind]);
}

// ---------------- 装備 ----------------

const EQUIP_SVG: Record<string, string> = {
  mugiwara: `<ellipse cx="32" cy="40" rx="28" ry="9" fill="#f2d27a" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M16 38 Q16 16 32 16 Q48 16 48 38 Z" fill="#f2d27a" stroke="${OUT}" stroke-width="2.5"/><path d="M16 34 H48" stroke="#ff4d6d" stroke-width="5"/>`,
  knit: `<path d="M12 44 Q12 16 32 14 Q52 16 52 44 Z" fill="#6c8cff" stroke="${OUT}" stroke-width="2.5"/>
    <rect x="10" y="40" width="44" height="10" rx="4" fill="#ffffff" stroke="${OUT}" stroke-width="2.5"/><circle cx="32" cy="12" r="6" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>`,
  katyusha: `<path d="M10 46 Q12 18 32 18 Q52 18 54 46" stroke="${OUT}" stroke-width="8"/><path d="M10 46 Q12 18 32 18 Q52 18 54 46" stroke="#ff7eb6" stroke-width="5"/>
    <path d="M32 18 L18 8 L18 26 Z M32 18 L46 8 L46 26 Z" fill="#ff4d8d" stroke="${OUT}" stroke-width="2.5"/><circle cx="32" cy="18" r="4" fill="#ff4d8d" stroke="${OUT}" stroke-width="2"/>`,
  kubiwa: `<ellipse cx="32" cy="26" rx="24" ry="10" stroke="${OUT}" stroke-width="9"/><ellipse cx="32" cy="26" rx="24" ry="10" stroke="#ff4d6d" stroke-width="6"/>
    <path d="M32 36 v4" stroke="${OUT}" stroke-width="3"/><path d="M24 40 h16 l-3 14 h-10 Z" fill="#ffd23f" stroke="${OUT}" stroke-width="2.5"/>`,
  suzu: `<path d="M14 18 Q32 30 50 18" stroke="#ff4d6d" stroke-width="6"/><circle cx="32" cy="40" r="15" fill="#ffd23f" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M20 38 H44 M32 44 v8" stroke="${OUT}" stroke-width="2.5"/><circle cx="32" cy="44" r="3" fill="${OUT}"/>`,
  ribbon: `<path d="M32 30 L10 16 L12 44 Z M32 30 L54 16 L52 44 Z" fill="#ff7eb6" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M28 34 L22 56 M36 34 L42 56" stroke="#ff7eb6" stroke-width="5"/><circle cx="32" cy="30" r="6" fill="#ff4d8d" stroke="${OUT}" stroke-width="2.5"/>`,
  bandana: `<path d="M8 16 H56 L32 54 Z" fill="#e63946" stroke="${OUT}" stroke-width="2.5"/>
    <circle cx="22" cy="24" r="2.5" fill="#fff"/><circle cx="38" cy="26" r="2.5" fill="#fff"/><circle cx="30" cy="36" r="2.5" fill="#fff"/><circle cx="44" cy="20" r="2" fill="#fff"/>`,
  haramaki: `<rect x="10" y="18" width="44" height="30" rx="8" fill="#e63946" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M10 26 H54 M10 34 H54 M10 42 H54" stroke="#ffd23f" stroke-width="3"/>`,
  sweater: `<path d="M20 10 L8 18 L4 34 L14 36 L16 28 V56 H48 V28 L50 36 L60 34 L56 18 L44 10 Q32 18 20 10 Z" fill="#9b72ff" stroke="${OUT}" stroke-width="2.5"/>
    <path d="M18 34 H46 M18 42 H46" stroke="#ffffff" stroke-width="3" stroke-dasharray="4 3"/>`,
  harness: `<path d="M14 14 Q32 30 50 14 M14 14 V48 H50 V14" stroke="#4aa3ff" stroke-width="6"/>
    <path d="M14 34 H50" stroke="#4aa3ff" stroke-width="6"/><rect x="26" y="28" width="12" height="12" rx="2" fill="#c9d1d9" stroke="${OUT}" stroke-width="2.5"/>`,
};

const SLOT_SVG: Record<EquipSlot, string> = {
  head: `<path d="M12 44 Q12 16 32 14 Q52 16 52 44 Z" stroke="currentColor" stroke-width="4" stroke-dasharray="6 5"/>`,
  neck: `<ellipse cx="32" cy="30" rx="22" ry="10" stroke="currentColor" stroke-width="4" stroke-dasharray="6 5"/>`,
  body: `<path d="M20 12 L8 20 L6 34 L16 34 V54 H48 V34 L58 34 L56 20 L44 12 Q32 20 20 12 Z" stroke="currentColor" stroke-width="4" stroke-dasharray="6 5"/>`,
};

export function equipSvg(defId: string): string {
  return S(EQUIP_SVG[defId] ?? SLOT_SVG.head);
}

/** 空いている枠の点線アイコン。 */
export function slotSvg(slot: EquipSlot): string {
  return S(SLOT_SVG[slot]);
}

// ---------------- そのほか ----------------

export const ICONS = {
  coin: S(`<circle cx="32" cy="32" r="26" fill="#ffd23f" stroke="#a8730a" stroke-width="4"/><circle cx="32" cy="32" r="18" stroke="#f0a90f" stroke-width="3"/>
    <ellipse cx="32" cy="37" rx="7" ry="6" fill="#c98a0b"/><circle cx="22.5" cy="28" r="3.2" fill="#c98a0b"/><circle cx="28.5" cy="22.5" r="3.2" fill="#c98a0b"/><circle cx="35.5" cy="22.5" r="3.2" fill="#c98a0b"/><circle cx="41.5" cy="28" r="3.2" fill="#c98a0b"/>`),
  relic: S(`<path d="M32 4 L54 22 L32 60 L10 22 Z" fill="#c78bff" stroke="#4a1f86" stroke-width="3.5"/>
    <path d="M10 22 H54 M22 22 L32 60 L42 22 M22 22 L32 4 L42 22" stroke="#4a1f86" stroke-width="2" opacity=".6"/><path d="M18 20 L28 10" stroke="#fff" stroke-width="3" opacity=".8"/>`),
  exp: S(`<path d="M32 4 L39 23 L59 24 L43 37 L49 57 L32 45 L15 57 L21 37 L5 24 L25 23 Z" fill="#7cf29c" stroke="#1d6b37" stroke-width="3.5"/>
    <text x="32" y="39" text-anchor="middle" font-size="13" font-weight="900" fill="#1d6b37" font-family="sans-serif">EXP</text>`),
  shard: S(`<path d="M20 8 L44 14 L54 38 L34 58 L12 40 Z" fill="#7fd4ff" stroke="#1f5a8a" stroke-width="3.5"/><path d="M20 8 L30 34 L54 38 M30 34 L12 40 M30 34 L34 58" stroke="#1f5a8a" stroke-width="2" opacity=".6"/>`),
  equipBox: S(`<rect x="8" y="22" width="48" height="34" rx="5" fill="#ff9f43" stroke="#7a3d00" stroke-width="3.5"/><path d="M4 16 H60 V26 H4 Z" fill="#ffc46b" stroke="#7a3d00" stroke-width="3.5"/><path d="M32 16 V56" stroke="#ff4d6d" stroke-width="6"/>`),
  kibble: S(`<path d="M10 32 Q24 14 44 26 L56 18 L54 46 L44 38 Q24 50 10 32 Z" fill="#c98a4b" stroke="#5a3210" stroke-width="3.5"/><circle cx="20" cy="30" r="3" fill="#5a3210"/>`),
  lock: S(`<rect x="12" y="28" width="40" height="30" rx="6" fill="#cdb596" stroke="#4a3121" stroke-width="3.5"/><path d="M20 28 V20 Q20 8 32 8 Q44 8 44 20 V28" stroke="#4a3121" stroke-width="5"/><circle cx="32" cy="42" r="4" fill="#4a3121"/>`),
  gear: S(`<path d="M28 4 h8 l2 8 l6 3 l7 -4 l6 6 l-4 7 l3 6 l8 2 v8 l-8 2 l-3 6 l4 7 l-6 6 l-7 -4 l-6 3 l-2 8 h-8 l-2 -8 l-6 -3 l-7 4 l-6 -6 l4 -7 l-3 -6 l-8 -2 v-8 l8 -2 l3 -6 l-4 -7 l6 -6 l7 4 l6 -3 Z" fill="#ecd6b4" stroke="#4a3121" stroke-width="3"/><circle cx="32" cy="32" r="9" fill="#4a3121"/>`),
  check: S(`<path d="M12 34 L26 48 L52 18" stroke="currentColor" stroke-width="9"/>`),
  close: S(`<path d="M16 16 L48 48 M48 16 L16 48" stroke="currentColor" stroke-width="8"/>`),
  left: S(`<path d="M42 8 L16 32 L42 56 Z" fill="currentColor" stroke="#4a3121" stroke-width="4"/>`),
  right: S(`<path d="M22 8 L48 32 L22 56 Z" fill="currentColor" stroke="#4a3121" stroke-width="4"/>`),
  paw: S(`<ellipse cx="32" cy="42" rx="13" ry="11" fill="currentColor"/><ellipse cx="15" cy="28" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="25" cy="16" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="39" cy="16" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="49" cy="28" rx="6" ry="7.5" fill="currentColor"/>`),
  shield: S(`<path d="M32 6 L54 14 V32 Q54 50 32 58 Q10 50 10 32 V14 Z" fill="currentColor"/><path d="M32 16 V48 M20 28 H44" stroke="#4a3121" stroke-width="4" opacity=".35"/>`),
  sparkle: S(`<path d="M32 4 L37 26 L60 32 L37 38 L32 60 L27 38 L4 32 L27 26 Z" fill="currentColor"/><circle cx="52" cy="12" r="4" fill="currentColor"/>`),
  toybox: S(`<rect x="8" y="26" width="48" height="30" rx="5" fill="currentColor"/><path d="M4 18 H60 V28 H4 Z" fill="currentColor"/><circle cx="24" cy="12" r="7" fill="currentColor"/><path d="M38 6 l10 10 M48 6 l-10 10" stroke="currentColor" stroke-width="5"/><path d="M8 34 H56" stroke="#4a3121" stroke-width="3" opacity=".35"/>`),
  churu: S(`<g transform="rotate(-35 32 32)"><rect x="22" y="2" width="20" height="60" rx="6" fill="#ff9ec4" stroke="#7a2350" stroke-width="3.5"/>
    <path d="M22 10 h20" stroke="#7a2350" stroke-width="2.5"/><path d="M24 4 l3 3 3 -3 3 3 3 -3 3 3" stroke="#7a2350" stroke-width="1.8"/>
    <rect x="25" y="22" width="14" height="24" rx="4" fill="#fff6ea"/>
    <g fill="#ff5c9a"><ellipse cx="32" cy="38" rx="4" ry="3.4"/><circle cx="27.4" cy="32.6" r="1.8"/><circle cx="30.6" cy="30.6" r="1.8"/><circle cx="33.8" cy="30.6" r="1.8"/><circle cx="36.8" cy="32.6" r="1.8"/></g>
    <path d="M26 52 h12" stroke="#fff" stroke-width="3" opacity=".7"/></g>`),
  heart: S(`<path d="M32 56 L10 34 Q2 22 12 12 Q24 4 32 18 Q40 4 52 12 Q62 22 54 34 Z" fill="currentColor"/>`),
  wind: S(`<path d="M6 22 H40 Q52 22 50 12 Q46 4 38 10 M6 34 H52 Q62 34 60 44 Q56 52 48 46 M6 46 H30" stroke="currentColor" stroke-width="7"/>`),
  crown: S(`<path d="M6 50 L10 18 L22 32 L32 10 L42 32 L54 18 L58 50 Z" fill="currentColor"/><rect x="6" y="50" width="52" height="6" rx="2" fill="currentColor"/>`),
  mama: S(`<circle cx="32" cy="20" r="12" fill="#ffd9c2" stroke="${OUT}" stroke-width="2.5"/><path d="M18 22 Q16 4 32 6 Q48 4 46 22 Q44 12 32 12 Q22 12 18 22 Z" fill="#6b3f2a"/><path d="M12 60 Q14 34 32 34 Q50 34 52 60 Z" fill="#ff8fb1" stroke="${OUT}" stroke-width="2.5"/>`),
  // 下のタブ
  tabGrow: S(`<path d="M32 6 L54 30 H42 V56 H22 V30 H10 Z" fill="#7cf29c" stroke="#123f22" stroke-width="4"/>`),
  tabMain: S(`<path d="M6 30 L32 8 L58 30 V58 H6 Z" fill="#ffb347" stroke="#5a2d00" stroke-width="4"/><path d="M22 58 V40 H42 V58" fill="#7a3d00" stroke="#5a2d00" stroke-width="4"/>
    <path d="M24 22 l2 -8 6 5 6 -5 2 8 Q32 28 24 22 Z" fill="#fff6ea" stroke="#5a2d00" stroke-width="2.5"/>`),
  tabRelic: S(`<path d="M32 4 L54 22 L32 60 L10 22 Z" fill="#c78bff" stroke="#3d1670" stroke-width="4"/><path d="M10 22 H54 M22 22 L32 60 L42 22" stroke="#3d1670" stroke-width="2.5"/>`),
};

const REGION_ICON: Record<SkillRegion, string> = {
  atk: ICONS.paw,
  def: ICONS.shield,
  spd: ICONS.wind,
  tech: ICONS.sparkle,
  support: ICONS.toybox,
};

/** スキル盤の地方のアイコン。 */
export function regionSvg(r: SkillRegion): string {
  return REGION_ICON[r] ?? ICONS.crown;
}

// ---------------- v4: ねこ福袋・わざ・複合効果 ----------------

/** ねこ福袋（ふくろの口をひもでしばった、まるい布の袋）。open なら口がほどけて光がもれる。 */
export function bagSvg(open = false, color = "#ff6b6b"): string {
  const top = open
    ? `<path d="M18 22 Q10 10 20 6 Q26 14 32 12 Q38 14 44 6 Q54 10 46 22" fill="${color}" stroke="${OUT}" stroke-width="3"/>
       <path d="M22 20 Q32 4 42 20" fill="#fff6c8" opacity=".9"/>
       <g stroke="#fff3a0" stroke-width="3"><path d="M32 2 V-6"/><path d="M22 4 L17 -2"/><path d="M42 4 L47 -2"/></g>`
    : `<path d="M20 20 Q12 8 22 6 Q27 13 32 10 Q37 13 42 6 Q52 8 44 20" fill="${color}" stroke="${OUT}" stroke-width="3"/>
       <path d="M24 12 q2 4 0 7 M40 12 q-2 4 0 7" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`;
  return S(`
    <path d="M14 30 Q6 52 18 58 Q32 63 46 58 Q58 52 50 30 Q44 20 32 21 Q20 20 14 30 Z" fill="${color}" stroke="${OUT}" stroke-width="3"/>
    <path d="M17 36 Q32 42 47 36" stroke="#fff" stroke-width="2.5" opacity=".35"/>
    <circle cx="32" cy="43" r="9.5" fill="#fff6ea" stroke="${OUT}" stroke-width="2.5"/>
    <g fill="${color}"><ellipse cx="32" cy="46" rx="3.6" ry="3"/><circle cx="27.6" cy="41.4" r="1.7"/><circle cx="30.6" cy="39.6" r="1.7"/><circle cx="33.6" cy="39.6" r="1.7"/><circle cx="36.4" cy="41.4" r="1.7"/></g>
    ${top}
    <path d="M19 23 Q32 28 45 23" stroke="#ffd23f" stroke-width="4"/>
    <path d="M30 25 l-6 7 M34 25 l6 7" stroke="#ffd23f" stroke-width="3"/>
    <circle cx="32" cy="25" r="3" fill="#ffd23f" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M18 34 Q16 44 20 52" stroke="#fff" stroke-width="3" opacity=".45"/>`, "0 -8 64 72");
}

/** 役割のアイコン（わざ・スキルのタブ用）。currentColor で塗る。 */
const ROLE_ICON: Record<CharRole, string> = {
  melee: S(`<ellipse cx="32" cy="42" rx="13" ry="11" fill="currentColor"/><ellipse cx="15" cy="28" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="25" cy="16" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="39" cy="16" rx="6" ry="7.5" fill="currentColor"/><ellipse cx="49" cy="28" rx="6" ry="7.5" fill="currentColor"/>`),
  ranged: S(`<circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="6"/><circle cx="32" cy="32" r="13" stroke="currentColor" stroke-width="6"/><circle cx="32" cy="32" r="4.5" fill="currentColor"/>`),
  aoe: S(`<path d="M32 32 m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -20 0 a16 16 0 1 1 32 0 a22 22 0 1 1 -44 0" stroke="currentColor" stroke-width="6"/>`),
  fast: S(`<path d="M38 4 L12 36 H30 L24 60 L52 26 H34 Z" fill="currentColor"/>`),
};

export function roleSvg(role: CharRole): string {
  return ROLE_ICON[role];
}

/** 複合効果（スキルツリーの特別なノード）。きらきらの星。 */
export const COMBO_ICON = S(`<path d="M32 3 L39 22 L60 24 L44 37 L49 58 L32 47 L15 58 L20 37 L4 24 L25 22 Z" fill="currentColor"/>
  <path d="M32 16 L35 27 L46 28 L37 34 L40 45 L32 39 L24 45 L27 34 L18 28 L29 27 Z" fill="#fff" opacity=".55"/>`);

/** わざの星（レベル）。 */
export const STAR_ICON = S(`<path d="M32 5 L40 24 L60 25 L44 38 L50 58 L32 47 L14 58 L20 38 L4 25 L24 24 Z" fill="currentColor"/>`);

/** えんぴつ（なまえを変える）。 */
export const PEN_ICON = S(`<path d="M12 52 L16 38 L44 10 L54 20 L26 48 Z" fill="currentColor"/><path d="M12 52 L16 38 L26 48 Z" fill="#ffe0a8"/><path d="M40 14 L50 24" stroke="#4a3121" stroke-width="3" opacity=".4"/>`);

/** たす（＋）。 */
export const PLUS_ICON = S(`<path d="M32 12 V52 M12 32 H52" stroke="currentColor" stroke-width="9"/>`);
