import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Smooth out the SVG path final segment to remove the self-overlapping loop.
old_bad_path = '<path id="ts-path" d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 800,300 C 950,300 900,250 950,200"'
new_smooth_path = '<path id="ts-path" d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 800,300 C 850,300 930,250 950,200"'
html = html.replace(old_bad_path, new_smooth_path)

# 2. Update the JS fractions array to properly space out the 8 nodes across the new clean path length
old_fracs = 'const fractions = [0, 0.15, 0.28, 0.42, 0.55, 0.68, 0.82, 1.0];'
new_fracs = 'const fractions = [0, 0.13, 0.26, 0.41, 0.55, 0.70, 0.85, 1.0];'
html = html.replace(old_fracs, new_fracs)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)
print("Corrected path curve and fractions.")
