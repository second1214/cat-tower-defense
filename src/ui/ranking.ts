// エンドレスのランキング（サーバー: worker/ranking.js）。サーバーが使えないときは自分の記録だけ出す。
import type { Ctx } from "./ctx";
import { h } from "./dom";
import { heroUid } from "../core/progress";

const PID_KEY = "cat-tower-defense/pid";
const API = "api/ranking";

export interface RankRow { name: string; score: number }

/** この端末のプレイヤー id（はじめて使うときに作る）。 */
function playerId(): string {
  try {
    let id = localStorage.getItem(PID_KEY);
    if (!id || !/^[a-z0-9-]{8,64}$/i.test(id)) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
      localStorage.setItem(PID_KEY, id);
    }
    return id;
  } catch { return "local-player"; }
}

/** ランキングに出す名前（決めていなければ主人公の名前）。 */
export function rankName(ctx: Ctx): string {
  return ctx.save.playerName || ctx.save.cats[heroUid(ctx.save)]?.name || "ねこ";
}

async function call(init?: RequestInit): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(API, { ...init, signal: ac.signal, headers: { "content-type": "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/** 上位を読む。使えないときは null。 */
export async function fetchTop(): Promise<RankRow[] | null> {
  const j = (await call()) as { top?: RankRow[] } | null;
  return j && Array.isArray(j.top) ? j.top : null;
}

/** 記録を送る。順位（わからなければ null）。 */
export async function submitScore(ctx: Ctx, score: number): Promise<number | null> {
  if (score <= 0) return null;
  const j = (await call({ method: "POST", body: JSON.stringify({ id: playerId(), name: rankName(ctx), score }) })) as { rank?: number } | null;
  return j && typeof j.rank === "number" ? j.rank : null;
}

/** ランキングの窓。 */
export function openRanking(ctx: Ctx): void {
  let top: RankRow[] | null | undefined;
  ctx.modals.open({
    title: "エンドレス ランキング",
    render: () => {
      const save = ctx.save;
      const input = h("input", { class: "rk-name", maxlength: "12", value: rankName(ctx), "aria-label": "ランキングの名前" }) as HTMLInputElement;
      const list = top === undefined ? h("p", { class: "muted" }, "読みこみ中…")
        : top === null ? h("p", { class: "muted" }, "ランキングに つながりませんでした（自分の記録だけ出しています）")
        : top.length === 0 ? h("p", { class: "muted" }, "まだ記録がありません。一番乗りしよう！")
        : h("ol", { class: "rk-list" }, top.map((r, i) => h("li", { class: `rk-row ${i < 3 ? `top${i + 1}` : ""}` },
          h("span", { class: "rk-rank" }, String(i + 1)), h("span", { class: "rk-n" }, r.name), h("span", { class: "rk-s" }, `${r.score} 波`))));
      return h("div", { class: "rk" },
        h("div", { class: "rk-me" }, h("span", null, "自分の記録"), h("b", null, `${save.endlessBest} 波`)),
        h("div", { class: "rk-edit" }, input,
          h("button", { class: "btn btn-small", onclick: () => {
            ctx.save.playerName = input.value.replace(/[<>]/g, "").trim().slice(0, 12);
            ctx.commit();
            void submitScore(ctx, ctx.save.endlessBest).then(() => ctx.toast("名前を変えました"));
          } }, "名前を保存")),
        list);
    },
  });
  void fetchTop().then((t) => { top = t; ctx.modals.rerenderAll(); });
}
