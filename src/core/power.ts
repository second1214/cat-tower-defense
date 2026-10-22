// 省電力モード（スマホの電池をへらさない）。はじめは ON。localStorage に覚える。
// ON: 戦闘は 30 コマ/秒・画面のきめを少しあらく・こまかい演出をへらす。
const KEY = "cat-td-power";

export function powerSave(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

export function setPowerSave(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* 覚えられなくてもよい */ }
}
