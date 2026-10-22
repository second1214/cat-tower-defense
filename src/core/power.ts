// 電池の設定。localStorage に覚える。
// high: きれい（60 コマ/秒・きめ 2 倍・演出ぜんぶ）
// save: 省電力（はじめはこれ。60 コマ/秒のまま、きめ 1.5 倍・こまかい演出を半分）
// ultra: 超省電力（save に加えて 30 コマ/秒。少しカクカクする）
export type PowerMode = "high" | "save" | "ultra";
const KEY = "cat-td-power2";

export function powerMode(): PowerMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "high" || v === "ultra" ? v : "save";
  } catch { return "save"; }
}

export function setPowerMode(m: PowerMode): void {
  try { localStorage.setItem(KEY, m); } catch { /* 覚えられなくてもよい */ }
}

export const POWER_NAMES: Record<PowerMode, string> = { high: "きれい", save: "省電力", ultra: "超省電力" };
