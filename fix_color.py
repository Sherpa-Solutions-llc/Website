import os
import cv2
import numpy as np
from PIL import Image

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
inp = os.path.join(base, "sherpa_logo_clean.png")
out = os.path.join(base, "sherpa_logo_true_color.png")

img = cv2.imread(inp, cv2.IMREAD_UNCHANGED)
h, w, c = img.shape

# Orange color in BGR is (42, 154, 212)
# Orange color in BGR with thread shadowing: let's multiply existing luminance by a base orange.
# Actually, just hue-shifting the green to orange is perfect!
# Green is ~60-80 hue. Orange is ~15-30.

hsv = cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2HSV)
hue, sat, val = cv2.split(hsv)

# Bounding box for SHERPA + Thread
# SHERPA is roughly 65% to 85% of height
# Right snow is roughly 25% to 55% height, 60% to 90% width
orange_mask = np.zeros((h, w), dtype=np.uint8)

# 1. We want to convert ALL pixels of the word SHERPA and thread to orange.
# Find the exact Y values of SHERPA by projecting alpha
alpha = img[:,:,3]
y_proj = np.sum(alpha, axis=1)
# we can find the peaks in Y projection
# The huge peak at the bottom is SHERPA. The peak below it is SOLUTIONS LLC.
# Let's just heuristically use y bounds: 260 to 325 (out of 376)
orange_mask[245:320, :] = 255 # Give a safe margin.

# 2. Right snow. We want to convert the white pixels to orange here.
# Snow is roughly x=280 to 390, y=100 to 200
# But wait, the thread of SHERPA might be green, the text is green.
# For the right snow, we want to change white to orange.
# White has low saturation, high value.
right_snow_mask = np.zeros((h, w), dtype=np.uint8)
right_snow_mask[110:210, 270:380] = 255
# Only select pixels that are white-ish
white_pixels = (sat < 50) & (val > 150) & (alpha > 50)

# Apply shift
# For SHERPA (green text), we change the hue to 15 (orange) and boost sat
is_sherpa = (orange_mask > 0) & (alpha > 50)
hue[is_sherpa] = 18  # Orange hue in OpenCV (0-179)
sat[is_sherpa] = np.clip(sat[is_sherpa].astype(int) + 50, 0, 255).astype(np.uint8)

# For right snow (white), we need to add color
is_snow = (right_snow_mask > 0) & white_pixels
hue[is_snow] = 18
sat[is_snow] = 200
val[is_snow] = np.clip(val[is_snow].astype(int) - 20, 0, 255).astype(np.uint8) # slight darkening to match thread

hsv_new = cv2.merge([hue, sat, val])
bgr_new = cv2.cvtColor(hsv_new, cv2.COLOR_HSV2BGR)

img_new = np.dstack((bgr_new, alpha))
cv2.imwrite(out, img_new)
print("Color corrected logo saved.")
