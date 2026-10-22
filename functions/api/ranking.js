// エンドレスのランキング（Cloudflare Pages Functions）。KV の名前空間を RANKING という名前でつないで使う。
// GET  /api/ranking            → { top: [{ name, score }] }（上位 100）
// POST /api/ranking {id, name, score} → 自分の記録が上がったときだけ書きかえる。{ ok, rank }
// RANKING がつながっていないときは 503（画面は「自分の記録」だけ出す）。
const KEY = "top";
const MAX = 100;
const MAX_SCORE = 1000;          // エンドレスの波は 300 + 始める波（ありえない数ははじく）
const MIN_GAP_MS = 20 * 1000;    // 同じ人の書きこみは 20 秒に1回まで

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function readTop(kv) {
  try { const t = await kv.get(KEY, "json"); return Array.isArray(t) ? t : []; } catch { return []; }
}

export async function onRequestGet({ env }) {
  if (!env.RANKING) return json({ error: "ranking off" }, 503);
  const top = await readTop(env.RANKING);
  return json({ top: top.map((e) => ({ name: e.name, score: e.score })) });
}

export async function onRequestPost({ env, request }) {
  if (!env.RANKING) return json({ error: "ranking off" }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = typeof b.id === "string" ? b.id.slice(0, 64) : "";
  const name = (typeof b.name === "string" ? b.name : "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12) || "ねこ";
  const score = Math.floor(Number(b.score));
  if (!/^[a-z0-9-]{8,64}$/i.test(id) || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) return json({ error: "bad data" }, 400);
  const top = await readTop(env.RANKING);
  const now = Date.now();
  const mine = top.find((e) => e.id === id);
  if (mine && now - (mine.at || 0) < MIN_GAP_MS) return json({ error: "too fast" }, 429);
  if (mine) {
    mine.name = name;
    if (score > mine.score) { mine.score = score; mine.at = now; }
  } else {
    top.push({ id, name, score, at: now });
  }
  top.sort((a, c) => c.score - a.score || a.at - c.at);
  const kept = top.slice(0, MAX);
  await env.RANKING.put(KEY, JSON.stringify(kept));
  const rank = kept.findIndex((e) => e.id === id);
  return json({ ok: true, rank: rank >= 0 ? rank + 1 : null });
}
