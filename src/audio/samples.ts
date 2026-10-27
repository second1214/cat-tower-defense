// フリー素材の 効果音（Kenney・CC0。public/sfx/）。読めた 音だけ 鳴らし、読めない時は 合成音（sfx.ts）に まかせる。
// 1つの 名前に いくつか 入れて、毎回 ちがう 音を 選ぶ（同じ 音の くりかえしで 耳が 疲れないように）。
// 数字は 音量（ファイルごとに 平均の 大きさを -16dB に そろえた 上で、名前ごとの 大きさを 掛けた 値）。
import type { SfxName } from "./sfx";

const SAMPLES: Partial<Record<SfxName, [file: string, gain: number][]>> = {
  tap: [["click_002", 0.536], ["click_003", 0.446]],
  confirm: [["confirmation_001", 0.338]],
  cancel: [["back_002", 0.592]],
  tab: [["select_002", 0.367]],
  error: [["error_004", 0.387]],
  place: [["drop_002", 0.697], ["drop_003", 0.681]],
  remove: [["minimize_003", 1.063]],
  upgrade: [["maximize_006", 0.513]],
  hit: [["impactSoft_medium_000", 0.254], ["impactSoft_medium_001", 0.27], ["impactSoft_medium_002", 0.249], ["impactSoft_medium_003", 0.253], ["impactSoft_medium_004", 0.258]],
  crit: [["impactPunch_medium_000", 0.43], ["impactPunch_medium_001", 0.416], ["impactPunch_medium_002", 0.516]],
  punch: [["impactGeneric_light_000", 0.608], ["impactGeneric_light_001", 0.551], ["impactGeneric_light_002", 0.627]],
  explode: [["impactSoft_heavy_000", 0.54], ["impactSoft_heavy_001", 0.542]],
  slam: [["impactWood_heavy_000", 0.711], ["impactWood_heavy_001", 0.717]],
  catHit: [["impactSoft_heavy_001", 0.406]],
  win: [["jingles_STEEL02", 0.546]],
  lose: [["jingles_PIZZI01", 0.472]],
  levelUp: [["jingles_PIZZI04", 0.536]],
  unlock: [["jingles_PIZZI12", 0.455]],
};

const buffers = new Map<string, AudioBuffer>();
let started = false;

/** 効果音の ファイルを 読む（音が 使えるように なった時に 1回）。失敗した 物は 合成音の まま。 */
export function loadSamples(ac: AudioContext): void {
  if (started || typeof fetch === "undefined") return;
  started = true;
  const files = new Set(Object.values(SAMPLES).flatMap((xs) => xs!.map((x) => x[0])));
  for (const f of files) {
    fetch(`./sfx/${f}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => { buffers.set(f, buf); })
      .catch(() => undefined);
  }
}

/** 読めた 素材が あれば 鳴らして 長さ（秒）を 返す。無ければ null（合成音で 鳴らす）。 */
export function playSample(ac: AudioContext, out: AudioNode, name: SfxName, t0: number, pitch: number): number | null {
  const list = SAMPLES[name]?.filter(([f]) => buffers.has(f));
  if (!list?.length) return null;
  const [f, gain] = list[Math.floor(Math.random() * list.length)];
  const buf = buffers.get(f)!;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out);
  src.start(t0);
  return buf.duration / pitch;
}
