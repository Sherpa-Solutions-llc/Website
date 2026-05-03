import os
import glob

# Use current directory instead of hardcoded Windows path
directory = os.path.dirname(os.path.abspath(__file__))
html_files = glob.glob(os.path.join(directory, "**/*.html"), recursive=True)

processed = 0
for file in html_files:
    if any(x in file for x in ["static", "mock_emails", "venv", "node_modules"]):
        continue
    
    try:
        with open(file, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        print(f"Skipping {file} due to encoding issue (possibly binary).")
        continue
    
    original_content = content
    
    # 1. Update data-theme attribute to DARK
    content = content.replace('data-theme="light"', 'data-theme="dark"')
    
    # Ensure all HTML tags that are missing data-theme get data-theme="dark"
    if '<html' in content and 'data-theme' not in content:
        # Avoid double data-theme if it was already there but different
        if 'data-theme' not in content:
            content = content.replace('<html', '<html data-theme="dark"')
    
    # 2. Inject <style data-cms="custom-theme-colors"></style> before </head> if missing
    target_tag = '<style data-cms="custom-theme-colors"></style>'
    if target_tag not in content:
        if '</head>' in content:
            content = content.replace('</head>', f'    {target_tag}\n</head>')
        elif '</HEAD>' in content:
            content = content.replace('</HEAD>', f'    {target_tag}\n</HEAD>')
            
    if content != original_content:
        with open(file, "w", encoding="utf-8") as f:
            f.write(content)
        processed += 1
        
print(f"Successfully processed and updated {processed} HTML files to DARK mode.")
