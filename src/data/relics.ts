// レリック（全体の永続強化）。ステージクリアでもらえるレリックポイントで、道にそって順に解放していく。

export type RelicStat =
  | "dmg"          // すべてのダメージ（猫・オブジェクト）に掛ける
  | "kibble"       // カリカリの自然増加・生産 +%
  | "startKibble"  // 最初のカリカリ +
  | "mamaHp"       // ママの HP +
  | "charHp"       // 猫の体力に掛ける
  | "objCost"      // 置くカリカリ -%
  | "drop"         // 装備・かけらのドロップ数 +%
  | "exp"          // 経験値 +%
  | "coins"        // お金 +%
  | "churu";       // ステージクリアのちゅ〜る +%

export interface RelicNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** 先に解放しておくレリック。 */
  req: string[];
  stat: RelicStat;
  /** dmg・charHp は掛け算の倍率（1.5 = ×1.5）。それ以外は足し算（% は 0.1 = 10%）。 */
  value: number;
}

type Row = [name: string, stat: RelicStat, value: number];

// 道の順番。ダメージ系は掛け算で効くので、後半ほど大きく。
const PATH: Row[] = [
  ["ママの応援", "dmg", 1.2],
  ["カリカリの買いだめ", "startKibble", 20],
  ["おうちの見まわり", "mamaHp", 2],
  ["ふかふかベッド", "charHp", 1.3],
  ["ごほうびのおやつ", "exp", 0.15],
  ["ママの手づくりおもちゃ", "dmg", 1.3],
  ["おさいふのへそくり", "coins", 0.2],
  ["ちゅ〜るのストック", "churu", 0.2],
  ["カリカリ大袋", "kibble", 0.1],
  ["ていねいな片づけ", "objCost", 0.05],
  ["お気に入りの毛布", "dmg", 1.4],
  ["落とし物さがし", "drop", 0.2],
  ["まどべの日なたぼっこ", "charHp", 1.5],
  ["ママのエプロン", "mamaHp", 3],
  ["キャットタワー", "dmg", 1.5],
  ["ごはんの時間", "kibble", 0.15],
  ["ほめられ上手", "exp", 0.2],
  ["朝のカリカリ", "startKibble", 40],
  ["ねこ用こたつ", "dmg", 1.6],
  ["しまいこみ上手", "objCost", 0.05],
  ["宝さがし", "drop", 0.3],
  ["ママのだっこ", "charHp", 1.8],
  ["ちょきん箱", "coins", 0.3],
  ["ちゅ〜るの定期便", "churu", 0.3],
  ["かつおぶし", "dmg", 1.8],
  ["高級カリカリ", "kibble", 0.2],
  ["みんなのおうち", "dmg", 2.0],
];

function descOf(stat: RelicStat, v: number): string {
  const pct = Math.round(v * 100);
  switch (stat) {
    case "dmg": return `すべてのダメージ ×${v}`;
    case "kibble": return `カリカリの増え方 +${pct}%`;
    case "startKibble": return `最初のカリカリ +${v}`;
    case "mamaHp": return `ママの HP +${v}`;
    case "charHp": return `猫の体力 ×${v}`;
    case "objCost": return `置くカリカリ -${pct}%`;
    case "drop": return `ドロップ +${pct}%`;
    case "exp": return `経験値 +${pct}%`;
    case "coins": return `お金 +${pct}%`;
    case "churu": return `ステージクリアのちゅ〜る +${pct}%`;
  }
}

/** i 番目（0 始まり）の解放に使うポイント。 */
export function relicCost(i: number): number {
  return Math.max(1, Math.round(1 + i * 0.6 + Math.pow(1.13, i) - 1));
}

export const RELICS: RelicNode[] = PATH.map(([name, stat, value], i) => ({
  id: `relic${String(i + 1).padStart(2, "0")}`,
  name,
  desc: descOf(stat, value),
  cost: relicCost(i),
  req: i === 0 ? [] : [`relic${String(i).padStart(2, "0")}`],
  stat,
  value,
}));

export const RELIC_MAP: Record<string, RelicNode> = Object.fromEntries(RELICS.map((r) => [r.id, r]));
