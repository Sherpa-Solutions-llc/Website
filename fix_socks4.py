import os
from PIL import Image
import rembg
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772649007664.jpg'
socks_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\pure_wool_socks_1772649114704.png'

print("Isolating embroidery from background using AI segmentation...")
with open(logo_path, "rb") as f:
    raw_logo_data = f.read()

transparent_logo_data = rembg.remove(raw_logo_data)

temp_logo_path = os.path.join(base, "temp_stitched_logo2.png")
with open(temp_logo_path, "wb") as f:
    f.write(transparent_logo_data)

logo = Image.open(temp_logo_path).convert("RGBA")
socks = Image.open(socks_path).convert("RGBA")

bbox = logo.getbbox()
if bbox:
    logo = logo.crop(bbox)

# Size 
logo_w = int(socks.width * 0.23)
logo_h = int(logo_w * (logo.height / logo.width))
base_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Sock 1 (Left)
logo_left = base_logo.rotate(8, expand=True, resample=Image.Resampling.BICUBIC)
x_left = int(socks.width * 0.30) - (logo_left.width // 2)
y_left = int(socks.height * 0.26) - (logo_left.height // 2)

# Sock 2 (Right)
logo_right = base_logo.rotate(-5, expand=True, resample=Image.Resampling.BICUBIC)
x_right = int(socks.width * 0.70) - (logo_right.width // 2)
y_right = int(socks.height * 0.26) - (logo_right.height // 2)

socks.paste(logo_left, (x_left, y_left), logo_left)
socks.paste(logo_right, (x_right, y_right), logo_right)

out_path = os.path.join(base, "merch_socks_pro.png")
socks.save(out_path, "PNG")
print("Saved perfect premium branded socks.")

os.remove(temp_logo_path)

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
