import codecs
import re

html_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
css_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\styles.css'

# 1. Update HTML
with codecs.open(html_path, 'r', 'utf-8') as f:
    html = f.read()

# Remove the node-tooltip from the partnership-summit
old_tooltip = """                <div class="node-tooltip">
                    <h4>The Partnership Path</h4>
                    <p>Zero-Cost Assessment<br>Performance-Based Obligation</p>
                </div>"""
                
html = html.replace(old_tooltip, "")

# Add the legend right before the end of trail-container
legends_html = """            <!-- Path Legends -->
            <div class="path-legends">
                <div class="legend-box legend-accent">
                    <h4>The Partnership Path</h4>
                    <p>Zero-Cost Assessment<br>Performance-Based Obligation</p>
                </div>
                <div class="legend-box legend-primary">
                    <h4>Services Path</h4>
                    <p>Traditional Consulting<br>Hourly & Project-Based</p>
                </div>
            </div>
"""

# find <div id="followers-container"></div>
# or find the end of the sections
if 'id="followers-container"></div>' in html:
    html = html.replace('id="followers-container"></div>', 'id="followers-container"></div>\n' + legends_html)

with codecs.open(html_path, 'w', 'utf-8') as f:
    f.write(html)

# 2. Update CSS
with codecs.open(css_path, 'r', 'utf-8') as f:
    css = f.read()

# Remove the old specific CSS:
css = re.sub(r'\.partnership-summit \.node-tooltip \{[\s\S]*?\}', '', css)
css = re.sub(r'\.partnership-summit \.node-tooltip::after \{[\s\S]*?\}', '', css)

legend_css = """
/* Path Legends at Bottom */
.path-legends {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 20px;
    z-index: 20;
    pointer-events: none;
}

.legend-box {
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    width: 280px;
    text-align: center;
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15);
}

.legend-box h4 {
    margin: 0 0 0.5rem 0;
    font-family: 'Outfit', sans-serif;
    font-size: 1.1rem;
}

.legend-box p {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.9;
}

.legend-accent {
    background: var(--accent);
}

.legend-primary {
    background: var(--primary);
}

@media (max-width: 768px) {
    .path-legends {
        bottom: 15px;
        flex-direction: column;
        gap: 10px;
    }
    .legend-box {
        width: 240px;
        padding: 0.75rem 1rem;
    }
}
"""

if '.path-legends' not in css:
    css += '\n' + legend_css

with codecs.open(css_path, 'w', 'utf-8') as f:
    f.write(css)

print("Updated HTML and CSS for Path Legends.")
