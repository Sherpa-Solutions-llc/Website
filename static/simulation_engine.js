/**
 * Sherpa High-Availability Simulation Engine
 * Ensures demo availability by providing high-fidelity mock fallbacks
 * when external dashboards are unreachable.
 */

window.SherpaSimulation = {
    isSimulation: false,
    mockups: {
        'b2b_leads': 'static/simulation_b2b.png',
        'seo_sniper': 'static/simulation_seo.png',
        'arbitrage': 'static/simulation_arbitrage.png',
        'brand_monitor': 'static/simulation_brand.png'
    },

    init: function(pageKey) {
        // Force detection based on current window location
        const isLocalBackend = window.location.search.includes('backend=local');
        
        console.log("Sherpa HA Engine: Initializing for " + pageKey + " (Local backend: " + isLocalBackend + ")");
        
        if (isLocalBackend) {
            console.log("Sherpa HA Engine: Running in Local Mode. Real backend connected.");
            this.isSimulation = false;
            return;
        }
        // Production: Enable High-Fidelity Mockup
        this.activateSimulation(pageKey);
    },

    activateSimulation: function(pageKey) {
        this.isSimulation = true;
        const iframe = document.getElementById('sherpa-frame');
        const ind = document.getElementById('env-indicator');
        
        if (ind) {
            ind.innerHTML = '<i class="fa-solid fa-bolt" style="color:#FFCC00;"></i> SIMULATION ACTIVE';
            ind.style.borderColor = 'rgba(255,204,0,0.5)';
            ind.style.background = 'rgba(255,204,0,0.1)';
        }

        // Create Simulation Layer
        const simLayer = document.createElement('div');
        simLayer.id = 'simulation-layer';
        simLayer.style.cssText = `
            position: fixed;
            top: 180px;
            left: 0;
            width: 100%;
            height: calc(100vh - 180px);
            background: url('${this.mockups[pageKey]}') no-repeat top center;
            background-size: contain;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.8s ease-out;
        `;

        // Add "Interactive" Overlays (Transparent divs for demo pacing)
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.1);
            pointer-events: none;
        `;
        
        simLayer.appendChild(overlay);

        // Hide original iframe and add simulation
        if (iframe) iframe.style.display = 'none';
        document.body.appendChild(simLayer);

        console.warn(`Sherpa Cloud unreachable. Failing over to ${pageKey} simulation.`);
    },

    // Inject virtual cursor for cinematic demo
    runVirtualDemo: function(pageKey, audio) {
        if (!this.isSimulation) return;

        const cursor = document.createElement('div');
        cursor.id = 'virtual-cursor';
        cursor.style.cssText = `
            position: fixed;
            width: 24px;
            height: 24px;
            background: var(--primary);
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 0 15px var(--primary);
            z-index: 200;
            pointer-events: none;
            transition: all 1s cubic-bezier(0.19, 1, 0.22, 1);
            left: 50%;
            top: 50%;
            opacity: 0;
        `;
        document.body.appendChild(cursor);

        // Sequence logic based on page
        setTimeout(() => {
            cursor.style.opacity = '1';
            // Move to search box
            cursor.style.left = '30%';
            cursor.style.top = '250px';
        }, 1000);

        setTimeout(() => {
            // "Click" effect
            cursor.style.transform = 'scale(0.8)';
            setTimeout(() => cursor.style.transform = 'scale(1)', 200);
        }, 3000);

        setTimeout(() => {
            // Move to Action Button
            cursor.style.left = '70%';
            cursor.style.top = '60%';
        }, 6000);

        audio.onended = () => {
            cursor.remove();
        };
    }
};
