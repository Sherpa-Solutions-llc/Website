import os
from PIL import Image, ImageFilter, ImageEnhance, ImageChops
import numpy as np
import requests
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
logo_path = os.path.join(base, "sherpa_logo_source_clean.png")

img_raw = Image.open(logo_path).convert("RGBA")
bbox = img_raw.getbbox()
logo_clean = img_raw.crop(bbox) if bbox else img_raw

# Pre-process the logo: Clean up white fringing from rembg by shrinking alpha slightly
data = np.array(logo_clean)
alpha = data[:, :, 3]

from scipy.ndimage import binary_erosion
eroded_alpha = binary_erosion(alpha > 140, iterations=2) # stronger erosion
alpha_new = np.where(eroded_alpha, alpha, 0)
data[:, :, 3] = alpha_new
logo_clean = Image.fromarray(data)

# Darken logo significantly so it fits the moody, dark lighting of the backpacks
enhancer = ImageEnhance.Brightness(logo_clean)
logo_clean = enhancer.enhance(0.55)

# Also enhance contrast slightly to pop the orange and green
con_enhancer = ImageEnhance.Contrast(logo_clean)
logo_clean = con_enhancer.enhance(1.2)

def apply_realistic_embroidery(bg_path, scale, x_rat, y_rat, angle, p_skew=1.0):
    if not os.path.exists(bg_path):
        return
        
    bg = Image.open(bg_path).convert("RGBA")
    
    # Resize heavily
    logo_w = int(bg.width * scale)
    aspect = logo_clean.height / logo_clean.width
    logo_h = int(logo_w * aspect)
    resized_logo = logo_clean.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    if p_skew != 1.0:
        w, h = resized_logo.size
        resized_logo = resized_logo.resize((int(w * p_skew), h), Image.Resampling.LANCZOS)
        
    if angle != 0:
        resized_logo = resized_logo.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

    # Position
    x = int((bg.width * x_rat) - (resized_logo.width / 2))
    y = int((bg.height * y_rat) - (resized_logo.height / 2))
    
    final_logo = resized_logo
    
    # Shadow - tight, dark drop shadow to ground the physical threads
    shadow_data = np.zeros_like(np.array(resized_logo))
    shadow_data[:, :, 3] = np.array(resized_logo)[:, :, 3] * 0.95
    shadow_img = Image.fromarray(shadow_data.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    
    out = bg.copy()
    # 2px shadow offset for a small patch
    out.paste(shadow_img, (x + 2, y + 2), shadow_img) 
    out.paste(final_logo, (x, y), final_logo)
    
    if bg_path.lower().endswith(".jpg"):
        out = out.convert("RGB")
        out.save(bg_path, quality=97)
    else:
        out.save(bg_path, "PNG")
        
    print(f"Applied highly realistic logo to {os.path.basename(bg_path)}")

urls = {
    "bp_nomatic_pack_1.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleFront.png",
    "bp_pd_30l_1.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg",
    "bp_nomatic_bag_1.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png"
}
for name, url in urls.items():
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# Correct realistic scales
targets = {
    # Small realistic chest patch in the upper smoothly section
    "bp_nomatic_pack_1.png": (0.09, 0.44, 0.22, 2, 0.95),
    "bp_pd_30l_1.jpg": (0.10, 0.50, 0.38, 0, 1.0),
    "bp_nomatic_bag_1.png": (0.09, 0.42, 0.28, 1, 0.98)
}

for filename, layout in targets.items():
    apply_realistic_embroidery(os.path.join(base, filename), *layout)

import time
buster = f"?v={int(time.time())}"
html_files = ["backpack_pd_30l.html", "backpack_nomatic_bag.html", "backpack_nomatic_pack.html", "backpack_pd_45l.html"]

for filename in html_files:
    path = os.path.join(base, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    content = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', content)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
print("Composited with true scale and lighting overrides.")
