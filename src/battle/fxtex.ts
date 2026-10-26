// エフェクトの 粒子画像（Kenney Particle Pack・CC0。public/fx/ の 白い 64px）。色を つけた 物を 作って 使いまわす。
// 読めて いない 間・読めない時は null（view.ts が 今までの 図形で 描く）。
export type FxTex = "star_06" | "star_08" | "light_01" | "smoke_04" | "spark_04" | "circle_02" | "twirl_02";
const NAMES: FxTex[] = ["star_06", "star_08", "light_01", "smoke_04", "spark_04", "circle_02", "twirl_02"];

const imgs = new Map<FxTex, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();
let started = false;

export function loadFxTextures(): void {
  if (started || typeof Image === "undefined") return;
  started = true;
  for (const n of NAMES) {
    const im = new Image();
    im.onload = () => imgs.set(n, im);
    im.src = `./fx/${n}.png`;
  }
}

/** 色を つけた 粒子（color は #rgb・#rrggbb・rgba(...)・hsl(...)）。まだ 読めて いなければ null。 */
export function fxTex(name: FxTex, color: string): HTMLCanvasElement | null {
  const im = imgs.get(name);
  if (!im) return null;
  const key = `${name}|${color}`;
  let c = tinted.get(key);
  if (!c) {
    if (tinted.size > 160) tinted.clear(); // 色の 種類が 多すぎる時は 作りなおす
    c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0, 64, 64);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    tinted.set(key, c);
  }
  return c;
}
