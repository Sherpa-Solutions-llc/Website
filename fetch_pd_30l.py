import os
import requests

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

urls = [
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_1.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_2.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_3.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_4.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_5.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-30-BK-1_BTR-30-BK-1-p_ecomm_6.jpg",
]

count = 1
for url in urls:
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        if resp.status_code == 200 and len(resp.content) > 10000:
            out_path = os.path.join(base, f"bp_pd_30l_{count}.jpg")
            with open(out_path, "wb") as f:
                f.write(resp.content)
            print(f"Saved {out_path} from {url}")
            count += 1
        else:
            print(f"Failed {url}: {resp.status_code}")
    except Exception as e:
        print(f"Err {url}: {e}")
