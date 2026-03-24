import os
import glob
import re
import shutil

html_files = glob.glob('*.html') + glob.glob('**/*.html', recursive=True)
html_files = list(set(html_files))

# Find all WebP files to update their references
webp_files = glob.glob('**/*.webp', recursive=True)

for webp in webp_files:
    basename = os.path.basename(webp)
    name_without_ext = os.path.splitext(basename)[0]
    # We replace any .png or .jpg or .jpeg with .webp for this file name
    # We need to read all HTML files
    for html_f in html_files:
        with open(html_f, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # replace "name_without_ext.png" or "name_without_ext.jpg" with "name_without_ext.webp"
        content = re.sub(rf'{name_without_ext}\.(png|jpg|jpeg)', f'{name_without_ext}.webp', content, flags=re.IGNORECASE)
        
        with open(html_f, 'w', encoding='utf-8') as f:
            f.write(content)

print(f"Updated HTML references for {len(webp_files)} WebP files.")

# Now move active assets from root to static/
image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico')
root_images = [f for f in os.listdir('.') if os.path.isfile(f) and f.lower().endswith(image_extensions)]

if not os.path.exists('static'):
    os.makedirs('static')

moved_count = 0
for img in root_images:
    # check if img is referenced in any HTML file
    # If we are asked to move *active* assets out of root, we should check references
    # But wait, task says "Move any active assets out of the root directory and into /static/"
    # Let's just check if they are referenced anywhere
    is_referenced = False
    for html_f in html_files:
        with open(html_f, 'r', encoding='utf-8') as f:
            if img in f.read():
                is_referenced = True
                break
    
    if is_referenced:
        # move file to static
        dest = os.path.join('static', img)
        if not os.path.exists(dest): # don't overwrite if it already exists there
            shutil.move(img, dest)
            moved_count += 1
            # Update references in HTML from "img" or "/img" or "./img" to "static/img" (or similar)
            for html_f in html_files:
                with open(html_f, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Update bare references like src="img" -> src="static/img"
                # Need to be careful not to replace static/img with static/static/img
                # Let's use regex for src="..." and href="..." and url(...)
                content = re.sub(rf'([\'"])(?:\.\/|\/)?{img}([\'"])', r'\g<1>static/' + img + r'\g<2>', content)
                content = re.sub(rf'url\([\'"]?(?:\.\/|\/)?{img}[\'"]?\)', f'url("static/{img}")', content)
                
                with open(html_f, 'w', encoding='utf-8') as f:
                    f.write(content)
        else:
            print(f"Could not move {img} to static/ because it already exists there. Will update references anyway if any were missing.")
            # update references just in case
            for html_f in html_files:
                with open(html_f, 'r', encoding='utf-8') as f:
                    content = f.read()
                content = re.sub(rf'([\'"])(?:\.\/|\/)?{img}([\'"])', r'\g<1>static/' + img + r'\g<2>', content)
                content = re.sub(rf'url\([\'"]?(?:\.\/|\/)?{img}[\'"]?\)', f'url("static/{img}")', content)
                with open(html_f, 'w', encoding='utf-8') as f:
                    f.write(content)
                
print(f"Moved and updated references for {moved_count} active root images.")
