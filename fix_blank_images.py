import os
import requests

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

# Fix the Nomatic Bag images (1 and 6 were blank)
# Replacing 1 with Main Front
url_bag_1 = "https://www.nomatic.com/cdn/shop/files/CARO40-01-MainAccess-1_grande.jpg"
print("Fetching Nomatic Bag 1...")
r = requests.get(url_bag_1, headers={'User-Agent': 'Mozilla/5.0'})
if r.status_code == 200:
    with open(os.path.join(base, "bp_nomatic_bag_1.jpg"), "wb") as f:
        f.write(r.content)

# Replacing 6 with Angle Back (if 2 wasn't the back)
# Wait, the subagent said Photo 2 was the back for the Nomatic Bag. So 6 can be an interior view.
url_bag_6 = "https://cdn.shopify.com/s/files/1/0745/1299/products/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png"
print("Fetching Nomatic Bag 6...")
r = requests.get(url_bag_6, headers={'User-Agent': 'Mozilla/5.0'})
if r.status_code == 200:
    with open(os.path.join(base, "bp_nomatic_bag_6.png"), "wb") as f:
        f.write(r.content)
