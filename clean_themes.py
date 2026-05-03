import os
import re

def clean_theme_overrides():
    # Pattern to match the broken style block
    pattern = re.compile(r'<style data-cms="custom-theme-colors">\s*:root\[data-theme="dark"\].*?</style>', re.DOTALL)
    
    html_files = [f for f in os.listdir('.') if f.endswith('.html')]
    
    count = 0
    for filename in html_files:
        try:
            with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            if pattern.search(content):
                new_content = pattern.sub('<style data-cms="custom-theme-colors"></style>', content)
                with open(filename, 'w', encoding='utf-8', errors='ignore') as f:
                    f.write(new_content)
                print(f"Cleaned {filename}")
                count += 1
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            
    print(f"Finished cleaning {count} files.")

if __name__ == "__main__":
    clean_theme_overrides()
