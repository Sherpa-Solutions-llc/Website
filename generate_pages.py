import os
import shutil
import re

base_dir = r"C:\Users\choos\Documents\Antigravity\sherpa_solutions"
services_html = os.path.join(base_dir, "services.html")

# 1. Update services.html to use <a> tags for the ts-nodes
with open(services_html, 'r', encoding='utf-8') as f:
    html = f.read()

# We need to replace `<div class="trail-node ts-node"` with `<a href="service_X.html" class="trail-node ts-node"`
# and matching `</div>` with `</a>`
# Let's map indexes to filenames and titles

services = [
    ("Basecamp", "index.html"), # Node 0
    ("Competitor Analysis", "service_competitor_analysis.html"),
    ("Operational Review", "service_operational_review.html"),
    ("Quality Assessment", "service_quality_assessment.html"),
    ("Marketing Strategy", "service_marketing_strategy.html"),
    ("Leadership Coaching", "service_leadership_coaching.html"),
    ("AI Integration Review", "service_ai_integration.html"),
    ("Strategy Development", "service_strategy_development.html")
]

for idx, (title, filename) in enumerate(services):
    if idx == 0:
        # basecamp
        html = re.sub(
            fr'<div class="trail-node ts-node" data-idx="{idx}"(.*?)>(.*?)</div>\s*</div>',
            fr'<a href="{filename}" class="trail-node ts-node" data-idx="{idx}"\1>\2</div></a>',
            html,
            flags=re.DOTALL
        )
    else:
        # other nodes have tooltips and dots
        # Pattern looks for `<div class="trail-node ts-node" data-idx="1" style="..."> ... </div> ... </div>`
        # Because of the nested structure, simple regex replacement is tricky, so let's do targeted string replace.
        
        # Find the start tag
        start_tag = f'<div class="trail-node ts-node" data-idx="{idx}"'
        start_idx = html.find(start_tag)
        if start_idx != -1:
            # find the end of this div, it ends after `<div class="node-dot"></div>`
            dot_end = html.find('<div class="node-dot"></div>', start_idx) + len('<div class="node-dot"></div>')
            # the closing div should be right after white space
            div_end = html.find('</div>', dot_end) + len('</div>')
            
            chunk = html[start_idx:div_end]
            new_chunk = chunk.replace('<div class="trail-node ts-node"', f'<a href="{filename}" class="trail-node ts-node"')
            # replace the last </div> with </a>
            new_chunk = new_chunk[:-6] + '</a>'
            
            html = html[:start_idx] + new_chunk + html[div_end:]

# Partnership node as well
part_start = '<div class="trail-node partnership-summit"'
if part_start in html:
    p_idx = html.find(part_start)
    p_end = html.find('</div>\n            </div>', p_idx) + 24
    chunk = html[p_idx:p_end]
    new_chunk = chunk.replace('<div class="trail-node partnership-summit"', '<a href="#contact" class="trail-node partnership-summit"').replace('</div>\n            </div>', '</div>\n            </a>')
    
    html = html[:p_idx] + new_chunk + html[p_end:]


with open(services_html, 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated services.html with <a> links.")

# 2. Generate the 7 service pages
template_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sherpa Solutions LLC | {title}</title>
    <!-- Modern Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>

    <header>
        <div class="logo-container">
            <a href="index.html">
                <img src="/static/sherpa_logo.png" alt="Sherpa Solutions LLC" data-cms="global-navbar-logo">
            </a>
        </div>
        <ul class="nav-links">
            <li><a href="index.html">Home</a></li>
            <li><a href="about.html">About Us</a></li>
            <li><a href="services.html" class="active">Our Services</a></li>
            <li><a href="merchandise.html">Merchandise</a></li>
            <li><a href="contact.html">Contact</a></li>
        </ul>
        <a href="contact.html" class="btn btn-primary">Start Your Ascent</a>
    </header>

    <div class="page-header" style="background: linear-gradient(135deg, var(--bg-color), #E8F1F5);">
        <h1 style="color: var(--primary);">{title}</h1>
        <p style="color: var(--secondary);">Expert guidance mapped to your unique business terrain.</p>
    </div>

    <section class="basic-section">
        <div class="section-container" style="max-width: 800px; margin: 4rem auto; text-align: center;">
            <i class="fa-solid fa-map" style="font-size: 4rem; color: var(--accent); margin-bottom: 2rem;"></i>
            <h2 style="font-family: 'Outfit', sans-serif; color: var(--primary); margin-bottom: 1rem;">Navigating {title}</h2>
            <p style="font-size: 1.1rem; line-height: 1.8; color: #555; margin-bottom: 2rem;">
                This page represents the dedicated landing area for our <strong>{title}</strong> service. 
                Our sherpas dive deep into your organizational landscape to chart an optimized course toward maximum efficiency and market dominance. 
            </p>
            <a href="contact.html" class="btn btn-secondary">Request a Consultation</a>
        </div>
    </section>

    <footer>
        <div class="footer-bottom">
            <p>&copy; 2026 Sherpa Solutions LLC. All rights reserved.</p>
        </div>
    </footer>

</body>
</html>
"""

for idx, (title, filename) in enumerate(services):
    if idx == 0: continue # basecamp
    page_path = os.path.join(base_dir, filename)
    with open(page_path, 'w', encoding='utf-8') as f:
        f.write(template_content.format(title=title))
    print(f"Generated {filename}")

print("Done.")
