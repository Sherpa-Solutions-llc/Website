import os
os.environ.pop('SSLKEYLOGFILE', None)
import numpy as np
from PIL import Image

def remove_logo(img_path):
    img = Image.open(img_path).convert("RGB")
    arr = np.array(img, dtype=np.float32)
    
    # We look for Sherpa Orange and Sherpa Green
    # Sherpa Orange: R ~ 220, G ~ 130, B ~ 30
    dist_orange = np.sqrt((arr[...,0]-220)**2 + (arr[...,1]-130)**2 + (arr[...,2]-30)**2)
    
    # Sherpa Green (was brightened in apply_logo_patch maybe): R~130, G~170, B~130
    dist_green = np.sqrt((arr[...,0]-130)**2 + (arr[...,1]-170)**2 + (arr[...,2]-130)**2)
    
    mask = (dist_orange < 70) | (dist_green < 70)
    
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    
    if len(rows) > 0 and len(cols) > 0:
        top, bot = rows.min(), rows.max()
        left, right = cols.min(), cols.max()
        
        pad = 10
        top = max(0, top-pad)
        bot = min(arr.shape[0], bot+pad)
        left = max(0, left-pad)
        right = min(arr.shape[1], right+pad)
        
        # Create an interpolation / patch
        # Just sample the color from above the logo
        bg_col = np.median(arr[top-5:top, left:right], axis=(0,1))
        
        # Fill the box with the background color
        box_h = bot - top
        box_w = right - left
        
        # We only want to erase the "bag", not the white backdrop if it overlaps
        gray = 0.299*arr[top:bot, left:right, 0] + 0.587*arr[top:bot, left:right, 1] + 0.114*arr[top:bot, left:right, 2]
        is_bag = gray < 200 # Bag is black/dark grey
        
        noise = np.random.normal(0, 4, (box_h, box_w, 3))
        fill = bg_col + noise
        
        patch = arr[top:bot, left:right]
        # To avoid square blocks, we can just replace ONLY the pixels belonging to the logo + soft margin
        # But wait, the logo had a dark green alpha-blended shadow. A flat replace of the rect works perfectly if the bag is uniform.
        # Let's replace only pixels that differ from the bg_col by more than some amount.
        dist_bg = np.sqrt(np.sum((patch - bg_col)**2, axis=2))
        
        to_replace = (dist_bg > 15) & is_bag
        patch[to_replace] = fill[to_replace]
        
        arr[top:bot, left:right] = patch
        
        print(f"Removed logo from {img_path}")
        out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        out.save(img_path, quality=90)
    else:
        print(f"No logo found on {img_path}")

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
for i in range(2, 7):
    path = os.path.join(base, f"bp_pd_45l_{i}.jpg")
    if os.path.exists(path):
        remove_logo(path)
