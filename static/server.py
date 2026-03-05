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
async def get_content():
    content = await database.get_all_content()
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
    file_location = os.path.join("static", file.filename)
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
    # Automatically update the database with this new static path if the original 
    # client caller wants to wrap this endpoint in a chain. 
    # For now, we just return the saved relative path so the frontend can submit it to the CMS.
    return {"url": f"/{file_location}"}

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

import asyncio

@app.post("/api/sync-github")
async def sync_github(user: str = Depends(require_admin)):
    try:
        # Initialize progress file with starting state
        progress_file = r"C:\tmp\github_sync_progress.json"
        with open(progress_file, 'w') as f:
            import json
            json.dump({"current": 0, "total": 0, "status": "starting", "message": "Initializing...", "percentage": 0}, f)
            
        # Run the existing upload script
        # Using the same interpreter and absolute path for reliability
        script_path = r"C:\tmp\github_final_upload.py"
        python_exe = r"C:\Users\choos\AppData\Local\Python\pythoncore-3.14-64\python.exe"
        
        process = await asyncio.create_subprocess_exec(
            python_exe, script_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": f"Sync failed: {stderr.decode()}"}
            )
            
        return {"status": "success", "output": stdout.decode()}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )
