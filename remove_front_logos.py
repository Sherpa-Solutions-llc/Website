import os
from PIL import Image
import numpy as np

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
front_images = [
    "bp_pd_30l_1.jpg",
    "bp_nomatic_bag_1.png",
    "bp_nomatic_pack_1.png"
]

def remove_logo_strict(img_path):
    orig_img = Image.open(img_path)
    orig_mode = orig_img.mode
    img = orig_img.convert("RGBA")
    img_rgb = img.convert("RGB")
    arr = np.array(img_rgb, dtype=np.float32)
    
    # Sherpa Orange
    dist_orange = np.sqrt((arr[...,0]-220)**2 + (arr[...,1]-130)**2 + (arr[...,2]-30)**2)
    # Sherpa Green
    dist_green = np.sqrt((arr[...,0]-130)**2 + (arr[...,1]-170)**2 + (arr[...,2]-130)**2)
    
    mask = (dist_orange < 70) | (dist_green < 70)
    
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    
    if len(rows) > 0 and len(cols) > 0:
        top, bot = rows.min(), rows.max()
        left, right = cols.min(), cols.max()
        
        pad = 12
        top = max(0, top-pad)
        bot = min(arr.shape[0], bot+pad)
        left = max(0, left-pad)
        right = min(arr.shape[1], right+pad)
        
        # Sample background from completely above the padding
        sample_top = max(0, top-10)
        if sample_top < top:
            bg_col = np.median(arr[sample_top:top, left:right], axis=(0,1))
        else:
            bg_col = np.array([30, 30, 30]) # fallback dark grey
            
        if np.isnan(bg_col).any():
            bg_col = np.array([30, 30, 30])
        
        box_h = bot - top
        box_w = right - left
        
        # Determine if pixel is part of the bag (dark) vs white background
        gray = 0.299*arr[top:bot, left:right, 0] + 0.587*arr[top:bot, left:right, 1] + 0.114*arr[top:bot, left:right, 2]
        is_bag = gray < 235
        
        noise = np.random.normal(0, 3, (box_h, box_w, 3))
        fill = bg_col + noise
        
        patch = arr[top:bot, left:right]
        dist_bg = np.sqrt(np.sum((patch - bg_col)**2, axis=2))
        
        to_replace = (dist_bg > 15) & is_bag
        patch[to_replace] = fill[to_replace]
        
        arr[top:bot, left:right] = patch
        
        print(f"Removed Front Logo from {img_path}")
        
        if orig_mode == "RGBA" or img_path.lower().endswith(".png"):
            arr_rgba = np.array(img, dtype=np.float32)
            arr_rgba[top:bot, left:right, :3] = patch
            out = Image.fromarray(np.clip(arr_rgba, 0, 255).astype(np.uint8))
        else:
            out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            
        out.save(img_path, quality=90)
    else:
        print(f"No Logo found on {img_path}")

for f in front_images:
    path = os.path.join(base, f)
    if os.path.exists(path):
        remove_logo_strict(path)
