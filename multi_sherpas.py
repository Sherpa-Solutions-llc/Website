import re

# 1. Update CSS
css_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\styles.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# remove transition from walking-sherpa
css = re.sub(r'transition: left 2s[^\n]+;', '', css)
# scale it down slightly
css = re.sub(r'font-size: 3rem;', 'font-size: 2rem;', css)
# change color to a bit darker/varied, or keep accent? Let's keep accent.

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

# 2. Update HTML JS
html_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Replace the single Sherpa HTML
old_sherpa_html = """        <!-- The Animated Sherpa Avatar -->
        <div id="walking-sherpa" class="walking-sherpa">
            <i class="fa-solid fa-person-hiking"></i>
        </div>"""

new_sherpa_html = """        <!-- Animated Followers Container -->
        <div id="followers-container"></div>"""

if old_sherpa_html in html:
    html = html.replace(old_sherpa_html, new_sherpa_html)

# Replace the JS
js_start = '<script>\n        // Sherpa Random Walk Logic'
js_end = '    </script>\n\n    <section class="partnership-hero">'

# We need to find the old script block
idx_start = html.find('<script>\n        // Sherpa Random Walk Logic')
idx_end = html.find('</script>\n\n    <section class="partnership-hero">') + 9

old_script = html[idx_start:idx_end]

new_script = """<script>
        // Multi-Sherpa Follower Animation Logic
        document.addEventListener("DOMContentLoaded", () => {
            const tsPath = document.getElementById('ts-path');
            const container = document.getElementById('followers-container');
            if (!tsPath || !container) return;

            const totalLength = tsPath.getTotalLength();
            // Icons representing random men, women, hikers
            const icons = [
                "fa-person-hiking",
                "fa-person-walking",
                "fa-person-walking-with-cane",
                "fa-person",
                "fa-person-dress"
            ];
            
            // Colors for variety
            const colors = [
                "var(--accent)", // Orange
                "var(--primary)", // Dark green
                "#4a5c4a", // Muted green
                "#5a6d5a", // Lighter green
                "#c06c3b"  // Different orange
            ];

            function spawnFollower() {
                const follower = document.createElement("div");
                follower.className = "walking-sherpa";
                
                // Pick random icon and color
                const iconClass = icons[Math.floor(Math.random() * icons.length)];
                const color = colors[Math.floor(Math.random() * colors.length)];
                
                follower.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                follower.style.color = color;
                
                // Randomize scale to simulate distance/size differences
                const scale = 0.8 + Math.random() * 0.4;
                // Since base transform is translate(-50%, -100%), we append scale
                
                container.appendChild(follower);

                // Animation state
                let progress = 0; // 0 to 1
                const duration = 15000 + Math.random() * 10000; // 15 to 25 seconds to complete path
                let lastTime = performance.now();

                function animate(time) {
                    const dt = time - lastTime;
                    lastTime = time;
                    
                    progress += dt / duration;
                    
                    if (progress >= 1) {
                        follower.remove();
                        return; // Stop animating this one
                    }

                    // Get point on SVG path
                    const pt = tsPath.getPointAtLength(progress * totalLength);
                    
                    // Convert SVG local coordinates (1000x600) to percentages
                    const xPct = (pt.x / 1000) * 100;
                    const yPct = (pt.y / 600) * 100;
                    
                    // We need to determine direction to flip the icon if walking left
                    // But the trail primarily marches right. We can assume right for now, 
                    // though there's a slight curve leftward near the beginning.
                    // Let's sample a point slightly ahead to get direction
                    let flip = 1;
                    if (progress < 0.99) {
                        const nextPt = tsPath.getPointAtLength((progress + 0.01) * totalLength);
                        if (nextPt.x < pt.x) {
                            flip = -1;
                        }
                    }

                    follower.style.left = `${xPct}%`;
                    follower.style.top = `${yPct}%`;
                    follower.style.transform = `translate(-50%, -100%) scaleX(${flip}) scale(${scale})`;

                    // Add a slight walking bounce
                    // Math.sin(progress * something)
                    const bounce = Math.abs(Math.sin(time / 150)) * 5; // 5px bounce
                    follower.style.marginTop = `-${bounce}px`;

                    requestAnimationFrame(animate);
                }

                requestAnimationFrame(animate);
            }

            // Spawn initial followers
            for(let i=0; i<3; i++) {
                setTimeout(spawnFollower, i * 4000);
            }

            // Continuously spawn new followers every 5-10 seconds
            setInterval(() => {
                spawnFollower();
            }, 6000 + Math.random() * 4000);
        });
    </script>"""

if idx_start != -1 and old_script:
    html = html.replace(old_script, new_script)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("Updated services.html with multi-sherpa spawner.")
else:
    print("Could not find the JS block in services.html")
