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

# Mapping to isolate projects
DIRECT_MAP = {
    "heavenly_melody": "heavenly_melody",
    "open_vote": "open_vote",
    "live_earth": "live_earth",
    "live_earth2": "live_earth",
    "skip_tracer": "traku",
    "stock_agent": "stock_agent",
    "productivity_agent": "productivity_agent",
    "osint_api": "osint_api",
    "osint_api_docs": "osint_api",
    "freeme": "freeme",
    "voice-chat": "voice-chat",
    "sadtalker_worker": "voice-chat",
    "arbitrage": "arbitrage",
    "b2b_leads": "b2b_leads",
    "launchpad": "launchpad",
    "marion_va": "marion_va",
    "train_your_brain": "train_your_brain",
    "food_globe": "food_globe",
    "fun_e_stick": "fun_e_stick",
    "seo_sniper": "seo_sniper",
    "brand_monitor": "brand_monitor",
    "business_model": "business_model",
    "dealership_marketing": "dealership_marketing",
    "dealership_admin": "dealership_marketing",
    "hoosier_roadside": "hoosier_roadside",
    "avitar": "avitar",
    "dcsa_dashboard": "dcsa",
    "dcsa_personnel_vetting": "dcsa",
    "dcsa_industrial_security": "dcsa",
    "dcsa_counterintelligence": "dcsa",
    "dcsa_security_training": "dcsa",
    "dcsa_full_integration": "dcsa",
    "dcsa_2040_threats": "dcsa",
    "dcsa_agency_profile": "dcsa",
    "dcsa_resource_locator": "dcsa",
    "view_candidates": "dcsa",
    "index": "core_site",
    "about": "core_site",
    "contact": "core_site",
    "login": "core_site",
    "services": "core_site",
    "merchandise": "core_site",
    "projects": "core_site",
    "styles.css": "core_site",
    "settings": "core_site",
    "server": "core_site",
    "agent_audit": "core_site",
    "CLAUDE": "core_site"
}

def get_file_project(path):
    path = path.replace("\\", "/")
    filename = os.path.basename(path)
    name_no_ext = os.path.splitext(filename)[0]
    
    if name_no_ext in DIRECT_MAP:
        return DIRECT_MAP[name_no_ext]
    if filename in DIRECT_MAP:
        return DIRECT_MAP[filename]
        
    if filename.startswith("dcsa_"):
        return "dcsa"
    if filename.startswith("service_") or filename.startswith("merch_") or filename.startswith("backpack_"):
        return "core_site"
    if "deformation" in filename or "earthquake" in filename or "satellite" in filename or "flight" in filename:
        return "live_earth"
        
    if path.startswith("static/"):
        if "open_vote" in filename: return "open_vote"
        elif "live_earth" in filename: return "live_earth"
        elif "dcsa" in filename or "resource_locator" in filename: return "dcsa"
        elif "voice-chat" in filename or "voice_chat" in filename: return "voice-chat"
        elif "avitar" in filename or "avitar_3d" in filename: return "avitar"
        elif "productivity_agent" in filename: return "productivity_agent"
        elif "osint_api" in filename: return "osint_api"
        elif "launchpad" in filename: return "launchpad"
        elif "marion_va" in filename: return "marion_va"
        elif "food_globe" in filename: return "food_globe"
        elif "fun_e_stick" in filename or "fun_e" in filename: return "fun_e_stick"
        elif "seo_sniper" in filename: return "seo_sniper"
        elif "brand_monitor" in filename: return "brand_monitor"
        elif "hoosier" in filename or "roadside" in filename: return "hoosier_roadside"
        elif "heavenly_melody" in filename or "heavenly" in filename: return "heavenly_melody"
        elif "arbitrage" in filename: return "arbitrage"
        elif "b2b" in filename or "leads" in filename: return "b2b_leads"
        elif "train_your_brain" in filename or "brain" in filename: return "train_your_brain"
        elif "dealership" in filename: return "dealership_marketing"
        elif "styles" in filename or "theme" in filename or "cms" in filename: return "core_site"
        
    return "core_site" # Fallback to core_site

def update_progress(percentage, message, status="running"):
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({
            "current": percentage,
            "total": 100,
            "status": status,
            "message": message,
            "percentage": percentage
        }, f)

def bake_cms(selected_projects):
    if not os.path.exists(CMS_DB):
        return "CMS Database not found."
    
    conn = sqlite3.connect(CMS_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT element_id, html_content FROM content")
    cms_data = {row[0]: row[1] for row in cursor.fetchall()}
    conn.close()
    
    html_files = [f for f in os.listdir('.') if f.endswith('.html')]
    # Filter to only HTML files belonging to the selected projects
    html_files = [f for f in html_files if get_file_project(f) in selected_projects]
    total = len(html_files)
    
    if total == 0:
        return None
    
    for i, filename in enumerate(html_files):
        update_progress(10 + int((i / total) * 40), f"Baking CMS content into {filename}...")
        
        with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        elements = soup.find_all(attrs={"data-cms": True})
        changed = False
        for el in elements:
            eid = el['data-cms']
            if eid in cms_data:
                db_val = cms_data[eid]
                if not db_val:
                    continue
                # Replace content
                if el.name == 'img':
                    if el.get('src') != db_val:
                        el['src'] = db_val
                        changed = True
                else:
                    # Check if it's a JSON media payload
                    try:
                        if db_val.strip().startswith("{"):
                            data = json.loads(db_val)
                            if isinstance(data, dict) and ('img' in data or 'video' in data):
                                if 'video' in data and data['video']:
                                    el['data-video-src'] = data['video']
                                else:
                                    if el.has_attr('data-video-src'):
                                        del el['data-video-src']
                                    if el.has_attr('class') and 'video-thumbnail' in el['class']:
                                        el['class'].remove('video-thumbnail')
                                if 'img' in data and data['img']:
                                    img_tag = el.find('img')
                                    if not img_tag:
                                        img_tag = soup.new_tag("img")
                                        el.string = ""
                                        el.append(img_tag)
                                    img_tag['src'] = data['img']
                                changed = True
                                continue
                    except json.JSONDecodeError:
                        pass
                    
                    # For text elements, we inject HTML
                    new_content = BeautifulSoup(db_val, 'html.parser')
                    el.clear()
                    el.append(new_content)
                    changed = True
        
        if changed:
            with open(filename, 'w', encoding='utf-8', errors='ignore') as f:
                f.write(str(soup))
                
    return None

def git_push(selected_projects):
    try:
        update_progress(60, "Staging changes for GitHub...")
        
        # Get list of git modified/untracked files
        status_res = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
        
        added_files = []
        for line in status_res.stdout.splitlines():
            l_strip = line.strip()
            if not l_strip:
                continue
            path = line[3:].strip()
            
            # Skip progress and config files
            if "github_sync_progress.json" in path or "github_sync_config.json" in path:
                continue
                
            file_project = get_file_project(path)
            if file_project in selected_projects:
                # Stage only files belonging to selected projects
                subprocess.run(["git", "add", path], check=True)
                added_files.append(path)
                
        file_count = len(added_files)
        
        if file_count == 0:
            update_progress(100, f"No new changes detected in {', '.join(selected_projects)} (already up to date).", "completed")
            return
            
        update_progress(70, f"Committing changes ({file_count} files)...")
        commit_msg = f"Auto-deploy from Sherpa Admin ({', '.join(selected_projects)}) - {time.ctime()}"
        subprocess.run(["git", "commit", "-m", commit_msg], check=True)
        
        # Get current branch name
        branch_res = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True)
        current_branch = branch_res.stdout.strip() or "master"
        
        update_progress(80, f"Pushing {file_count} files to GitHub ({current_branch})...")
        result = subprocess.run(["git", "push"], capture_output=True, text=True)
        
        if result.returncode != 0:
            if "no upstream branch" in result.stderr:
                subprocess.run(["git", "push", "-u", "origin", current_branch], check=True)
            else:
                raise Exception(result.stderr)
                
        update_progress(100, f"Deployment Successful! {file_count} files synchronized for {', '.join(selected_projects)}.", "completed")
    except Exception as e:
        update_progress(100, f"Git Error: {str(e)}", "error")

def main():
    try:
        if not os.path.exists(CONFIG_FILE):
            update_progress(0, "Error: Config file missing.", "error")
            return

        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            
        selected_projects = config.get("projects", [])
        if not selected_projects:
            update_progress(100, "No projects selected for deployment.", "completed")
            return

        update_progress(5, f"Starting deployment pipeline for {', '.join(selected_projects)}...")
        time.sleep(1) # Visual feedback
        
        # 1. Bake CMS for selected projects only
        update_progress(10, "Baking CMS content into selected project files...")
        error = bake_cms(selected_projects)
        if error:
            update_progress(100, error, "error")
            return
            
        # 2. Run Individual Page Sync if core_site is selected
        if "core_site" in selected_projects:
            update_progress(55, "Syncing individual product metadata...")
            try:
                import sync_individual_pages
            except Exception as e:
                print(f"Sync script warning: {e}")
            
        # 3. Git Push selected files
        git_push(selected_projects)
        
    except Exception as e:
        update_progress(100, f"Critical Error: {str(e)}", "error")

if __name__ == "__main__":
    main()
