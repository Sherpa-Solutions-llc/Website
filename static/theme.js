// Execute immediately to prevent flash of wrong theme
(function() {
    const savedTheme = localStorage.getItem('sherpa_theme');
    // Inherit from hardcoded HTML attribute, otherwise default to Light
    const defaultTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const theme = savedTheme ? savedTheme : defaultTheme;
    
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
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
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
        
        // Sync with Streamlit Application Iframes if present
        const sherpaFrame = document.getElementById('sherpa-frame');
        if (sherpaFrame && sherpaFrame.contentWindow) {
            sherpaFrame.contentWindow.postMessage({
                stCommVersion: 1,
                type: "SHERPA_THEME",
                theme: {
                    base: newTheme,
                    primaryColor: "#ff6600",
                    backgroundColor: newTheme === 'dark' ? "#0e1117" : "#ffffff",
                    secondaryBackgroundColor: newTheme === 'dark' ? "#262730" : "#f0f2f6",
                    textColor: newTheme === 'dark' ? "#fafafa" : "#31333F",
                    font: "sans serif"
                }
            }, "*");
        }
    });
});

// Also sync iframe on load if it's the CMS page
window.addEventListener('load', () => {
    const cmsIframe = document.getElementById('cms-iframe');
    if (cmsIframe) {
        cmsIframe.addEventListener('load', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            try {
                cmsIframe.contentWindow.document.documentElement.setAttribute('data-theme', currentTheme);
            } catch (e) {
                console.warn("Could not sync theme to iframe (cross-origin)");
            }
        });
    }
});
