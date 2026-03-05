import os
import requests
import re
import urllib.parse

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

def search_bing_images(query):
    url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    html = requests.get(url, headers=headers).text
    
    # Bing stores image URLs in m="{murl: '...'}"
    urls = re.findall(r'murl&quot;:&quot;(http[^&]+(?:jpg|png))&quot;', html)
    if not urls:
        urls = re.findall(r'murl":"(http[^"]+(?:jpg|png))"', html)
        
    count = 1
    for u in urls:
        if 'peak' in u.lower() or 'design' in u.lower() or '30l' in u.lower() or 'backpack' in u.lower() or 'btr-30' in u.lower():
            try:
                print(f"Downloading {u}")
                r = requests.get(u, headers=headers, timeout=5)
                if r.status_code == 200 and len(r.content) > 15000:
                    with open(os.path.join(base, f"bp_pd_30l_{count}.jpg"), "wb") as f:
                        f.write(r.content)
                    count += 1
                    if count > 6:
                        break
            except Exception as e:
                print(f"Failed: {e}")

search_bing_images("Peak Design Travel Backpack 30L Black site:bhphotovideo.com OR site:peakdesign.com")
