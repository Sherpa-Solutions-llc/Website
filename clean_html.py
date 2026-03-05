import os
import re

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
html_files = [
    "backpack_pd_30l.html",
    "backpack_pd_45l.html",
    "backpack_nomatic_bag.html",
    "backpack_nomatic_pack.html"
]

for filename in html_files:
    path = os.path.join(base, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Append a cache buster parameter to all .png and .jpg image sources in the static folder
    import time
    buster = f"?v={int(time.time())}"
    
    # We want to replace .png" with .png?v=..."
    content = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
        
    print(f"Added cache-busters to {filename}")
