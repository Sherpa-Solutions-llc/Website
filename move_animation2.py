import re

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'

with open(filepath, 'r', encoding='utf-8') as f:
    html = f.read()

start_marker = '<div style="text-align:center; padding-top:6rem; margin-bottom: 2rem;">'
end_marker = '</script>'

start_idx = html.find(start_marker)

if start_idx != -1:
    end_idx = html.find(end_marker, start_idx) + len(end_marker)
    anim_block = html[start_idx:end_idx]
    
    # Remove it
    new_html = html[:start_idx] + html[end_idx:]
    
    # Pad it correctly (it's going to the top right below the page header which has padding)
    anim_block = anim_block.replace('padding-top:6rem;', 'padding-top:1rem;')
    
    # Insert it before the partnership-hero
    insert_marker = '<section class="partnership-hero">'
    insert_idx = new_html.find(insert_marker)
    
    if insert_idx != -1:
        final_html = new_html[:insert_idx] + anim_block + '\n\n    ' + new_html[insert_idx:]
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(final_html)
        print("Success: Moved animated section to the top.")
    else:
        print("Error: Could not find insert point.")
else:
    print("Error: Could not find start marker.")
