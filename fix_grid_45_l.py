import os
import requests
from PIL import Image, ImageFilter, ImageEnhance
import numpy as np
import re
import time

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# 1. Download PD 45L Pristine Front
url_45l_front = "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-1.jpg?v=1726156534&width=2000"
r = requests.get(url_45l_front, headers={'User-Agent': 'Mozilla/5.0'})
pd_45l_path = os.path.join(base, "bp_pd_45l_1.jpg")
with open(pd_45l_path, "wb") as f:
    f.write(r.content)

# 2. Setup Realistic Embroidery function
logo_path = os.path.join(base, "sherpa_logo_source_clean.png")
logo_clean = Image.open(logo_path).convert("RGBA")
bbox = logo_clean.getbbox()
if bbox: logo_clean = logo_clean.crop(bbox)

# Erosion identical to step 896
data = np.array(logo_clean)
from scipy.ndimage import binary_erosion
alpha = data[:, :, 3]
eroded_alpha = binary_erosion(alpha > 140, iterations=2)
data[:, :, 3] = np.where(eroded_alpha, alpha, 0)
logo_clean = Image.fromarray(data)

# Darken by 45% and contrast up
enhancer = ImageEnhance.Brightness(logo_clean)
logo_clean = enhancer.enhance(0.55)
con_enhancer = ImageEnhance.Contrast(logo_clean)
logo_clean = con_enhancer.enhance(1.2)

def apply_realistic_embroidery(bg_path, scale, x_rat, y_rat, angle, p_skew=1.0):
    bg = Image.open(bg_path).convert("RGBA")
    
    logo_w = int(bg.width * scale)
    aspect = logo_clean.height / logo_clean.width
    logo_h = int(logo_w * aspect)
    resized_logo = logo_clean.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    x = int((bg.width * x_rat) - (resized_logo.width / 2))
    y = int((bg.height * y_rat) - (resized_logo.height / 2))
    
    shadow_data = np.zeros_like(np.array(resized_logo))
    shadow_data[:, :, 3] = np.array(resized_logo)[:, :, 3] * 0.95
    shadow_img = Image.fromarray(shadow_data.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    
    out = bg.copy()
    out.paste(shadow_img, (x + 2, y + 2), shadow_img) 
    out.paste(resized_logo, (x, y), resized_logo)
    
    out = out.convert("RGB")
    out.save(bg_path, quality=97)

# Same scale as PD 30L but placed comfortably on the 45L's upper smooth chest
apply_realistic_embroidery(pd_45l_path, 0.10, 0.50, 0.38, 0, 1.0)
print("Processed realistic embroidery for PD 45L.")

# 3. Update merch_backpacks.html
html_path = os.path.join(base, "merch_backpacks.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

# Make sure nomatic pack thumbnail points to the user's version
html = html.replace('src="/static/bp_nomatic_pack_1.png', 'src="/static/bp_nomatic_pack_1_user.jpg')

# Cache bust
buster = f"?v={int(time.time())}"
html = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
print("merch_backpacks.html cache busted and swapped.")
