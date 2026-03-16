// Execute immediately to prevent flash of wrong theme
(function() {
    const savedTheme = localStorage.getItem('sherpa_theme');
    // Dark is default
    const theme = savedTheme ? savedTheme : 'dark';
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('i');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    
    // Set initial icon
    if (isLight) {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    } else {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    }
    
    toggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('sherpa_theme', newTheme);
        
        // Update Icon
        if (newTheme === 'light') {
            icon.classList.replace('fa-sun', 'fa-moon');
        } else {
            icon.classList.replace('fa-moon', 'fa-sun');
        }

        // Sync with CMS Editor Iframe if present
        const cmsIframe = document.getElementById('cms-iframe');
        if (cmsIframe && cmsIframe.contentWindow && cmsIframe.contentWindow.document) {
            try {
                cmsIframe.contentWindow.document.documentElement.setAttribute('data-theme', newTheme);
            } catch (e) {
                console.warn("Could not sync theme to iframe (cross-origin or not loaded yet)");
            }
        }
    });
});

// Also sync iframe on load if it's the CMS page
window.addEventListener('load', () => {
    const cmsIframe = document.getElementById('cms-iframe');
    if (cmsIframe) {
        cmsIframe.addEventListener('load', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            try {
                cmsIframe.contentWindow.document.documentElement.setAttribute('data-theme', currentTheme);
            } catch (e) {
                console.warn("Could not sync theme to iframe (cross-origin)");
            }
        });
    }
});
