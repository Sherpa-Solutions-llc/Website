import os
from PIL import Image
import numpy as np

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
inp = os.path.join(base, "sherpa_logo_clean.png")
out = os.path.join(base, "sherpa_logo_true_color.png")

img = Image.open(inp).convert("RGBA")
data = np.array(img).astype(np.float32)

r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]

def recolor(r, g, b, factor=1.0):
    lum = (r + g + b) / 3.0
    new_r = np.clip(lum * 1.5 * factor, 0, 255)
    new_g = np.clip(lum * 1.0 * factor, 0, 255)
    new_b = np.clip(lum * 0.3 * factor, 0, 255)
    return new_r, new_g, new_b

h, w = r.shape
y_indices, x_indices = np.indices((h, w))

# 1. SHERPA text (y: 235 to 325 approx)
sherpa_mask = (y_indices >= 235) & (y_indices <= 325) & (a > 50)
new_r, new_g, new_b = recolor(r, g, b)
r[sherpa_mask] = new_r[sherpa_mask]
g[sherpa_mask] = new_g[sherpa_mask]
b[sherpa_mask] = new_b[sherpa_mask]

# 2. Right Snow (x: 270 to 380, y: 110 to 210)
snow_mask = (x_indices >= 270) & (x_indices <= 380) & (y_indices >= 110) & (y_indices <= 210)
is_white = (a > 50) & (r > 150) & (g > 150) & (b > 150) & ((np.maximum(r, np.maximum(g, b)) - np.minimum(r, np.minimum(g, b))) < 30)
snow_target = snow_mask & is_white
new_r_s, new_g_s, new_b_s = recolor(r, g, b, factor=1.2)
r[snow_target] = new_r_s[snow_target]
g[snow_target] = new_g_s[snow_target]
b[snow_target] = new_b_s[snow_target]

new_data = np.stack([r, g, b, a], axis=-1).astype(np.uint8)
new_img = Image.fromarray(new_data)
new_img.save(out)
print("Color corrected logo saved.")
