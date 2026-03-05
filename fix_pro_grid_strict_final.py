import os
import requests
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Download absolutely pure unbranded sources to avoid double-pasting
downloads = {
    # Pure unbranded front-angle of PD 45L
    "pure_pd45.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-1.jpg?v=1726156534&width=1000",
    # Pure unbranded front-angle of PD 30L
    "pure_pd30.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg",
    # Pure unbranded front-angle of Nomatic Bag 40L
    "pure_nbag.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png"
}

print("Fetching purely unbranded bases...")
for name, url in downloads.items():
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# 2. Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# Parameters mimicking the Nomatic Pack exactly: Centered horizontally (0.5), upper chest vertically (0.35-0.4), roughly 32% scale
targets = {
    "pure_pd45.jpg": ("thumb_pro_pd45.jpg", 0.35, 0.50, 0.40),
    "pure_pd30.jpg": ("thumb_pro_pd30.jpg", 0.35, 0.50, 0.40),
    "pure_nbag.png": ("thumb_pro_nbag.png", 0.35, 0.50, 0.35)
}

print("\nCompositing perfectly centered professional logos...")
for in_name, (out_name, scale, x_rat, y_rat) in targets.items():
    bg = Image.open(os.path.join(base, in_name)).convert("RGBA")
    
    logo_w = int(bg.width * scale)
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
    print(f"Created {out_name}")

html_path = os.path.join(base, "merch_backpacks.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Make absolutely sure these mappings point strictly to the newly carved exact thumbnails
html = html.replace('/static/bp_pd_45l_1.jpg', '/static/thumb_pro_pd45.jpg')
html = html.replace('/static/bp_pd_30l_1.jpg', '/static/thumb_pro_pd30.jpg')
html = html.replace('/static/bp_nomatic_bag_1.png', '/static/thumb_pro_nbag.png')

buster = f"?v={int(time.time())}"
html = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
print("Grid successfully upgraded to professional layout avoiding double-branding!")
