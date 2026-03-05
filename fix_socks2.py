import os
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772649007664.jpg'
socks_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\pure_wool_socks_1772649114704.png'

logo = Image.open(logo_path).convert("RGBA")
socks = Image.open(socks_path).convert("RGBA")

# Extract only the dark stitched threads by turning off-white background transparent
data = logo.getdata()
new_data = []
for item in data:
    # item is (R, G, B, A)
    # The background is mostly light grey/white. Let's make anything very bright transparent.
    if item[0] > 180 and item[1] > 180 and item[2] > 180:
        new_data.append((255, 255, 255, 0))
    else:
        # Keep the exact thread color
        new_data.append(item)

logo.putdata(new_data)

# Crop 
bbox = logo.getbbox()
if bbox:
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
print("Saved clean color-keyed socks.")

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
