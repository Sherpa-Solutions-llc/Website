import os
os.environ.pop('SSLKEYLOGFILE', None)
import httpx

urls = [
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_2.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_3.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_4.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_5.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_6.jpg",
    "https://cdn.shopify.com/s/files/1/2986/1172/products/BTR-45-BK-1_BTR-45-BK-1-p_ecomm_7.jpg",
]

base_dir = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
count = 2
for url in urls:
    try:
        resp = httpx.get(url)
        if resp.status_code == 200 and len(resp.content) > 10000:
            out_path = os.path.join(base_dir, f"bp_pd_45l_{count}.jpg")
            with open(out_path, "wb") as f:
                f.write(resp.content)
            print(f"Saved {out_path} from {url}")
            count += 1
            if count > 6:
                break
        else:
            print(f"Failed {url}: {resp.status_code}")
    except Exception as e:
        print(f"Err {url}: {e}")
