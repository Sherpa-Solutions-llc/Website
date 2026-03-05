import os; os.environ.pop('SSLKEYLOGFILE', None)
import re, requests

def rip_gallery(url, out_prefix):
    print(f'Ripping {url}')
    html = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}).text
    matches = set(re.findall(r'https://cdn\.shopify\.com/s/files/[^\s\"\'\?]+\.jpg', html))
    
    count = 1
    base = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions'
    for m in matches:
        if ('BTR-45' in m if '45L' in url else 'BTR-30' in m):
            if '2500x2500' in m:
                # Skip the primary image we already grabbed
                if 'BTR-45-BK-1_1_2500x2500_c56fa2b8-7c85-4eb8-b2ba-afdbbc00def6' in m: continue
                if 'BTR-30-BK-1_1_2500x2500' in m: continue
                
                print(f'Found alternate {m}')
                img = requests.get(m).content
                if len(img) > 20000:
                    out = os.path.join(base, f'{out_prefix}_alt_{count}.png')
                    with open(out, 'wb') as f:
                        f.write(img)
                    count += 1
                    if count > 4: # Get up to 4 alternate angles
                        break

base = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions'
rip_gallery('https://www.peakdesign.com/products/travel-backpack?Size=45L&Color=Black', 'merch_pd_45l')
rip_gallery('https://www.peakdesign.com/products/travel-backpack?Size=30L&Color=Black', 'merch_pd_30l')
