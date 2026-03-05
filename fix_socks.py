import os
from PIL import Image
import rembg
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# Paths
logo_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772649007664.jpg'
socks_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\pure_wool_socks_1772649114704.png'

# 1. Remove background from the intricate stitched logo using U-2-Net (rembg)
print("Isolating embroidery from background...")
with open(logo_path, "rb") as f:
    raw_logo_data = f.read()

transparent_logo_data = rembg.remove(raw_logo_data)

# Save temporary transparent logo
temp_logo_path = os.path.join(base, "temp_stitched_logo.png")
with open(temp_logo_path, "wb") as f:
    f.write(transparent_logo_data)

# 2. Open images
logo = Image.open(temp_logo_path).convert("RGBA")
socks = Image.open(socks_path).convert("RGBA")

# Crop logo to tight bounding box
bbox = logo.getbbox()
if bbox:
    logo = logo.crop(bbox)

# 3. Size and rotate the logo for the calves
# Based on the AI socks image, the socks take up most of the frame.
# We'll make the logo about 25% of the overall image width.
logo_w = int(socks.width * 0.25)
logo_h = int(logo_w * (logo.height / logo.width))
base_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

from PIL import ImageChops

# Sock 1 (Left)
logo_left = base_logo.rotate(10, expand=True, resample=Image.Resampling.BICUBIC)
x_left = int(socks.width * 0.31) - (logo_left.width // 2)
y_left = int(socks.height * 0.28) - (logo_left.height // 2)

bg_patch_left = socks.crop((x_left, y_left, x_left + logo_left.width, y_left + logo_left.height)).convert("RGB")
blended_left = ImageChops.multiply(logo_left.convert("RGB"), bg_patch_left)
socks.paste(blended_left, (x_left, y_left), logo_left.split()[3])

# Sock 2 (Right)
logo_right = base_logo.rotate(-5, expand=True, resample=Image.Resampling.BICUBIC)
x_right = int(socks.width * 0.69) - (logo_right.width // 2)
y_right = int(socks.height * 0.28) - (logo_right.height // 2)

bg_patch_right = socks.crop((x_right, y_right, x_right + logo_right.width, y_right + logo_right.height)).convert("RGB")
blended_right = ImageChops.multiply(logo_right.convert("RGB"), bg_patch_right)
socks.paste(blended_right, (x_right, y_right), logo_right.split()[3])

# 4. Save finished premium socks
out_path = os.path.join(base, "merch_socks_pro.png")
socks.save(out_path, "PNG")
print("Saved premium branded socks: merch_socks_pro.png")

# 5. Clean up temp file
os.remove(temp_logo_path)

# 6. Update HTML
html_files = ["merch_shirts.html"] # Merch shirts contains the socks at the bottom
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace old socks
    html = re.sub(r'/static/merch_socks\.png(\?v=\d+)?', f'/static/merch_socks_pro.png{buster}', html)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename}")

print("Socks re-branded successfully.")
