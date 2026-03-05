import os
import requests
import re
import urllib.parse

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

def fetch_ddg():
    url = "https://html.duckduckgo.com/html/?q=Peak+Design+Travel+Backpack+30L+Black+images"
    html = requests.get(url, headers=headers).text
    
    # In DDG HTML, the links sometimes point to image sources via duckduckgo redirect or direct. 
    # Actually, html.duckduckgo.com doesn't do image search well. Let's try Qwant or Yahoo.
    
    url = "https://images.search.yahoo.com/search/images?p=Peak+Design+Travel+Backpack+30L+Black"
    html = requests.get(url, headers=headers).text
    
    urls = set(re.findall(r'imgurl=&quot;(http[^&]+)&quot;', html))
    
    count = 1
    for u in urls:
        if ('30l' in u.lower() or 'peak' in u.lower()) and ('jpg' in u.lower() or 'png' in u.lower()):
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

fetch_ddg()
