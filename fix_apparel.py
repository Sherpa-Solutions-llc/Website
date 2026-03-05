import os
import requests
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Base shirt already downloaded as raw_shirt.jpg
raw_path = os.path.join(base, "raw_shirt.jpg")

# 2. Open and convert
shirt = Image.open(raw_path).convert("RGBA")

# 3. Create a perfect high-res square canvas (since the HTML uses aspect-ratio: 1)
# We want the shirt to fit beautifully centered in the square
target_size = 1000
square = Image.new('RGBA', (target_size, target_size), (255, 255, 255, 255))

# Resize shirt to fit within the square, leaving a little padding
scale = (target_size * 0.9) / max(shirt.width, shirt.height)
new_w = int(shirt.width * scale)
new_h = int(shirt.height * scale)
shirt_resized = shirt.resize((new_w, new_h), Image.Resampling.LANCZOS)

# Paste shirt into center of square
offset_x = (target_size - new_w) // 2
offset_y = (target_size - new_h) // 2
square.paste(shirt_resized, (offset_x, offset_y), shirt_resized)

# 4. Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# 5. Composite logo onto left chest
# We'll size the logo appropriately for the chest (about 18% of the shirt width)
logo_w = int(new_w * 0.18)
logo_h = int(logo_w * (logo.height / logo.width))
resized_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Coordinates for left chest (viewer's left side of the shirt image, so technically the right pectoral)
# Actually, standard logo placement is right pectoral (viewer's left).
# Let's map it visually.
x = offset_x + int(new_w * 0.65) - (resized_logo.width // 2)
y = offset_y + int(new_h * 0.28) - (resized_logo.height // 2)

square.paste(resized_logo, (x, y), resized_logo)

# 6. Save as the final perfectly framed image
out_path = os.path.join(base, "merch_shirt_pro.jpg")
square.convert("RGB").save(out_path, quality=95)
print("Created perfectly squarified merch_shirt_pro.jpg")

# 7. Update HTML files linking to the old broken shirt
html_files = ["merchandise.html", "merch_shirts.html"]
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace /static/merch_shirt.png (with or without query strings) with our new jpg
    html = re.sub(r'/static/merch_shirt\.png(\?v=\d+)?', f'/static/merch_shirt_pro.jpg{buster}', html)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename}")

print("Apparel effectively reframed and branded.")
