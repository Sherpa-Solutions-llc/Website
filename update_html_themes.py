import os
import glob

directory = r"C:\Users\choos\Documents\Antigravity\sherpa_solutions"
html_files = glob.glob(os.path.join(directory, "**/*.html"), recursive=True)

processed = 0
for file in html_files:
    if "static" in file or "mock_emails" in file:
        continue
    
    with open(file, "r", encoding="utf-8") as f:
        content = f.read()
    
    original_content = content
    
    # 1. Update data-theme attribute
    content = content.replace('<html lang="en" data-theme="dark">', '<html lang="en" data-theme="light">')
    
    # Ensure all HTML tags that are missing data-theme get data-theme="light" (Except for those that shouldn't)
    if '<html lang="en">' in content:
        content = content.replace('<html lang="en">', '<html lang="en" data-theme="light">')
    
    # 2. Inject <style data-cms="custom-theme-colors"></style> before </head>
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
        
print(f"Successfully processed and updated {processed} HTML files.")
