filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\merch_shirts.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

old = (
    '<h3 class="product-title" data-cms="merch-title-3">Summit Powerbank</h3>\n'
    '<p class="product-price" data-cms="merch-price-3">$45.00</p>\n'
    '<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'
)

new = (
    '<h3 class="product-title" data-cms="merch-title-3">Summit Powerbank</h3>\n'
    '<p class="product-price" id="powerbank-price">$55.00</p>\n'
    '<div style="margin: 1rem 0; display: flex; gap: 0.5rem; justify-content: center;">\n'
    '<select id="powerbank-mah" '
    'style="padding: 0.5rem; border-radius: 4px; border: 1px solid #ccc; background: white; flex: 1; font-family: inherit;" '
    'onchange="document.getElementById(\'powerbank-price\').textContent = this.value === \'200000\' ? \'$75.00\' : \'$55.00\';">\n'
    '<option value="100000">100,000 mAh — $55</option>\n'
    '<option value="200000">200,000 mAh — $75</option>\n'
    '</select>\n'
    '</div>\n'
    '<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'
)

if old in html:
    html = html.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Success: powerbank options added.")
else:
    print("WARNING: Could not find target block. Searching context...")
    idx = html.find('Summit Powerbank')
    print(repr(html[idx:idx+400]))
