# マイキャットプリティ（paper-cat-magic）の猫を 新しい画風で作り直す

いただいた18マスのシート（`2_reference.png`）で、歩き・走り・威嚇・すわる・あおむけ・丸まって寝る はそろっています。
このゲームで足りないのは **ふりむく4コマ・まばたき3コマ・ジャンプ4コマ・よろこぶ** の12枚なので、それだけを1枚で作ります。

## 使い方
1. 新しいチャットで、次の2枚を添付します。
   - **画像1**：`1_pose_sheet.png`（4列×3段・12マスの灰色の見本）
   - **画像2**：`2_reference.png`（このクオリティで作った18マスのシート）
2. 下のプロンプトを、右上のボタンでまるごとコピーして送ります。
3. できた画像をアップしてください。切り出して、ゲームの絵（`public/cat/`）に差しかえます。

## プロンプト

```
Image 1 is a pose reference sheet: 12 gray sketch poses in a grid of 4 columns x 3 rows.
Image 2 is a finished sprite sheet of my cat. It is the reference for BOTH the art style AND the cat itself.

Create a NEW sprite sheet of the EXACT same cat as Image 2, in the EXACT same art style as Image 2 (soft, realistic painterly illustration with fluffy fur texture, gentle shading, thin soft outlines). Use exactly the same 4 x 3 grid as Image 1 and redraw every pose from Image 1 in the same cell, in the same order.

Cat: the fluffy orange-and-white Norwegian Forest Cat from Image 2 — bright orange long fur, white chest ruff, white muzzle, white belly and white paws, big bushy orange tail with a white tip, green-yellow eyes.

Cells (left to right, top to bottom):
Row 1: 1-4 turning the head toward the viewer while standing (side view facing right):
  1 head in profile facing right, 2 head turned slightly toward the viewer, 3 head turned three-quarters toward the viewer, 4 face looking straight at the viewer. The body, legs and tail stay EXACTLY the same in all 4 cells; only the head turns.
Row 2: 5-7 standing, body facing right, face looking at the viewer:
  5 relaxed half-closed eyes, gentle smile, 6 eyes fully closed (blink), 7 big round sparkling eyes, mouth slightly open, happy.
  The body, legs and tail stay EXACTLY the same in cells 5-7; only the eyes and mouth change.
  8 sitting front view, very happy: eyes closed in a big smile, mouth open, tail wrapped around the front paws.
Row 3: 9-12 jump sequence, side view facing right:
  9 crouched low ready to spring, 10 springing up and forward, body stretched diagonally, front paws raised, 11 in the air, body level, legs tucked, 12 landing, front paws touching down first, back raised.

Rules:
- The SAME cat in every cell, identical to Image 2: same fur pattern, colors, eye color and face
- Copy each pose and facing direction from Image 1 (side views face RIGHT)
- Full color, not gray
- Exactly 4 columns x 3 rows (12 equal-size cells), separated by thin light-gray lines
- Wide landscape image (16:9), as large and detailed as possible
- One cat per cell, full body visible, centered, not touching or crossing the cell edges
- Keep the cat the same size across cells 1-7 (standing frames are animation frames)
- Pure white background (#FFFFFF), no floor shadow, no scenery
- NO text, NO numbers, NO labels, NO title anywhere in the image
```

## うまくいかないときに付け足す一文
- ふりむき・まばたきで体まで変わる → `In cells 1-7 the body must be identical; change only the head, eyes and mouth.`
- 画風がアニメ調にもどる → `Match the painterly fur texture of Image 2 exactly, not a flat cartoon style.`
- 影が入る → `No shadow under the cat. Flat white background only.`
- 一部のマスだけ崩れた → できたシートを添付して `Redraw only cell N, keep everything else identical.`
