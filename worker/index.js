// Cloudflare Workers の入り口。dist の静的ファイル（ゲーム本体）を返す。
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
