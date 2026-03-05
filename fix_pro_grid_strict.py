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

# Parameters to fit the logo perfectly inside the clean *upper geometric bounds* of the standard 45-degree angled shots.
# The user's provided 'Nomatic Pack' example is a 45-degree angle shot with a massive logo glued to the clean upper-left chest.
# Format: (output_name, image_width_scale, x_ratio, y_ratio)
targets = {
    # PD 45L: Placed cleanly on the upper-left dark grey smooth chest above the zippers
    "bp_pd_45l_1.jpg": ("thumb_pro_pd45.jpg", 0.35, 0.40, 0.28),
    
    # PD 30L: Placed cleanly on the upper-left black smooth chest above the diagonal crease
    "bp_pd_30l_1.jpg": ("thumb_pro_pd30.jpg", 0.35, 0.35, 0.25),
    
    # Nomatic Bag: Placed perfectly inside the large black rectangle above the NOMATIC logo
    "bp_nomatic_bag_1.png": ("thumb_pro_nbag.png", 0.32, 0.50, 0.45)
}

print("\nExecuting final exact placement over the standard gallery angels...")
for in_name, (out_name, scale, x_rat, y_rat) in targets.items():
    bg = Image.open(os.path.join(base, in_name)).convert("RGBA")
    
    logo_w = int(bg.width * scale)
    logo_h = int(logo_w * (logo.height / logo.width))
    resized_logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    # Coordinate system places logo perfectly by center
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
    
print("Grid successfully upgraded to professional layout utilizing standard pristine angles!")
