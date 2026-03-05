document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Fetch the dynamic content map from the backend CMS
        const res = await fetch('http://localhost:8001/api/content');
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
});

async function autoRegisterTags() {
    // Collect all elements with a data-cms tag natively embedded
    const elements = document.querySelectorAll('[data-cms]');
    for (const el of elements) {
        const key = el.getAttribute('data-cms');

        let originalContent = el.innerHTML;
        if (el.tagName === 'IMG') originalContent = el.getAttribute('src');

        // Blindly fire it to the server. The backend uses ON CONFLICT DO UPDATE
        // meaning if we already edited this via the CMS, it WON'T overwrite the DB text,
        // it will just ensure the key itself actually exists in the DB so the admin Editor renders it.
        try {
            await fetch('http://localhost:8001/api/content/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ element_id: key, default_content: originalContent })
            });
        } catch (e) {
            // Ignore passive tracking errors
        }
    }
}
