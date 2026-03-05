import os
from PIL import Image, ImageFilter, ImageChops, ImageEnhance
import rembg
import time
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

logo_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\media__1772649007664.jpg'
socks_path = r'C:\Users\choos\.gemini\antigravity\brain\05a8bca4-0d23-4ae3-8c39-cfb4dfdae1d1\sherpa_socks_embroidered_v2_1772649969563.png'

# 1. Extract logo with rembg
print("Running AI segmentation...")
with open(logo_path, "rb") as f:
    logo_data = rembg.remove(f.read())

logo = Image.open(__import__('io').BytesIO(logo_data)).convert("RGBA")

bbox = logo.getbbox()
if bbox:
    logo = logo.crop(bbox)

# 2. Scale 
socks = Image.open(socks_path).convert("RGBA")
logo_w = int(socks.width * 0.35)
logo_h = int(logo_w * (logo.height / logo.width))
logo_scaled = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# 3. Build a "stitch depth" effect using emboss on the alpha channel
alpha = logo_scaled.split()[3]
embossed_alpha = alpha.filter(ImageFilter.EMBOSS)
depth_layer = Image.merge("RGBA", [embossed_alpha, embossed_alpha, embossed_alpha, alpha])

# 4. Sample the sock fabric texture at the target region and apply soft overlay
def place_embroidered(socks_img, logo_img, cx_ratio, cy_ratio):
    """Composite logo on sock using multiply/screen layers to embed threadwork into fabric."""
    x = int(socks_img.width * cx_ratio) - (logo_img.width // 2)
    y = int(socks_img.height * cy_ratio) - (logo_img.height // 2)
    
    # Clamp to image bounds
    x = max(0, min(x, socks_img.width - logo_img.width))
    y = max(0, min(y, socks_img.height - logo_img.height))
    
    # Sample the specific sock fabric region under the logo
    patch = socks_img.crop((x, y, x + logo_img.width, y + logo_img.height)).convert("RGBA")
    
    # The logo's alpha mask (from rembg)
    mask = logo_img.split()[3]
    
    # Create a Multiply layer: logo * sock = darkens logo where sock is dark
    logo_rgb = logo_img.convert("RGB")
    sock_rgb = patch.convert("RGB")
    
    # Multiply blend — draws the fabric knit through the logo threads
    multiplied = ImageChops.multiply(logo_rgb, sock_rgb)
    
    # Re-combine with a softened Screen to recover the logo's brightness
    screened = ImageChops.screen(logo_rgb, sock_rgb)
    
    # Blend: use 70% original logo + 30% multiply for the stitching depth feel
    blended_rgb = Image.blend(logo_rgb, multiplied, 0.3)
    
    # Slightly darken the overall logo to simulate thread shadows
    blended_rgb = ImageEnhance.Brightness(blended_rgb).enhance(0.90)
    
    # Reduce color saturation very slightly so it "lives inside" the fabric 
    blended_rgb = ImageEnhance.Color(blended_rgb).enhance(0.85)
    
    # Convert back to RGBA with original alpha mask
    blended = blended_rgb.convert("RGBA")
    blended.putalpha(mask)
    
    # Paste the blended embroidery
    result = socks_img.copy()
    result.paste(blended, (x, y), mask)
    return result

# 5. Place on BOTH socks
# Left sock (viewer's left) — roughly at 30% across, 35% down 
socks = place_embroidered(socks, logo_scaled, 0.30, 0.35)

# Right sock — roughly at 70% across, 33% down
socks = place_embroidered(socks, logo_scaled, 0.70, 0.33)

# 6. Save
out_path = os.path.join(base, "merch_socks_pro.png")
socks.save(out_path, "PNG")
print("Saved embroidered socks.")

# 7. Update HTML
html_files = ["merch_shirts.html"]
buster = f"?v={int(time.time())}"

for filename in html_files:
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    html = re.sub(r'/static/merch_socks_pro\.png(\?v=\d+)?', f'/static/merch_socks_pro.png{buster}', html)
    html = re.sub(r'/static/merch_socks\.png(\?v=\d+)?', f'/static/merch_socks_pro.png{buster}', html)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Updated {filename}")

print("Done!")
