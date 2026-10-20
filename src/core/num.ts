// 数値の表示（インフレ系）。999 まではそのまま、1e3 = 1A、1e6 = 1B、… 1e78 = 1Z、その次は 1AA（26×26 まで）。

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** k 番目（1 = A = 1e3）の単位の文字。 */
export function unitName(k: number): string {
  if (k <= 0) return "";
  if (k <= 26) return LETTERS[k - 1];
  const j = k - 27; // 0 = AA
  if (j < 26 * 26) return LETTERS[Math.floor(j / 26)] + LETTERS[j % 26];
  return "";
}

/** 有効数字3けたまで（切り捨て）。末尾の 0 は消す。 */
function mantissa(m: number): string {
  // 浮動小数の誤差（1.15*100 = 114.999…）をよけるため、ほんの少し足してから切り捨てる
  let s: string;
  if (m < 10) s = (Math.floor(m * 100 + 1e-7) / 100).toFixed(2);
  else if (m < 100) s = (Math.floor(m * 10 + 1e-7) / 10).toFixed(1);
  else s = String(Math.floor(m + 1e-7));
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

/** 数値を短く表示する。例: 1500 → "1.5A"、1e6 → "1B"、1e81 → "1AA"。 */
export function fmt(n: number): string {
  if (Number.isNaN(n)) return "?";
  if (n === Infinity) return "∞";
  if (n === -Infinity) return "-∞";
  if (n < 0) {
    const s = fmt(-n);
    return s === "0" ? "0" : "-" + s;
  }
  if (n < 1000) return String(Math.floor(n));
  let k = Math.floor(Math.log10(n) / 3);
  let m = n / Math.pow(10, 3 * k);
  // log10 の誤差で境目がずれたときの直し
  if (m >= 1000 - 1e-9) { k += 1; m = n / Math.pow(10, 3 * k); }
  if (m < 1 - 1e-12) { k -= 1; m = n / Math.pow(10, 3 * k); }
  const unit = unitName(k);
  if (!unit) return n.toExponential(2); // 単位が足りないほど大きいとき
  // 切り捨てで 1000 になってしまうのを防ぐ
  return mantissa(Math.min(m, 999.999)) + unit;
}
