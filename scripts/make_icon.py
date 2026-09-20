from pathlib import Path
from PIL import Image, ImageDraw

root = Path(r"C:\Users\leizi\Documents\watch_x\build")
root.mkdir(parents=True, exist_ok=True)

size = 1024
img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

draw.rounded_rectangle((72, 72, 952, 952), radius=236, fill=(11, 15, 20, 255))
draw.ellipse((214, 214, 810, 810), outline=(61, 255, 168, 255), width=42)
draw.ellipse((286, 286, 738, 738), outline=(35, 52, 48, 255), width=18)

# Watch ticks
cx = cy = 512
for i in range(12):
    import math
    angle = math.radians(i * 30 - 90)
    inner = 318 if i % 3 == 0 else 338
    outer = 372
    x1, y1 = cx + inner * math.cos(angle), cy + inner * math.sin(angle)
    x2, y2 = cx + outer * math.cos(angle), cy + outer * math.sin(angle)
    draw.line((x1, y1, x2, y2), fill=(61, 255, 168, 230), width=10 if i % 3 == 0 else 6)

# Needle
draw.line((512, 512, 512, 300), fill=(232, 238, 244, 255), width=18)
draw.ellipse((488, 488, 536, 536), fill=(61, 255, 168, 255))

# Small X badge
draw.rounded_rectangle((700, 700, 888, 888), radius=42, fill=(18, 24, 31, 255), outline=(61, 255, 168, 255), width=8)
draw.line((736, 736, 852, 852), fill=(61, 255, 168, 255), width=22)
draw.line((852, 736, 736, 852), fill=(61, 255, 168, 255), width=22)

img.save(root / "icon.png")
print("wrote", root / "icon.png")
