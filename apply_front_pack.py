import os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import numpy as np

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

target_img = os.path.join(base, 'bp_nomatic_pack_1.png')

logo_path = os.path.join(base, 'sherpa_logo.png')
logo = Image.open(logo_path).convert("RGBA")

data = np.array(logo)
r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
white_mask = (r > 220) & (g > 220) & (b > 220)
data[white_mask, 3] = 0
logo_clean = Image.fromarray(data)

# Load the background image
bg_pil = Image.open(target_img).convert("RGBA")

# We want white pixels that are surrounded by bag pixels.
# Let's just paint a box over the NOMATIC text to be safe, using the dark color
draw = ImageDraw.Draw(bg_pil)
# The text is near the bottom, let's sample a dark color near it
dark_color = (25, 25, 25, 255) # approximate dark gray of the bag
# The bottom text is roughly in this area (we can just apply the logo and see)
# draw.rectangle([150, 400, 350, 480], fill=dark_color) # Too risky to guess coordinates precisely

# Now apply the logo to the center of the upper panel
scale = 0.35
x_rat = 0.40  # It's an angle shot, so center of the panel is a bit to the left
y_rat = 0.45  # Upper half, roughly middle of the large section

logo_w = int(bg_pil.width * scale)
aspect = logo_clean.height / logo_clean.width
logo_h = int(logo_w * aspect)
resized_logo = logo_clean.resize((logo_w, logo_h), Image.Resampling.LANCZOS)

# Rotate slightly to match the angle of the bag
resized_logo = resized_logo.rotate(3, resample=Image.Resampling.BICUBIC, expand=True)

shadow = Image.new("RGBA", resized_logo.size, (0,0,0,0))
shadow_data = np.array(resized_logo)
shadow_alpha = shadow_data[:,:,3]
shadow_arr = np.zeros_like(shadow_data)
shadow_arr[:,:,3] = shadow_alpha * 0.8
shadow_img = Image.fromarray(shadow_arr).filter(ImageFilter.GaussianBlur(1.5))

x = int((bg_pil.width * x_rat) - (resized_logo.width / 2))
y = int((bg_pil.height * y_rat) - (resized_logo.height / 2))

patch = bg_pil.crop((x, y, x + resized_logo.width, y + resized_logo.height)).convert("L")
patch_gray = ImageEnhance.Contrast(patch).enhance(1.5)

l_arr = np.array(resized_logo).astype(np.float32)
p_arr = np.array(patch_gray).astype(np.float32) / 255.0

# Blend
for c in range(3):
    l_arr[:,:,c] = np.clip(l_arr[:,:,c] * (p_arr * 0.4 + 0.6), 0, 255)
    
blended_logo = Image.fromarray(l_arr.astype(np.uint8))

out = bg_pil.copy()
out.paste(shadow_img, (x + 2, y + 2), shadow_img)
out.paste(blended_logo, (x, y), blended_logo)

# Convert back to regular format to save
out.save(target_img, "PNG")
print(f"Successfully applied to {target_img}")
