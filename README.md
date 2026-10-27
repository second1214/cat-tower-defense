# Gemini 猫スプライト用プロンプト（見本シート1枚・1回で1匹）

## 使い方
1. 猫ごとに新しいチャットを開きます。前の猫の模様が混ざるのを防ぐためです。
2. 次の2枚を添付します。
   - **画像1**：`1_pose_sheet.png`（6列×3段・18マスの灰色の見本）
   - **画像2**：`2_style_reference.png`（画風の参考。タワーディフェンスのノルウェージャンの絵）
3. 下の「共通プロンプト」の `{CAT}` を、「猫の設定」にある1行に置きかえて送ります。
4. できた画像は `<id>_sheet.png` という名前でアップしてください（例：`mike_sheet.png`）。マスの切り出し、背景の透過、リサイズ、ゲームへの割り当てはこちらでやります。

---

## 共通プロンプト

```
Image 1 is a pose reference sheet: 18 gray sketch poses in a grid of 6 columns x 3 rows.
Image 2 is the art style reference.

Create a NEW sprite sheet of the cat described below. Use exactly the same 6 x 3 grid and redraw every pose from Image 1 in the same cell, in the same order.

Cat: {CAT}

Cells (left to right, top to bottom):
Row 1: 1-4 walk cycle (4 frames), 5-6 run cycle frames 1-2
Row 2: 7-8 run cycle frames 3-4, 9 standing on hind legs swinging a paw, 10 lunging forward reaching out with a paw, 11 crouched low with tail raised high, 12 hurt: back arched, ears back, mouth open
Row 3: 13 sitting front view, 14 loaf front view: round fluffy body, paws tucked under, eyes closed with a content smile, 15 lying on its back belly up, 16 eating from a small white bowl, 17 curled up asleep, 18 leaping happily

Rules:
- Art style: match Image 2 exactly — soft hand-drawn digital illustration, clean dark-brown outlines, gentle cel shading, fluffy fur strokes, cute but realistic proportions
- The SAME cat in every cell: identical fur pattern, markings, colors, eye color and face
- Copy each pose and facing direction from Image 1 (side views face RIGHT)
- Full color, not gray
- Exactly 6 columns x 3 rows (18 equal-size cells), separated by thin light-gray lines
- Wide landscape image (16:9), as large and detailed as possible
- One cat per cell, full body visible, centered, not touching or crossing the cell edges
- Walk and run frames: keep the cat the same size and head height across the frames; only the legs and body stretch change
- Pure white background (#FFFFFF), no floor shadow, no scenery
- NO text, NO numbers, NO labels, NO title anywhere in the image
- The only prop is the food bowl in cell 16
```

---

## 猫の設定（作成済みの chatora・kijitora・kuma は除く）

| id | 名前 | {CAT} |
|---|---|---|
| mike | みけ | a Japanese calico cat (white base with orange and black patches), short hair, yellow-green eyes, sweet clingy look, female |
| kuro | くろ | a sleek all-black short-haired cat, slim athletic body, bright golden-yellow eyes, curious alert look |
| shiro | しろ | a pure white short-haired cat, long expressive tail, light blue eyes, relaxed easygoing look |
| hachiware | はちわれ | a black-and-white tuxedo cat with a symmetrical black "hachiware" split mask on the forehead, white muzzle and chest, sturdy chunky body, calm eyes |
| sabatora | さばとら | a silver mackerel tabby cat (gray with black stripes), short hair, green eyes, focused sharp look |
| komugi | こむぎ | a small kitten, light wheat-brown mackerel tabby, big round eyes, energetic playful look, larger head relative to body |
| omochi | おもち | a very fluffy long-haired pure white cat, round soft body like a rice cake, pink nose, sleepy sweet look |
| sabi | さび | a tortoiseshell cat (mottled black and dark orange, no white), short hair, amber eyes, gentle mellow look |
| leo | レオ | an American Shorthair male, silver classic tabby with bold swirl patterns on the sides, round face, green eyes, confident hunter look |
| luna | ルナ | a Siamese female, cream body with seal-brown points on face, ears, paws and tail, bright blue almond eyes, slender elegant body |
| chibi | ちび | a Munchkin cat with very short legs, cream and white short fur, round eyes, cheerful bouncy look |
| sora | そら | a Russian Blue, plush blue-gray short coat, vivid green eyes, slim elegant body, slight smile |
| purin | プリン | a Ragdoll, semi-long fluffy cream coat with soft brown-gray points and white mittens, big blue eyes, very gentle relaxed look |
| kotetsu | こてつ | a Bengal male, golden coat with dark leopard-like rosettes, muscular athletic body, green-gold eyes, wild fierce look |
| hime | ひめ | a white Persian, long luxurious fur, flat face, copper eyes, elegant princess-like dignified look (no accessories) |
| taisho | 大将 | a big tough stray boss tomcat, brown tabby with white chest, wide jowly cheeks, a small notch in one ear, half-lidded confident eyes |
| tama | たま | an elderly grandma cat, white with gray tabby patches, slightly thin, grayish whiskers and muzzle, kind wise half-closed eyes |

※ 短毛の猫（くろ・しろ・さばとら・ルナ・そら・レオなど）は、見本の長毛に引っぱられやすいです。毛がふさふさになったら `This cat has SHORT, sleek fur — do not copy the long fluffy fur of the reference.` を付け足してください。

---

## うまくいかないときに付け足す一文
- 文字が入る → `Remove all text. The image must contain no letters or numbers.`
- 灰色のままになる → `Render every cell in full color as described, not as a gray sketch.`
- マスによって模様が変わる → `Cell 13 defines the markings; all other cells must match cell 13 exactly.`
- 猫がマスからはみ出す → `Shrink the cats so each one fits inside its own cell with margin.`
- 左を向く → `All side-view poses must face to the RIGHT.`
- 一部のマスだけ崩れた → できたシートを添付して `Redraw only cell N, keep everything else identical.`
