import os
import secrets
import asyncio
import aiosqlite
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, Form, Response, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

import database

from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI()

# Allow both local dev and the live GitHub Pages site
ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://localhost:8001",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8001",
    "https://sherpa-solutions-llc.com",
    "https://www.sherpa-solutions-llc.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (css, images)
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory session store for simplicity (token -> user_id)
# In production, use Redis or signed JWT cookies
sessions = {}

def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token or token not in sessions:
        return None
        
    session_data = sessions[token]
    if datetime.now() > session_data["expires"]:
        del sessions[token]
        return None
        
    return session_data["username"]

def require_admin(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user

@app.get("/api/health")
async def health_check():
    """Railway healthcheck endpoint"""
    return {"status": "ok", "service": "sherpa-solutions-api"}

@app.on_event("startup")
async def startup_event():
    await database.init_db()
    await init_flights_db()
    asyncio.create_task(fetch_flights_loop())

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()
    content_map = await database.get_all_content()
    # Basic server-side template hydration for CMS elements
    # We will also load these via JS for the editor later
    return html

@app.get("/{page_name}.html", response_class=HTMLResponse)
async def serve_pages(page_name: str, request: Request):
    if page_name == "settings":
        user = get_current_user(request)
        if not user:
            return RedirectResponse(url="/login.html", status_code=status.HTTP_302_FOUND)
    
    html_path = f"{page_name}.html"
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            return f.read()
    raise HTTPException(status_code=404)


@app.post("/api/login")
async def login(response: Response, username: str = Form(...), password: str = Form(...)):
    if await database.verify_user(username, password):
        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "username": username,
            "expires": datetime.now() + timedelta(days=1)
        }
        response = RedirectResponse(url="/settings.html", status_code=status.HTTP_302_FOUND)
        response.set_cookie(key="session_token", value=token, httponly=True, max_age=86400)
        return response
    
    # Return error param
    return RedirectResponse(url="/login.html?error=1", status_code=status.HTTP_302_FOUND)

@app.post("/api/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token in sessions:
        del sessions[token]
    response = RedirectResponse(url="/login.html", status_code=status.HTTP_302_FOUND)
    response.delete_cookie("session_token")
    return response

# --- CMS API Routes ---

@app.get("/api/content")
async def get_content(response: Response):
    content = await database.get_all_content()
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return JSONResponse(content)

class ContentUpdate(BaseModel):
    element_id: str
    html_content: str

class ContentRegister(BaseModel):
    element_id: str
    default_content: str

@app.post("/api/content/register")
async def register_content(req: ContentRegister):
    await database.register_content_default(req.element_id, req.default_content)
    return {"status": "success"}

@app.post("/api/content")
async def update_content(update: ContentUpdate, user: str = Depends(require_admin)):
    await database.update_content(update.element_id, update.html_content)
    return {"status": "success"}

from fastapi import UploadFile, File
import shutil
import os

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), user: str = Depends(require_admin)):
    # Ensure static directory exists
    if not os.path.exists(STATIC_DIR):
        os.makedirs(STATIC_DIR)
        
    file_location = os.path.join(STATIC_DIR, file.filename)
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
    
    # Return the relative URL for browser use
    return {"url": f"/static/{file.filename}"}

# --- Admin API Routes ---

@app.get("/api/users")
async def list_users(user: str = Depends(require_admin)):
    users = await database.get_all_users()
    return JSONResponse(users)

class NewUser(BaseModel):
    username: str
    password: str

@app.post("/api/users")
async def add_user(new_user: NewUser, user: str = Depends(require_admin)):
    success = await database.add_admin_user(new_user.username, new_user.password)
    if success:
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Username already exists")

@app.delete("/api/users/{user_id}")
async def remove_user(user_id: int, user: str = Depends(require_admin)):
    # Prevent deleting the core cricks account as a safety feature just in case
    # In a real app we'd fetch the user first
    if user_id == 1: 
        raise HTTPException(status_code=403, detail="Cannot delete root admin")
        
    await database.remove_admin_user(user_id)
    return {"status": "success"}

@app.put("/api/users/{user_id}/revoke")
async def revoke_user(user_id: int, user: str = Depends(require_admin)):
    if user_id == 1: 
        raise HTTPException(status_code=403, detail="Cannot revoke root admin")
        
    await database.revoke_admin_access(user_id)
    return {"status": "success"}

class PasswordUpdate(BaseModel):
    new_password: str

@app.put("/api/users/{user_id}/password")
async def update_user_password(user_id: int, update: PasswordUpdate, user: str = Depends(require_admin)):
    # Optional: We could prevent changing root password by non-root users if we tracked roles deeper, 
    # but for this demo any authenticated admin can change passwords.
    await database.edit_admin_password(user_id, update.new_password)
    return {"status": "success"}
import subprocess

@app.get("/api/sync-progress")
async def sync_progress(user: str = Depends(require_admin)):
    progress_file = r"C:\tmp\github_sync_progress.json"
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                import json
                return JSONResponse(json.load(f))
        except:
            return JSONResponse({"status": "error", "message": "Failed to read progress"})
    return JSONResponse({"status": "idle", "message": "No sync in progress", "percentage": 0})

SAFE_EDIT_PAGES = ['index', 'about', 'services', 'projects', 'contact', 'merchandise', 'live_earth']

@app.get("/api/edit-page/{page_name}")
async def edit_page_view(page_name: str, user: str = Depends(require_admin)):
    if page_name not in SAFE_EDIT_PAGES:
        raise HTTPException(status_code=404)
    html_path = os.path.join(BASE_DIR, f"{page_name}.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404)
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # Inject <base> so relative assets resolve correctly inside the iframe
    html = html.replace('<head>', '<head><base href="/">', 1)

    editor_injection = r"""
    <style>
        /* ---- CMS Editor Overlay Styles ---- */
        [data-cms] {
            outline: 2px dashed rgba(192,108,59,0.35) !important;
            cursor: pointer !important;
            transition: outline 0.15s, background 0.15s;
            border-radius: 3px;
        }
        [data-cms]:hover {
            outline: 2px solid rgba(192,108,59,0.85) !important;
            background: rgba(192,108,59,0.05) !important;
        }
        [data-cms][data-cms-active] {
            outline: 2px solid #c06c3b !important;
            background: rgba(192,108,59,0.07) !important;
        }
        
        #_cms_top_bar {
            position: fixed; top: 0; left: 0; width: 100%; height: 50px;
            background: #1e2e1f; color: #fff; z-index: 2147483647;
            display: flex; justify-content: space-between; align-items: center;
            padding: 0 20px; font-family: 'Outfit','Inter',sans-serif;
            box-sizing: border-box; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        #_cms_top_bar span { font-size: 14px; font-weight: 500; }
        #_cms_top_save_btn {
            background: #2ecc71; color: #fff; border: none; padding: 8px 16px;
            border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;
        }
        #_cms_top_save_btn:hover:not([disabled]) { background: #27ae60; }
        #_cms_top_save_btn[disabled] { opacity: 0.5; cursor: not-allowed; }
        body { margin-top: 50px !important; }

        /* Image modal */
        #_cms_img_overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.72);
            z-index: 2147483646;
            display: none;
            align-items: center;
            justify-content: center;
        }
        #_cms_img_overlay.open { display: flex; }
        #_cms_img_box {
            background: #fff;
            border-radius: 18px;
            padding: 2rem 2rem 1.75rem;
            max-width: 500px;
            width: 92%;
            font-family: 'Outfit','Inter',sans-serif;
            box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        }
        #_cms_img_box h3 { margin: 0 0 .4rem; color: #1e2e1f; font-size: 1.3rem; }
        #_cms_img_box p  { margin: 0 0 1rem; color: #666; font-size: .88rem; }
        #_cms_img_box label { display: block; font-weight: 600; font-size: .85rem; color: #2d3f2e; margin-bottom: .25rem; }
        #_cms_img_box input[type=text] {
            width: 100%; padding: .65rem .85rem; border: 1px solid #ddd;
            border-radius: 8px; font-size: .9rem; box-sizing: border-box; margin-bottom: .9rem;
            font-family: inherit;
        }
        #_cms_img_box input[type=file] { font-size: .85rem; margin-bottom: 1.2rem; }
        #_cms_img_preview { text-align: center; margin-bottom: 1rem; }
        #_cms_img_preview img { max-height: 130px; max-width: 100%; border-radius: 8px; border: 1px solid #eee; }
        #_cms_img_box .img-actions { display: flex; gap: .75rem; justify-content: flex-end; }
        #_cms_img_box .img-actions button {
            padding: .6rem 1.4rem; border-radius: 8px; border: none;
            cursor: pointer; font-size: .92rem; font-weight: 600; font-family: inherit;
        }
        .img-btn-apply  { background: #c06c3b; color: #fff; }
        .img-btn-cancel { background: #f0f0f0; color: #333; }
        .img-btn-apply:hover  { background: #a85e33; }
        .img-btn-cancel:hover { background: #e0e0e0; }
        /* Toast */
        #_cms_toast {
            position: fixed; bottom: 1.75rem; left: 50%;
            transform: translateX(-50%) translateY(90px);
            background: #2ecc71; color: #fff;
            padding: .65rem 2rem; border-radius: 50px;
            font-weight: 700; font-size: .88rem;
            z-index: 2147483647; transition: transform .3s ease;
            pointer-events: none; font-family: 'Outfit','Inter',sans-serif;
            box-shadow: 0 4px 16px rgba(46,204,113,.45);
        }
        #_cms_toast.show { transform: translateX(-50%) translateY(0); }
    </style>

    <div id="_cms_top_bar">
        <span>Editing <span id="_cms_mod_count" style="color:#c06c3b; font-weight:700;">0</span> pending changes</span>
        <button id="_cms_top_save_btn" disabled><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
    </div>

    <script>
    (function() {
        let _dirtyFields = {};
        let _activeEl = null; 
        let _origHTML = '';

        /* ---- helpers ---- */
        function toast(msg, color) {
            const t = document.getElementById('_cms_toast');
            t.textContent = msg;
            t.style.background = color || '#2ecc71';
            t.classList.add('show');
            setTimeout(() => t.classList.remove('show'), 2600);
        }

        function markDirty(id, val) {
            _dirtyFields[id] = val;
            updateUI();
        }

        function updateUI() {
            const count = Object.keys(_dirtyFields).length;
            document.getElementById('_cms_mod_count').innerText = count;
            document.getElementById('_cms_top_save_btn').disabled = count === 0;
            window.parent && window.parent.postMessage({ type: 'cms-dirty', count }, '*');
        }

        document.getElementById('_cms_top_save_btn').onclick = () => {
            // Also commit any currently active element before saving
            commitActiveEl();
            window.parent && window.parent.postMessage({ type: 'cms-changes-data', changes: _dirtyFields }, '*');
        };

        window.addEventListener('message', e => {
            if (e.data.type === 'cms-get-changes') {
                commitActiveEl();
                window.parent && window.parent.postMessage({ type: 'cms-changes-data', changes: _dirtyFields }, '*');
            } else if (e.data.type === 'cms-saved') {
                _dirtyFields = {};
                updateUI();
                toast('\u2713 All changes saved!');
            }
        });

        window.addEventListener('beforeunload', function (e) {
            if (Object.keys(_dirtyFields).length > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        function commitActiveEl() {
            if (!_activeEl) return;
            const id = _activeEl.getAttribute('data-cms');
            const val = _activeEl.innerHTML;
            if (val !== _origHTML) {
                markDirty(id, val);
            }
            _activeEl.removeAttribute('contenteditable');
            _activeEl.removeAttribute('data-cms-active');
            _activeEl = null; _origHTML = '';
        }

        /* ---- image modal ---- */
        let _imgEl = null, _imgTag = null;

        const overlay = document.createElement('div');
        overlay.id = '_cms_img_overlay';
        overlay.innerHTML = `
            <div id="_cms_img_box">
                <h3>Update Image</h3>
                <p>Enter a URL or upload a new file to replace this image.</p>
                <div id="_cms_img_preview"></div>
                <label>Image URL</label>
                <input type="text" id="_cms_img_url" placeholder="https://... or /static/filename.jpg">
                <label>&#8212;&nbsp; or upload a file &nbsp;&#8212;</label>
                <input type="file" id="_cms_img_file" accept="image/*">
                <div class="img-actions">
                    <button class="img-btn-cancel" id="_cms_img_cancel">Cancel</button>
                    <button class="img-btn-apply"  id="_cms_img_apply">Apply Image</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('_cms_img_cancel').onclick = () => overlay.classList.remove('open');

        document.getElementById('_cms_img_apply').onclick = async function() {
            const fileInput = document.getElementById('_cms_img_file');
            const urlInput  = document.getElementById('_cms_img_url');
            let newSrc = '';

            if (fileInput.files && fileInput.files.length > 0) {
                const fd = new FormData();
                fd.append('file', fileInput.files[0]);
                const r = await fetch('/api/upload', { method: 'POST', body: fd });
                if (r.ok) { newSrc = (await r.json()).url; }
                else { toast('\u26a0 Upload failed', '#e74c3c'); return; }
            } else if (urlInput.value.trim()) {
                newSrc = urlInput.value.trim();
            } else {
                toast('Enter a URL or choose a file', '#e67e22'); return;
            }

            if (_imgTag) _imgTag.src = newSrc;
            const id = _imgEl && _imgEl.getAttribute('data-cms');
            if (id) {
                markDirty(id, newSrc);
                toast('\u2713 Image locally updated');
            } else {
                toast('\u26a0 Error: Image lacks CMS ID');
            }
            overlay.classList.remove('open');
        };

        /* ---- toast ---- */
        const toastEl = document.createElement('div');
        toastEl.id = '_cms_toast';
        document.body.appendChild(toastEl);

        /* ---- init ---- */
        function init() {
            // Apply click handlers to data-cms elements
            document.querySelectorAll('[data-cms]').forEach(el => {
                el.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    // If clicking same element, do nothing
                    if (_activeEl === el) return;

                    commitActiveEl();

                    // Image element?
                    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
                    if (img) {
                        _imgEl = el; _imgTag = img;
                        document.getElementById('_cms_img_url').value  = img.getAttribute('src') || '';
                        document.getElementById('_cms_img_file').value = '';
                        document.getElementById('_cms_img_preview').innerHTML =
                            `<img src="${img.getAttribute('src')}" alt="current">`;
                        overlay.classList.add('open');
                        return;
                    }

                    // Text element
                    _activeEl = el;
                    _origHTML = el.innerHTML;
                    el.setAttribute('contenteditable', 'true');
                    el.setAttribute('data-cms-active', '1');
                    el.setAttribute('spellcheck', 'true');
                    el.focus();

                    el.oninput = function() {
                        if (el.innerHTML !== _origHTML) {
                            window.parent && window.parent.postMessage({ type: 'cms-dirty', count: Object.keys(_dirtyFields).length || 1 }, '*');
                            document.getElementById('_cms_top_save_btn').disabled = false;
                        } else {
                            updateUI();
                        }
                    };

                    // Enter = line break, not new block
                    el.onkeydown = function(ev) {
                        if (ev.key === 'Enter' && !ev.shiftKey) {
                            ev.preventDefault();
                            document.execCommand('insertLineBreak');
                        }
                    };
                });
            });

            // Commit when clicking off an active element
            document.addEventListener('click', function(e) {
                if (_activeEl && !_activeEl.contains(e.target)) {
                    commitActiveEl();
                }
            });

            // Block link navigation outside data-cms elements
            document.querySelectorAll('a[href]').forEach(a => {
                if (!a.closest('[data-cms]')) a.addEventListener('click', e => e.preventDefault());
            });
            document.querySelectorAll('form').forEach(f => {
                f.addEventListener('submit', e => e.preventDefault());
            });
        }

        // Ensure init runs AFTER static/cms.js has generated the auto data-cms tags!
        // We defer execution slightly if needed, but DOMContentLoaded is enough if we hook in correctly.
        // Actually since we want cms.js to run first, let's use a small timeout to let all synchronous DOM additions finish.
        setTimeout(init, 50);
        
    })();
    </script>
    """
    html = html.replace('</body>', editor_injection + '</body>')
    return HTMLResponse(html)



import asyncio

@app.post("/api/sync-github")
async def sync_github(user: str = Depends(require_admin)):
    try:
        # Initialize progress file with starting state
        progress_file = r"C:\tmp\github_sync_progress.json"
        with open(progress_file, 'w') as f:
            import json
            json.dump({"current": 0, "total": 0, "status": "starting", "message": "Initializing...", "percentage": 0}, f)
            
        # Run the existing upload script in the background
        # Using the same interpreter and absolute path for reliability
        script_path = r"C:\tmp\github_final_upload.py"
        python_exe = r"C:\Users\choos\AppData\Local\Python\pythoncore-3.14-64\python.exe"
        
        # We DON'T await process.communicate() here, so the API returns immediately
        # and allows the frontend to poll for progress while the script runs.
        subprocess.Popen([python_exe, script_path], 
                         stdout=subprocess.DEVNULL, 
                         stderr=subprocess.DEVNULL,
                         creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            
        return {"status": "success", "message": "Deployment started in background."}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )

# --- Lead Capture: Roadmap Form ---

class LeadCapture(BaseModel):
    email: str

@app.post("/api/lead-capture")
async def lead_capture(lead: LeadCapture):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    visitor_email = lead.email.strip()
    to_address = "basecamp@sherpa-solutions-llc.com"

    # SMTP credentials read from environment variables (set these on the server).
    # Example:  set SMTP_USER=your.gmail@gmail.com  &&  set SMTP_PASS=your_app_password
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        # Log the lead server-side even if SMTP isn't configured yet
        print(f"[LEAD CAPTURE] New roadmap request from: {visitor_email}")
        return JSONResponse({"status": "success", "message": "Lead recorded (SMTP not configured)"})

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "send me a sample roadmap to using AI"
        msg["From"] = smtp_user
        msg["To"] = to_address
        msg["Reply-To"] = visitor_email

        body_html = f"""
        <html><body style="font-family: Arial, sans-serif; color: #2d3f2e;">
            <h2 style="color: #C06C3B;">New AI Roadmap Lead 🏔️</h2>
            <p>A visitor submitted the <strong>AI Strategy Roadmap</strong> form on the Sherpa Solutions homepage.</p>
            <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Email</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">{visitor_email}</td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9;"><strong>Requested</strong></td>
                    <td style="padding: 8px; border: 1px solid #ddd;">AI Strategy Roadmap for Mid-Size Companies</td>
                </tr>
            </table>
            <p style="margin-top: 20px;">Reply directly to this email to reach the prospect.</p>
        </body></html>
        """
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_address, msg.as_string())

        print(f"[LEAD CAPTURE] Email sent for: {visitor_email}")
        return JSONResponse({"status": "success"})

    except Exception as e:
        print(f"[LEAD CAPTURE] SMTP error for {visitor_email}: {e}")
        # Still return success to the user — don't expose SMTP errors publicly
        return JSONResponse({"status": "success", "note": "logged"})


# --- OpenSky Flights API Proxy with Global Cache ---

import httpx
import time

opensky_cache = {
    "data": None,
    "last_fetched": 0
}

import random
import math

# Major world airports with realistic lat/lng and country codes/airline callsigns
WORLD_AIRPORTS = [
    # North America
    ("JFK", 40.6413, -73.7781, "US", ["UAL", "AAL", "DAL", "JBU", "B6"]),
    ("LAX", 33.9425, -118.4081, "US", ["UAL", "AAL", "DAL", "WN", "SWA"]),
    ("ORD", 41.9742, -87.9073, "US", ["UAL", "AAL", "SWA", "DAL"]),
    ("ATL", 33.6407, -84.4277, "US", ["DAL", "SWA", "UAL", "AAL"]),
    ("YYZ", 43.6777, -79.6248, "CA", ["ACA", "WJA", "DAL"]),
    ("MEX", 19.4361, -99.0719, "MX", ["AMX", "VOI", "VIV"]),
    # Europe
    ("LHR", 51.4775, -0.4614, "GB", ["BAW", "VIR", "EZY"]),
    ("CDG", 48.9794, 2.5508, "FR", ["AFR", "EZY", "TVF"]),
    ("FRA", 50.0333, 8.5706, "DE", ["DLH", "CFG", "EWG"]),
    ("AMS", 52.3086, 4.7639, "NL", ["KLM", "TRA", "EZY"]),
    ("MAD", 40.4719, -3.5626, "ES", ["IBE", "VLG", "RYR"]),
    ("IST", 41.2608, 28.7418, "TR", ["THY", "PGT"]),
    ("SVO", 55.9736, 37.4125, "RU", ["AFL", "SU"]),
    ("FCO", 41.7999, 12.2462, "IT", ["AZA", "RYR", "FCM"]),
    ("MUC", 48.3537, 11.7860, "DE", ["DLH", "EWG", "CFG"]),
    # Asia-Pacific
    ("HND", 35.5494, 139.7798, "JP", ["ANA", "JAL", "SNA"]),
    ("PEK", 40.0799, 116.6031, "CN", ["CCA", "CSN", "CXA"]),
    ("PVG", 31.1443, 121.8083, "CN", ["CES", "CCA", "CSN"]),
    ("HKG", 22.3080, 113.9185, "HK", ["CPA", "HDA", "GCR"]),
    ("SIN", 1.3644, 103.9915, "SG", ["SIA", "TGW", "JIN"]),
    ("BKK", 13.6900, 100.7501, "TH", ["THA", "BPG", "NOK"]),
    ("SYD", -33.9461, 151.1772, "AU", ["QFA", "VOZ", "TGW"]),
    ("MEL", -37.6690, 144.8410, "AU", ["QFA", "VOZ", "REX"]),
    ("DXB", 25.2532, 55.3657, "AE", ["UAE", "FDB", "EK"]),
    ("DOH", 25.2609, 51.6138, "QA", ["QTR", "QR"]),
    # Africa / South America
    ("JNB", -26.1367, 28.2411, "ZA", ["SAA", "MNO", "FA"]),
    ("CAI", 30.1219, 31.4056, "EG", ["MSR", "NIA", "EG"]),
    ("NBO", -1.3192, 36.9275, "KE", ["KQA", "JAM"]),
    ("GRU", -23.4356, -46.4731, "BR", ["GLO", "TAM", "LAM"]),
    ("GIG", -22.8099, -43.2505, "BR", ["GLO", "TAM"]),
    ("EZE", -34.8222, -58.5358, "AR", ["ARG", "AEP"]),
    ("SCL", -33.3928, -70.7856, "CL", ["LAN", "SKU"]),
    ("BOG", 4.7016, -74.1469, "CO", ["AVA", "LNE"]),
    ("LIM", -12.0219, -77.1143, "PE", ["LPE", "AVA"]),
]

def _great_circle_point(lat1, lon1, lat2, lon2, frac):
    """Interpolate a point along the great circle between two airports at fraction frac (0..1)."""
    lat1r, lon1r = math.radians(lat1), math.radians(lon1)
    lat2r, lon2r = math.radians(lat2), math.radians(lon2)
    d = 2 * math.asin(math.sqrt(
        math.sin((lat2r - lat1r) / 2) ** 2 +
        math.cos(lat1r) * math.cos(lat2r) * math.sin((lon2r - lon1r) / 2) ** 2
    ))
    if d < 1e-9:
        return lat1, lon1, 0.0
    A = math.sin((1 - frac) * d) / math.sin(d)
    B = math.sin(frac * d) / math.sin(d)
    x = A * math.cos(lat1r) * math.cos(lon1r) + B * math.cos(lat2r) * math.cos(lon2r)
    y = A * math.cos(lat1r) * math.sin(lon1r) + B * math.cos(lat2r) * math.sin(lon2r)
    z = A * math.sin(lat1r) + B * math.sin(lat2r)
    lat = math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))
    lon = math.degrees(math.atan2(y, x))
    # Compute initial bearing from this point toward destination
    dlon = lon2r - math.radians(lon)
    bearing = math.degrees(math.atan2(
        math.sin(dlon) * math.cos(lat2r),
        math.cos(math.radians(lat)) * math.sin(lat2r) - math.sin(math.radians(lat)) * math.cos(lat2r) * math.cos(dlon)
    )) % 360
    return lat, lon, bearing

def generate_mock_flights():
    states = []
    n = len(WORLD_AIRPORTS)
    for i in range(4500):
        is_military = i > 4000

        if is_military:
            # Military flights: random positions, military callsigns
            lat = random.uniform(-75, 75)
            lon = random.uniform(-180, 180)
            heading = random.uniform(0, 360)
            velocity = random.uniform(200, 350)  # m/s — often faster
            alt = random.uniform(6000, 15000)
            mil_callsigns = ['RCH', 'AF', 'RRR', 'CNV', 'EXEC', 'MAC', 'SAM']
            callsign = random.choice(mil_callsigns) + str(random.randint(1, 999))
            country = random.choice(['US', 'GB', 'FR', 'DE', 'RU', 'CN'])
        else:
            # Pick two distinct airports for origin/destination
            orig_idx = random.randrange(n)
            dest_idx = random.randrange(n - 1)
            if dest_idx >= orig_idx:
                dest_idx += 1
            orig = WORLD_AIRPORTS[orig_idx]
            dest = WORLD_AIRPORTS[dest_idx]

            # Random progress along the route (0..1)
            frac = random.random()
            lat, lon, heading = _great_circle_point(orig[1], orig[2], dest[1], dest[2], frac)

            velocity = random.uniform(220, 260)  # m/s — typical cruise ~880 km/h
            alt = random.uniform(9000, 12500)
            callsign = random.choice(orig[4]) + str(random.randint(100, 9999))
            country = orig[3]

        state = [
            f"m{i:05x}",  # 0: id
            callsign,     # 1: callsign
            country,      # 2: country
            None,         # 3: time
            None,         # 4: last contact
            lon,          # 5: lng
            lat,          # 6: lat
            alt,          # 7: alt meters
            False,        # 8: on_ground
            velocity,     # 9: velocity (m/s)
            heading       # 10: heading
        ]
        states.append(state)
    return {"time": int(time.time()), "states": states}

FLIGHTS_DB = "sherpa_flights.db"

async def init_flights_db():
    async with aiosqlite.connect(FLIGHTS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS flights (
                icao24 TEXT PRIMARY KEY,
                callsign TEXT,
                country TEXT,
                time_position INTEGER,
                last_contact INTEGER,
                lng REAL,
                lat REAL,
                alt REAL,
                on_ground BOOLEAN,
                velocity REAL,
                heading REAL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS flight_metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
        await db.commit()

async def fetch_flights_loop():
    import httpx
    import time
    while True:
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get('https://opensky-network.org/api/states/all', timeout=15.0)
                res.raise_for_status()
                data = res.json()
                
                states = data.get("states", [])
                
                async with aiosqlite.connect(FLIGHTS_DB) as db:
                    await db.execute("DELETE FROM flights")
                    
                    insert_data = []
                    for s in states:
                        if len(s) >= 11:
                            insert_data.append((
                                s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], bool(s[8]), s[9], s[10]
                            ))
                    
                    await db.executemany('''
                        INSERT INTO flights 
                        (icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', insert_data)
                    
                    current_time = int(time.time())
                    source_time = data.get("time", current_time)
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('fetch_time', ?)", (str(current_time),))
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('source_time', ?)", (str(source_time),))
                    await db.commit()
                print(f"Background Scraper: Successfully stored {len(states)} flights in SQLite database.")
        except Exception as e:
            print(f"Background Scraper Failed: {e}")
        
        # Free public API limit: 100 per day. 4 pulls per hour = 96 pulls/day. Perfect 15m cadence!
        await asyncio.sleep(900)

@app.get("/api/flights")
async def get_flights():
    import time
    try:
        async with aiosqlite.connect(FLIGHTS_DB) as db:
            async with db.execute("SELECT value FROM flight_metadata WHERE key = 'source_time'") as cursor:
                row = await cursor.fetchone()
                if not row:
                    return JSONResponse(generate_mock_flights())
                source_time = int(row[0])
            
            # Massive payload optimization: Do not transmit grounded planes to the client
            async with db.execute("SELECT icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading FROM flights WHERE on_ground = 0") as cursor:
                rows = await cursor.fetchall()
                
                states = []
                for r in rows:
                    states.append([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8]), r[9], r[10]])
                    
                return JSONResponse({"time": source_time, "states": states})
    except Exception as e:
        print(f"Database query failed: {e}")
        return JSONResponse(generate_mock_flights())


# --- Camera Image Proxy ---
# Fetches public camera snapshot images server-side so the browser gets them
# from our own origin (bypassing CORS and X-Frame-Options entirely).

from fastapi.responses import StreamingResponse
import urllib.parse

# Allow-list of trusted camera domains (to prevent open-proxy abuse)
ALLOWED_CAM_HOSTS = {
    "images.webcams.travel",
    "webcam.windy.com",
    "cdn.earthcam.com",
    "www.earthcam.com",
    "traffi.dk",
    "trafficam.com",
    "www.trafficam.com",
    "weathercams.faa.gov",
    "avcams.faa.gov",
    "511la.org",
    "cwwp2.dot.ca.gov",
    "gis.penndot.gov",
    "camera.tdot.tn.gov",
    "fl511.com",
    "images.lookr.com",
    "static.lookr.com",
    "cam.lookr.com",
    "nvroads.com",
    "itraffic.hawaii.gov",
    "images.wsdot.wa.gov",   # Washington State DOT traffic cameras (public, fresh JPEGs)
    "s3-eu-west-1.amazonaws.com", # UK Highways Agency
    "cwwp2.dot.ca.gov",           # Caltrans
    "www.trafficengland.com",     # UK Highways Network
}

@app.get("/api/cam-proxy")
async def cam_proxy(url: str):
    """Proxy a camera snapshot image to bypass CORS/X-Frame-Options."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or parsed.hostname not in ALLOWED_CAM_HOSTS:
            raise HTTPException(status_code=403, detail="Camera host not in allow-list")

        # Use HTTP/1 and generic headers to bypass CDN blocks
        req_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "image/*, video/*, */*",
        }
        if parsed.hostname and "cwwp2.dot.ca.gov" in parsed.hostname:
            req_headers["Referer"] = "https://cwwp2.dot.ca.gov/"

        async with httpx.AsyncClient(follow_redirects=True) as client:
            res = await client.get(url, timeout=12.0, headers=req_headers)
            res.raise_for_status()
            content_type = res.headers.get("content-type", "application/octet-stream")

        return Response(
            content=res.content,
            media_type=content_type,
            headers={
                "Cache-Control": "no-cache, max-age=0",
                "Access-Control-Allow-Origin": "*"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Camera fetch failed: {e}")


# --- Flight Route Proxy ---
_route_cache: dict = {}
ROUTE_CACHE_TTL = 86400

@app.get("/api/flight-route")
async def get_flight_route(callsign: str):
    callsign = callsign.strip().upper()
    if not callsign:
        raise HTTPException(status_code=400, detail="callsign required")
    cached = _route_cache.get(callsign)
    if cached and (time.time() - cached["fetched_at"]) < ROUTE_CACHE_TTL:
        return JSONResponse({"origin": cached["origin"], "destination": cached["destination"]})
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://opensky-network.org/api/routes?callsign={callsign}",
                timeout=5.0,
                headers={"User-Agent": "Mozilla/5.0 LiveEarth/1.0"}
            )
            if res.status_code == 200:
                data = res.json()
                route = data.get("route", [])
                if len(route) >= 2:
                    result = {"origin": route[0], "destination": route[-1]}
                    _route_cache[callsign] = {**result, "fetched_at": time.time()}
                    return JSONResponse(result)
            raise HTTPException(status_code=404, detail="No route data")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Route Proxy] Failed for {callsign}: {e}")
        raise HTTPException(status_code=503, detail="Route lookup unavailable")


# ---------------------------------------------------------------------------
# Global CCTV Camera Aggregator  /api/cameras
# Uses Caltrans CWWP2 open API — the only verified public source with both
# live JPEG snapshots and HLS video streams (no API key required).
# ---------------------------------------------------------------------------
import asyncio

_cameras_cache: dict = {"data": None, "fetched_at": 0.0}
CAMERAS_CACHE_TTL = 0 # Temporarily bypass cache to load new UK cameras. Normally 600 (URLs stay fresh this long)

# Caltrans districts 1-12 span all of California
CALTRANS_DISTRICTS = ["d3", "d4", "d5", "d6", "d7", "d8", "d10", "d11", "d12"]

async def _fetch_caltrans_district(client: httpx.AsyncClient, district: str) -> list:
    """Fetch cameras from one Caltrans district's open JSON endpoint."""
    url = f"https://cwwp2.dot.ca.gov/data/{district}/cctv/cctvStatus{district.upper()}.json"
    try:
        res = await client.get(url, timeout=10.0, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0",
            "Referer": "https://cwwp2.dot.ca.gov/"
        })
        if res.status_code != 200:
            print(f"[Cameras] Caltrans {district}: HTTP {res.status_code}")
            return []
        cameras = []
        for item in res.json().get("data", []):
            cam = item.get("cctv", {})
            if cam.get("inService") != "true":
                continue
            loc = cam.get("location", {})
            img_data = cam.get("imageData", {})
            static = img_data.get("static", {})
            lat  = loc.get("latitude",  "")
            lng  = loc.get("longitude", "")
            name = loc.get("locationName", "").replace(" -- ", " — ")
            snap = static.get("currentImageURL", "")
            hls  = img_data.get("streamingVideoURL", "")
            if not (lat and lng and snap):
                continue
            cam_id = f"ca_{district}_{cam.get('index', '')}"
            cameras.append({
                "id":          cam_id,
                "title":       name or f"Caltrans {district.upper()} Camera",
                "lat":         float(lat),
                "lng":         float(lng),
                "type":        "cctv",
                "country":     "USA",
                "stream_type": "hls" if hls else "snapshot",
                "snapshot":    snap,
                "hls_url":     hls,
                "link":        "https://cwwp2.dot.ca.gov/",
            })
        print(f"[Cameras] Caltrans {district}: {len(cameras)} cameras")
        return cameras
    except Exception as e:
        print(f"[Cameras] Caltrans {district} failed: {e}")
        return []

async def _fetch_uk_cameras(client: httpx.AsyncClient) -> list:
    """Fetch live camera list from Transport for London (TfL) JamCams API (public)."""
    try:
        res = await client.get("https://api.tfl.gov.uk/Place/Type/JamCam", timeout=12.0, headers={"User-Agent": "Mozilla/5.0"})
        if res.status_code != 200:
            return []
        cameras = []
        data = res.json()
        for cc in data:
            lat = cc.get("lat")
            lng = cc.get("lon")
            if not lat or not lng: continue
            
            img_url = ""
            vid_url = ""
            for p in cc.get('additionalProperties', []):
                if p.get('key') == 'imageUrl': img_url = p.get('value')
                if p.get('key') == 'videoUrl': vid_url = p.get('value')
                
            if not img_url: continue

            cameras.append({
                "id": "uk_" + cc.get("id", "unk").replace(".", "_"),
                "title": cc.get("commonName", "London CCTV"),
                "lat": float(lat), "lng": float(lng),
                "type": "cctv", "country": "UK",
                "stream_type": "snapshot",
                "snapshot": img_url,
                "video": vid_url,
                "link": "https://tfl.gov.uk/traffic/status/"
            })
        print(f"[Cameras] TfL JamCams UK: {len(cameras)} cameras")
        return cameras
    except Exception as e:
        print(f"[Cameras] TfL JamCams UK failed: {e}")
        return []

@app.get("/api/cameras")
async def get_cameras():
    """Return live Caltrans traffic cameras from the open CWWP2 API."""
    current_time = time.time()
    if _cameras_cache["data"] and (current_time - _cameras_cache["fetched_at"]) < CAMERAS_CACHE_TTL:
        return JSONResponse(_cameras_cache["data"])

    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [_fetch_caltrans_district(client, d) for d in CALTRANS_DISTRICTS]
        tasks.append(_fetch_uk_cameras(client))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    cameras = []
    for r in results:
        if isinstance(r, list):
            cameras.extend(r)

    # ── FALLBACK / SUPPLEMENT: Load WSDOT cameras from static JSON file
    try:
        import json
        import os
        fallback_path = os.path.join(os.path.dirname(__file__), "static", "insecam_data.json")
        with open(fallback_path, "r", encoding="utf-8") as f:
            fallback_data = json.load(f)
            # Add country tag since the frontend filter expects 'USA'
            for cam in fallback_data:
                cam["country"] = "USA"
            cameras.extend(fallback_data)
            print(f"[Cameras] Loaded {len(fallback_data)} WSDOT fallback cameras for USA.")
    except Exception as e:
        print(f"[Cameras] Failed to load insecam_data.json fallback: {e}")

    if not cameras:
        # Emergency fallback: a hardcoded known-good Caltrans camera
        cameras = [{
            "id": "ca_d4_fallback",
            "title": "I-580 Oakland — West of SR-24",
            "lat": 37.82539, "lng": -122.27291,
            "type": "cctv", "stream_type": "hls",
            "snapshot": "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv102i580westofsr24/tv102i580westofsr24.jpg",
            "hls_url":  "https://wzmedia.dot.ca.gov/D4/W580_JWO_24_IC.stream/playlist.m3u8",
            "link": "https://cwwp2.dot.ca.gov/"
        }]

    _cameras_cache["data"] = cameras
    _cameras_cache["fetched_at"] = current_time
    print(f"[Cameras] Total cameras cached: {len(cameras)}")
    return JSONResponse(cameras)



