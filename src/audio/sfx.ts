// 効果音（素材が 読めた 物は Kenney の 音、それ以外と 読めない時は 合成）。猫と家の、やわらかくて短い音。
// たくさん鳴っても耳が痛くならないように、同時に鳴る数と、同じ音の間かくをしぼる。
import { audioCtx, noise, onAudioReady, rawCtx, sfxOut, sfxSilent } from "./core";
import { loadSamples, playSample } from "./samples";

// 音が 使えるように なったら 素材の 効果音を 読む
onAudioReady(() => { const ac = rawCtx(); if (ac) loadSamples(ac); });

export type SfxName =
  | "tap" | "confirm" | "cancel" | "tab" | "error"
  | "place" | "upgrade" | "remove"
  | "punch" | "whoosh" | "throw" | "swish"
  | "hit" | "crit" | "pop" | "kibble" | "zap" | "poison" | "explode" | "shockwave" | "slam"
  | "special" | "bossAppear" | "bossDeath" | "mamaHit" | "catHit" | "catDown" | "catUp"
  | "wave" | "win" | "lose"
  | "bagShake" | "levelUp" | "unlock";

/** 同時に鳴らせる効果音の数（これを超えたら、だいじでない音はとばす）。 */
const MAX_VOICES = 18;
/** 同じ音の最小の間かく（秒）。x2・x3 のときに音が重なりすぎないように。 */
const GAP: Partial<Record<SfxName, number>> = {
  tap: 0.04, hit: 0.045, crit: 0.07, pop: 0.035, kibble: 0.07, zap: 0.06, poison: 0.18, explode: 0.09,
  shockwave: 0.12, slam: 0.1, punch: 0.06, whoosh: 0.07, throw: 0.06, swish: 0.05, catHit: 0.2, mamaHit: 0.25,
  place: 0.05, upgrade: 0.08, bagShake: 0.08,
};
/** 大事な音（数がいっぱいでも鳴らす）。 */
const PRIORITY = new Set<SfxName>(["special", "bossAppear", "bossDeath", "win", "lose", "wave", "mamaHit", "levelUp", "unlock", "upgrade", "place"]);

const lastAt = new Map<SfxName, number>();
/** 鳴っている音の終わる時刻（古い順ではなく、ただの入れもの）。 */
const voiceEnds: number[] = [];

function activeVoices(now: number): number {
  let w = 0;
  for (let i = 0; i < voiceEnds.length; i++) if (voiceEnds[i] > now) voiceEnds[w++] = voiceEnds[i];
  voiceEnds.length = w;
  return w;
}

function rnd(a: number, b: number): number { return a + Math.random() * (b - a); }

// ---- 音の部品 ----

interface ToneOpt {
  type?: OscillatorType;
  vol?: number;
  at?: number;       // 始まりの遅れ（秒）
  attack?: number;
  slide?: number;    // 終わりの高さ（Hz）
  vib?: number;      // ビブラートの深さ（Hz）
  q?: number;        // 0 より大きければ lowpass の Q（cut と使う）
  cut?: number;      // lowpass の周波数
}

function tone(ac: AudioContext, out: AudioNode, t0: number, freq: number, dur: number, o: ToneOpt = {}): void {
  const t = t0 + (o.at ?? 0);
  const osc = ac.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  const g = ac.createGain();
  const vol = o.vol ?? 0.3;
  const atk = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let last: AudioNode = osc;
  if (o.cut) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.cut;
    f.Q.value = o.q ?? 0.7;
    osc.connect(f);
    last = f;
  }
  last.connect(g);
  g.connect(out);
  let lfo: OscillatorNode | null = null;
  if (o.vib) {
    lfo = ac.createOscillator();
    const lg = ac.createGain();
    lfo.frequency.value = 7;
    lg.gain.value = o.vib;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpt {
  vol?: number;
  at?: number;
  attack?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;       // フィルターの終わりの周波数
  q?: number;
}

function hiss(ac: AudioContext, out: AudioNode, t0: number, dur: number, o: NoiseOpt = {}): void {
  const buf = noise();
  if (!buf) return;
  const t = t0 + (o.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = o.filter ?? "bandpass";
  f.frequency.setValueAtTime(o.freq ?? 1500, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + dur);
  f.Q.value = o.q ?? 1;
  const g = ac.createGain();
  const vol = o.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** ドレミ（MIDI 番号）→ Hz。 */
export function mtof(m: number): number { return 440 * Math.pow(2, (m - 69) / 12); }

/** きらきら（高い鈴の音をいくつか）。 */
function sparkle(ac: AudioContext, out: AudioNode, t: number, n: number, base: number, spread: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    tone(ac, out, t, mtof(base + Math.floor(Math.random() * spread)), 0.25, { type: "sine", vol: vol * rnd(0.6, 1), at: i * 0.045 + Math.random() * 0.02 });
  }
}

// ---- それぞれの音 ----

type Maker = (ac: AudioContext, o: AudioNode, t: number, v: number) => number;

const MAKERS: Record<SfxName, Maker> = {
  // UI
  tap: (ac, o, t) => { tone(ac, o, t, 880, 0.06, { type: "triangle", vol: 0.16, slide: 700 }); return 0.07; },
  confirm: (ac, o, t) => {
    tone(ac, o, t, mtof(76), 0.09, { type: "triangle", vol: 0.18 });
    tone(ac, o, t, mtof(83), 0.16, { type: "triangle", vol: 0.18, at: 0.06 });
    return 0.24;
  },
  cancel: (ac, o, t) => {
    tone(ac, o, t, mtof(72), 0.08, { type: "triangle", vol: 0.15 });
    tone(ac, o, t, mtof(67), 0.12, { type: "triangle", vol: 0.14, at: 0.06 });
    return 0.2;
  },
  tab: (ac, o, t) => {
    tone(ac, o, t, mtof(79), 0.09, { type: "sine", vol: 0.2, slide: mtof(84) });
    hiss(ac, o, t, 0.04, { freq: 4000, vol: 0.05 });
    return 0.1;
  },
  error: (ac, o, t) => {
    tone(ac, o, t, 240, 0.09, { type: "triangle", vol: 0.18 });
    tone(ac, o, t, 200, 0.12, { type: "triangle", vol: 0.18, at: 0.1 });
    return 0.24;
  },
  // 置く（段ボールを床に置く「ぽすっ」）
  place: (ac, o, t) => {
    tone(ac, o, t, 190, 0.14, { type: "sine", vol: 0.35, slide: 80 });
    hiss(ac, o, t, 0.1, { filter: "lowpass", freq: 900, to: 200, vol: 0.25 });
    tone(ac, o, t, mtof(84), 0.08, { type: "triangle", vol: 0.06, at: 0.05 });
    return 0.18;
  },
  upgrade: (ac, o, t) => {
    [72, 76, 79, 84].forEach((m, i) => tone(ac, o, t, mtof(m), 0.14, { type: "triangle", vol: 0.16, at: i * 0.055 }));
    sparkle(ac, o, t + 0.2, 3, 91, 6, 0.06);
    return 0.45;
  },
  remove: (ac, o, t) => {
    tone(ac, o, t, mtof(74), 0.08, { type: "triangle", vol: 0.15 });
    tone(ac, o, t, mtof(67), 0.12, { type: "triangle", vol: 0.14, at: 0.07 });
    hiss(ac, o, t, 0.12, { freq: 1200, to: 400, vol: 0.08 });
    return 0.22;
  },
  // 猫の攻撃（近接: ぺしっ / 遠距離: ひゅっ / 範囲: ぶおん / すばやい: しゅっ）
  punch: (ac, o, t, v) => {
    hiss(ac, o, t, 0.04, { freq: 1600 * v, q: 2, vol: 0.22 });
    tone(ac, o, t, 320 * v, 0.07, { type: "sine", vol: 0.22, slide: 130 });
    return 0.08;
  },
  throw: (ac, o, t, v) => {
    hiss(ac, o, t, 0.1, { freq: 900 * v, to: 2600 * v, q: 3, vol: 0.12 });
    tone(ac, o, t, 660 * v, 0.05, { type: "triangle", vol: 0.06, slide: 900 });
    return 0.11;
  },
  whoosh: (ac, o, t, v) => {
    hiss(ac, o, t, 0.2, { freq: 400 * v, to: 1400 * v, q: 1.5, vol: 0.16, attack: 0.04 });
    tone(ac, o, t, 140 * v, 0.14, { type: "sine", vol: 0.12, slide: 70, at: 0.04 });
    return 0.2;
  },
  swish: (ac, o, t, v) => {
    hiss(ac, o, t, 0.06, { freq: 2500 * v, to: 5000, q: 2, vol: 0.12 });
    return 0.07;
  },
  // 当たった・会心・虫が消える
  hit: (ac, o, t, v) => { tone(ac, o, t, 1300 * v, 0.03, { type: "triangle", vol: 0.07, slide: 800 }); return 0.04; },
  crit: (ac, o, t, v) => {
    tone(ac, o, t, 1500 * v, 0.07, { type: "square", vol: 0.05, slide: 2400, cut: 5000 });
    hiss(ac, o, t, 0.05, { freq: 3500, q: 2, vol: 0.14 });
    tone(ac, o, t, 220, 0.08, { type: "sine", vol: 0.2, slide: 90 });
    return 0.1;
  },
  pop: (ac, o, t, v) => {
    const f = rnd(520, 760) * v;
    tone(ac, o, t, f, 0.07, { type: "sine", vol: 0.16, slide: f * 2.1 });
    return 0.08;
  },
  kibble: (ac, o, t, v) => {
    tone(ac, o, t, mtof(88) * v, 0.06, { type: "sine", vol: 0.08 });
    tone(ac, o, t, mtof(93) * v, 0.12, { type: "sine", vol: 0.08, at: 0.045 });
    return 0.17;
  },
  zap: (ac, o, t, v) => {
    tone(ac, o, t, 90 * v, 0.1, { type: "sawtooth", vol: 0.07, cut: 2400 });
    hiss(ac, o, t, 0.09, { filter: "highpass", freq: 3000, vol: 0.09 });
    return 0.11;
  },
  poison: (ac, o, t, v) => {
    tone(ac, o, t, 260 * v, 0.18, { type: "sine", vol: 0.1, slide: 520 * v, vib: 40 });
    tone(ac, o, t, 340 * v, 0.12, { type: "sine", vol: 0.07, slide: 600 * v, at: 0.08 });
    return 0.22;
  },
  explode: (ac, o, t, v) => {
    hiss(ac, o, t, 0.4, { filter: "lowpass", freq: 1600 * v, to: 120, vol: 0.32 });
    tone(ac, o, t, 110 * v, 0.3, { type: "sine", vol: 0.32, slide: 40 });
    return 0.4;
  },
  shockwave: (ac, o, t) => {
    tone(ac, o, t, 220, 0.32, { type: "sine", vol: 0.26, slide: 55 });
    hiss(ac, o, t, 0.3, { freq: 2400, to: 300, q: 1.2, vol: 0.14 });
    return 0.33;
  },
  slam: (ac, o, t) => {
    tone(ac, o, t, 140, 0.12, { type: "sine", vol: 0.26, slide: 60 });
    hiss(ac, o, t, 0.06, { filter: "lowpass", freq: 1200, vol: 0.14 });
    return 0.13;
  },
  // 必殺技（ため → どーん → きらきらの和音）
  special: (ac, o, t) => {
    hiss(ac, o, t, 0.32, { freq: 300, to: 3000, q: 2, vol: 0.18, attack: 0.25 });
    tone(ac, o, t, 200, 0.3, { type: "triangle", vol: 0.1, slide: 800, attack: 0.25 });
    const b = t + 0.28;
    tone(ac, o, b, 120, 0.55, { type: "sine", vol: 0.42, slide: 38 });
    hiss(ac, o, b, 0.6, { filter: "lowpass", freq: 2200, to: 150, vol: 0.3 });
    [60, 64, 67, 72, 76].forEach((m, i) => tone(ac, o, b, mtof(m + 12), 0.9, { type: "triangle", vol: 0.07, at: 0.04 + i * 0.03, attack: 0.02 }));
    sparkle(ac, o, b + 0.15, 7, 88, 12, 0.07);
    return 1.3;
  },
  // ぬしが来た（低いうなり＋ずしん）
  bossAppear: (ac, o, t) => {
    tone(ac, o, t, mtof(33), 1.1, { type: "sawtooth", vol: 0.16, cut: 500, attack: 0.15 });
    tone(ac, o, t, mtof(34), 1.1, { type: "sawtooth", vol: 0.12, cut: 450, attack: 0.15 });
    tone(ac, o, t, 70, 0.5, { type: "sine", vol: 0.35, slide: 35 });
    tone(ac, o, t, 70, 0.5, { type: "sine", vol: 0.32, slide: 35, at: 0.45 });
    hiss(ac, o, t, 0.9, { filter: "lowpass", freq: 300, vol: 0.18, attack: 0.2 });
    return 1.2;
  },
  bossDeath: (ac, o, t) => {
    hiss(ac, o, t, 0.8, { filter: "lowpass", freq: 2500, to: 100, vol: 0.38 });
    tone(ac, o, t, 140, 0.7, { type: "sine", vol: 0.4, slide: 30 });
    [72, 76, 79, 84, 88].forEach((m, i) => tone(ac, o, t, mtof(m), 0.3, { type: "triangle", vol: 0.12, at: 0.35 + i * 0.07 }));
    sparkle(ac, o, t + 0.7, 8, 91, 10, 0.07);
    return 1.4;
  },
  // ママ「きゃっ」（高い声のような、ゆれる音。こわくしない）
  mamaHit: (ac, o, t) => {
    tone(ac, o, t, 1050, 0.22, { type: "triangle", vol: 0.16, slide: 700, vib: 25, attack: 0.01 });
    tone(ac, o, t, 160, 0.12, { type: "sine", vol: 0.25, slide: 70 });
    return 0.25;
  },
  catHit: (ac, o, t) => { tone(ac, o, t, 420, 0.08, { type: "triangle", vol: 0.1, slide: 260 }); return 0.09; },
  catDown: (ac, o, t) => {
    tone(ac, o, t, mtof(76), 0.15, { type: "triangle", vol: 0.14, slide: mtof(70) });
    tone(ac, o, t, mtof(70), 0.3, { type: "triangle", vol: 0.12, slide: mtof(62), at: 0.14 });
    return 0.45;
  },
  catUp: (ac, o, t) => {
    [67, 71, 74, 79].forEach((m, i) => tone(ac, o, t, mtof(m), 0.12, { type: "triangle", vol: 0.13, at: i * 0.05 }));
    return 0.32;
  },
  // 波の始まり（ぴんぽん）
  wave: (ac, o, t) => {
    tone(ac, o, t, mtof(81), 0.35, { type: "sine", vol: 0.18 });
    tone(ac, o, t, mtof(81) * 2, 0.2, { type: "sine", vol: 0.04 });
    tone(ac, o, t, mtof(77), 0.5, { type: "sine", vol: 0.18, at: 0.18 });
    return 0.7;
  },
  win: (ac, o, t) => {
    const mel = [72, 76, 79, 84, 79, 84, 88];
    const at = [0, 0.11, 0.22, 0.33, 0.5, 0.6, 0.72];
    mel.forEach((m, i) => tone(ac, o, t, mtof(m), i === mel.length - 1 ? 0.8 : 0.16, { type: "triangle", vol: 0.17, at: at[i] }));
    [48, 55, 60, 64].forEach((m) => tone(ac, o, t + 0.72, mtof(m), 0.9, { type: "sine", vol: 0.08, attack: 0.03 }));
    sparkle(ac, o, t + 0.75, 6, 91, 10, 0.06);
    return 1.6;
  },
  lose: (ac, o, t) => {
    [67, 66, 65, 64].forEach((m, i) => tone(ac, o, t, mtof(m), i === 3 ? 0.9 : 0.3, { type: "triangle", vol: 0.15, at: i * 0.3, vib: i === 3 ? 5 : 0 }));
    tone(ac, o, t + 0.9, mtof(40), 1, { type: "sine", vol: 0.12, attack: 0.05 });
    return 2;
  },
  // ガチャ（福袋をゆらす・レベルアップ・解放）
  bagShake: (ac, o, t) => {
    for (let i = 0; i < 3; i++) hiss(ac, o, t, 0.06, { freq: rnd(1800, 3200), q: 1.5, vol: 0.12, at: i * 0.07 });
    return 0.25;
  },
  levelUp: (ac, o, t) => {
    [67, 72, 76, 79, 84].forEach((m, i) => tone(ac, o, t, mtof(m), 0.14, { type: "triangle", vol: 0.15, at: i * 0.05 }));
    tone(ac, o, t + 0.25, mtof(84), 0.5, { type: "sine", vol: 0.1 });
    sparkle(ac, o, t + 0.25, 4, 91, 8, 0.06);
    return 0.8;
  },
  unlock: (ac, o, t) => {
    [60, 64, 67].forEach((m) => tone(ac, o, t, mtof(m + 12), 0.25, { type: "triangle", vol: 0.1 }));
    [65, 69, 72].forEach((m) => tone(ac, o, t + 0.2, mtof(m + 12), 0.25, { type: "triangle", vol: 0.1 }));
    [67, 72, 76, 79].forEach((m) => tone(ac, o, t + 0.4, mtof(m + 12), 0.8, { type: "triangle", vol: 0.1 }));
    sparkle(ac, o, t + 0.45, 6, 93, 10, 0.06);
    return 1.3;
  },
};

/**
 * 効果音を鳴らす。pitch は高さの倍率（1 = そのまま）。
 * 音がまだ使えない・消音・数がいっぱい・同じ音が続きすぎのときは、何もしない。
 */
export function sfx(name: SfxName, pitch = 1): void {
  if (sfxSilent()) return;
  const ac = audioCtx();
  const out = sfxOut();
  if (!ac || !out) return;
  const now = ac.currentTime;
  const gap = GAP[name] ?? 0.03;
  const prev = lastAt.get(name) ?? -1;
  if (now - prev < gap) return;
  if (activeVoices(now) >= MAX_VOICES && !PRIORITY.has(name)) return;
  lastAt.set(name, now);
  const len = playSample(ac, out, name, now + 0.005, pitch) ?? MAKERS[name](ac, out, now + 0.005, pitch);
  voiceEnds.push(now + len);
}

/** 福袋をあけた音（rank: 0 = N 〜 4 = UR、5 = EX）。 */
export function sfxGachaOpen(rank: number): void {
  if (sfxSilent()) return;
  const ac = audioCtx();
  const o = sfxOut();
  if (!ac || !o) return;
  const t = ac.currentTime + 0.005;
  // ぽんっ（袋があく）
  tone(ac, o, t, 300, 0.1, { type: "sine", vol: 0.25, slide: 700 });
  hiss(ac, o, t, 0.08, { freq: 2000, vol: 0.1 });
  const roots = [72, 74, 76, 79, 81, 84];
  const r = roots[Math.max(0, Math.min(5, rank))];
  const notes = rank >= 3 ? [0, 4, 7, 12, 16, 19] : rank >= 2 ? [0, 4, 7, 12] : rank >= 1 ? [0, 7] : [0];
  notes.forEach((n, i) => tone(ac, o, t, mtof(r + n), 0.22 + (i === notes.length - 1 ? 0.3 : 0), { type: "triangle", vol: 0.14, at: 0.06 + i * 0.06 }));
  if (rank >= 3) {
    sparkle(ac, o, t + 0.3, 6 + rank * 2, 90, 14, 0.06);
    tone(ac, o, t + 0.3, mtof(r - 12), 0.9, { type: "sine", vol: 0.1, attack: 0.04 });
  }
  if (rank >= 4) {
    // UR・EX: もう一段、上へ
    [0, 4, 7, 12].forEach((n, i) => tone(ac, o, t + 0.5, mtof(r + 12 + n), 0.5, { type: "sine", vol: 0.07, at: i * 0.05 }));
  }
}
