import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

# The animated section starts with:
# <div style="text-align:center; padding-top:6rem; margin-bottom: 2rem;">
#     <h2 style="color:var(--primary); font-size:2.5rem; font-family:'Outfit',sans-serif;">Choose Your Route</h2>
# ...
# and ends with:
# </script>
# Let's extract this entire block.
anim_start_pattern = r'<div style="text-align:center; padding-top:6rem; margin-bottom: 2rem;">\s*<h2 style="color:var(--primary); font-size:2.5rem; font-family:\'Outfit\',sans-serif;">Choose Your Route</h2>'

# Find the start
match = re.search(anim_start_pattern, html)
if match:
    start_idx = match.start()
    # Find the end of the script block
    end_pattern = '</script>'
    end_match = html.find(end_pattern, start_idx)
    end_idx = end_match + len(end_pattern)
    
    anim_block = html[start_idx:end_idx]
    
    # Remove it from the current location
    new_html = html[:start_idx] + html[end_idx:]
    
    # Now we want to insert it directly after the page header.
    # The page header ends with `</div>` right before `<section class="partnership-hero">`
    insertion_point = new_html.find('<section class="partnership-hero">')
    
    # We should also adjust the padding of the anim block so it fits nicely at the top
    # Change padding-top:6rem to padding-top:0rem since the page header has padding
    modified_anim_block = anim_block.replace('padding-top:6rem;', 'padding-top:4rem;')
    
    # also we should probably pad the top of the partnership hero just a bit more, or leave it.
    
    if insertion_point != -1:
        final_html = new_html[:insertion_point] + modified_anim_block + '\n\n    ' + new_html[insertion_point:]
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(final_html)
        print("Success: Moved animated section to the top.")
    else:
        print("Error: Could not find partnership-hero section to insert before.")
else:
    print("Error: Could not find the animated section block.")
