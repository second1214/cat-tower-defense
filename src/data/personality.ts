// 猫の性格。6種。どれも合計の価値は同じくらい（強い・弱いではなく、得意・不得意が入れかわるだけ）。
// 値は割合（0.15 = +15%）。atk・hp・atkSpd・move は掛け算（×(1 + 値)）、rest は休けい時間に ×(1 + 値)、
// kibble は倒した虫のカリカリの上乗せに足す。
import type { Personality } from "../core/types";

export interface PersonalityDef {
  id: Personality;
  name: string;
  desc: string;
  atk: number;
  hp: number;
  atkSpd: number;
  move: number;
  rest: number;
  kibble: number;
}

const Z = { atk: 0, hp: 0, atkSpd: 0, move: 0, rest: 0, kibble: 0 };

function p(id: Personality, name: string, desc: string, fx: Partial<typeof Z>): PersonalityDef {
  return { id, name, desc, ...Z, ...fx };
}

export const PERSONALITIES: PersonalityDef[] = [
  p("yancha", "やんちゃ", "元気いっぱい。攻撃 +15%・体力 -10%", { atk: 0.15, hp: -0.1 }),
  p("nonbiri", "のんびり", "どっしりおおらか。体力 +20%・攻撃の速さ -8%", { hp: 0.2, atkSpd: -0.08 }),
  p("amaenbo", "あまえんぼう", "すぐ元気になる。休けい時間 -25%・攻撃 -5%", { rest: -0.25, atk: -0.05 }),
  p("kuishinbo", "くいしんぼう", "ごはんが大好き。カリカリ +12%・移動の速さ -8%", { kibble: 0.12, move: -0.08 }),
  p("kokishin", "こうきしん", "なんでも見に行く。移動の速さ +15%・体力 -6%", { move: 0.15, hp: -0.06 }),
  p("maipace", "マイペース", "自分のリズム。攻撃の速さ +10%・移動の速さ -10%", { atkSpd: 0.1, move: -0.1 }),
];

export const PERSONALITY_MAP: Record<Personality, PersonalityDef> = Object.fromEntries(
  PERSONALITIES.map((x) => [x.id, x]),
) as Record<Personality, PersonalityDef>;

export const PERSONALITY_IDS: Personality[] = PERSONALITIES.map((x) => x.id);

export function isPersonality(v: unknown): v is Personality {
  return typeof v === "string" && (PERSONALITY_IDS as string[]).includes(v);
}
