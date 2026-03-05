import re

services_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
css_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\styles.css'

with open(services_path, 'r', encoding='utf-8') as f:
    html = f.read()

# ── 1. The Interactive SVG/HTML Canvas ────────────────────────────────────
# We are replacing everything from `<div style="text-align:center; padding-top:6rem;">` down to `</section>` of the features grid.
canvas_html = '''
    <div style="text-align:center; padding-top:6rem; margin-bottom: 2rem;">
        <h2 style="color:var(--primary); font-size:2.5rem; font-family:'Outfit',sans-serif;">Choose Your Route</h2>
        <p style="color:var(--secondary); font-size:1.1rem; margin-top:0.5rem;">The Partnership Path versus the Line of Services.</p>
    </div>

    <section class="animated-services-canvas">
        <div class="trail-container" id="trail-container">
            <!-- Background Mountain/Trail Graphic via SVG -->
            <svg class="trail-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
                <defs>
                    <linearGradient id="pathGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="rgba(192, 108, 59, 0.2)" />
                        <stop offset="100%" stop-color="rgba(192, 108, 59, 0.8)" />
                    </linearGradient>
                    <linearGradient id="mainGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                        <stop offset="0%" stop-color="#2D3F2E" />
                        <stop offset="100%" stop-color="#7A8E63" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>
                <!-- Base Mountain Silhouette -->
                <path d="M0,600 L300,200 L500,350 L800,50 L1000,250 L1000,600 Z" fill="rgba(122, 142, 99, 0.05)" />
                
                <!-- The Straight Partnership Path (Left to Peak) -->
                <path d="M100,550 L400,100" stroke="var(--accent)" stroke-width="8" stroke-dasharray="10,10" fill="none" filter="url(#glow)"/>
                
                <!-- The Winding Traditional Services Path -->
                <path d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 850,350 C 950,370 900,150 700,100" stroke="var(--primary)" stroke-width="4" stroke-dasharray="6,6" fill="none" opacity="0.4"/>
            </svg>

            <!-- Partnership Summit Node -->
            <div class="trail-node partnership-summit" style="left: 40%; top: 16%; transform: translate(-50%, -50%);">
                <div class="node-icon"><i class="fa-solid fa-flag"></i></div>
                <div class="node-tooltip">
                    <h4>The Partnership Path</h4>
                    <p>Zero-Cost Assessment<br>Performance-Based Obligation</p>
                </div>
            </div>

            <!-- Traditional Services Nodes (7 waypoints) -->
            <!-- Approximate percentages corresponding to the SVG curve -->
            <!-- Base camp -->
            <div class="trail-node ts-node" data-idx="0" style="left: 10%; top: 91%; transform: translate(-50%, -50%);">
                <div class="node-label">Basecamp</div>
            </div>
            <div class="trail-node ts-node" data-idx="1" style="left: 20%; top: 75%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Competitor Analysis</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="2" style="left: 35%; top: 80%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Operational Review</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="3" style="left: 55%; top: 70%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Quality Assessment</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="4" style="left: 70%; top: 55%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Marketing Strategy</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="5" style="left: 85%; top: 58%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Leadership Coaching</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="6" style="left: 88%; top: 35%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>AI Integration Review</h4></div>
                <div class="node-dot"></div>
            </div>
            <div class="trail-node ts-node" data-idx="7" style="left: 70%; top: 16%; transform: translate(-50%, -50%);">
                <div class="node-tooltip"><h4>Strategy Development</h4></div>
                <div class="node-dot"></div>
            </div>

            <!-- The Animated Sherpa Avatar -->
            <div id="walking-sherpa" class="walking-sherpa">
                <i class="fa-solid fa-person-hiking"></i>
            </div>
        </div>
    </section>

    <script>
        // Sherpa Random Walk Logic
        document.addEventListener("DOMContentLoaded", () => {
            const sherpa = document.getElementById("walking-sherpa");
            const nodes = document.querySelectorAll(".ts-node");
            let currentIndex = 0;

            // Move Sherpa to initial node (Basecamp)
            function setSherpaPosition(index) {
                const node = nodes[index];
                if (!node) return;
                const left = node.style.left;
                const top = node.style.top;
                
                // Add a walking bounce class
                sherpa.classList.add("is-walking");
                
                // Flip the Sherpa horizontally if moving left
                const currentLeftPercent = parseFloat(sherpa.style.left || "10");
                const targetLeftPercent = parseFloat(left);
                if (targetLeftPercent < currentLeftPercent) {
                    sherpa.style.transform = "translate(-50%, -100%) scaleX(-1)";
                } else {
                    sherpa.style.transform = "translate(-50%, -100%) scaleX(1)";
                }

                sherpa.style.left = left;
                sherpa.style.top = top;

                // Stop bouncing after transition duration (2s)
                setTimeout(() => {
                    sherpa.classList.remove("is-walking");
                    // Show tooltip of the visited node briefly
                    const tooltip = node.querySelector('.node-tooltip');
                    if (tooltip) {
                        tooltip.style.opacity = '1';
                        tooltip.style.visibility = 'visible';
                        setTimeout(() => {
                            tooltip.style.opacity = '';
                            tooltip.style.visibility = '';
                        }, 2500);
                    }
                }, 2000);
            }

            // Init position
            setSherpaPosition(0);

            // Randomly walk every 4 seconds
            setInterval(() => {
                // Pick a new random node (1 through 7)
                let nextIndex = currentIndex;
                while (nextIndex === currentIndex) {
                    nextIndex = Math.floor(Math.random() * 7) + 1;
                }
                currentIndex = nextIndex;
                setSherpaPosition(currentIndex);
            }, 4500);
        });
    </script>
'''

# We need to wipe out the old section.
# It starts at `<div style="text-align:center; padding-top:6rem;">`
# and ends at `</section>` (right before `<section class="cta-banner">`)
start_idx = html.find('<div style="text-align:center; padding-top:6rem;">')
end_idx = html.find('<section class="cta-banner">')

if start_idx != -1 and end_idx != -1:
    new_html = html[:start_idx] + canvas_html + "\n    " + html[end_idx:]
    with open(services_path, 'w', encoding='utf-8') as f:
        f.write(new_html)
    print("Injected animated canvas into HTML.")
else:
    print("Could not find blocks to replace in HTML.")


# ── 2. Append CSS for the Animated Canvas ─────────────────────────────────
css_append = '''
/* Animated Services Canvas */
.animated-services-canvas {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto 8rem auto;
    position: relative;
    padding: 0 5%;
}

.trail-container {
    position: relative;
    width: 100%;
    height: 600px;
    background: #ffffff;
    border-radius: 24px;
    box-shadow: 0 30px 60px rgba(45, 63, 46, 0.05);
    border: 1px solid rgba(45, 63, 46, 0.05);
    overflow: hidden;
}

.trail-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.trail-node {
    position: absolute;
    z-index: 10;
}

.node-dot {
    width: 16px;
    height: 16px;
    background: var(--primary);
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    transition: transform 0.3s;
}

.trail-node:hover .node-dot {
    transform: scale(1.5);
    background: var(--accent);
}

.partnership-summit .node-icon {
    width: 50px;
    height: 50px;
    background: var(--accent);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    box-shadow: 0 10px 20px rgba(192, 108, 59, 0.3);
    border: 4px solid white;
    cursor: pointer;
    animation: pulseGlow 2s infinite;
}

@keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(192, 108, 59, 0.6); }
    70% { box-shadow: 0 0 0 15px rgba(192, 108, 59, 0); }
    100% { box-shadow: 0 0 0 0 rgba(192, 108, 59, 0); }
}

.node-tooltip {
    position: absolute;
    bottom: calc(100% + 15px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    width: 240px;
    text-align: center;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s;
    box-shadow: 0 15px 30px rgba(0,0,0,0.15);
    pointer-events: none;
    z-index: 20;
}

.node-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    margin-left: -8px;
    border-width: 8px;
    border-style: solid;
    border-color: var(--primary) transparent transparent transparent;
}

.trail-node:hover .node-tooltip {
    opacity: 1;
    visibility: visible;
    bottom: calc(100% + 20px);
}

.partnership-summit .node-tooltip {
    opacity: 1;
    visibility: visible;
    width: 280px;
    background: var(--accent);
}
.partnership-summit .node-tooltip::after {
    border-color: var(--accent) transparent transparent transparent;
}

.node-tooltip h4 {
    margin: 0 0 0.5rem 0;
    font-family: 'Outfit', sans-serif;
    font-size: 1.1rem;
}
.node-tooltip p {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.9;
}

.node-label {
    background: white;
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-weight: 700;
    color: var(--primary);
    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    font-size: 0.9rem;
}

/* Walking Sherpa */
.walking-sherpa {
    position: absolute;
    font-size: 3rem;
    color: var(--accent);
    z-index: 15;
    transition: left 2s cubic-bezier(0.4, 0, 0.2, 1), top 2s cubic-bezier(0.4, 0, 0.2, 1);
    /* By default offset straight up so the 'feet' are at the origin */
    transform: translate(-50%, -100%);
    pointer-events: none;
    filter: drop-shadow(0 10px 10px rgba(0,0,0,0.2));
}

.walking-sherpa.is-walking i {
    animation: hikeBounce 0.4s infinite alternate;
}

@keyframes hikeBounce {
    0% { transform: translateY(0) rotate(-5deg); }
    100% { transform: translateY(-10px) rotate(5deg); }
}

@media (max-width: 900px) {
    .trail-container {
        height: 800px;
    }
}
'''

with open(css_path, 'a', encoding='utf-8') as f:
    f.write(css_append)
print("Appended Animation CSS.")
