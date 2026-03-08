import os
import secrets
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"],
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

@app.on_event("startup")
async def startup_event():
    await database.init_db()

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

SAFE_EDIT_PAGES = ['index', 'about', 'services', 'contact', 'merchandise']

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

