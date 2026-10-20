// 小さな DOM ヘルパー（フレームワークなし）。
import { fmt } from "../core/num";

/** ステータス用: 100 未満は小数1けたまで（2.4 など）、それ以上は fmt。 */
export function fmtS(n: number): string {
  if (isFinite(n) && Math.abs(n) < 100) return String(Math.round(n * 10) / 10);
  return fmt(n);
}
export type Child = Node | string | number | null | undefined | false | Child[];
export type Attrs = Record<string, unknown>;

/** 要素を作る。on〇〇 はイベント、class・style・html・dataset は特別あつかい。 */
export function h(tag: string, attrs?: Attrs | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "html") el.innerHTML = String(v);
      else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** SVG 文字列を span に入れる。 */
export function svgIcon(svg: string, cls = ""): HTMLElement {
  return h("span", { class: `ico ${cls}`, html: svg, "aria-hidden": "true" });
}

/** 0〜1 の進み具合のバー。 */
export function bar(ratio: number, cls = "", label?: string): HTMLElement {
  const r = Math.max(0, Math.min(1, isFinite(ratio) ? ratio : 0));
  return h("div", { class: `bar ${cls}` },
    h("div", { class: "bar-fill", style: `width:${(r * 100).toFixed(1)}%` }),
    label != null ? h("div", { class: "bar-label" }, label) : null,
  );
}

/** 赤いバッジの点。 */
export function badge(on: boolean): HTMLElement | null {
  return on ? h("span", { class: "badge-dot", "aria-label": "できること があります" }) : null;
}
