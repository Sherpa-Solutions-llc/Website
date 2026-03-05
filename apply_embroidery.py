import os
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
import requests

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = os.path.join(base, "sherpa_logo.png")
logo = Image.open(logo_path).convert("RGBA")

# Use flood fill to remove the exterior white background only.
# First, create a mask
temp_logo = logo.copy()
ImageDraw.floodfill(temp_logo, (0, 0), (0, 0, 0, 0), thresh=40)
# Also floodfill from the other corners just in case.
ImageDraw.floodfill(temp_logo, (logo.width-1, 0), (0, 0, 0, 0), thresh=40)
ImageDraw.floodfill(temp_logo, (0, logo.height-1), (0, 0, 0, 0), thresh=40)
ImageDraw.floodfill(temp_logo, (logo.width-1, logo.height-1), (0, 0, 0, 0), thresh=40)

logo_clean = temp_logo

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
    shadow_img = Image.fromarray(shadow_arr).filter(ImageFilter.GaussianBlur(2.0))
    
    # Position
    x = int((bg.width * x_rat) - (resized_logo.width / 2))
    y = int((bg.height * y_rat) - (resized_logo.height / 2))
    
    out = bg.copy()
    out.paste(shadow_img, (x + 3, y + 3), shadow_img) # Slight shadow offset
    out.paste(resized_logo, (x, y), resized_logo)
    
    if bg_path.lower().endswith(".jpg"):
        out = out.convert("RGB")
        out.save(bg_path, quality=95)
    else:
        out.save(bg_path, "PNG")
        
    print(f"Applied embroidered logo to {os.path.basename(bg_path)}")

# The user explicitly wants them on the REAR (strap side)
targets = {
    # Nomatic Pack (strap side)
    "bp_nomatic_pack_6.png": (0.24, 0.46, 0.40, -12, 0.85),
    # Peak Design 30L (strap side) 
    "bp_pd_30l_2.jpg": (0.32, 0.46, 0.28, -6, 0.9),
    # Nomatic Bag (strap side)
    "bp_nomatic_bag_2.png": (0.28, 0.50, 0.25, 0, 1.0)
}

# 1. Reset all front and rear images to pristine to wipe any existing logos
urls = {
    "bp_nomatic_pack_1.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleFront.png",
    "bp_pd_30l_1.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg",
    "bp_nomatic_bag_1.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png",
    "bp_nomatic_pack_6.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleBack.png",
    "bp_pd_30l_2.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-3_32276b62-97f0-49df-a735-ff6a98f17029.jpg",
    "bp_nomatic_bag_2.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleBack.png"
}
for name, url in urls.items():
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    with open(os.path.join(base, name), "wb") as f:
        f.write(r.content)

# 2. Apply logos only to the rear targets
for filename, layout in targets.items():
    apply_embroidery(os.path.join(base, filename), *layout)
