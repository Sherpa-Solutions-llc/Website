import os
import json
import sqlite3
import time
import subprocess
from bs4 import BeautifulSoup

# Paths
CONFIG_FILE = "github_sync_config.json"
PROGRESS_FILE = "github_sync_progress.json"
CMS_DB = "sherpa_cms.db"

def update_progress(percentage, message, status="running"):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({
            "current": percentage,
            "total": 100,
            "status": status,
            "message": message,
            "percentage": percentage
        }, f)

def bake_cms():
    if not os.path.exists(CMS_DB):
        return "CMS Database not found."
    
    conn = sqlite3.connect(CMS_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT element_id, html_content FROM content")
    cms_data = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    
    html_files = [f for f in os.listdir('.') if f.endswith('.html')]
    total = len(html_files)
    
    for i, filename in enumerate(html_files):
        update_progress(10 + int((i / total) * 40), f"Baking CMS content into {filename}...")
        
        with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        elements = soup.find_all(attrs={"data-cms": True})
        changed = False
        for el in elements:
            eid = el['data-cms']
            if eid in cms_data:
                # Replace content
                if el.name == 'img':
                    if el.get('src') != cms_data[eid]:
                        el['src'] = cms_data[eid]
                        changed = True
                else:
                    # For text elements, we inject HTML
                    # BeautifulSoup's .clear() and .append() or just .string
                    # If it's complex HTML, use BeautifulSoup(content, 'html.parser')
                    new_content = BeautifulSoup(cms_data[eid], 'html.parser')
                    el.clear()
                    el.append(new_content)
                    changed = True
        
        if changed:
            with open(filename, 'w', encoding='utf-8', errors='ignore') as f:
                f.write(str(soup))
                
    return None

def git_push():
    try:
        update_progress(60, "Staging changes for GitHub...")
        subprocess.run(["git", "add", "."], check=True)
        
        update_progress(70, "Committing changes...")
        # Check if there are changes to commit
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout
        if not status:
            update_progress(100, "No changes to deploy.", "completed")
            return
            
        subprocess.run(["git", "commit", "-m", f"Auto-deploy from Sherpa Admin - {time.ctime()}"], check=True)
        
        # Get current branch name
        branch_res = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True)
        current_branch = branch_res.stdout.strip() or "master"
        
        update_progress(80, f"Pushing to GitHub ({current_branch})...")
        result = subprocess.run(["git", "push"], capture_output=True, text=True)
        
        if result.returncode != 0:
            if "no upstream branch" in result.stderr:
                # Use detected branch instead of hardcoded 'main'
                subprocess.run(["git", "push", "-u", "origin", current_branch], check=True)
            else:
                raise Exception(result.stderr)
                
        update_progress(100, "Deployment Successful!", "completed")
    except Exception as e:
        update_progress(100, f"Git Error: {str(e)}", "error")

def main():
    try:
        if not os.path.exists(CONFIG_FILE):
            update_progress(0, "Error: Config file missing.", "error")
            return

        update_progress(5, "Starting deployment pipeline...")
        time.sleep(1) # Visual feedback
        
        # 1. Bake CMS
        update_progress(10, "Baking CMS content into static files...")
        error = bake_cms()
        if error:
            update_progress(100, error, "error")
            return
            
        # 2. Run Individual Page Sync (Thumbnails, etc)
        update_progress(55, "Syncing individual product metadata...")
        try:
            import sync_individual_pages
            # This script runs on import if not guarded, but we'll call its logic if it had any
        except Exception as e:
            print(f"Sync script warning: {e}")
            
        # 3. Git Push
        git_push()
        
    except Exception as e:
        update_progress(100, f"Critical Error: {str(e)}", "error")

if __name__ == "__main__":
    main()
