import os
import re
import time

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'

targets = {
    "backpack_pd_45l.html": [
        (r'/static/bp_pd_45l_1\.jpg(\?v=\d+)?', '/static/thumb_pro_pd45.jpg')
    ],
    "backpack_pd_30l.html": [
        (r'/static/bp_pd_30l_1\.jpg(\?v=\d+)?', '/static/thumb_pro_pd30.jpg')
    ],
    "backpack_nomatic_bag.html": [
        (r'/static/bp_nomatic_bag_1\.png(\?v=\d+)?', '/static/thumb_pro_nbag.png')
    ],
    # Nomatic pack is already correct: /static/bp_nomatic_pack_1_user.jpg
}

buster = f"?v={int(time.time())}"

for filename, replacements in targets.items():
    filepath = os.path.join(base, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    for old_regex, new_val in replacements:
        # replace the old path with the new path
        html = re.sub(old_regex, new_val, html)
        
    # Apply global cache buster to the newly inserted images
    html = html.replace('/static/thumb_pro_pd45.jpg', f'/static/thumb_pro_pd45.jpg{buster}')
    html = html.replace('/static/thumb_pro_pd30.jpg', f'/static/thumb_pro_pd30.jpg{buster}')
    html = html.replace('/static/thumb_pro_nbag.png', f'/static/thumb_pro_nbag.png{buster}')
    # Make sure we don't accidentally double-bust if the string was replaced twice in the same exact spot (due to the way replace works on the whole file, it's fine)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"Updated {filename}")
    
print("Successfully synced all individual product pages with professional thumbnails.")
