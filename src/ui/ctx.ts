// 画面どうしで共有するもの（セーブ・保存・モーダル・トースト）。
import type { Rng } from "../core/rng";
import type { SaveData } from "../core/save";
import { type Child, append, h, svgIcon } from "./dom";
import { ICONS } from "./icons";

export type Tab = "gacha" | "grow" | "main" | "relic";
export type GrowSub = "char" | "skill" | "obj" | "equip";
export type EquipFilter = "all" | "head" | "neck" | "body";

/** 画面だけの状態（保存しない）。 */
export interface UiState {
  tab: Tab;
  growSub: GrowSub;
  fuseMode: boolean;
  fuseSel: string[];
  equipFilter: EquipFilter;
  /** スキルツリーで見ている役割（null なら主人公の役割）。 */
  skillRole: import("../core/types").CharRole | null;
}

export interface Ctx {
  /** いまのセーブ（リセット・読みこみで入れかわるので、毎回 ctx.save から読む）。 */
  save: SaveData;
  ui: UiState;
  /** 保存して、画面を描きなおす。 */
  commit(): void;
  /** 描きなおすだけ。 */
  rerender(): void;
  /** たねつき乱数を使う（使ったあと save.seed を進める）。 */
  withRng<T>(fn: (rng: Rng) => T): T;
  modals: Modals;
  toast(msg: string, kind?: "ok" | "ng"): void;
  confirm(msg: string, okLabel?: string, danger?: boolean): Promise<boolean>;
  goTab(tab: Tab, sub?: GrowSub): void;
  play(stageId: string): void;
}

export interface ModalOpts {
  title?: string;
  /** 中身。描きなおすたびに呼ばれる。 */
  render: () => Child;
  /** 下に固定するボタンなど。 */
  footer?: () => Child;
  cls?: string;
  onClose?: () => void;
  /** 背景を押して閉じられるか（既定 true）。 */
  dismissable?: boolean;
  /** 閉じるボタン（既定 true）。 */
  closeButton?: boolean;
}

interface OpenModal { opts: ModalOpts; el: HTMLElement; body: HTMLElement; foot: HTMLElement; closed: boolean }

/** 重ねられるモーダル。commit のたびに中身を描きなおすので、古い表示が残らない。 */
export class Modals {
  private stack: OpenModal[] = [];
  constructor(private layer: HTMLElement) {}

  get count(): number { return this.stack.length; }

  open(opts: ModalOpts): { close(): void } {
    const body = h("div", { class: "modal-body", dataset: { sk: `modal-${this.stack.length}` } });
    const foot = h("div", { class: "modal-foot" });
    const m: OpenModal = { opts, el: null as unknown as HTMLElement, body, foot, closed: false };
    const close = () => this.closeOne(m);
    const panel = h("div", { class: `modal ${opts.cls ?? ""}`, role: "dialog", "aria-modal": "true" },
      opts.title != null || opts.closeButton !== false
        ? h("div", { class: "modal-head" },
          h("div", { class: "modal-title" }, opts.title ?? ""),
          opts.closeButton !== false ? h("button", { class: "modal-x", "aria-label": "閉じる", onclick: close }, svgIcon(ICONS.close)) : null)
        : null,
      body, foot);
    const el = h("div", { class: "modal-back enter" }, panel);
    el.addEventListener("click", (e) => { if (e.target === el && opts.dismissable !== false) close(); });
    el.addEventListener("animationend", () => el.classList.remove("enter"), { once: true });
    m.el = el;
    this.stack.push(m);
    this.layer.appendChild(el);
    this.fill(m);
    return { close };
  }

  private fill(m: OpenModal): void {
    const st = m.body.scrollTop;
    m.body.replaceChildren();
    append(m.body, [m.opts.render()]);
    m.foot.replaceChildren();
    if (m.opts.footer) append(m.foot, [m.opts.footer()]);
    m.foot.style.display = m.foot.childNodes.length ? "" : "none";
    m.body.scrollTop = st;
  }

  private closeOne(m: OpenModal): void {
    if (m.closed) return;
    m.closed = true;
    m.el.remove();
    this.stack = this.stack.filter((x) => x !== m);
    m.opts.onClose?.();
  }

  rerenderAll(): void {
    for (const m of [...this.stack]) if (!m.closed) this.fill(m);
  }

  closeAll(): void {
    for (const m of [...this.stack].reverse()) this.closeOne(m);
  }

  closeTop(): void {
    const m = this.stack[this.stack.length - 1];
    if (m && m.opts.dismissable !== false) this.closeOne(m);
  }
}

/** 戦闘画面のモジュール（src/battle/screen.ts）の形。 */
export type StartBattle = (
  root: HTMLElement,
  loadout: import("../core/types").Loadout,
  opts: { onEnd(result: import("../core/types").BattleResult): void; onQuit(): void; seed?: number },
) => { destroy(): void };
