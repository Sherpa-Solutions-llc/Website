import os
from PIL import Image, ImageEnhance, ImageFilter

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
logo_path = os.path.join(base, "sherpa_logo.png")

# Using the back-facing photos:
# We know the front images are 1 for Nomatic and 30L. Let's find the back ones.
# 30L: Wait, from previous analysis, bp_pd_30l_2 is back.
# Nomatic Bag: Photo 6 (or whatever is back now that we fetched fresh)
# Since we fetched fresh, the ordering might match whatever the URLs provided.
# Let's assume the ordering matches the old one for now, or we will visually check.
