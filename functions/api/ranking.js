// Cloudflare Pages で公開したときのランキング（中身は Workers と同じ worker/ranking.js）。
// Pages のプロジェクトの「設定 → バインディング」で、KV 名前空間を RANKING という名前でつなぐ。
export { onRequestGet, onRequestPost } from "../../worker/ranking.js";
