import os
import requests
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

downloads = {
    # Nomatic Travel Bag 40L
    "bp_nomatic_bag_2.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleBack.png", # REAR
    "bp_nomatic_bag_1.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_AngleFront.png",
    "bp_nomatic_bag_3.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Nomatic_Open.png",
    "bp_nomatic_bag_4.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Black_NOMATIC_OM_02.png",
    "bp_nomatic_bag_5.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Black_NOMATIC_OM_06.png",
    "bp_nomatic_bag_6.png": "https://www.nomatic.com/cdn/shop/files/TRBG40-BLK-02_TravelBag40L_Black_NOMATIC_OM_03.png",

    # Nomatic Travel Pack
    "bp_nomatic_pack_6.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleBack.png", # REAR
    "bp_nomatic_pack_1.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_Nomatic_AngleFront.png",
    "bp_nomatic_pack_2.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_NOMATIC_ecomm_35.png",
    "bp_nomatic_pack_3.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_NOMATIC_ecomm_37.png",
    "bp_nomatic_pack_4.png": "https://www.nomatic.com/cdn/shop/files/TRPK30-BLK-02_TravelPack20L_NOMATIC_ecomm_43.png",
    "bp_nomatic_pack_5.jpg": "https://www.nomatic.com/cdn/shop/files/Nomatic_TPPDP_14v20_Specs-Black_3.jpg",

    # Peak Design 30L
    "bp_pd_30l_2.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-3_32276b62-97f0-49df-a735-ff6a98f17029.jpg", # REAR (Updated URL to be sure)
    "bp_pd_30l_1.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-1_c0d79c48-01a6-4882-a48c-ffd3687365fb.jpg",
    "bp_pd_30l_3.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-2_a2e7f7f7-8159-47b8-a216-730bcf386960.jpg",
    "bp_pd_30l_4.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-5_0750528e-695b-4fcb-a988-33108c89e888.jpg",
    "bp_pd_30l_5.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-6_f6657b18-a4b3-405f-8767-8c148aa5b297.jpg",
    "bp_pd_30l_6.jpg": "https://cdn.shopify.com/s/files/1/2986/1172/files/travel-backpack-black-30-9_1290f0d7-260b-4c4f-956a-a54eb1d6fbac.jpg"
}

print("Downloading official images...")
for name, url in downloads.items():
    print(f"Fetching {name}...")
    try:
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=15)
        if r.status_code == 200:
            with open(os.path.join(base, name), "wb") as f:
                f.write(r.content)
            print(f"  Saved {name}")
        else:
            print(f"  Failed {name} (Status: {r.status_code})")
    except Exception as e:
        print(f"  Error {name}: {e}")
