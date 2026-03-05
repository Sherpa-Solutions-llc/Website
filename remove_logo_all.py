import os
import glob
os.environ.pop('SSLKEYLOGFILE', None)
import numpy as np
from PIL import Image

def remove_logo(img_path):
    orig_img = Image.open(img_path)
    orig_mode = orig_img.mode
    img = orig_img.convert("RGBA")
    # We will use RGBA if it's PNG, but wait, the logic uses RGB
    img_rgb = img.convert("RGB")
    arr = np.array(img_rgb, dtype=np.float32)
    
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
        sample_top = max(0, top-5)
        if sample_top < top:
            bg_col = np.median(arr[sample_top:top, left:right], axis=(0,1))
        else:
            bg_col = np.median(arr[top:bot, left:right], axis=(0,1))
            
        if np.isnan(bg_col).any():
            bg_col = np.array([50, 50, 50])
        
        # Fill the box with the background color
        box_h = bot - top
        box_w = right - left
        
        # We only want to erase the "bag", not the white backdrop if it overlaps
        gray = 0.299*arr[top:bot, left:right, 0] + 0.587*arr[top:bot, left:right, 1] + 0.114*arr[top:bot, left:right, 2]
        is_bag = gray < 230 # Bag is usually darker than pure white background
        
        noise = np.random.normal(0, 4, (box_h, box_w, 3))
        fill = bg_col + noise
        
        patch = arr[top:bot, left:right]
        # Let's replace only pixels that differ from the bg_col by more than some amount.
        dist_bg = np.sqrt(np.sum((patch - bg_col)**2, axis=2))
        
        to_replace = (dist_bg > 15) & is_bag
        patch[to_replace] = fill[to_replace]
        
        arr[top:bot, left:right] = patch
        
        print(f"Removed logo from {img_path}")
        
        # Re-apply to original image (especially if it was RGBA)
        if orig_mode == "RGBA" or img_path.lower().endswith(".png"):
            arr_rgba = np.array(img, dtype=np.float32)
            arr_rgba[top:bot, left:right, :3] = patch
            out = Image.fromarray(np.clip(arr_rgba, 0, 255).astype(np.uint8))
        else:
            out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            
        out.save(img_path, quality=90)
    else:
        print(f"No logo found on {img_path}")

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
prefixes = [
    "bp_pd_30l_",
    "bp_nomatic_bag_",
    "bp_nomatic_pack_"
]

for prefix in prefixes:
    files = glob.glob(os.path.join(base, f"{prefix}*"))
    for file in files:
        basename = os.path.basename(file)
        # Exclude the primary images which must remain branded
        if basename.endswith("_1.jpg") or basename.endswith("_1.png"):
            continue
        print(f"Processing {basename}...")
        remove_logo(file)

