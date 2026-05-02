// ─── Sherpa Solutions Cart System ───────────────────────────────────────────
let cart = [];

// ── Add to cart ──────────────────────────────────────────────────────────────
function addToCart(cardId, name, basePrice, imgSrc) {
    const card = document.getElementById(cardId);

    // Gather all selects / quantity inside this card
    const selects = card.querySelectorAll('select');
    const qtyInput = card.querySelector('.qty-input');
    const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;

    // Dynamic price (powerbank changes displayed price)
    const priceEl = card.querySelector('.product-price');
    const price = priceEl
        ? parseFloat(priceEl.textContent.replace('$', ''))
        : basePrice;

    // Build options label from all non-empty selects
    const opts = [];
    selects.forEach(s => {
        if (s.value && s.value !== '' && !s.classList.contains('qty-select')) {
            // skip the qty select if any
            const label = s.getAttribute('aria-label') || '';
            const text = s.options[s.selectedIndex]?.text || s.value;
            // Strip the pricing suffix from mAh option text
            const cleanText = text.split('—')[0].trim();
            opts.push(label ? `${label}: ${cleanText}` : cleanText);
        }
    });

    const existing = cart.find(
        i => i.name === name && i.opts === opts.join(', ')
    );

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ name, price, qty, opts: opts.join(', '), img: imgSrc });
    }

    updateCartBadge();
    openCart();
    renderCart();

    // Flash the button
    const btn = card.querySelector('.product-btn');
    if (btn) {
        btn.textContent = '✓ Added!';
        btn.style.background = 'var(--primary)';
        btn.style.color = '#fff';
        setTimeout(() => {
            btn.textContent = 'Add to Cart';
            btn.style.background = '';
            btn.style.color = '';
        }, 1200);
    }
}

// ── Cart badge ────────────────────────────────────────────────────────────────
function updateCartBadge() {
    const total = cart.reduce((s, i) => s + i.qty, 0);
    const badge = document.getElementById('cart-badge');
    if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? 'flex' : 'none';
    }
}

// ── Render cart drawer ────────────────────────────────────────────────────────
function renderCart() {
    const body = document.getElementById('cart-body');
    const footer = document.getElementById('cart-footer');
    if (!body) return;

    if (cart.length === 0) {
        body.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">Your cart is empty.</p>';
        footer.innerHTML = '';
        return;
    }

    body.innerHTML = cart.map((item, idx) => `
    <div style="display:flex;gap:1rem;align-items:center;padding:1rem 0;border-bottom:1px solid #eee;">
      <img src="${item.img}" alt="${item.name}"
           style="width:64px;height:64px;object-fit:contain;border-radius:8px;background:#f5f5f5;flex-shrink:0;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;color:var(--primary);font-size:0.95rem;">${item.name}</div>
        ${item.opts ? `<div style="font-size:0.8rem;color:#888;margin:0.2rem 0;">${item.opts}</div>` : ''}
        <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.4rem;">
          <button onclick="changeQty(${idx},-1)" style="width:24px;height:24px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">−</button>
          <span style="min-width:1.5rem;text-align:center;">${item.qty}</span>
          <button onclick="changeQty(${idx},1)" style="width:24px;height:24px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">+</button>
          <span style="margin-left:auto;font-weight:700;color:var(--accent);">$${(item.price * item.qty).toFixed(2)}</span>
          <button onclick="removeFromCart(${idx})" style="margin-left:0.5rem;background:none;border:none;color:#bbb;cursor:pointer;font-size:1.1rem;" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `).join('');

    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    footer.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
      <span style="font-size:1.1rem;font-weight:600;">Subtotal</span>
      <span style="font-size:1.3rem;font-weight:800;color:var(--accent);">$${subtotal.toFixed(2)}</span>
    </div>
    <button onclick="openCheckout()" class="btn btn-primary" style="width:100%;justify-content:center;font-size:1.05rem;">
      <i class="fas fa-lock" style="margin-right:0.5rem;"></i> Checkout
    </button>
  `;
}

// ── Qty helpers ───────────────────────────────────────────────────────────────
function changeQty(idx, delta) {
    cart[idx].qty = Math.max(1, cart[idx].qty + delta);
    updateCartBadge();
    renderCart();
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    updateCartBadge();
    renderCart();
}

// ── Drawer open / close ───────────────────────────────────────────────────────
function openCart() {
    document.getElementById('cart-overlay').style.display = 'block';
    document.getElementById('cart-drawer').style.transform = 'translateX(0)';
}

function closeCart() {
    document.getElementById('cart-overlay').style.display = 'none';
    document.getElementById('cart-drawer').style.transform = 'translateX(100%)';
}

// ── Checkout modal ────────────────────────────────────────────────────────────
function openCheckout() {
    closeCart();
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const orderSummary = cart.map(i =>
        `<div style="display:flex;justify-content:space-between;font-size:0.9rem;margin-bottom:0.4rem;">
      <span>${i.name}${i.opts ? ' <span style="color:#888;">(' + i.opts + ')</span>' : ''} × ${i.qty}</span>
      <span style="font-weight:600;">$${(i.price * i.qty).toFixed(2)}</span>
    </div>`
    ).join('');

    document.getElementById('checkout-order-summary').innerHTML = orderSummary +
        `<div style="border-top:2px solid #eee;margin-top:0.8rem;padding-top:0.8rem;display:flex;justify-content:space-between;font-size:1.1rem;font-weight:800;">
      <span>Total</span><span style="color:var(--accent);">$${subtotal.toFixed(2)}</span>
    </div>`;

    document.getElementById('checkout-modal').style.display = 'flex';
}

function closeCheckout() {
    document.getElementById('checkout-modal').style.display = 'none';
}

function placeOrder(e) {
    e.preventDefault();
    const form = document.getElementById('checkout-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }

    // Show success
    document.getElementById('checkout-modal-body').innerHTML = `
    <div style="text-align:center;padding:3rem 1rem;">
      <div style="font-size:4rem;margin-bottom:1rem;">🎉</div>
      <h2 style="color:var(--primary);margin-bottom:1rem;">Order Placed!</h2>
      <p style="color:#666;margin-bottom:2rem;">Thank you for your Sherpa Solutions order. You'll receive a confirmation email shortly.</p>
      <button onclick="closeCheckout();cart=[];updateCartBadge();renderCart();" class="btn btn-primary" style="justify-content:center;">
        Continue Shopping
      </button>
    </div>`;
}

// Format card number with spaces
function formatCard(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    input.value = v.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 2) v = v.substring(0, 2) + '/' + v.substring(2);
    input.value = v;
}
