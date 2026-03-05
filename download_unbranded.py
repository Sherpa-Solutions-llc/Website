import os
os.environ.pop('SSLKEYLOGFILE', None)
import httpx
from PIL import Image
from io import BytesIO

base = r"C:\Users\choos\Documents\Antigravity\sherpa_solutions"

urls = {
    "bp_pd_45l_2.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-2.jpg?v=1726156534&width=2000",
    "bp_pd_45l_3.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-3.jpg?v=1726156534&width=2000",
    "bp_pd_45l_4.jpg": "https://shuttermuse.com/wp-content/uploads/2018/08/peak-design-travel-backpack-review.jpg",
    "bp_pd_45l_5.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-45-6.jpg?v=1726156534&width=2000",
    "bp_pd_45l_6.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/bags-travel-backpack45L-black-MoS-PD_Final_Selects_High_Res_26_1.jpg?v=1727484968&width=2000"
}

for name, url in urls.items():
    print(f"Downloading {name} from {url}")
    try:
        resp = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15.0)
        img = Image.open(BytesIO(resp.content))
        # Ensure it fits into a clean square if needed, or just save it
        img = img.convert("RGB")
        img.save(os.path.join(base, name), quality=85)
        print(f"Saved {name}")
    except Exception as e:
        print(f"Failed {name}: {e}")
