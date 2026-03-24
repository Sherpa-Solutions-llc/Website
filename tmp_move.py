import sys

def move_map():
    with open('services.html', 'r', encoding='utf-8') as f:
        services_text = f.read()
    
    # 1. Extract the section and scripts from services.html
    # We need to grab everything from `<div style="text-align:center; padding-top:1rem; margin-bottom: 2rem;">`
    # down to the end of the second `<script>` tag
    
    start_marker = '<div style="text-align:center; padding-top:1rem; margin-bottom: 2rem;">'
    end_marker = '        });\n    </script>'
    
    start_idx = services_text.find(start_marker)
    end_idx = services_text.find(end_marker, start_idx) + len(end_marker)
    
    if start_idx == -1 or end_idx == -1:
        print("Could not find extraction markers in services.html")
        return
        
    extracted_content = services_text[start_idx:end_idx]
    
    # Update links in extracted content to point to services.html since they will live on index.html
    extracted_content = extracted_content.replace('href="#sherpa-advantage"', 'href="services.html#sherpa-advantage"')
    extracted_content = extracted_content.replace('href="#service-', 'href="services.html#service-')
    
    # Remove it from services.html
    new_services = services_text[:start_idx] + "\n" + services_text[end_idx:]
    
    with open('services.html', 'w', encoding='utf-8') as f:
        f.write(new_services)
        
    # 2. Insert into index.html inside the hero section
    with open('index.html', 'r', encoding='utf-8') as f:
        index_text = f.read()
        
    insert_marker = '        </div>\n    </section>'
    insert_idx = index_text.find(insert_marker)
    
    if insert_idx == -1:
        print("Could not find insertion marker in index.html")
        return
        
    # Wrap it in a container for the CSS grid
    wrapper_start = '\n        <div class="hero-animation">\n'
    wrapper_end = '\n        </div>'
    
    content_to_insert = wrapper_start + extracted_content + wrapper_end
    
    new_index = index_text[:insert_idx] + content_to_insert + "\n" + index_text[insert_idx:]
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(new_index)
        
    print("Successfully moved animated map to index.html!")

if __name__ == '__main__':
    move_map()
