import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# I want to replace the Winding Traditional Services Path SVG string
old_path = '<path d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 850,350 C 950,370 900,150 700,100"'
new_path = '<path d="M100,550 C 300,550 200,400 450,450 C 700,500 600,300 800,300 C 950,300 900,250 950,200"'

if old_path in html:
    html = html.replace(old_path, new_path)
    print("Replaced winding path SVG.")
else:
    print("Could not find the old winding path in the HTML.")

# I also need to systematically adjust the `left: X%; top: Y%;` of the 7 ts-nodes to follow the new curve closely.
# Note: The Sherpa walks to the `.style.left` and `.style.top` of these nodes automatically via JS!

# Node 0 (Basecamp): 10%, 91% -> Leave it
# Node 1: 20%, 75% -> 25%, 83%
html = html.replace('data-idx="1" style="left: 20%; top: 75%;', 'data-idx="1" style="left: 25%; top: 82%;')

# Node 2: 35%, 80% -> 40%, 75%
html = html.replace('data-idx="2" style="left: 35%; top: 80%;', 'data-idx="2" style="left: 40%; top: 76%;')

# Node 3: 55%, 70% -> 55%, 72%
html = html.replace('data-idx="3" style="left: 55%; top: 70%;', 'data-idx="3" style="left: 55%; top: 71%;')

# Node 4: 70%, 55% -> 65%, 60%
html = html.replace('data-idx="4" style="left: 70%; top: 55%;', 'data-idx="4" style="left: 65%; top: 62%;')

# Node 5: 85%, 58% -> 75%, 52%
html = html.replace('data-idx="5" style="left: 85%; top: 58%;', 'data-idx="5" style="left: 77%; top: 50%;')

# Node 6: 88%, 35% -> 85%, 45%
html = html.replace('data-idx="6" style="left: 88%; top: 35%;', 'data-idx="6" style="left: 86%; top: 40%;')

# Node 7: 70%, 16% -> 95%, 33% 
#(Because the peak of the background mountain is at 950,200 which translates to 95%, 33.3% in a 1000x600 viewBox)
html = html.replace('data-idx="7" style="left: 70%; top: 16%;', 'data-idx="7" style="left: 95%; top: 33%;')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(html)
print("Updated node positions.")
