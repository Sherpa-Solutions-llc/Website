import os
import re

cache_dir = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions\__pycache__"
for f in os.listdir(cache_dir):
    if f.endswith('.pyc'):
        with open(os.path.join(cache_dir, f), 'rb') as fp:
            data = fp.read()
        urls = re.findall(b'https://cdn.shopify.com/s/files/[^\s]+?\\.jpg', data)
        for u in urls:
            try:
                print(u.decode('utf-8'))
            except:
                pass
