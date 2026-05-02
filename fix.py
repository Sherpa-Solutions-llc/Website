import os
from duckduckgo_search import DDGS
import requests

def fix_image():
    results = DDGS().images('Peak Design Travel Backpack 30L Black', max_results=5)
    base = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions\\'
    for res in results:
        img_url = res['image']
        try:
            print(f'Downloading {img_url}')
            img_data = requests.get(img_url, timeout=5).content
            if len(img_data) > 20000:
                out = os.path.join(base, 'bp_pd_30l_2.jpg')
                with open(out, 'wb') as f:
                    f.write(img_data)
                print(f'Restored bp_pd_30l_2.jpg')
                break
        except Exception as e:
            print(f"Failed {img_url}: {e}")

fix_image()
