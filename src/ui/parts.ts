// 画面のあちこちで使う小さな部品（レアリティ・なかよし度・わざ・役割）。
import type { CharRole, Rarity } from "../core/types";
import { MAX_BOND, ROLE_NAMES } from "../data/chars";
import { MAX_WAZA_LEVEL, type WazaDef } from "../data/waza";
import { h, svgIcon } from "./dom";
import { ICONS, STAR_ICON, roleSvg } from "./icons";

/** レアリティの札（N〜UR）。わざ・装備だけに使う（猫そのものにはレアリティはない）。 */
export function rarityPill(r: Rarity, cls = ""): HTMLElement {
  return h("span", { class: `rar-pill rp-${r} ${cls}` }, r);
}

/** ハート（なかよし度）を n/MAX_BOND で並べる。 */
export function bondHearts(n: number, cls = ""): HTMLElement {
  const hs: HTMLElement[] = [];
  for (let i = 0; i < MAX_BOND; i++) hs.push(svgIcon(ICONS.heart, i < n ? "bh on" : "bh"));
  return h("span", { class: `bond ${cls}`, title: `なかよし度 ${n} / ${MAX_BOND}` }, hs);
}

/** わざのレベル（★）。 */
export function wazaStars(level: number, cls = ""): HTMLElement {
  const st: HTMLElement[] = [];
  for (let i = 0; i < MAX_WAZA_LEVEL; i++) st.push(svgIcon(STAR_ICON, i < level ? "ws on" : "ws"));
  return h("span", { class: `wstars ${cls}`, title: `わざ Lv${level} / ${MAX_WAZA_LEVEL}` }, st);
}

/** 役割の札（アイコンつき）。 */
export function roleTag(role: CharRole, cls = ""): HTMLElement {
  return h("span", { class: `role-tag role-${role} ${cls}` }, svgIcon(roleSvg(role), "role-ico"), ROLE_NAMES[role]);
}

/** わざのアイコン（メインは役割のしるし、サブはきらきら）。まるい枠の色はレアリティ。 */
export function wazaIcon(def: WazaDef, cls = ""): HTMLElement {
  const svg = def.slot === "main" && def.role ? roleSvg(def.role) : ICONS.sparkle;
  return h("span", { class: `wz-ico wr-${def.rarity} ${def.slot === "main" ? `wz-main role-c-${def.role}` : "wz-sub"} ${cls}` }, svgIcon(svg));
}
