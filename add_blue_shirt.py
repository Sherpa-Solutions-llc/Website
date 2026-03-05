import re, time

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\merch_shirts.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# --- Replace the shirt product card ---
# Find and replace the static color dropdown (only White) with a dynamic one (White + Blue)
# and add id to the img and onchange handler

# 1. Give the shirt image an ID
html = html.replace(
    'alt="White Button-Up Shirt" src="/static/merch_shirt_button_user.png?v=1772648820" style="object-fit: cover; aspect-ratio: 1;"',
    'id="shirt-color-img" alt="White Button-Up Shirt" src="/static/merch_shirt_button_user.png?v=1772648820" style="object-fit: contain;"'
)

# 2. Replace the static single-option color dropdown with an interactive one
old_color_select = '<select style="padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; background: white;"><option>White</option></select>'
new_color_select = (
    '<select id="shirt-color-select" '
    'style="padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; background: white;" '
    'onchange="'
    "var img=document.getElementById('shirt-color-img');"
    "if(this.value==='Blue'){"
    "img.src='/static/merch_shirt_button_blue.png';"
    "img.alt='Blue Button-Up Shirt';"
    "}else{"
    "img.src='/static/merch_shirt_button_user.png?v=1772648820';"
    "img.alt='White Button-Up Shirt';"
    '}">'
    '<option value="White">White</option>'
    '<option value="Blue">Blue</option>'
    '</select>'
)
html = html.replace(old_color_select, new_color_select)

# 3. Update title
html = html.replace(
    '<h3 class="product-title">White Button-Up Shirt</h3>',
    '<h3 class="product-title">Corporate Button-Up Shirt</h3>'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)

print("Done. Patched merch_shirts.html with Blue color option.")
