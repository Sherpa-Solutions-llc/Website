import os
import re

def audit_site(base_dir):
    print("--- SITE MAINTENANCE AUDIT ---\n")
    
    html_files = []
    assets = []
    
    # 1. Gather all files
    for root, dirs, files in os.walk(base_dir):
        if '.git' in root or '__pycache__' in root or 'node_modules' in root:
            continue
        for f in files:
            path = os.path.join(root, f)
            if f.endswith('.html'):
                html_files.append(path)
            elif f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.css', '.js')):
                assets.append(path)
                
    # 2. Check for large assets (>500KB)
    print("1. LARGE ASSETS (>500KB)")
    large_assets = [a for a in assets if os.path.getsize(a) > 500 * 1024]
    for la in large_assets:
        size_kb = os.path.getsize(la) / 1024
        print(f"  [WARNING] {os.path.relpath(la, base_dir)}: {size_kb:.1f} KB")
        
    if not large_assets:
        print("  [OK] No assets over 500KB found.")
        
    # 3. Check for broken references & missing alt tags
    print("\n2. HTML STRUCTURE & BROKEN LINKS")
    referenced_links = set()
    all_asset_names = {os.path.basename(a) for a in assets}
    
    for html in html_files:
        with open(html, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        # Missing alt tags
        img_tags = re.findall(r'<img\s+[^>]*>', content, re.IGNORECASE)
        for img in img_tags:
            src_match = re.search(r'src=["\']([^"\']+)["\']', img, re.IGNORECASE)
            alt_match = re.search(r'alt=["\']([^"\']*)["\']', img, re.IGNORECASE)
            
            if src_match:
                src = src_match.group(1)
                # Ignore external links for missing alt
                if not src.startswith(('http://', 'https://', 'data:')):
                    filename = os.path.basename(src)
                    referenced_links.add(filename)
                    if not alt_match or not alt_match.group(1).strip():
                        print(f"  [MISSING ALT] {os.path.basename(html)}: <img src='{src}'>")

        # Duplicate IDs
        ids = re.findall(r'id=["\']([^"\']+)["\']', content, re.IGNORECASE)
        duplicate_ids = set([i for i in ids if ids.count(i) > 1])
        if duplicate_ids:
            print(f"  [DUPLICATE IDs] {os.path.basename(html)}: {', '.join(duplicate_ids)}")

        # Check for broken references (naive check)
        links = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', content, re.IGNORECASE)
        for link in links:
            if link.startswith(('http://', 'https://', 'data:', '#', 'mailto:', 'tel:')):
                continue
            
            # Remove query params / hashes
            clean_link = link.split('?')[0].split('#')[0]
            if not clean_link:
                continue
                
            filename = os.path.basename(clean_link)
            if filename not in all_asset_names and not any(os.path.basename(h) == filename for h in html_files):
                # Could be a missing file if it's not a known route
                if clean_link.endswith(('.png', '.jpg', '.css', '.js', '.svg')):
                    print(f"  [BROKEN LINK] {os.path.basename(html)}: -> {clean_link}")

    # 4. Check for unused assets (mostly images/css/js inside root/static)
    print("\n3. UNUSED ASSETS")
    unused_assets = []
    for asset in assets:
        name = os.path.basename(asset)
        # ignore some generic files
        if name in ('styles.css', 'cart.js', 'script.js', 'cms.js'):
            pass  # actually check them but simpler to just skip
        if name not in referenced_links and not asset.endswith(('.css', '.js', '.ico')):
            unused_assets.append(asset)
            
    for ua in unused_assets:
        print(f"  [UNUSED] {os.path.relpath(ua, base_dir)}")
        
    if not unused_assets:
        print("  [OK] No obviously unused static images found.")

    # 5. Root directory clutter
    print("\n4. ROOT DIRECTORY CLUTTER")
    root_files = [f for f in os.listdir(base_dir) if os.path.isfile(os.path.join(base_dir, f))]
    root_images = [f for f in root_files if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg'))]
    if root_images:
        print(f"  [WARNING] Found {len(root_images)} image files in the root directory. Should be moved to /static/.")
        for ri in root_images[:5]:
            print(f"    - {ri}")
        if len(root_images) > 5:
            print(f"    ... and {len(root_images)-5} more.")

if __name__ == '__main__':
    audit_site(r'C:\Users\choos\.gemini\antigravity\scratch\Website')
