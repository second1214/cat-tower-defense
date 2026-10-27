// 音の土台（Web Audio API）。BGM と 多くの 効果音は その場で 作る（一部の 効果音は public/sfx の 素材）。
// AudioContext は、最初にさわった（タップ・キー）ときに1つだけ作る（スマホは、さわるまで音を出せない）。

export interface AudioSettings {
  sfx: number;    // 効果音の大きさ 0〜1
  bgm: number;    // BGM の大きさ 0〜1
  mute: boolean;  // ぜんぶ消す
}

const KEY = "cat-td-audio";
const DEFAULTS: AudioSettings = { sfx: 0.8, bgm: 0.5, mute: false };

let settings: AudioSettings = loadSettings();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let bgmBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const readyFns: (() => void)[] = [];

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw) as Partial<AudioSettings>;
    const num = (v: unknown, d: number) => (typeof v === "number" && v >= 0 && v <= 1 ? v : d);
    return { sfx: num(o.sfx, DEFAULTS.sfx), bgm: num(o.bgm, DEFAULTS.bgm), mute: o.mute === true };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getAudioSettings(): Readonly<AudioSettings> {
  return settings;
}

/** 設定を変えて保存する（すぐに音の大きさにも効く）。 */
export function setAudioSettings(patch: Partial<AudioSettings>): void {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 保存できなくてもよい */ }
  applyVolumes();
}

/** 音量（0〜1）を、耳に自然な大きさに（2乗）。 */
function curve(v: number): number { return v * v; }

let hiddenFade = false; // 画面が 隠れる 途中（全体の 音を しぼっている）

function applyVolumes(): void {
  if (!ctx || !master || !sfxBus || !bgmBus) return;
  const t = ctx.currentTime;
  if (!hiddenFade) master.gain.setTargetAtTime(settings.mute ? 0 : 0.9, t, 0.03);
  sfxBus.gain.setTargetAtTime(curve(settings.sfx), t, 0.03);
  bgmBus.gain.setTargetAtTime(curve(settings.bgm) * 0.55, t, 0.05);
}

/** 動いている AudioContext（まだ無い・止まっているときは null）。 */
export function audioCtx(): AudioContext | null {
  return ctx && ctx.state === "running" ? ctx : null;
}

export function sfxOut(): GainNode | null { return sfxBus; }
/** 止まっていても 返す（素材の 読みこみ用）。 */
export function rawCtx(): AudioContext | null { return ctx; }
export function bgmOut(): GainNode | null { return bgmBus; }

/** 消音か（音を作る手間をはぶくため）。 */
export function sfxSilent(): boolean { return settings.mute || settings.sfx <= 0.001; }
export function bgmSilent(): boolean { return settings.mute || settings.bgm <= 0.001; }

/** 白いノイズ（1秒ぶん。使いまわす）。 */
export function noise(): AudioBuffer | null {
  if (!ctx) return null;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 音が使えるようになったら呼ぶ（BGM の開始など）。 */
export function onAudioReady(fn: () => void): void {
  if (ctx) fn();
  else readyFns.push(fn);
}

function create(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch {
    return;
  }
  // 全体 → 音割れよけ（コンプレッサー）→ スピーカー
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  bgmBus = ctx.createGain();
  master.gain.value = 0;
  sfxBus.connect(master);
  bgmBus.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);
  applyVolumes();
  for (const fn of readyFns.splice(0)) fn();
}

let installed = false;

/** 最初のタップで音を使えるようにする・画面が隠れたら止める。1回だけ呼ぶ。 */
export function installAudio(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // 画面が 隠れる・もどる: いきなり 止める／鳴らすと、iPhone では「ブツッ」「ビヨッ」と 変な音が 出る（2026-10-27 ユーザー報告）。
  // 隠れる時は 全体の 音を すばやく しぼってから 止め、もどる時は 無音で 動かしてから ゆっくり 上げる。
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  const fadeOutAndSuspend = () => {
    if (!ctx || !master) return;
    hiddenFade = true;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.06);
    if (suspendTimer) clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => { suspendTimer = null; if (document.hidden) void ctx?.suspend().catch(() => undefined); }, 90);
  };
  const resumeAndFadeIn = () => {
    if (!ctx || !master) return;
    if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
    const g = master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(0, ctx.currentTime);
    void ctx.resume().catch(() => undefined).then(() => {
      if (!ctx || !master || document.hidden || ctx.state !== "running") return; // ことわられたら 次の タップで もう一度
      hiddenFade = false;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(settings.mute ? 0 : 0.9, t + 0.4);
    });
  };
  // さわった時: 音を 使えるように する。iPhone は もどった 直後に 再開を ことわる ことが あるので、その時も ここで 音を もどす
  const unlock = () => {
    create();
    if (!ctx || document.hidden) return;
    if (hiddenFade) resumeAndFadeIn();
    else if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener("touchend", unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) fadeOutAndSuspend(); else resumeAndFadeIn(); });
  window.addEventListener("pagehide", fadeOutAndSuspend);
  window.addEventListener("pageshow", () => { if (!document.hidden) resumeAndFadeIn(); });
}
