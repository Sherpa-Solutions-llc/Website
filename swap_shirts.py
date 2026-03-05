import os
from PIL import Image
import time
import re
import shutil

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Process the NEW white button-up shirt image
new_button_up_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772648678408.png'
shirt = Image.open(new_button_up_path).convert("RGBA")

target_size = max(shirt.width, shirt.height)
target_size = int(target_size * 1.05) # Add 5% padding so it pokes from the edges properly

square = Image.new('RGBA', (target_size, target_size), (255, 255, 255, 255))
offset_x = (target_size - shirt.width) // 2
offset_y = (target_size - shirt.height) // 2
square.paste(shirt, (offset_x, offset_y), shirt)

out_button_up = os.path.join(base, "merch_shirt_button_user.png")
square.save(out_button_up, "PNG")

# 2. Update HTML
html_files = ["merchandise.html", "merch_shirts.html"]
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # The main item is currently pointing to the polo. Let's redirect it to the button-up.
    html = re.sub(r'/static/merch_shirt_polo_user\.png(\?v=\d+)?', f'/static/merch_shirt_button_user.png{buster}', html)

    # Revert titles
    if filename == "merch_shirts.html":
        # First item title:
        html = html.replace('White Corporate Polo', 'White Button-Up Shirt')
        html = html.replace('alt="White Corporate Polo"', 'alt="White Button-Up Shirt"')
        
        # Second task: Assign the polo shirt image to the "Performance Polos" section
        # Replace the old placeholder
        html = re.sub(r'/static/merch_polos\.png(\?v=\d+)?', f'/static/merch_shirt_polo_user.png{buster}', html)

    if filename == "merchandise.html":
        pass

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"Updated {filename}")

print("Assets successfully swapped.")
