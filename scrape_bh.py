import os
os.environ.pop('SSLKEYLOGFILE', None)
import httpx
import re

url = "https://www.bhphotovideo.com/c/product/1427138-REG/peak_design_btr_45_bk_1_travel_backpack_45l_black.html"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"}

try:
    html = httpx.get(url, headers=headers).text
    matches = re.findall(r'https://[^\"\']+\.jpg', html)
    valid = []
    for m in matches:
        if 'static.bhphoto.com/images' in m and 'images500' in m:
            valid.append(m)
            
    print("Found:")
    for v in set(valid):
        print(v)
except Exception as e:
    print(f"Failed: {e}")
