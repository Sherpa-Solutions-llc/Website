import re

# B(t) = (1-t)^3 P0 + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 P3
def cubic_bezier(t, p0, p1, p2, p3):
    return (
        ((1 - t) ** 3) * p0[0] + 3 * ((1 - t) ** 2) * t * p1[0] + 3 * (1 - t) * (t ** 2) * p2[0] + (t ** 3) * p3[0],
        ((1 - t) ** 3) * p0[1] + 3 * ((1 - t) ** 2) * t * p1[1] + 3 * (1 - t) * (t ** 2) * p2[1] + (t ** 3) * p3[1]
    )

# The Winding path:
# Segment 1: M100,550 -> C 300,550 200,400 450,450
seg1 = [(100, 550), (300, 550), (200, 400), (450, 450)]
# Segment 2: C 700,500 600,300 800,300
seg2 = [(450, 450), (700, 500), (600, 300), (800, 300)]
# Segment 3: C 850,300 930,250 950,200
seg3 = [(800, 300), (850, 300), (930, 250), (950, 200)]

def get_point(global_t):
    # Let's approximate the lengths of the 3 segments.
    # Length of bezier roughly distance of control polygon
    l1 = sum( ((seg1[i][0]-seg1[i-1][0])**2 + (seg1[i][1]-seg1[i-1][1])**2)**0.5 for i in range(1,4) )
    l2 = sum( ((seg2[i][0]-seg2[i-1][0])**2 + (seg2[i][1]-seg2[i-1][1])**2)**0.5 for i in range(1,4) )
    l3 = sum( ((seg3[i][0]-seg3[i-1][0])**2 + (seg3[i][1]-seg3[i-1][1])**2)**0.5 for i in range(1,4) )
    total = l1 + l2 + l3
    
    target_len = global_t * total
    
    if target_len <= l1:
        return cubic_bezier(target_len / l1, *seg1)
    elif target_len <= l1 + l2:
        return cubic_bezier((target_len - l1) / l2, *seg2)
    else:
        # Prevent floating point overshoot
        t3 = (target_len - l1 - l2) / l3
        t3 = max(0.0, min(1.0, t3))
        return cubic_bezier(t3, *seg3)

# 8 points including basecamp
# fractions roughly matching aesthetics
fracs = [0, 0.13, 0.26, 0.41, 0.55, 0.70, 0.85, 1.0]

points = [get_point(f) for f in fracs]
# Let's adjust Strategy Development specifically to an exact coordinate just in case math varies slightly.
points[7] = (950.0, 200.0)

# Replace in services.html
filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Remove the JS query logic completely
js_block_start = '            // Align dots perfectly on the curve automatically'
js_block_end = '            const sherpa = document.getElementById("walking-sherpa");'

if js_block_start in html and js_block_end in html:
    idx_start = html.find(js_block_start)
    idx_end = html.find(js_block_end)
    html = html[:idx_start] + html[idx_end:]


# 2. Inject precise CSS left and top into each node.
# The nodes are structured line by line with data-idx="X"
for idx, (px, py) in enumerate(points):
    x_pct = f"{(px / 1000) * 100:.2f}%"
    y_pct = f"{(py / 600) * 100:.2f}%"
    
    # We replace their `style="left: X; top: Y; ..."` attributes directly.
    # regex match data-idx="X" followed by style attribute
    pattern = fr'(data-idx="{idx}"\s+style="left:\s*)[^;]+(;\s*top:\s*)[^;]+(;\s*transform:[^"]+")'
    replacement = rf'\g<1>{x_pct}\g<2>{y_pct}\g<3>'
    html = re.sub(pattern, replacement, html)


with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)
print("Solved SVG Path via Python and hardcoded coordinates.")
