import os
from PIL import Image, ImageDraw
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772649007664.jpg'
socks_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\pure_wool_socks_1772649114704.png'

logo = Image.open(logo_path).convert("RGBA")
socks = Image.open(socks_path).convert("RGBA")

# Contiguous floodfill from the four corners to erase the exterior fabric, leaving internal snow intact!
ImageDraw.floodfill(logo, (0, 0), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(logo, (logo.width-1, logo.height-1), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(logo, (0, logo.height-1), (255, 255, 255, 0), thresh=30)
ImageDraw.floodfill(logo, (logo.width-1, 0), (255, 255, 255, 0), thresh=30)

# Floodfill inside some letter loops where the fabric is clearly isolated:
# P, R, A, O, O
# Since the image is fairly standard, we'll extract the bbox
bbox = logo.getbbox()
logo = logo.crop(bbox)

# Scale
logo_w = int(socks.width * 0.22)
logo_h = int(logo_w * (logo.height / logo.width))
base_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Left
logo_left = base_logo.rotate(8, expand=True, resample=Image.Resampling.BICUBIC)
x_left = int(socks.width * 0.28) - (logo_left.width // 2)
y_left = int(socks.height * 0.28) - (logo_left.height // 2)

# Right
logo_right = base_logo.rotate(-5, expand=True, resample=Image.Resampling.BICUBIC)
x_right = int(socks.width * 0.72) - (logo_right.width // 2)
y_right = int(socks.height * 0.28) - (logo_right.height // 2)

# Paste normally to keep the vibrant stitched thread colors bright against the dark grey!
socks.paste(logo_left, (x_left, y_left), logo_left)
socks.paste(logo_right, (x_right, y_right), logo_right)

out_path = os.path.join(base, "merch_socks_pro.png")
socks.save(out_path, "PNG")
print("Saved contiguous floodfilled socks.")

# Update HTML
html_files = ["merch_shirts.html"] 
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    html = re.sub(r'/static/merch_socks_pro\.png(\?v=\d+)?', f'/static/merch_socks_pro.png{buster}', html)
    html = re.sub(r'/static/merch_socks\.png(\?v=\d+)?', f'/static/merch_socks_pro.png{buster}', html)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename}")
