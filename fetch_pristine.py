import os
import requests
import re
from io import BytesIO

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

def download_image(url, filename):
    print(f"Downloading {filename} from {url}...")
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 10000:
            with open(os.path.join(base, filename), 'wb') as f:
                f.write(resp.content)
            print(f"  Success: {filename}")
        else:
            print(f"  Failed: Bad status ({resp.status_code}) or file too small.")
    except Exception as e:
        print(f"  Failed: {e}")

# 1. Peak Design 30L (Using the known Shopify gallery structure)
print("\n--- Peak Design 30L ---")
url_30l = 'https://www.peakdesign.com/products/travel-backpack?Size=30L&Color=Black'
html_30l = requests.get(url_30l, headers={'User-Agent': 'Mozilla/5.0'}).text
matches_30l = list(set(re.findall(r'https://cdn\.shopify\.com/s/files/[^\s\"\'\?]+\.jpg', html_30l)))

# We need the main and 5 alternates for 30L
pd_30l_count = 1
for m in matches_30l:
    if 'BTR-30-BK' in m:
        # Avoid lower res dupes
        if '250x250' in m or '100x100' in m or '600x600' in m:
            continue
        download_image(m, f"bp_pd_30l_{pd_30l_count}.jpg")
        pd_30l_count += 1
        if pd_30l_count > 6:
            break

# 2. Nomatic Travel Pack (Using known URLs from scrape_gallery2.py trace)
print("\n--- Nomatic Travel Pack ---")
url_nomatic_pack = 'https://www.nomatic.com/products/the-nomatic-travel-pack'
html_nomatic_pack = requests.get(url_nomatic_pack, headers={'User-Agent': 'Mozilla/5.0'}).text
matches_nomatic_pack = list(set(re.findall(r'https?://[^\s\"\'\?]+\.png|https?://[^\s\"\'\?]+\.jpg', html_nomatic_pack)))

pack_count = 1
for m in matches_nomatic_pack:
    if 'TravelPack' in m or 'TRPK' in m:
        if '100x' in m or '200x' in m or '300x' in m:
            continue
        ext = "png" if ".png" in m else "jpg"
        download_image(m, f"bp_nomatic_pack_{pack_count}.{ext}")
        pack_count += 1
        if pack_count > 6:
            break

# 3. Nomatic Travel Bag
print("\n--- Nomatic Travel Bag ---")
url_nomatic_bag = 'https://www.nomatic.com/products/nomatic-travel-bag'
html_nomatic_bag = requests.get(url_nomatic_bag, headers={'User-Agent': 'Mozilla/5.0'}).text
matches_nomatic_bag = list(set(re.findall(r'https?://[^\s\"\'\?]+\.png|https?://[^\s\"\'\?]+\.jpg', html_nomatic_bag)))

bag_count = 1
for m in matches_nomatic_bag:
    if 'TravelBag' in m or 'TRBG' in m or 'CARO40' in m:
        if '100x' in m or '200x' in m or '300x' in m or 'x280' in m:
            continue
        ext = "png" if ".png" in m else "jpg"
        download_image(m, f"bp_nomatic_bag_{bag_count}.{ext}")
        bag_count += 1
        if bag_count > 6:
            break

print("\nDone downloading fresh images.")
