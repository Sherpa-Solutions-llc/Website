import os
from duckduckgo_search import DDGS
import requests

def save_alts(q, out_prefix):
    results = DDGS().images(q, max_results=4)
    base = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions\\'
    count = 1
    for res in results:
        img_url = res['image']
        try:
            print(f'Downloading {img_url}')
            img_data = requests.get(img_url, timeout=5).content
            if len(img_data) > 10000:
                out = os.path.join(base, f'{out_prefix}_alt_{count}.png')
                with open(out, 'wb') as f:
                    f.write(img_data)
                print(f'Saved {out}')
                count += 1
                if count > 3:
                    break
        except Exception as e:
            print(f"Failed {img_url}: {e}")

save_alts('Peak Design Travel Backpack 45L Black interior view OR side view', 'merch_pd_45l')
save_alts('Peak Design Travel Backpack 30L Black interior OR side', 'merch_pd_30l')
