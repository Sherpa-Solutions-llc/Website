import codecs
import re

html_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
css_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\styles.css'

# 1. Update HTML
with codecs.open(html_path, 'r', 'utf-8') as f:
    html = f.read()

# Replace <div class="node-dot"></div> with <i class="fa-solid fa-flag node-flag"></i>
html = html.replace('<div class="node-dot"></div>', '<i class="fa-solid fa-flag node-flag"></i>')

# Add nodes to Partnership path
# We'll inject them right after the Basecamp node or Partnership Summit node
pp_nodes = """
            <!-- Partnership Path Nodes (Intermediate) -->
            <div class="trail-node pp-node" style="left: 17.50%; top: 72.91%; transform: translate(-50%, -50%); pointer-events: none;">
                <i class="fa-solid fa-flag node-flag pp-flag"></i>
            </div>
            <div class="trail-node pp-node" style="left: 25.00%; top: 54.17%; transform: translate(-50%, -50%); pointer-events: none;">
                <i class="fa-solid fa-flag node-flag pp-flag"></i>
            </div>
            <div class="trail-node pp-node" style="left: 32.50%; top: 35.42%; transform: translate(-50%, -50%); pointer-events: none;">
                <i class="fa-solid fa-flag node-flag pp-flag"></i>
            </div>
"""

# Insert right after the summit node
if '<!-- Traditional Services Nodes (7 waypoints) -->' in html:
    html = html.replace('<!-- Traditional Services Nodes (7 waypoints) -->', pp_nodes + '\n            <!-- Traditional Services Nodes (7 waypoints) -->')

with codecs.open(html_path, 'w', 'utf-8') as f:
    f.write(html)


# 2. Update CSS
with codecs.open(css_path, 'r', 'utf-8') as f:
    css = f.read()

flag_css = """
.node-flag {
    color: var(--primary);
    font-size: 1.2rem;
    filter: drop-shadow(0 4px 5px rgba(0,0,0,0.2));
    transition: transform 0.3s, color 0.3s;
}

.trail-node:hover .node-flag {
    transform: scale(1.3);
    color: var(--accent);
}

.pp-flag {
    color: var(--accent);
}
"""

if '.node-flag' not in css:
    css += '\n' + flag_css

with codecs.open(css_path, 'w', 'utf-8') as f:
    f.write(css)

print("Updated HTML and CSS for flags.")
