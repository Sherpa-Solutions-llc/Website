import os
import requests

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

urls = {
    "bp_pd_30l_1.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg?v=1762275781&width=2048",
    "bp_pd_30l_2.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-3_32276b62-97f0-49df-a735-ff6a98f17029.jpg?v=1726875418&width=2048",
    "bp_pd_30l_3.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-2_a2e7f7f7-8159-47b8-a216-730bcf386960.jpg?v=1726875418&width=2048",
    "bp_pd_30l_4.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-7_2d48d185-1842-4d3c-be72-f5e06132e884.jpg?v=1747071851&width=2048",
    "bp_pd_30l_5.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-5_0750528e-695b-4fcb-a988-33108c89e888.jpg?v=1747071851&width=2048",
    "bp_pd_30l_6.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-6_f6657b18-a4b3-405f-8767-8c148aa5b297.jpg?v=1747071851&width=2048"
}

for name, url in urls.items():
    print(f"Downloading {name}...")
    try:
        resp = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        if resp.status_code == 200:
            with open(os.path.join(base, name), "wb") as f:
                f.write(resp.content)
            print(f"Saved {name}")
        else:
            print(f"Failed {name}: {resp.status_code}")
    except Exception as e:
        print(f"Err {name}: {e}")
