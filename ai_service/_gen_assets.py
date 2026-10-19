# Generate bundled WebP assets for Phase 5 pages (run with the ai_service venv).
# - src/assets/feed/activity-{1..3}.webp    → parent feed photo gallery
# - src/assets/finance/receipt-{1..2}.webp  → admin OCR reconciler receipt scans
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED_DIR = os.path.join(ROOT, "src", "assets", "feed")
FIN_DIR = os.path.join(ROOT, "src", "assets", "finance")
os.makedirs(FEED_DIR, exist_ok=True)
os.makedirs(FIN_DIR, exist_ok=True)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def gradient(size, top, bottom):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        row = lerp(top, bottom, y / max(1, h - 1))
        for x in range(w):
            px[x, y] = row
    return img


def activity(idx: int, top, bottom, accent, kind: str):
    img = gradient((640, 480), top, bottom)
    d = ImageDraw.Draw(img, "RGBA")
    if kind == "blocks":  # colorful building blocks
        colors = [(242, 153, 74), (0, 169, 157), (15, 44, 89), (236, 72, 153)]
        base = 360
        for i, col in enumerate(colors):
            x = 70 + i * 130
            size = 90 + (i % 2) * 30
            d.rounded_rectangle([x, base - size, x + size, base], radius=14,
                                fill=col + (235,), outline=(255, 255, 255, 160), width=3)
        d.rounded_rectangle([40, base, 600, base + 26], radius=12, fill=(15, 44, 89, 220))
    elif kind == "sun":  # sun + hill scene
        d.ellipse([450, 60, 570, 180], fill=(255, 214, 90, 255))
        for r in range(0, 360, 30):
            import math
            cx, cy = 510, 120
            x1 = cx + 70 * math.cos(math.radians(r))
            y1 = cy + 70 * math.sin(math.radians(r))
            x2 = cx + 92 * math.cos(math.radians(r))
            y2 = cy + 92 * math.sin(math.radians(r))
            d.line([x1, y1, x2, y2], fill=(255, 214, 90, 230), width=7)
        d.ellipse([-120, 300, 340, 640], fill=(0, 169, 157, 235))
        d.ellipse([260, 330, 760, 680], fill=(0, 131, 122, 235))
    else:  # paint palette swirls
        d.ellipse([90, 90, 340, 340], fill=(255, 255, 255, 60))
        d.ellipse([150, 150, 280, 280], fill=accent + (230,))
        d.arc([120, 120, 360, 360], 200, 340, fill=(255, 255, 255, 220), width=14)
        d.ellipse([360, 220, 520, 380], fill=(242, 153, 74, 220))
        d.ellipse([300, 330, 430, 460], fill=(0, 169, 157, 220))
        for i in range(14):
            x = 60 + i * 40
            d.line([x, 400, x + 30, 470], fill=(255, 255, 255, 140), width=6)
    # subtle vignette frame
    d.rectangle([0, 0, 639, 479], outline=(255, 255, 255, 90), width=6)
    out = os.path.join(FEED_DIR, f"activity-{idx}.webp")
    img.save(out, "WEBP", quality=82, method=6)
    return out


def receipt(idx: int, ref: str, amount: str, date: str, payer: str):
    w, h = 560, 760
    img = gradient((w, h), (250, 250, 252), (236, 238, 242))
    d = ImageDraw.Draw(img)
    font_path = "C:/Windows/Fonts/arial.ttf"
    bold_path = "C:/Windows/Fonts/arialbd.ttf"
    try:
        f_title = ImageFont.truetype(bold_path, 34)
        f_body = ImageFont.truetype(font_path, 24)
        f_small = ImageFont.truetype(font_path, 20)
        f_big = ImageFont.truetype(bold_path, 42)
    except OSError:
        f_title = f_body = f_small = f_big = ImageFont.load_default()

    # paper
    d.rounded_rectangle([24, 24, w - 24, h - 24], radius=18, fill=(255, 255, 255),
                        outline=(200, 205, 215), width=2)
    # header band
    d.rectangle([24, 24, w - 24, 130], fill=(15, 44, 89))
    d.text((w / 2, 62), "BANK RECEIPT", font=f_title, fill=(255, 255, 255), anchor="mm")
    d.text((w / 2, 102), "TRANSFER CONFIRMATION", font=f_small, fill=(150, 200, 220), anchor="mm")

    y = 180
    rows = [
        ("DATE", date),
        ("REFERENCE", ref),
        ("PAYER", payer),
        ("PAYEE", "SARH PLATFORM"),
        ("METHOD", "BANK TRANSFER"),
        ("BRANCH", "GAZA - AL-RIMAL"),
    ]
    for label, value in rows:
        d.text((60, y), label, font=f_small, fill=(100, 116, 139))
        d.text((w - 60, y), value, font=f_body, fill=(13, 37, 61), anchor="ra")
        y += 46
        d.line([60, y - 12, w - 60, y - 12], fill=(226, 232, 240), width=2)

    y += 24
    d.text((60, y), "TOTAL AMOUNT", font=f_small, fill=(100, 116, 139))
    y += 34
    d.text((w / 2, y + 26), f"ILS {amount}", font=f_big, fill=(0, 169, 157), anchor="mm")

    # barcode strip
    import random
    random.seed(idx * 7 + 3)
    bx, by = 70, h - 150
    for i in range(46):
        bw = random.choice([3, 5, 8])
        d.rectangle([bx, by, bx + bw, by + 70], fill=(13, 37, 61))
        bx += bw + random.choice([4, 6, 9])
    d.text((w / 2, h - 60), f"*** {ref} ***", font=f_small, fill=(100, 116, 139), anchor="mm")

    out = os.path.join(FIN_DIR, f"receipt-{idx}.webp")
    img.save(out, "WEBP", quality=85, method=6)
    return out


made = [
    activity(1, (176, 232, 240), (110, 200, 220), (0, 169, 157), "blocks"),
    activity(2, (255, 228, 190), (255, 190, 140), (242, 153, 74), "sun"),
    activity(3, (225, 210, 255), (180, 170, 240), (108, 92, 210), "palette"),
    receipt(1, "TRX-84921", "320.00", "2026-10-05", "AHMAD ALI"),
    receipt(2, "TRX-90174", "550.00", "2026-10-06", "MONA SALEM"),
]
for path in made:
    print(path, os.path.getsize(path))
