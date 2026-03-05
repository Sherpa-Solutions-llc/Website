import os
import requests
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# URLs to the pristine 'smooth side' images for the other 3 backpacks
downloads = {
    "pristine_45l.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-2.jpg?v=1726156534&width=2000",
    "pristine_30l.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-2_a2e7f7f7-8159-47b8-a216-730bcf386960.jpg",
    "pristine_bag.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleBack.png"
}

for name, url in downloads.items():
    print(f"Downloading {name}...")
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# Parameters to match the large, prominent look of the user's Nomatic Pack
targets = {
    "pristine_45l.jpg": ("thumb_pd_45l.jpg", 0.42, 0.50, 0.38),
    "pristine_30l.jpg": ("thumb_pd_30l.jpg", 0.42, 0.48, 0.35),
    "pristine_bag.png": ("thumb_nomatic_bag.png", 0.35, 0.50, 0.32)
}

for in_name, (out_name, scale, x_rat, y_rat) in targets.items():
    print(f"Applying large logo to {in_name}...")
    bg = Image.open(os.path.join(base, in_name)).convert("RGBA")
    
    logo_w = int(bg.width * scale)
    # maintain aspect ratio
    logo_h = int(logo_w * (logo.height / logo.width))
    resized_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    x = int((bg.width * x_rat) - (resized_logo.width / 2))
    y = int((bg.height * y_rat) - (resized_logo.height / 2))
    
    out = bg.copy()
    out.paste(resized_logo, (x, y), resized_logo)
    
    out_path = os.path.join(base, out_name)
    if out_name.endswith(".jpg"):
        out.convert("RGB").save(out_path, quality=95)
    else:
        out.save(out_path, "PNG")

# Update merch_backpacks.html with the new unified images
html_path = os.path.join(base, "merch_backpacks.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

print("Updating HTML image sources...")
html = html.replace('/static/bp_pd_45l_1.jpg', '/static/thumb_pd_45l.jpg')
html = html.replace('/static/bp_pd_30l_1.jpg', '/static/thumb_pd_30l.jpg')
html = html.replace('/static/bp_nomatic_bag_1.png', '/static/thumb_nomatic_bag.png')

# Ensure Nomatic Pack points to the custom user file
html = html.replace('/static/bp_nomatic_pack_1.png', '/static/bp_nomatic_pack_1_user.jpg')

# Cache bust
buster = f"?v={int(time.time())}"
html = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
print("Done! The grid images are now unified matching the large Nomatic Pack style.")
