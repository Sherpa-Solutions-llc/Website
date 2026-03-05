import os
os.environ.pop('SSLKEYLOGFILE', None)
import httpx
import re

url = "https://www.peakdesign.com/products/travel-backpack?Size=45L&Color=Black"
headers = {"User-Agent": "Mozilla/5.0"}
html = httpx.get(url, headers=headers).text

# Find shopify URLs
urls = re.findall(r'"(https://cdn\.shopify\.com[^"]+?\.jpg)"', html)
btr = set()
for u in urls:
    if 'BTR-45-BK' in u:
        btr.add(u)
        
print("BTR count:", len(btr))
for b in sorted(list(btr))[:10]:
    print(b)
