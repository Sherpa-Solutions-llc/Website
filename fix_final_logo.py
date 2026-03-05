import os
from PIL import Image, ImageFilter
import numpy as np
import requests
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = os.path.join(base, "sherpa_logo_true_color.png")
logo_clean = Image.open(logo_path).convert("RGBA")

def apply_embroidery(bg_path, scale, x_rat, y_rat, angle, perspective_skew=1.0):
    if not os.path.exists(bg_path):
        return
        
    bg = Image.open(bg_path).convert("RGBA")
    
    # Resize Logo
    logo_w = int(bg.width * scale)
    aspect = logo_clean.height / logo_clean.width
    logo_h = int(logo_w * aspect)
    resized_logo = logo_clean.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    if perspective_skew != 1.0:
        w, h = resized_logo.size
        resized_logo = resized_logo.resize((int(w * perspective_skew), h), Image.Resampling.LANCZOS)
        
    if angle != 0:
        resized_logo = resized_logo.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    
    # Drop Shadow 
    shadow = Image.new("RGBA", resized_logo.size, (0,0,0,0))
    shadow_data = np.array(resized_logo)
    shadow_alpha = shadow_data[:,:,3]
    shadow_arr = np.zeros_like(shadow_data)
    shadow_arr[:,:,3] = shadow_alpha * 0.8
    shadow_img = Image.fromarray(shadow_arr).filter(ImageFilter.GaussianBlur(1.0)) 
    
    # Position
    x = int((bg.width * x_rat) - (resized_logo.width / 2))
    y = int((bg.height * y_rat) - (resized_logo.height / 2))
    
    out = bg.copy()
    out.paste(shadow_img, (x + 2, y + 2), shadow_img) # Slight shadow offset
    out.paste(resized_logo, (x, y), resized_logo)
    
    if bg_path.lower().endswith(".jpg"):
        out = out.convert("RGB")
        out.save(bg_path, quality=95)
    else:
        out.save(bg_path, "PNG")
        
    print(f"Applied final true-color logo to {os.path.basename(bg_path)}")

# 1. Reset all images to pristine (wiping any previous mistakes)
urls = {
    "bp_nomatic_pack_1.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleFront.png",
    "bp_nomatic_pack_6.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleBack.png",
    
    "bp_pd_30l_1.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg",
    "bp_pd_30l_2.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-3_32276b62-97f0-49df-a735-ff6a98f17029.jpg",
    
    "bp_nomatic_bag_1.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png",
    "bp_nomatic_bag_2.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleBack.png"
}
for name, url in urls.items():
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# 2. Apply logos EXCLUSIVELY to the STRAP sides (the user explicitly said "you placed a logo on the front... which is not required")
targets = {
    # Nomatic Pack (Strap side = Photo 6)
    "bp_nomatic_pack_6.png": (0.24, 0.46, 0.40, -12, 0.85),
    
    # Peak Design 30L (Strap side = Photo 2)
    "bp_pd_30l_2.jpg": (0.32, 0.46, 0.28, -6, 0.9),
    
    # Nomatic Bag (Strap side = Photo 2)
    "bp_nomatic_bag_2.png": (0.28, 0.50, 0.25, 0, 1.0)
}

for filename, layout in targets.items():
    apply_embroidery(os.path.join(base, filename), *layout)

# 3. Cache buster update to ensure user sees it
import time
buster = f"?v={int(time.time())}"
html_files = ["backpack_pd_30l.html", "backpack_nomatic_bag.html", "backpack_nomatic_pack.html", "backpack_pd_45l.html"]

for filename in html_files:
    path = os.path.join(base, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace old cache busters
    content = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
print("Fixed images and cache busters.")
