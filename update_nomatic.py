import os
import re
import time

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
html_file = os.path.join(base, 'backpack_nomatic_pack.html')

with open(html_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the image filenames
content = content.replace("bp_nomatic_pack_1.png", "bp_nomatic_pack_1_user.jpg")
content = content.replace("bp_nomatic_pack_5.jpg", "bp_nomatic_pack_5_user.jpg")

# Update cache buster
buster = f"?v={int(time.time())}"
content = re.sub(r'(\.png|\.jpg)(\?v=\d+)?"', r'\1' + buster + '"', content)

with open(html_file, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated backpack_nomatic_pack.html with user images.")
