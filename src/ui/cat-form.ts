// うちの子の登録・変更（名前・見た目・性格）。はじめての起動・「うちの子を追加」・くわしくの「変える」で使う。
import { heroUid, registerCat, updateCat } from "../core/progress";
import { MAX_CATS } from "../core/save";
import type { Personality } from "../core/types";
import { CAT_LOOKS, MAX_CAT_NAME } from "../data/chars";
import { PERSONALITIES } from "../data/personality";
import type { Ctx } from "./ctx";
import { h, svgIcon } from "./dom";
import { ICONS } from "./icons";
import { catIcon, loadCatSprites } from "./cafe";

interface FormState { name: string; look: string; personality: Personality }

/** 入力の部品。描きなおしても入力がきえないように、要素は1回だけ作って使いまわす。 */
function buildForm(st: FormState, intro?: string): { el: HTMLElement; focus(): void } {
  const input = h("input", {
    class: "cf-name-input", type: "text", maxlength: String(MAX_CAT_NAME), placeholder: "なまえ（12文字まで）",
    value: st.name, autocomplete: "off", enterkeyhint: "done",
  }) as HTMLInputElement;
  const count = h("span", { class: "cf-name-count" });
  const preview = h("div", { class: "cf-preview" });
  const updPreview = () => {
    count.textContent = `${[...st.name].length} / ${MAX_CAT_NAME}`;
    preview.replaceChildren(catIcon(st.look, "cf-prev-ico"),
      h("div", { class: "cf-prev-name" }, st.name.trim() || "？"),
      h("div", { class: "cf-prev-pers" }, PERSONALITIES.find((p) => p.id === st.personality)?.name ?? ""));
  };
  input.addEventListener("input", () => {
    // 12文字（絵文字なども1文字）をこえたら切る
    const chars = [...input.value];
    if (chars.length > MAX_CAT_NAME) input.value = chars.slice(0, MAX_CAT_NAME).join("");
    st.name = input.value;
    updPreview();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });

  const looks = CAT_LOOKS.map((id) => {
    const b = h("button", {
      class: `cf-look ${st.look === id ? "on" : ""}`, "aria-label": `見た目 ${id}`, type: "button",
      onclick: () => {
        st.look = id;
        lookGrid.querySelectorAll(".cf-look").forEach((x) => x.classList.toggle("on", x === b));
        updPreview();
      },
    }, catIcon(id, "cf-look-ico"));
    return b;
  });
  const lookGrid = h("div", { class: "cf-looks" }, looks);

  const pers = PERSONALITIES.map((p) => {
    const b = h("button", {
      class: `cf-pers ${st.personality === p.id ? "on" : ""}`, type: "button",
      onclick: () => {
        st.personality = p.id;
        persList.querySelectorAll(".cf-pers").forEach((x) => x.classList.toggle("on", x === b));
        updPreview();
      },
    }, h("span", { class: "cf-pers-name" }, p.name), h("span", { class: "cf-pers-desc" }, p.desc));
    return b;
  });
  const persList = h("div", { class: "cf-perslist" }, pers);
  updPreview();
  // はじめての起動では 猫の絵の一覧（manifest）より先に 画面ができるので、届いたら 絵に差しかえる
  loadCatSprites(() => {
    looks.forEach((b, i) => b.replaceChildren(catIcon(CAT_LOOKS[i], "cf-look-ico")));
    updPreview();
  });

  const el = h("div", { class: "cat-form" },
    intro ? h("div", { class: "cf-intro" }, svgIcon(ICONS.heart, "cf-intro-ico"), h("span", null, intro)) : null,
    preview,
    h("div", { class: "cf-label" }, h("span", null, "なまえ"), count),
    input,
    h("div", { class: "cf-label" }, h("span", null, "見た目"), h("span", { class: "muted small" }, "いちばん近い子をえらんでね")),
    lookGrid,
    h("div", { class: "cf-label" }, h("span", null, "性格"), h("span", { class: "muted small" }, "強さはみんな同じ。得意なことがちがうよ")),
    persList);
  return { el, focus: () => { try { input.focus(); } catch { /* 何もしない */ } } };
}

/** はじめての起動: 1匹目（仮の c1）に名前・見た目・性格をつける。閉じられない。 */
export function openSetup(ctx: Ctx): void {
  const uid = heroUid(ctx.save);
  const c = ctx.save.cats[uid];
  const st: FormState = { name: "", look: c?.look ?? CAT_LOOKS[0], personality: c?.personality ?? "nonbiri" };
  const form = buildForm(st, "ママを虫から守る、うちの子を教えてね。あとから成長タブで変えたり、増やしたりできるよ。");
  const m = ctx.modals.open({
    title: "うちの子を登録しよう",
    cls: "modal-tall modal-catform modal-setup",
    dismissable: false,
    closeButton: false,
    render: () => form.el,
    footer: () => h("button", {
      class: "btn btn-gold btn-wide cf-ok",
      onclick: () => {
        const save = ctx.save;
        const r = updateCat(save, heroUid(save), { name: st.name, look: st.look, personality: st.personality });
        if (!r.ok) { ctx.toast(r.reason, "ng"); form.focus(); return; }
        save.setupDone = true;
        m.close();
        ctx.commit();
        ctx.toast(`${st.name.trim()}、よろしくね！`);
      },
    }, "この子ではじめる"),
  });
}

/** うちの子を追加する。できたら、その子のくわしくを開く（onDone）。 */
export function openAddCat(ctx: Ctx, onDone?: (uid: string) => void): void {
  if (Object.keys(ctx.save.cats).length >= MAX_CATS) { ctx.toast(`猫は ${MAX_CATS} 匹までです`, "ng"); return; }
  const st: FormState = { name: "", look: CAT_LOOKS[Math.floor(Math.random() * CAT_LOOKS.length)], personality: "nonbiri" };
  const form = buildForm(st);
  const m = ctx.modals.open({
    title: "うちの子を追加",
    cls: "modal-tall modal-catform",
    render: () => form.el,
    footer: () => h("div", { class: "foot-row" },
      h("button", { class: "btn btn-gray", onclick: () => m.close() }, "やめる"),
      h("button", {
        class: "btn btn-gold",
        onclick: () => {
          const r = registerCat(ctx.save, st);
          if (!r.ok) { ctx.toast(r.reason, "ng"); form.focus(); return; }
          m.close();
          ctx.commit();
          ctx.toast(`${st.name.trim()}がうちの子になりました`);
          onDone?.(r.value);
        },
      }, "登録する")),
  });
}

/** 名前・見た目・性格を変える。 */
export function openEditCat(ctx: Ctx, uid: string): void {
  const c = ctx.save.cats[uid];
  if (!c) return;
  const st: FormState = { name: c.name, look: c.look, personality: c.personality };
  const form = buildForm(st);
  const m = ctx.modals.open({
    title: `${c.name}のプロフィール`,
    cls: "modal-tall modal-catform",
    render: () => form.el,
    footer: () => h("div", { class: "foot-row" },
      h("button", { class: "btn btn-gray", onclick: () => m.close() }, "やめる"),
      h("button", {
        class: "btn btn-green",
        onclick: () => {
          const r = updateCat(ctx.save, uid, st);
          if (!r.ok) { ctx.toast(r.reason, "ng"); form.focus(); return; }
          m.close();
          ctx.commit();
          ctx.toast("変えました");
        },
      }, "これにする")),
  });
}
