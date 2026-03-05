import os
import requests
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# The optimal pristine "smooth side" photos based on subagent review
downloads = {
    # This is a flat lay of the PD 45L showing the entire clean back panel
    "pristine_pd45.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-4.jpg?v=1726156534&width=2000",
    # This shows two PD 30L bags standing up, the left one has a perfect smooth outward face
    "pristine_pd30.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-2_a2e7f7f7-8159-47b8-a216-730bcf386960.jpg",
    # The Nomatic Travel Bag standing upright showing the large smooth duffel face
    "pristine_nbag.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png"
}

print("Fetching pristine canvas photos...")
for name, url in downloads.items():
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# Parameters to fit the logo perfectly inside the *clean geometric bounds* of the smooth panels
targets = {
    # Placed centrally on the upper flat hatch of the PD 45L
    "pristine_pd45.jpg": ("thumb_pro_pd45.jpg", 0.32, 0.48, 0.32),
    # Placed centrally on the smooth outer shell of the left-hand bag in the photo
    "pristine_pd30.jpg": ("thumb_pro_pd30.jpg", 0.28, 0.43, 0.45),
    # Placed centrally on the large smooth right-facing panel of the upright duffel
    "pristine_nbag.png": ("thumb_pro_nbag.png", 0.30, 0.65, 0.45)
}

print("\nCompositing professional logos...")
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

# Update merch_backpacks.html with the new professional images
html_path = os.path.join(base, "merch_backpacks.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

print("\nUpdating HTML unified links...")
html = html.replace('/static/bp_pd_45l_1.jpg', '/static/thumb_pro_pd45.jpg')
html = html.replace('/static/bp_pd_30l_1.jpg', '/static/thumb_pro_pd30.jpg')
html = html.replace('/static/bp_nomatic_bag_1.png', '/static/thumb_pro_nbag.png')

# Double check Nomatic Pack is pointing to the custom user file
html = html.replace('/static/bp_nomatic_pack_1.png', '/static/bp_nomatic_pack_1_user.jpg')

# Cache bust
buster = f"?v={int(time.time())}"
html = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
print("Grid successfully upgraded to professional layout!")
