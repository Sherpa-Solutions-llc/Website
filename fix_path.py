import re

html_path = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Make the path flatter so it doesn't dip down to Y=500
# Old: d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 800,300 C 850,300 930,250 950,200"
# New: d="M100,550 C 300,550 200,400 450,450 C 600,450 650,350 800,300 C 850,300 930,250 950,200"
old_d = 'd="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 800,300 C 850,300 930,250 950,200"'
new_d = 'd="M100,550 C 300,550 200,400 450,450 C 600,450 650,350 800,300 C 850,300 930,250 950,200"'
html = html.replace(old_d, new_d)

# To find out the new left/top, let's inject a JS script at the bottom of the body
# that fetches the positions of nodes 1-7 (at certain fractions) and prints them.
# The fractions from the JS are: 0.13, 0.26, 0.41, 0.55, 0.70, 0.85, 0.95 (approx for strategy)

js_inject = """
<script>
document.addEventListener("DOMContentLoaded", () => {
    const tsPath = document.getElementById('ts-path');
    const totalLength = tsPath.getTotalLength();
    const fractions = [0.0, 0.13, 0.26, 0.41, 0.55, 0.70, 0.85, 0.95];
    const out = [];
    for(let f of fractions) {
        const pt = tsPath.getPointAtLength(f * totalLength);
        out.push(`left: ${(pt.x / 10).toFixed(2)}%; top: ${(pt.y / 6).toFixed(2)}%;`);
    }
    console.log("---- NODE POSITIONS ----");
    console.log(out.join('\\n'));
});
</script>
"""

if "---- NODE POSITIONS ----" not in html:
    html = html.replace('</body>', js_inject + '\n</body>')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("Updated SVG and injected coordinate logger.")
