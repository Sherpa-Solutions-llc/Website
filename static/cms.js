document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Automatically make all standard elements editable if they don't already have a data-cms tag.
        // This ensures the entire website is editable within the iframe.
        let cmsCounter = 1;
        const validTags = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'LI', 'A', 'IMG', 'B', 'STRONG', 'EM', 'I', 'TD', 'TH', 'BUTTON'];
        const pageSource = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

        document.querySelectorAll('body *').forEach(el => {
            if (validTags.includes(el.tagName) && !el.hasAttribute('data-cms')) {
                // Ignore elements within SVG/editor UI
                if (el.closest('svg') || el.closest('.trail-svg') || el.closest('[id^="_cms_"]') || el.closest('.custom-modal')) return;

                // Only target leaf nodes (no structural block children)
                let hasBlockChildren = false;
                for (let child of el.children) {
                    if (['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'FORM'].includes(child.tagName)) {
                        hasBlockChildren = true;
                        break;
                    }
                }

                if (!hasBlockChildren) {
                    let hasText = el.textContent.trim().length > 0;
                    if (el.tagName === 'IMG' || hasText || el.querySelector('img')) {
                        el.setAttribute('data-cms', 'auto-' + pageSource + '-' + el.tagName.toLowerCase() + '-' + cmsCounter);
                        cmsCounter++;
                    }
                }
            }
        });

        // Fetch the dynamic content map from the backend CMS
        const res = await fetch('https://sherpa-solutions-api.railway.app/api/content', { cache: 'no-store' });
        if (res.ok) {
            const content = await res.json();

            // Re-hydrate any tagged DOM elements with the authoritative text/imagse from the DB
            document.querySelectorAll('[data-cms]').forEach(el => {
                const key = el.getAttribute('data-cms');

                // If a DB override exists for this element, inject it
                if (content[key]) {
                    if (el.tagName === 'IMG') {
                        // For images, we just update the src link
                        el.src = content[key];
                    } else {
                        // For everything else, replace the raw HTML
                        el.innerHTML = content[key];
                    }
                }
            });

            // Auto-register any new data-cms tags to the backend so they show up in the Admin portal!
            setTimeout(autoRegisterTags, 1000);
        }
    } catch (err) {
        console.error("Failed to load CMS content:", err);
    }

    // Mobile Menu Logic
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');

    if (mobileMenuBtn && navMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-xmark');
            }
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-bars');
                    icon.classList.remove('fa-xmark');
                }
            });
        });
    }
});

async function autoRegisterTags() {
    // Collect all elements with a data-cms tag natively embedded
    const elements = document.querySelectorAll('[data-cms]');
    const registerPromises = [];

    for (const el of elements) {
        const key = el.getAttribute('data-cms');

        let originalContent = el.innerHTML;
        if (el.tagName === 'IMG') originalContent = el.getAttribute('src');

        // Blindly fire it to the server. The backend uses ON CONFLICT DO UPDATE
        // meaning if we already edited this via the CMS, it WON'T overwrite the DB text,
        // it will just ensure the key itself actually exists in the DB so the admin Editor renders it.
        registerPromises.push(
            fetch('https://sherpa-solutions-api.railway.app/api/content/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ element_id: key, default_content: originalContent })
            }).catch(e => {
                // Ignore passive tracking errors
            })
        );
    }

    await Promise.all(registerPromises);
}
