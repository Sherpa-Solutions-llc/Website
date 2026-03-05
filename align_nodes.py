import os
import re

base_dir = r"C:\Users\choos\Documents\Antigravity\sherpa_solutions"
services_html = os.path.join(base_dir, "services.html")

with open(services_html, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Change preserveAspectRatio to none
html = html.replace('preserveAspectRatio="xMidYMid slice"', 'preserveAspectRatio="none"')

# 2. Add an ID to the winding path so JS can find it easily
winding_path_old = '<!-- The Winding Traditional Services Path -->\n                <path d="M100,550'
winding_path_new = '<!-- The Winding Traditional Services Path -->\n                <path id="ts-path" d="M100,550'
if winding_path_old in html:
    html = html.replace(winding_path_old, winding_path_new)

# 3. Inject the alignment JS before the Sherpa walk logic begins
# Find `document.addEventListener("DOMContentLoaded", () => {`
marker = 'document.addEventListener("DOMContentLoaded", () => {'
inject_code = """
            const tsPath = document.getElementById('ts-path');
            const nodes = document.querySelectorAll(".ts-node");
            
            // Align dots perfectly on the curve automatically
            if (tsPath && nodes.length > 0) {
                const totalLength = tsPath.getTotalLength();
                // We have 8 nodes (0 to 7)
                // Let's position them at aesthetically pleasing fractions along the curve
                const fractions = [0, 0.15, 0.28, 0.42, 0.55, 0.68, 0.82, 1.0];
                
                nodes.forEach((node, index) => {
                    if (index < fractions.length) {
                        const pt = tsPath.getPointAtLength(totalLength * fractions[index]);
                        // Convert SVG local coordinates (1000x600) to percentages
                        const xPct = (pt.x / 1000) * 100;
                        const yPct = (pt.y / 600) * 100;
                        node.style.left = xPct + "%";
                        node.style.top = yPct + "%";
                    }
                });
            }
"""

if marker in html:
    parts = html.split(marker)
    html = parts[0] + marker + inject_code + parts[1]

with open(services_html, 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated services.html with dynamic JS path alignment.")
