// Global theme management
// Apply theme IMMEDIATELY (blocking) to prevent flash of light mode
const savedTheme = localStorage.getItem('sherpa_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

window.toggleTheme = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('sherpa_theme', newTheme);
    
    updateThemeUI(newTheme);
    syncThemeToIframes(newTheme);
};

function updateThemeUI(theme) {
    const isLight = theme === 'light';
    
    // Find all theme toggle buttons
    const toggles = document.querySelectorAll('#theme-toggle, #btn-theme-toggle, .theme-toggle');
    
    toggles.forEach(btn => {
        const icon = btn.querySelector('i');
        const hasText = btn.textContent.toLowerCase().includes('switch to') || btn.classList.contains('btn');
        
        if (isLight) {
            if (icon) icon.className = 'fa-solid fa-moon';
            if (hasText) btn.innerHTML = `<i class="fa-solid fa-moon"></i> Switch to Dark Mode`;
        } else {
            if (icon) icon.className = 'fa-solid fa-sun';
            if (hasText) btn.innerHTML = `<i class="fa-solid fa-sun"></i> Switch to Light Mode`;
        }
    });
}

function syncThemeToIframes(theme) {
    const iframes = ['cms-iframe', 'demo-iframe', 'sherpa-frame'];
    iframes.forEach(id => {
        const frame = document.getElementById(id);
        if (frame && frame.contentWindow) {
            try {
                frame.contentWindow.document.documentElement.setAttribute('data-theme', theme);
                if (id === 'sherpa-frame') {
                    frame.contentWindow.postMessage({
                        stCommVersion: 1,
                        type: "SHERPA_THEME",
                        theme: { base: theme }
                    }, "*");
                }
            } catch (e) {}
        }
    });
}

// Global event delegation for theme toggles
document.addEventListener('click', (e) => {
    const btn = e.target.closest('#theme-toggle, #btn-theme-toggle, .theme-toggle');
    if (btn) {
        e.preventDefault();
        window.toggleTheme();
    }
});

// Sync and UI update after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    const theme = document.documentElement.getAttribute('data-theme');
    updateThemeUI(theme);
});

// Sync on load
window.addEventListener('load', () => {
    const theme = document.documentElement.getAttribute('data-theme');
    syncThemeToIframes(theme);
});
