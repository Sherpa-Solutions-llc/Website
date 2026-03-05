import os
import cv2
import numpy as np
from PIL import Image

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

def wipe_white_text(img_path):
    if not os.path.exists(img_path): return
    print(f"Wiping text from {img_path}")
    
    img = cv2.imread(img_path)
    if img is None: return
    
    # "NOMATIC" text is typically bright white/light gray
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Threshold for bright white pixels
    _, mask = cv2.threshold(gray, 220, 255, cv2.THRESH_BINARY)
    
    # The background is white too! So we only want to target white pixels INSIDE the bag (where surroundings are dark).
    # Create a mask of the bag itself by thresholding the dark areas
    _, bag_mask = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    
    # We want white pixels that are surrounded by bag pixels.
    # Actually, a simpler way: find the bounding box of the bag, then only look at the top/center where the logo is.
    # Let's just use the `bag_mask` we created. The bag is dark. The actual white background is not dark.
    # Let's dilate the bag mask slightly to ensure it covers the text.
    kernel = np.ones((5,5), np.uint8)
    bag_mask_dilated = cv2.dilate(bag_mask, kernel, iterations=3)
    
    # Combine masks: white pixels AND inside the dilated bag mask
    text_mask = cv2.bitwise_and(mask, bag_mask_dilated)
    
    # Filter out small noise
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(text_mask, connectivity=8)
    filtered_mask = np.zeros_like(text_mask)
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        # Text characters are usually small but not tiny blocks.
        if 5 < area < 1000:
            filtered_mask[labels == i] = 255
            
    # Dilate the text mask a bit for inpainting
    filtered_mask = cv2.dilate(filtered_mask, np.ones((3,3), np.uint8), iterations=1)
    
    # Inpaint
    result = cv2.inpaint(img, filtered_mask, 3, cv2.INPAINT_TELEA)
    
    cv2.imwrite(img_path, result)
    print("Cleaned.")

# We run this on Nomatic images that aren't the back
for i in range(1, 7):
    # For Nomatic Bag, 2 is the back.
    if i != 2:
        wipe_white_text(os.path.join(base, f"bp_nomatic_bag_{i}.jpg"))
        wipe_white_text(os.path.join(base, f"bp_nomatic_bag_{i}.png"))
        
    # For Nomatic Pack, 6 is the back.
    if i != 6:
        wipe_white_text(os.path.join(base, f"bp_nomatic_pack_{i}.png"))
        wipe_white_text(os.path.join(base, f"bp_nomatic_pack_{i}.jpg"))
