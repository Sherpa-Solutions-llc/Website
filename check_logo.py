import os
from PIL import Image
import numpy as np

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
logo_path = os.path.join(base, "sherpa_logo.png")
logo = Image.open(logo_path).convert("RGBA")

# Let's sample colors in the bottom half where "SHERPA" text usually is.
# The logo is 110.7 KB, probably fairly large.
w, h = logo.size
print(f"Logo size: {w}x{h}")

# Sample some non-transparent pixels in the lower middle
patch = logo.crop((int(w*0.3), int(h*0.7), int(w*0.7), int(h*0.9)))
data = np.array(patch)

r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
mask = (a > 100) & ((r < 200) | (g < 200) | (b < 200)) # not background
valid_r = r[mask]
valid_g = g[mask]
valid_b = b[mask]

if len(valid_r) > 0:
    print(f"Mean R: {np.mean(valid_r):.1f}")
    print(f"Mean G: {np.mean(valid_g):.1f}")
    print(f"Mean B: {np.mean(valid_b):.1f}")
else:
    print("No valid pixels found in crop.")
