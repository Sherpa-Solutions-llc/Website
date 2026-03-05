import os; os.environ.pop('SSLKEYLOGFILE', None)
import re, requests

def rip_nomatic(url, out_prefix):
    print('Ripping', url)
    html = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}).text
    
    # Nomatic stores images on a generic shopify cdn or their own domain
    matches = set(re.findall(r'https?://[^\s\"\'\?]+\.jpg', html))
    matches.update(set(re.findall(r'https?://[^\s\"\'\?]+\.png', html)))
    
    count = 1
    base = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions'
    for m in matches:
        if 'nomatic.com' in m or 'cdn.shopify' in m:
            if '1024' not in m and 'width=1200' not in m and len(m)>50 and 'TRPK' in m or 'CARO' in m or 'travel' in m.lower():
                print('Found alt', m)
                try:
                    img = requests.get(m).content
                    if len(img) > 20000:
                        out = os.path.join(base, f'{out_prefix}_alt_{count}.png')
                        with open(out, 'wb') as f:
                            f.write(img)
                        count += 1
                        if count > 3: break
                except: pass

rip_nomatic('https://www.nomatic.com/products/the-nomatic-travel-pack', 'merch_nomatic_pack')
rip_nomatic('https://www.nomatic.com/products/nomatic-travel-bag', 'merch_nomatic_bag')
