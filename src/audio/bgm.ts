// BGM（その場で作る、くり返しの音楽）。少し先まで音を予約する「先読み」方式で、軽く・ずれずに鳴らす。
// 曲は「コード進行＋ベース・太鼓のパターン」だけ決めて、メロディは毎回少しずつ変わる（同じ音階の中で歩く）。
import { audioCtx, bgmOut, bgmSilent, noise, onAudioReady } from "./core";
import { mtof } from "./sfx";

export type BgmMood = "cafe" | "battle" | "boss" | "none";

interface Song {
  bpm: number;
  /** 1小節ごとのコード（MIDI。下から3つ）。 */
  chords: number[][];
  /** 1小節ごとのベースの音（MIDI）。 */
  bass: number[];
  /** 16分音符ごと: 0 なし / 1 根音 / 2 5度 / 3 オクターブ上。 */
  bassPat: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  /** メロディが鳴るかもしれない場所（16分ごとの確率）。 */
  mel: number[];
  /** メロディの音階（MIDI）。 */
  scale: number[];
  padVol: number;
  padCut: number;
  bassVol: number;
  bassType: OscillatorType;
  melVol: number;
  swing: number;
}

// 猫カフェ（ゆったり・あたたかい。F の明るい和音）
const CAFE: Song = {
  bpm: 90,
  chords: [[53, 57, 64], [50, 57, 60], [46, 53, 57], [48, 55, 58]],
  bass: [41, 38, 34, 36],
  bassPat: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  kick: [0.5, 0, 0, 0, 0, 0, 0, 0, 0.35, 0, 0, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 0.18, 0, 0, 0, 0, 0, 0, 0, 0.18, 0, 0, 0],
  hat: [0, 0, 0.12, 0, 0, 0, 0.12, 0, 0, 0, 0.12, 0, 0, 0, 0.14, 0.06],
  mel: [0.7, 0, 0.35, 0, 0.5, 0, 0.3, 0, 0.6, 0, 0.3, 0, 0.45, 0, 0.25, 0],
  scale: [65, 67, 69, 72, 74, 77, 79, 81],
  padVol: 0.07, padCut: 1400, bassVol: 0.16, bassType: "sine", melVol: 0.09, swing: 0.12,
};

// 戦い（元気・はずむ。A マイナー → C）
const BATTLE: Song = {
  bpm: 120,
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  bass: [45, 41, 36, 43],
  bassPat: [1, 0, 1, 0, 2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 3, 0],
  kick: [0.6, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0, 0, 0, 0.5, 0, 0, 0],
  snare: [0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0.1],
  hat: [0.1, 0, 0.14, 0, 0.1, 0, 0.14, 0, 0.1, 0, 0.14, 0, 0.1, 0, 0.14, 0.08],
  mel: [0.55, 0, 0.3, 0, 0.45, 0, 0.35, 0, 0.55, 0, 0.3, 0, 0.45, 0, 0.25, 0],
  scale: [69, 71, 72, 74, 76, 79, 81, 84],
  padVol: 0.05, padCut: 1800, bassVol: 0.15, bassType: "triangle", melVol: 0.07, swing: 0,
};

// ぬし・難関（少し速く、きんちょう。D マイナー）
const BOSS: Song = {
  bpm: 132,
  chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
  bass: [38, 34, 31, 33],
  bassPat: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 2, 0, 3, 0],
  kick: [0.7, 0, 0, 0.3, 0.6, 0, 0, 0, 0.7, 0, 0.3, 0, 0.6, 0, 0, 0],
  snare: [0, 0, 0, 0, 0.35, 0, 0, 0, 0, 0, 0, 0, 0.35, 0, 0.12, 0.15],
  hat: [0.12, 0.06, 0.14, 0.06, 0.12, 0.06, 0.14, 0.06, 0.12, 0.06, 0.14, 0.06, 0.12, 0.06, 0.14, 0.1],
  mel: [0.5, 0, 0.3, 0.3, 0.4, 0, 0.5, 0, 0.5, 0, 0.3, 0.3, 0.4, 0.2, 0.4, 0],
  scale: [62, 64, 65, 67, 69, 70, 73, 74],
  padVol: 0.05, padCut: 1200, bassVol: 0.17, bassType: "sawtooth", melVol: 0.07, swing: 0,
};

const SONGS: Record<Exclude<BgmMood, "none">, Song> = { cafe: CAFE, battle: BATTLE, boss: BOSS };

const LOOKAHEAD = 0.25;   // 何秒先まで予約するか
const TICK_MS = 60;       // 予約の間かく
const FADE = 1.2;         // 曲の切りかえ（新しい曲が 大きくなるまで）
const FADE_OUT = 0.35;    // 前の曲を しぼる 時間（調の ちがう 曲が 長く 重なると 不協和音に 聞こえるので 短く）

interface Player {
  song: Song;
  gain: GainNode;
  step: number;
  next: number;
  stopAt: number;     // これより後は予約しない（フェードアウト中）
  melIdx: number;
}

let players: Player[] = [];
let mood: BgmMood = "none";
let timer: ReturnType<typeof setInterval> | null = null;
let intensity = 0;

/** 曲を切りかえる（同じなら何もしない）。音がまだ使えないときは、使えるようになってから始まる。 */
export function setBgm(m: BgmMood): void {
  if (m === mood) return;
  mood = m;
  onAudioReady(() => applyMood());
}

/** 盛り上がり（0〜1）。エンドレスで波が進むと、太鼓・メロディが少し増える。 */
export function setBgmIntensity(v: number): void {
  intensity = Math.max(0, Math.min(1, v));
}

function applyMood(): void {
  const ac = audioCtx();
  const out = bgmOut();
  if (!ac || !out) {
    // まだ止まっている（タップ前）。動きだしたら tick で始める
    ensureTimer();
    return;
  }
  const t = ac.currentTime;
  const want = mood === "none" ? null : SONGS[mood];
  if (want && players.some((p) => p.stopAt === Infinity && p.song === want)) return;
  for (const p of players) {
    if (p.stopAt === Infinity) {
      p.stopAt = t + FADE_OUT;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t);
      p.gain.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT);
    }
  }
  if (mood !== "none") {
    const g = ac.createGain();
    // 新しい曲は 前の曲が しぼれてから 始める（重ならない）
    const start = t + (players.some((p) => p.stopAt !== Infinity && p.stopAt > t) ? FADE_OUT : 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(1, start + FADE);
    g.connect(out);
    players.push({ song: SONGS[mood], gain: g, step: 0, next: start + 0.1, stopAt: Infinity, melIdx: 3 });
  }
  ensureTimer();
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
}

function tick(): void {
  const ac = audioCtx();
  if (!ac) return;
  if (players.length === 0 && mood !== "none") { applyMood(); return; }
  const now = ac.currentTime;
  let w = 0;
  for (const p of players) {
    if (p.stopAt !== Infinity && now > p.stopAt + 0.3) { p.gain.disconnect(); continue; }
    players[w++] = p;
    // 長く止まっていた（画面が隠れていた等）ときは、今から始めなおす
    if (p.next < now - 0.5) p.next = now + 0.05;
    const quiet = bgmSilent();
    while (p.next < now + LOOKAHEAD && p.next < p.stopAt) {
      if (!quiet) playStep(ac, p, p.next);
      const sixteenth = 60 / p.song.bpm / 4;
      const sw = p.step % 2 === 0 ? 1 + p.song.swing : 1 - p.song.swing;
      p.next += sixteenth * sw;
      p.step = (p.step + 1) % (16 * p.song.chords.length);
    }
  }
  players.length = w;
  if (players.length === 0 && mood === "none" && timer) { clearInterval(timer); timer = null; }
}

function playStep(ac: AudioContext, p: Player, t: number): void {
  const s = p.song;
  const out = p.gain;
  const bar = Math.floor(p.step / 16) % s.chords.length;
  const i = p.step % 16;
  const beat = 60 / s.bpm;
  const lift = s === BATTLE ? intensity : 0;
  if (i === 0) pad(ac, out, t, s.chords[bar], beat * 4, s);
  const bp = s.bassPat[i];
  if (bp) {
    const root = s.bass[bar];
    const m = bp === 1 ? root : bp === 2 ? root + 7 : root + 12;
    bassNote(ac, out, t, mtof(m), beat * 0.45, s);
  }
  if (s.kick[i]) kick(ac, out, t, s.kick[i]);
  if (s.snare[i]) snare(ac, out, t, s.snare[i]);
  const hv = s.hat[i] || (lift > 0.4 && i % 2 === 1 ? 0.05 * lift : 0);
  if (hv) hat(ac, out, t, hv);
  const pm = s.mel[i] * (1 + lift * 0.5);
  if (pm > 0 && Math.random() < pm) {
    // メロディ: 音階の中を、となりへ歩く（ときどき跳ぶ）。小節の頭はコードの音に寄せる
    const r = Math.random();
    const stepBy = r < 0.4 ? 1 : r < 0.8 ? -1 : r < 0.9 ? 2 : -2;
    p.melIdx = Math.max(0, Math.min(s.scale.length - 1, p.melIdx + stepBy));
    let m = s.scale[p.melIdx];
    if (i === 0) {
      const c = s.chords[bar];
      let best = m, bd = 99;
      for (const n of c) for (const o of [12, 24]) { const d = Math.abs(n + o - m); if (d < bd) { bd = d; best = n + o; } }
      m = best;
    }
    pluck(ac, out, t, mtof(m), beat * (i % 4 === 0 ? 0.9 : 0.5), s.melVol);
  }
}

// ---- 楽器 ----

function pad(ac: AudioContext, out: AudioNode, t: number, chord: number[], dur: number, s: Song): void {
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = s.padCut;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(s.padVol, t + dur * 0.25);
  g.gain.setValueAtTime(s.padVol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
  f.connect(g);
  g.connect(out);
  for (const m of chord) {
    for (const det of [-7, 7]) {
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
  }
}

function bassNote(ac: AudioContext, out: AudioNode, t: number, freq: number, dur: number, s: Song): void {
  const o = ac.createOscillator();
  o.type = s.bassType;
  o.frequency.value = freq;
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(s.bassType === "sine" ? 2000 : 900, t);
  f.frequency.exponentialRampToValueAtTime(240, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(s.bassVol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f);
  f.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** メロディの音: やわらかい木琴（マリンバ）風。正弦波の 本体＋すぐ消える 高い倍音（木を たたいた 感じ）。
 *  前は 三角波を はじく音で、戦いの 速い 曲だと 三味線の ように 聞こえて 耳ざわりだった（2026-10-27 ユーザー報告）。 */
function pluck(ac: AudioContext, out: AudioNode, t: number, freq: number, dur: number, vol: number): void {
  const len = Math.max(0.25, dur * 1.2);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = Math.min(4000, freq * 4);
  f.connect(g);
  g.connect(out);
  const o1 = ac.createOscillator();
  o1.type = "sine";
  o1.frequency.value = freq;
  o1.connect(f);
  // 木の 音: 4倍の 倍音を ほんの 一瞬だけ
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.18, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  g2.connect(f);
  const o2 = ac.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 3.99;
  o2.connect(g2);
  o1.start(t); o2.start(t);
  o1.stop(t + len + 0.02); o2.stop(t + 0.08);
}

function kick(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  const o = ac.createOscillator();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol * 0.55, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

function noiseHit(ac: AudioContext, out: AudioNode, t: number, vol: number, type: BiquadFilterType, freq: number, dur: number): void {
  const buf = noise();
  if (!buf) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 0.8);
  src.stop(t + dur + 0.02);
}

function snare(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  noiseHit(ac, out, t, vol * 0.5, "bandpass", 1800, 0.12);
}

function hat(ac: AudioContext, out: AudioNode, t: number, vol: number): void {
  noiseHit(ac, out, t, vol * 0.45, "highpass", 7000, 0.035);
}
