import os
import re
import shutil

def cleanup(base_dir):
    audit_file = os.path.join(base_dir, 'site_audit_output_utf8.txt')
    
    with open(audit_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    unused = []
    in_unused = False
    for line in lines:
        if line.startswith('3. UNUSED ASSETS'):
            in_unused = True
            continue
        if line.startswith('4. ROOT DIRECTORY CLUTTER'):
            in_unused = False
            break
        if in_unused and '[UNUSED]' in line:
            parts = line.split('[UNUSED]')
            if len(parts) > 1:
                filename = parts[1].strip()
                unused.append(filename)
                
    # 1. Delete unused files
    deleted_count = 0
    for u in unused:
        path = os.path.join(base_dir, u)
        if os.path.exists(path):
            os.remove(path)
            deleted_count += 1
            print(f"Deleted {u}")
            
    print(f"\nDeleted {deleted_count} unused files.\n")
    
    # 2. Move active files from root to static
    static_dir = os.path.join(base_dir, 'static')
    os.makedirs(static_dir, exist_ok=True)
    
    root_files = [f for f in os.listdir(base_dir) if os.path.isfile(os.path.join(base_dir, f))]
    root_images = [f for f in root_files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'))]
    
    moved_count = 0
    for img in root_images:
        src_path = os.path.join(base_dir, img)
        dst_path = os.path.join(static_dir, img)
        if os.path.exists(dst_path):
            # Already exists in static? We might want to remove the root one maybe?
            print(f"File {img} already exists in static/, deleting root duplicate.")
            os.remove(src_path)
        else:
            shutil.move(src_path, dst_path)
            moved_count += 1
            print(f"Moved {img} to static/")
            
    print(f"\nMoved {moved_count} files from root to static/.\n")
    
    # 3. Update HTML references
    html_files = [f for f in root_files if f.endswith('.html')]
    updated_files = 0
    
    for hf in html_files:
        path = os.path.join(base_dir, hf)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Match something like src="image.png" or href='image.jpg'
        # The key is: quote + filename (no slash) + quote
        # We only want to match image extensions since we only moved those.
        # Negative lookbehind to avoid matching already prefixed ones? We just ensure no slash in filename.
        pattern = r'(["\'])([^/"\'<>]+?\.(?:png|jpg|jpeg|gif|svg|ico))\1'
        
        def repl(match):
            quote = match.group(1)
            filename = match.group(2)
            # We move it to static/filename
            return f'{quote}static/{filename}{quote}'
            
        new_content, count = re.subn(pattern, repl, content, flags=re.IGNORECASE)
        
        if count > 0:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            updated_files += 1
            print(f"Updated {count} reference(s) in {hf}")
            
    print(f"\nUpdated HTML references in {updated_files} files.")

if __name__ == '__main__':
    cleanup(r'C:\Users\choos\.gemini\antigravity\scratch\Website')
