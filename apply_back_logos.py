import os
from PIL import Image

# Positions for the bag rears discovered via grid analysis
# Key pattern: Add logo to upper center/back pad area
# bp_pd_30l_2.jpg -> Rear of 30L
# bp_pd_30l_4.jpg -> Identical to 2, also needs logo
# bp_nomatic_bag_6.png -> Rear of Nomatic Bag
# bp_nomatic_pack_6.png -> Rear of Nomatic Pack
# bp_pd_45l_... actually the 45L current main is front too based on standard pd numbering? 
# Wait, the prompt says "use peak design travel backpack 45L as the template... The backpacks should only have one sherpa logo on the back... any pictures should have the logo on the back".
# Let's fix the 45L too if it's currently on the front. 
# Re-analyzing 45L - bp_pd_45l_1.jpg is front angled view. bp_pd_45l_2.jpg is back.
# I need to process 45L too if it isn't already on the back!

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
logo_path = os.path.join(base, "sherpa_logo.png")

logo = Image.open(logo_path).convert("RGBA")

# Sherpa Logo tint processing (make it transparent/blend)
data = list(logo.getdata())
new_data = []
width, height = logo.size
text_start_y = int(height * 0.55)
for y in range(height):
    for x in range(width):
        r, g, b, a = data[y * width + x]
        if r > 220 and g > 220 and b > 220:
            new_data.append((255, 255, 255, 0)) # White to transparent
        else:
            if y > text_start_y and r < 140 and g < 140 and b < 140:
                new_data.append((255, 120, 0, a))
            else:
                new_data.append((r, g, b, a))
                
logo.putdata(new_data)
alpha = logo.split()[3]
alpha = alpha.point(lambda p: int(p * 0.90)) # Slight transparency
logo.putalpha(alpha)


targets = {
    # filename: (scale_factor, x_offset_ratio, y_offset_ratio)
    "bp_pd_30l_2.jpg": (0.25, 0.5, 0.25),
    "bp_pd_30l_4.jpg": (0.25, 0.5, 0.25),   # Same as 2
    "bp_nomatic_bag_6.png": (0.22, 0.5, 0.25),
    "bp_nomatic_pack_6.png": (0.35, 0.5, 0.40),
    "bp_pd_45l_2.jpg": (0.45, 0.5, 0.35)    # Adding 45L back logic!
}

for filename, (scale, x_rat, y_rat) in targets.items():
    path = os.path.join(base, filename)
    if not os.path.exists(path):
        continue
        
    img = Image.open(path).convert("RGBA")
    
    # Calculate logo size
    logo_w = int(img.width * scale)
    aspect = logo.height / logo.width
    logo_h = int(logo_w * aspect)
    logo_resized = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    
    # Calculate position
    x = int((img.width * x_rat) - (logo_w / 2))
    y = int((img.height * y_rat) - (logo_h / 2))
    
    out = img.copy()
    out.paste(logo_resized, (x, y), logo_resized)
    
    if path.lower().endswith(".jpg"):
        out = out.convert("RGB")
        out.save(path, quality=90)
    else:
        out.save(path, "PNG")
    print(f"Applied back logo to {filename}")

