import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\merch_shirts.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# ── 1. Add size dropdown to the Mountaineering Socks ──────────────────────
old_socks = '''<h3 class="product-title" data-cms="merch-title-5">Mountaineering Socks</h3>
<p class="product-price" data-cms="merch-price-5">$25.00</p>
<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'''

new_socks = '''<h3 class="product-title" data-cms="merch-title-5">Mountaineering Socks</h3>
<p class="product-price" data-cms="merch-price-5">$25.00</p>
<div style="margin: 1rem 0; display: flex; gap: 0.5rem; justify-content: center;">
<select aria-label="Size" style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; background: white; flex: 1; font-family: inherit;">
<option disabled="" selected="" value="">Size</option>
<option value="S">Small (6-8)</option>
<option value="M">Medium (8-10)</option>
<option value="L">Large (10-12)</option>
<option value="XL">X-Large (12-14)</option>
</select>
</div>
<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'''

html = html.replace(old_socks, new_socks)

# ── 2. Add quantity input before EVERY "Add to Cart" button ───────────────
# We add a small qty input row right before each Add to Cart link
qty_widget = '''<div style="margin: 0.5rem 0; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
<label style="font-size:0.85rem;color:#666;">Qty:</label>
<input type="number" class="qty-input" value="1" min="1" max="99" style="width:50px;padding:0.4rem;border:1px solid #ddd;border-radius:4px;text-align:center;font-family:inherit;">
</div>
'''

html = html.replace(
    '<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>',
    qty_widget + '<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'
)

# ── 3. Give each product-card an ID and wire Add to Cart buttons ──────────
# Product 1: Corporate Button-Up Shirt (line 38)
html = html.replace(
    '<div class="product-card">\n<div class="product-img"><img id="shirt-color-img"',
    '<div class="product-card" id="card-shirt">\n<div class="product-img"><img id="shirt-color-img"'
)

# Product 2: Basecamp Quarter-Zip (line 54)
html = html.replace(
    '<div class="product-card">\n<div class="product-img">\n<img id="quartzip-color-img"',
    '<div class="product-card" id="card-quartzip">\n<div class="product-img">\n<img id="quartzip-color-img"'
)

# Product 3: Summit Powerbank (line 79)
html = html.replace(
    '<!-- Product 3 -->\n<div class="product-card">\n<div class="product-img">\n<img alt="Sherpa Summit Powerbank"',
    '<!-- Product 3 -->\n<div class="product-card" id="card-powerbank">\n<div class="product-img">\n<img alt="Sherpa Summit Powerbank"'
)

# Product 4: Performance Polos (line 95)
html = html.replace(
    '<!-- Product 4 -->\n<div class="product-card">\n<div class="product-img">\n<img alt="Sherpa Performance Polos"',
    '<!-- Product 4 -->\n<div class="product-card" id="card-polos">\n<div class="product-img">\n<img alt="Sherpa Performance Polos"'
)

# Product 5: Socks (line 121)
html = html.replace(
    '<!-- Product 5 -->\n<div class="product-card">\n<div class="product-img">\n<img alt="Sherpa Mountaineering Socks"',
    '<!-- Product 5 -->\n<div class="product-card" id="card-socks">\n<div class="product-img">\n<img alt="Sherpa Mountaineering Socks"'
)

# ── 4. Replace all "Add to Cart" placeholder links with JS calls ──────────
# We need to map each button to its card. We'll use onclick with card IDs.
# Since there are exactly 5 buttons in order, we replace them sequentially.
products = [
    ("card-shirt", "Corporate Button-Up Shirt", 65, "/static/merch_shirt_button_user.png"),
    ("card-quartzip", "Basecamp Quarter-Zip", 85, "/static/merch_pullover_pro.png"),
    ("card-powerbank", "Summit Powerbank", 55, "/static/merch_powerbank_pro.png"),
    ("card-polos", "Performance Polos", 65, "/static/merch_shirt_polo_user.png"),
    ("card-socks", "Mountaineering Socks", 25, "/static/merch_socks_pro.png"),
]

old_btn = '<a class="btn btn-outline product-btn" href="#buy">Add to Cart</a>'
for card_id, name, price, img in products:
    # Replace one at a time (first occurrence)
    new_btn = f'<a class="btn btn-outline product-btn" href="javascript:void(0)" onclick="addToCart(\'{card_id}\',\'{name}\',{price},\'{img}\')">Add to Cart</a>'
    html = html.replace(old_btn, new_btn, 1)

# ── 5. Add cart FAB button, drawer, checkout modal, and cart.js ───────────
cart_html = '''
<!-- Cart FAB -->
<div id="cart-fab" onclick="openCart()" style="position:fixed;bottom:2rem;right:2rem;width:60px;height:60px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(192,108,59,0.4);z-index:999;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
<i class="fas fa-shopping-cart" style="color:white;font-size:1.4rem;"></i>
<span id="cart-badge" style="position:absolute;top:-4px;right:-4px;background:var(--primary);color:white;font-size:0.7rem;font-weight:700;width:22px;height:22px;border-radius:50%;display:none;align-items:center;justify-content:center;">0</span>
</div>

<!-- Cart Overlay -->
<div id="cart-overlay" onclick="closeCart()" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:1000;"></div>

<!-- Cart Drawer -->
<div id="cart-drawer" style="position:fixed;top:0;right:0;width:400px;max-width:90vw;height:100%;background:white;z-index:1001;transform:translateX(100%);transition:transform 0.3s ease;display:flex;flex-direction:column;box-shadow:-10px 0 30px rgba(0,0,0,0.1);">
<div style="padding:1.5rem;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
<h3 style="margin:0;color:var(--primary);font-family:'Outfit',sans-serif;">Shopping Cart</h3>
<button onclick="closeCart()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#888;">&times;</button>
</div>
<div id="cart-body" style="flex:1;overflow-y:auto;padding:0 1.5rem;">
<p style="text-align:center;color:#888;padding:2rem;">Your cart is empty.</p>
</div>
<div id="cart-footer" style="padding:1.5rem;border-top:1px solid #eee;"></div>
</div>

<!-- Checkout Modal -->
<div id="checkout-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;">
<div id="checkout-modal-body" style="background:white;border-radius:16px;max-width:500px;width:90%;max-height:90vh;overflow-y:auto;padding:2rem;position:relative;">
<button onclick="closeCheckout()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:#888;">&times;</button>
<h2 style="color:var(--primary);font-family:'Outfit',sans-serif;margin-bottom:1.5rem;"><i class="fas fa-lock" style="margin-right:0.5rem;color:var(--accent);"></i>Secure Checkout</h2>

<div id="checkout-order-summary" style="margin-bottom:1.5rem;"></div>

<form id="checkout-form" onsubmit="placeOrder(event)">
<h3 style="color:var(--primary);font-size:1rem;margin-bottom:0.8rem;">Shipping Information</h3>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1rem;">
<input required placeholder="First Name" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
<input required placeholder="Last Name" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
</div>
<input required placeholder="Email Address" type="email" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;margin-bottom:0.8rem;">
<input required placeholder="Street Address" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;margin-bottom:0.8rem;">
<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.8rem;margin-bottom:1.5rem;">
<input required placeholder="City" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
<input required placeholder="State" maxlength="2" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
<input required placeholder="ZIP" maxlength="5" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
</div>

<h3 style="color:var(--primary);font-size:1rem;margin-bottom:0.8rem;"><i class="fas fa-credit-card" style="margin-right:0.5rem;color:var(--accent);"></i>Payment</h3>
<input required placeholder="Card Number" maxlength="19" oninput="formatCard(this)" style="width:100%;padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;margin-bottom:0.8rem;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;margin-bottom:1.5rem;">
<input required placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
<input required placeholder="CVV" maxlength="4" type="password" style="padding:0.7rem;border:1px solid #ddd;border-radius:6px;font-family:inherit;">
</div>

<button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;font-size:1.05rem;">
<i class="fas fa-lock" style="margin-right:0.5rem;"></i> Place Order
</button>
</form>
</div>
</div>
'''

# Insert before </body>
html = html.replace('</body>', cart_html + '\n<script src="/static/cart.js"></script>\n</body>')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)

print("SUCCESS: All patches applied.")
