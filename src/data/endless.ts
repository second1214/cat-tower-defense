// エンドレスの「ごほうびの道」: こえた波（自分の記録）が届くと、EX のわざ・オブジェクトが手に入る。
// 手に入れたあとは、EX のわざはねこ福袋からも出る（かぶりでレベルが上がる）。EX のオブジェクトはストーリーでもかけらが落ちる。
export interface EndlessReward {
  wave: number;
  kind: "waza" | "object";
  id: string;
}

export const ENDLESS_REWARDS: EndlessReward[] = [
  { wave: 10, kind: "object", id: "laser" },
  { wave: 15, kind: "object", id: "gatling" },
  { wave: 20, kind: "waza", id: "nijiironokenami" },
  { wave: 30, kind: "object", id: "hotcarpet" },
  { wave: 40, kind: "waza", id: "hyakuretsu" },
  { wave: 50, kind: "object", id: "robot" },
  { wave: 70, kind: "waza", id: "ryusei" },
  { wave: 100, kind: "object", id: "seijouki" },
  { wave: 130, kind: "waza", id: "ginganoshippo" },
  { wave: 160, kind: "waza", id: "kousoku" },
  { wave: 200, kind: "waza", id: "densetsunomaneki" },
];
