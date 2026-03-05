import os
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Use the AI-generated pristine white folded shirt
shirt_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\pure_white_dress_shirt_1772648070530.png'
shirt = Image.open(shirt_path).convert("RGBA")

# 2. Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# 3. Composite logo onto the shirt
# The folded shirt takes up the center of the square. The left breast (viewer's left) 
# is around x=0.65, y=0.45.
# Let's size the logo to be about 15% of the shirt's total width
logo_w = int(shirt.width * 0.15)
logo_h = int(logo_w * (logo.height / logo.width))
resized_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Coordinates for left breast (viewer's left side of the folded shirt)
# Look at the image: the shirt width is mostly from x=0.2 to x=0.8.
# Center of the right pectoral (viewer's left) is around x=0.65.
# Height is around y=0.35 to 0.45 (above the middle button).
x = int(shirt.width * 0.65) - (resized_logo.width // 2)
y = int(shirt.height * 0.40) - (resized_logo.height // 2)

out = shirt.copy()
out.paste(resized_logo, (x, y), resized_logo)

# 4. Save as the final perfectly framed image
out_path = os.path.join(base, "merch_shirt_pro.png")
out.save(out_path, "PNG")
print("Created merch_shirt_pro.png")

# 5. Update HTML files linking to the old broken shirt
html_files = ["merchandise.html", "merch_shirts.html"]
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace old instances
    html = re.sub(r'/static/merch_shirt\.png(\?v=\d+)?', f'/static/merch_shirt_pro.png{buster}', html)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename}")

print("Apparel effectively branded and linked.")
