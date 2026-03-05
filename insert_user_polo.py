import os
from PIL import Image
import time
import re
import shutil

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Open the user's uploaded polo shirt
user_img_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772648254189.png'
shirt = Image.open(user_img_path).convert("RGBA")

# 2. As we learned previously, the HTML relies on a 1:1 square `aspect-ratio` to avoid zooming/clipping.
# Let's cleanly pad the user's image into a perfect square if it isn't one already.
target_size = max(shirt.width, shirt.height)
# Add a slight 5% padding so the shirt isn't touching the literal edge of the square
target_size = int(target_size * 1.05)

square = Image.new('RGBA', (target_size, target_size), (255, 255, 255, 255))

# Calculate center offset
offset_x = (target_size - shirt.width) // 2
offset_y = (target_size - shirt.height) // 2

# Paste the shirt smoothly into the center of the brilliant white square
# We use shirt as mask to preserve any built-in transparency from the user's file.
square.paste(shirt, (offset_x, offset_y), shirt)

# 3. Save as the new final framed asset
out_path = os.path.join(base, "merch_shirt_polo_user.png")
square.save(out_path, "PNG")
print("Perfectly framed user polo saved to merch_shirt_polo_user.png")

# 4. Update the HTML files to link to this new user asset (instead of merch_shirt_pro)
html_files = ["merchandise.html", "merch_shirts.html"]
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # Replace old instances
    html = re.sub(r'/static/merch_shirt_pro\.(png|jpg)(\?v=\d+)?', f'/static/merch_shirt_polo_user.png{buster}', html)
    
    # Just in case we're still linking merch_shirt.png somewhere
    html = re.sub(r'/static/merch_shirt\.png(\?v=\d+)?', f'/static/merch_shirt_polo_user.png{buster}', html)

    # Let's also update the item title since it's now a Polo instead of a Dress Shirt
    if filename == "merch_shirts.html":
        # Change title "White Button-Up Shirt" -> "White Corporate Polo"
        html = html.replace('White Button-Up Shirt', 'White Corporate Polo')
        # Change image alt
        html = html.replace('alt="White Dress Shirt"', 'alt="White Corporate Polo"')

    if filename == "merchandise.html":
        pass # "Corporate Apparel" is broad enough

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename} with new user polo.")

print("Apparel effectively swapped to user asset.")
