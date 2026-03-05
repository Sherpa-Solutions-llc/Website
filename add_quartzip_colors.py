filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\merch_shirts.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Add id to the quarter-zip image
html = html.replace(
    'alt="Sherpa Basecamp Quarter-Zip" data-cms="merch-img-2" src="/static/merch_pullover_pro.png?v=1772650922"',
    'id="quartzip-color-img" alt="Sherpa Basecamp Quarter-Zip" data-cms="merch-img-2" src="/static/merch_pullover_pro.png?v=1772650922"'
)

# 2. Add onchange to the color select (it already has Olive and Black options)
old_select = (
    '<select aria-label="Color" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: white; flex: 1; font-family: inherit; color: var(--text-dark);">\n'
    '<option disabled="" selected="" value="">Color</option>\n'
    '<option value="Olive">Olive Green</option>\n'
    '<option value="Black">Black</option>\n'
    '</select>'
)

onchange = (
    "var img=document.getElementById('quartzip-color-img');"
    "if(this.value==='Black'){"
    "img.src='/static/merch_pullover_black.png';"
    "img.alt='Black Basecamp Quarter-Zip';"
    "}else if(this.value==='Olive'){"
    "img.src='/static/merch_pullover_pro.png?v=1772650922';"
    "img.alt='Sherpa Basecamp Quarter-Zip';"
    "}"
)

new_select = (
    f'<select aria-label="Color" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: white; flex: 1; font-family: inherit; color: var(--text-dark);" onchange="{onchange}">\n'
    '<option disabled="" selected="" value="">Color</option>\n'
    '<option value="Olive">Olive Green</option>\n'
    '<option value="Black">Black</option>\n'
    '</select>'
)

if old_select in html:
    html = html.replace(old_select, new_select)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Success: quarter-zip color swap added.")
else:
    print("WARNING: Could not find color select block.")
    idx = html.find('aria-label="Color"')
    print(repr(html[max(0,idx-50):idx+300]))
