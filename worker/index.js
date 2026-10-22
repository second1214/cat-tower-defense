// Cloudflare Workers の入り口。/api/ranking はランキング、それ以外は dist の静的ファイル（ゲーム本体）を返す。
import { onRequestGet, onRequestPost } from "./ranking.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ranking") {
      if (request.method === "GET") return onRequestGet({ env, request });
      if (request.method === "POST") return onRequestPost({ env, request });
      return new Response("method not allowed", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
