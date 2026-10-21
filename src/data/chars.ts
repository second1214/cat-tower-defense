// 猫の見た目のひな形。猫そのものにはレアリティも役割もない（戦い方はメインの「わざ」で決まる。waza.ts）。
// ここの 20 匹は、うちの子の見た目（look）のひな形と、古いセーブを引きつぐためのデータ。
// id は絵（sprites）の id でもある（うちの子の見た目 look もこの id から選ぶ）。
import type { CharRole, Personality } from "../core/types";

export interface CharDef {
  id: string;
  name: string;
  desc: string;
  /** はじめの性格（古いセーブから引きついだ猫に使う。あとで変えられる）。 */
  personality: Personality;
  /** その猫らしいメインのわざ（古いセーブの特技を引きつぐのに使う。waza.ts の id）。 */
  waza: string;
}

export const ROLE_NAMES: Record<CharRole, string> = {
  melee: "近接",
  ranged: "遠距離",
  aoe: "範囲",
  fast: "すばやい",
};

function cat(id: string, name: string, personality: Personality, waza: string, desc: string): CharDef {
  return { id, name, desc, personality, waza };
}

export const CHARS: CharDef[] = [
  // id "chatora" は古いセーブとの互換のため、そのまま（絵は public/sprites の PNG）
  cat("chatora", "ノルウェージャン", "nonbiri", "nekopunch", "ふさふさの長毛で体が大きく、がんじょう。近くの虫をねこパンチ。"),
  cat("mike", "みけ", "amaenbo", "choichoi", "離れたところから、ちょいちょいと手を出す。"),
  cat("kuro", "くろ", "kokishin", "yorunome", "足がとても速い。暗いところでも目がきく。"),
  cat("shiro", "しろ", "maipace", "fuwafuwa", "しっぽをぶんぶん。まわりの虫をまとめてはらう。"),
  cat("kijitora", "きじとら", "yancha", "norasodachi", "元のら猫。たくましくて、けがをしてもすぐ治る。"),
  cat("hachiware", "はちわれ", "nonbiri", "dossiri", "どっしり構えて、かじられてもへっちゃら。"),
  cat("sabatora", "さばとら", "maipace", "neraiuchi", "じっと狙って、遠くの虫にぴしっ。"),
  cat("komugi", "こむぎ", "yancha", "sodachizakari", "家じゅうを走りまわる元気な子ねこ。"),
  cat("omochi", "おもち", "amaenbo", "mimamori", "もふもふの長い毛。ごろんと転がって虫をまとめてつぶす。"),
  cat("sabi", "さび", "maipace", "jiwajiwa", "まだら模様のおっとりさん。引っかき傷がじわじわ効く。"),
  cat("leo", "レオ", "yancha", "karinomeijin", "アメリカンショートヘアの男の子。狩りが大好き。"),
  cat("luna", "ルナ", "amaenbo", "yokutoorukoe", "シャムの女の子。よく通る声でおしゃべり。"),
  cat("chibi", "ちび", "kokishin", "chokomaka", "あしの短いマンチカン。ちょこまか動いて当たらない。"),
  cat("kuma", "くま", "nonbiri", "ookinakarada", "メインクーンの大きな子。ゆったり構えて、範囲も広い。"),
  cat("sora", "そら", "kuishinbo", "oyatsusagashi", "ロシアンブルー。おやつのありかを知っている。"),
  cat("purin", "プリン", "amaenbo", "iyashi", "ラグドールのおっとりさん。いるだけで場がなごむ。"),
  cat("kotetsu", "こてつ", "yancha", "yaseinokan", "ベンガルの男の子。野生の血がさわぐ。"),
  cat("hime", "ひめ", "maipace", "kihin", "ペルシャのお姫さま。気品のある一撃。"),
  cat("taisho", "大将", "kuishinbo", "machinoboss", "ご近所のボス猫。けんかの強さは町いちばん。"),
  cat("tama", "たま", "nonbiri", "toshinokou", "長生きのおばあちゃん猫。なんでも知っている。"),
];

export const CHAR_MAP: Record<string, CharDef> = Object.fromEntries(CHARS.map((c) => [c.id, c]));

/** 見た目（look）に選べる絵の id。絵が増えたらここも増える。 */
export const CAT_LOOKS: string[] = CHARS.map((c) => c.id);

/** 名前の長さの上限（文字）。 */
export const MAX_CAT_NAME = 12;

/** なかよし度の上限。 */
export const MAX_BOND = 5;
/** なかよし度1つにつき、基本の体力・攻撃 +20%。 */
export const BOND_STAT_PER = 0.2;
/** なかよし度 bond → bond+1 に必要な戦闘の回数（主人公・相棒として勝つたびに 1）。 */
export function bondToNext(bond: number): number {
  return 3 + 3 * Math.max(0, bond);
}
