"""Draws the launcher icon (a small calculator) into <res>/mipmap-*/ic_launcher.png,
and with a second argument also the opaque web/iOS icons into that folder."""
import os
import sys
from PIL import Image, ImageDraw


def draw(px, bg=(0, 0, 0, 0)):
    s = 4  # supersample for smooth edges
    W = px * s
    im = Image.new("RGBA", (W, W), bg)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([W * .14, W * .04, W * .86, W * .96], radius=W * .1, fill=(43, 45, 49), outline=(80, 84, 90), width=max(1, W // 60))
    d.rounded_rectangle([W * .22, W * .12, W * .78, W * .34], radius=W * .03, fill=(195, 203, 187))
    colors = [(90, 164, 221), (20, 21, 24), (20, 21, 24), (92, 106, 118), (92, 106, 118), (91, 113, 132)]
    for r in range(4):
        for c in range(3):
            x0, y0 = W * (.22 + c * .19), W * (.42 + r * .13)
            col = colors[0] if (r, c) == (0, 0) else colors[5] if c == 2 else colors[3] if r else colors[1]
            d.rounded_rectangle([x0, y0, x0 + W * .15, y0 + W * .09], radius=W * .02, fill=col)
    return im.resize((px, px), Image.LANCZOS)


res = sys.argv[1]
for name, px in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
    out = os.path.join(res, "mipmap-" + name)
    os.makedirs(out, exist_ok=True)
    draw(px).save(os.path.join(out, "ic_launcher.png"))
if len(sys.argv) > 2:  # iOS shows transparency as black, so web icons get the app background
    for fn, px in [("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)]:
        draw(px, (17, 17, 17, 255)).convert("RGB").save(os.path.join(sys.argv[2], fn))
