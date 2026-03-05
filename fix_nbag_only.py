import os
from PIL import Image
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# Source the bright, clean logo
logo = Image.open(os.path.join(base, "sherpa_logo_source_clean.png")).convert("RGBA")
bbox = logo.getbbox()
if bbox: 
    logo = logo.crop(bbox)

# Parameters for Nomatic Bag: 
# It was previously at scale=0.35, x=0.50, y=0.35
# User requested moving the logo UP by the same amount again (from 0.40 to 0.30)
# User also requested moving the logo slightly LEFT to be centered on the bag visually (from 0.44 to 0.40)
targets = {
    "pure_nbag.png": ("thumb_pro_nbag.png", 0.28, 0.40, 0.30)
}

print("Running correction on Nomatic Travel Bag 40L...")
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
    out.save(out_path, "PNG")
    print(f"Created {out_name}")

html_path = os.path.join(base, "merch_backpacks.html")
with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

buster = f"?v={int(time.time())}"
html = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', html)

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
    
print("Grid successfully upgraded to professional layout avoiding double-branding!")
