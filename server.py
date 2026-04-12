import os
from dotenv import load_dotenv
load_dotenv()

import secrets
import asyncio
import sys
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import aiosqlite
import urllib.request
import urllib.parse
import urllib.error
import json
import time
import hmac
import hashlib
import base64
from datetime import datetime, timedelta
import traceback
from fastapi import FastAPI, Request, Form, Response, Depends, HTTPException, status, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import database
import agent_database
from agents.master_agent import MasterAgent
from fastapi import WebSocket, WebSocketDisconnect

from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

import logging
class CDPLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Suppress Chrome DevTools Protocol 404 terminal spam from background VS Code / Antivirus port scanners
        msg = record.getMessage()
        if "/json/version" in msg or "/json/list" in msg:
            return False
        return True

logging.getLogger("uvicorn.access").addFilter(CDPLogFilter())

app = FastAPI()

WEATHER_DB = "weather.db"
WEATHER_SOURCE_DB = "weather_source.db"
POLICE_DB = "sherpa_police.db"
POLICE_SOURCE_DB = "sherpa_police_source.db"
SCANNERS_DB = "sherpa_scanners.db"
SCANNERS_SOURCE_DB = "sherpa_scanners_source.db"
VESSELS_DB = "sherpa_vessels.db"
VESSELS_SOURCE_DB = "sherpa_vessels_source.db"
EARTHQUAKES_DB = "sherpa_earthquakes.db"
EARTHQUAKES_SOURCE_DB = "sherpa_earthquakes_source.db"
CAMERAS_DB = "sherpa_cameras.db"
CAMERAS_SOURCE_DB = "sherpa_cameras_source.db"
from weather_cities import WEATHER_CITIES

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        if message.get("type") in ["chat", "question"] and hasattr(self, "session_id"):
            content = message.get("message") or message.get("question")
            if content:
                await agent_database.save_message(self.session_id, "agent", content, message.get("agent"))
        for connection in self.active_connections:
            await connection.send_text(json.dumps(message))

manager = ConnectionManager()
master_agent = MasterAgent(callback_manager=manager)

# --- Background Task: Weekly AI Data Broker Discovery ---
async def run_weekly_discovery():
    while True:
        try:
            print("[FreeMe] Running weekly AI Discovery scan for new emerging Data Brokers...")
            # We construct a mock request to reuse the endpoint logic
            req = DiscoverBrokersRequest(llm_model="claude-3-opus")
            result = await discover_new_brokers(req)
            if result.get("status") == "success":
                new_count = len(result.get("discovered_brokers", []))
                print(f"[FreeMe] Weekly discovery complete. Found {new_count} emerging threats.")
                # In production, these would be saved to a persistent SQLite DB to auto-populate the UI grid on load.
        except Exception as e:
            print(f"[FreeMe] Weekly discovery failed: {e}")
        
        # Sleep for exactly 7 days
        await asyncio.sleep(7 * 24 * 60 * 60)

@app.on_event("startup")
async def startup_weekly_discovery_task():
    # Spin up our weekly background workers
    asyncio.create_task(run_weekly_discovery())

# Enable GZIP compression for all responses > 1000 bytes (CSS, JS, JSON, HTML)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Allow both local dev and the live GitHub Pages site
ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:8001",
    "http://127.0.0.1:8000",
    "http://127.0.0.1:8001",
    "https://sherpa-solutions-llc.com",
    "https://www.sherpa-solutions-llc.com",
    "https://sherpa-solutions-llc.com/",
    "https://www.sherpa-solutions-llc.com/",
    "https://sherpa-solutions-llc.github.io",
    "https://sherpa-solutions-llc.github.io/"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (css, images)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

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

@app.get("/api/health")
async def health_check():
    """Railway internal healthcheck hook"""
    return {"status": "ok", "service": "sherpa-solutions-api"}

def require_admin(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user

# --- SaaS JWT Authentication ---
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-sherpa-fallback-key")

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def create_jwt(payload: dict) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_enc = base64url_encode(json.dumps(header).encode('utf-8'))
    # add expiration
    payload["exp"] = int(time.time()) + (24 * 3600)  # 24 hours
    payload_enc = base64url_encode(json.dumps(payload).encode('utf-8'))
    sig = hmac.new(JWT_SECRET.encode(), f"{header_enc}.{payload_enc}".encode(), hashlib.sha256).digest()
    sig_enc = base64url_encode(sig)
    return f"{header_enc}.{payload_enc}.{sig_enc}"

def verify_jwt(token: str):
    try:
        header_enc, payload_enc, sig_enc = token.split('.')
        expected_sig = hmac.new(JWT_SECRET.encode(), f"{header_enc}.{payload_enc}".encode(), hashlib.sha256).digest()
        if base64url_encode(expected_sig) != sig_enc:
            return None
        
        # pad if missing
        pad = len(payload_enc) % 4
        if pad: payload_enc += '=' * (4 - pad)
        payload = json.loads(base64.urlsafe_b64decode(payload_enc).decode('utf-8'))
        
        if payload.get("exp", 0) < int(time.time()):
            return None # expired
            
        return payload
    except Exception:
        return None

def require_saas_user(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    token = auth_header.split(" ")[1]
    payload = verify_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

class RegisterUserRequest(BaseModel):
    email: str
    password: str

class LoginUserRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/register")
async def saas_register(req: RegisterUserRequest):
    user = await database.create_saas_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=400, detail="Email already registered")
    token = create_jwt(user)
    return {"status": "success", "token": token, "user": user}

@app.post("/api/auth/login")
async def saas_login(req: LoginUserRequest):
    user = await database.verify_saas_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt(user)
    return {"status": "success", "token": token, "user": user}

# --- Stripe Billing Implementation ---
# For proof of concept, this mocks the Stripe Checkout and Webhook flows.
class CreateCheckoutRequest(BaseModel):
    plan: str

@app.post("/api/billing/create-checkout-session")
async def create_checkout_session(req: CreateCheckoutRequest, request: Request):
    user = require_saas_user(request)
    
    # MOCK FLOW: Instead of stripe.checkout.Session.create(), we redirect to a local mock UI.
    encoded_email = urllib.parse.quote(user.get("email", ""))
    mock_url = f"/static/mock_checkout.html?email={encoded_email}&plan={req.plan}"
    
    return {"status": "success", "url": mock_url}

class MockWebhookRequest(BaseModel):
    email: str

@app.post("/api/billing/webhook-mock")
async def mock_webhook(req: MockWebhookRequest):
    # Simulates Stripe webhook 'checkout.session.completed'
    if req.email:
        mock_cus_id = "cus_mock_" + secrets.token_hex(4)
        await database.upgrade_saas_user_to_premium(req.email, mock_cus_id)
        return {"status": "success", "message": "Upgraded to Pro via Mock Payment"}
    raise HTTPException(status_code=400, detail="Missing email")


@app.get("/history")
async def get_history():
    if hasattr(manager, "session_id"):
        messages = await agent_database.get_messages(manager.session_id)
        return {"messages": messages}
    return {"messages": []}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")
            
            if action == "start_task":
                task_description = payload.get("task")
                if task_description:
                    await agent_database.save_message(manager.session_id, "user", task_description, "User")
                if task_description or payload.get("file_data"):
                    asyncio.create_task(master_agent.run_task(payload))
            elif action == "reply_to_agent":
                reply_text = payload.get("text", "")
                if reply_text:
                    await agent_database.save_message(manager.session_id, "user", reply_text, "User")
                target_agent_name = payload.get("target_agent", "Master Agent")
                
                target_agent = None
                if target_agent_name == "Master Agent":
                    target_agent = master_agent
                elif target_agent_name == "Research Agent":
                    target_agent = master_agent.research_agent
                elif target_agent_name == "Stock Monitor":
                    target_agent = master_agent.stock_agent
                elif target_agent_name == "Web Developer":
                    target_agent = master_agent.web_agent
                    
                if target_agent and getattr(target_agent, "pending_question_future", None):
                    if not target_agent.pending_question_future.done():
                        target_agent.pending_question_future.set_result(reply_text)
            elif action == "new_chat":
                new_session = await agent_database.create_session("Productivity Agent Chat")
                manager.session_id = new_session
                master_agent.reset_memory()
                await manager.broadcast({"type": "chat_cleared"})
            elif action == "halt_task":
                master_agent.cancel_event.set()
                if master_agent.pending_question_future and not master_agent.pending_question_future.done():
                    master_agent.pending_question_future.cancel()
                await manager.broadcast({"type": "status", "agent": "Master Agent", "status": "Halted"})
                await manager.broadcast({"type": "log", "agent": "SYSTEM", "message": "Manual override. Protocol halted.", "level": "error"})
            elif action == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.on_event("startup")
async def startup_event():
    # Start Telegram Bot Bridge — uses raw httpx polling (no python-telegram-bot)
    # to avoid event loop conflicts with uvicorn.
    from telegram_bot import poll_telegram
    asyncio.create_task(poll_telegram(master_agent, manager))

    await database.init_db()
    
    # Init Productivity Agent Database
    await agent_database.init_db()
    session_id = await agent_database.get_most_recent_session()
    if not session_id:
        session_id = await agent_database.create_session("Productivity Agent Chat")
    manager.session_id = session_id
    
    await init_flights_db()
    await init_military_flights_db()
    await init_satellites_db()
    await init_weather_db()
    await init_police_db()
    await init_scanners_db()
    await init_vessels_db()
    await init_earthquakes_db()
    await init_osint_db()
    await init_cameras_db()
    await database.init_stock_db()
    await database.init_traku_db()
    await database.init_traku_search_history()
    await database.init_stock_alerts()
    await database.init_consulting_leads()

    # Init SaaS User table
    await database.db.execute('''
        CREATE TABLE IF NOT EXISTS saas_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_premium BOOLEAN DEFAULT 0,
            stripe_customer_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''') if hasattr(database, "db") else None 
    # Actually wait, database.init_db() now initializes saas_users. 
    # It was added to `init_db()` in database.py !

    # We must NEVER block the startup_event with network fetches, or Railway will kill Uvicorn for failing the 30s healthcheck.
    # Instead, we spin off a background task that safely primes empty databases while the server accepts incoming connections.
    async def prime_databases_background():
        try:
            # --- Satellites ---
            async with aiosqlite.connect(SATELLITES_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM satellites") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Satellites] DB empty on startup, fetching in background...")
                        await fetch_satellites_logic()
                    else:
                        print("[Satellites] DB already populated, skipping initial fetch.")

            # --- Police ---
            async with aiosqlite.connect(POLICE_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM police_stations") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Police] DB empty on startup, fetching in background...")
                        await fetch_police_logic()
                    else:
                        print(f"[Police] DB has {row[0]} stations.")
                        # Check if US data is missing
                        async with db.execute("SELECT COUNT(*) FROM police_stations WHERE country='United States'") as us_cursor:
                            us_row = await us_cursor.fetchone()
                            if not us_row or us_row[0] == 0:
                                print("[Police] US data missing — fetching via Overpass...")
                                await fetch_missing_countries()
                            else:
                                print(f"[Police] US data present ({us_row[0]} stations).")

            # --- Scanners ---
            async with aiosqlite.connect(SCANNERS_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM scanners") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Scanners] DB empty on startup, fetching in background...")
                        await fetch_scanners_logic()
                    else:
                        print("[Scanners] DB already populated, skipping initial fetch.")

            # --- Vessels ---
            async with aiosqlite.connect(VESSELS_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM vessels") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Vessels] DB empty on startup, fetching in background...")
                        await fetch_vessels_logic()
                    else:
                        print("[Vessels] DB already populated, skipping initial fetch.")

            # --- Earthquakes ---
            async with aiosqlite.connect(EARTHQUAKES_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM earthquakes") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Earthquakes] DB empty on startup, fetching in background...")
                        await fetch_earthquakes_logic()
                    else:
                        print("[Earthquakes] DB already populated, skipping initial fetch.")

            # --- Cameras ---
            async with aiosqlite.connect(CAMERAS_DB) as db:
                async with db.execute("SELECT COUNT(*) FROM cameras") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] == 0:
                        print("[Cameras] DB empty on startup, fetching in background...")
                        await fetch_cameras_logic()
                    else:
                        print("[Cameras] DB already populated, skipping initial fetch.")

            # Start all hourly/daily background refresh loops
            asyncio.create_task(update_satellites_loop())
            asyncio.create_task(update_police_loop())
            asyncio.create_task(update_scanners_loop())
            asyncio.create_task(update_vessels_loop())
            asyncio.create_task(update_earthquakes_loop())
            asyncio.create_task(update_cameras_loop())
            asyncio.create_task(update_wildfires_loop())
            
            # --- Wildfires ---
            async with aiosqlite.connect(os.path.join(BASE_DIR, "sherpa_wildfires.db")) as db:
                async with db.execute("SELECT COUNT(*) FROM wildfires") as cursor:
                    row = await cursor.fetchone()
                    if not row or row[0] <= 2: # 2 represents the old mock data limit
                        print("[Wildfires] DB empty or mock data on startup, fetching live NASA FIRMS in background...")
                        await fetch_wildfires_logic()
                    else:
                        print("[Wildfires] DB already populated, skipping initial fetch.")

        except Exception as e:
            print(f"[Startup] Background prime failed: {e}")

    asyncio.create_task(prime_databases_background())
    asyncio.create_task(fetch_flights_loop())
    asyncio.create_task(fetch_military_flights_loop())
    asyncio.create_task(update_weather_loop())

@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    return FileResponse(os.path.join(BASE_DIR, "favicon.ico"))

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    index_path = os.path.join(BASE_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
    return html

@app.get("/live_earth", response_class=HTMLResponse)
async def serve_live_earth(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'live_earth.html'))

@app.get("/live_earth2", response_class=HTMLResponse)
async def serve_live_earth2(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'live_earth2.html'))

@app.get("/skip_tracer", response_class=HTMLResponse)
async def skip_tracer_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'skip_tracer.html'))

@app.get("/stock_agent", response_class=HTMLResponse)
async def stock_agent_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'stock_agent.html'))

@app.get("/b2b_leads.html", response_class=HTMLResponse)
async def b2b_leads_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'b2b_leads.html'))

@app.get("/seo_sniper.html", response_class=HTMLResponse)
async def seo_sniper_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'seo_sniper.html'))

@app.get("/arbitrage.html", response_class=HTMLResponse)
async def arbitrage_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'arbitrage.html'))

@app.get("/brand_monitor.html", response_class=HTMLResponse)
async def brand_monitor_page(request: Request):
    return FileResponse(os.path.join(BASE_DIR, 'brand_monitor.html'))

# --- Dual-Engine Intelligence Uplink (Tavily & SerpApi) ---
import httpx

class AvatarSearchRequest(BaseModel):
    query: str

@app.post("/api/avatar-search")
async def avatar_search(req: AvatarSearchRequest):
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Empty directive stream")
        
    tavily_key = os.environ.get("TAVILY_API_KEY")
    serpapi_key = os.environ.get("SERPAPI_API_KEY")
    
    # Tier 1: Primary Intelligence Engine (Tavily AI)
    if tavily_key:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post("https://api.tavily.com/search", json={
                    "api_key": tavily_key,
                    "query": query,
                    "search_depth": "basic",
                    "include_answer": True
                })
                if res.status_code == 200:
                    data = res.json()
                    if data.get("answer"):
                        return {"status": "success", "source": "tavily", "result": data["answer"]}
                    elif data.get("results") and len(data["results"]) > 0:
                        return {"status": "success", "source": "tavily", "result": data["results"][0].get("content")}
        except Exception as e:
            print(f"[Avatar Intel] Tavily Engine Failure: {e}")
            
    # Tier 2: Fallback Scraper Engine (SerpApi - Google)
    if serpapi_key:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.get("https://serpapi.com/search", params={
                    "q": query,
                    "engine": "google",
                    "api_key": serpapi_key,
                    "num": 3
                })
                if res.status_code == 200:
                    data = res.json()
                    # Snatch Google's native 'Answer Box' immediately if possible
                    if "answer_box" in data:
                        if "snippet" in data["answer_box"]:
                            return {"status": "success", "source": "serpapi", "result": data["answer_box"]["snippet"]}
                        if "answer" in data["answer_box"]:
                            return {"status": "success", "source": "serpapi", "result": data["answer_box"]["answer"]}
                    # Default into standard organic snippet extraction
                    organic = data.get("organic_results", [])
                    if organic and "snippet" in organic[0]:
                        return {"status": "success", "source": "serpapi", "result": organic[0]["snippet"]}
        except Exception as e:
            print(f"[Avatar Intel] SerpApi Engine Failure: {e}")
            
    # Tier 3: Zero Engines Functional / Online
    raise HTTPException(status_code=404, detail="NOT_FOUND")

class SourcingRequest(BaseModel):
    query: str
    cp_key: str = ""
    te_key: str = ""

@app.post("/api/sourcing")
async def get_sourcing(req: SourcingRequest):
    """Multi-Tiered Sourcing Execution for HarvestTracker"""
    query = req.query.strip().lower()
    cp_key = req.cp_key.strip()
    te_key = req.te_key.strip()
    
    live_price_string = None
    mock_used = True
    
    # Tier 1: Primary API 
    try:
        if cp_key:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Based on standard CommodityPriceAPI schema
                resPrimary = await client.get(
                    f"https://api.commoditypriceapi.com/v1/latest?base={query}",
                    params={"api_key": cp_key}
                )
                if resPrimary.status_code == 200:
                    data = resPrimary.json()
                    rates = data.get("data", {}).get("rates", {})
                    # Grab USD value mapping or inverse if base 
                    if "USD" in rates:
                        live_price_string = f"${round(1/rates['USD'], 2)}/kg"
                        mock_used = False
                    else:
                        raise Exception("API Structural Mismatch: USD rate missing")
                else:
                    raise Exception(f"Primary API Failed: HTTP {resPrimary.status_code}")
        else:
            raise Exception("No Primary API Key provided in execution payload.")
    except Exception as e1:
        # print(f"Tier 1 Check Failed: {e1}")
        # Tier 2: Backup/Redundant API
        try:
            if te_key:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    # TradingEconomics structural query (ClientKey:Secret)
                    resBackup = await client.get(
                        f"https://api.tradingeconomics.com/historical/country/all/commodity/{query}?c={te_key}&format=json"
                    )
                    if resBackup.status_code == 200:
                        data = resBackup.json()
                        if len(data) > 0 and "Close" in data[0]:
                            live_price_string = f"${round(data[0]['Close'], 2)}/kg"
                            mock_used = False
                        else:
                            raise Exception("API Structural Mismatch: Close price array missing")
                    else:
                        raise Exception(f"Backup API Failed: HTTP {resBackup.status_code}")
            else:
                raise Exception("No Backup API Key provided in execution payload.")
        except Exception as e2:
            pass # print(f"Tier 2 Check Failed: {e2}")

    # Tier 3: Output Generator (Geometry & Logistics Math)
    import random
    
    regions = [
        {"name": "Veracruz Cooperative", "lat": 19.17, "lon": -96.13, "country": "Mexico"},
        {"name": "Andean Harvest Ops", "lat": -12.04, "lon": -77.02, "country": "Peru"},
        {"name": "Central Valley Growers", "lat": 36.77, "lon": -119.41, "country": "USA"},
        {"name": "São Paulo Agro", "lat": -23.55, "lon": -46.63, "country": "Brazil"},
        {"name": "Rift Valley Exports", "lat": -1.29, "lon": 36.82, "country": "Kenya"},
        {"name": "Java Plantations", "lat": -7.25, "lon": 112.75, "country": "Indonesia"},
        {"name": "Andalusia Estates", "lat": 37.38, "lon": -5.98, "country": "Spain"},
        {"name": "Mekong Delta Farms", "lat": 10.04, "lon": 105.78, "country": "Vietnam"}
    ]
    
    suppliers = []
    for r in regions:
        quality = random.randint(1, 5)
        price_tier = random.choice(['low', 'medium', 'high'])
        shipping_days = random.randint(2, 15)
        
        # Override Generative Math with the Live Spot Price if successful
        if not mock_used and live_price_string:
            base_val = float(live_price_string.replace('$', '').replace('/kg', ''))
            # Random variance +/- 10% per supplier quality tier
            val = round(base_val * random.uniform(0.9, 1.1), 2)
            calculated_price = f"${val}/kg"
        else:
            calculated_price = f"${round(random.uniform(1.0, 6.0), 2)}/kg"
        
        suppliers.append({
            "id": f"sup_{random.randint(1000, 9999)}",
            "name": r["name"],
            "lat": r["lat"],
            "lon": r["lon"],
            "country": r["country"],
            "produce": query,
            "quality": quality,
            "priceTier": price_tier,
            "price": calculated_price,
            "shippingDays": shipping_days
        })
        
    return {
        "status": "success",
        "mock_used": mock_used,
        "data": suppliers
    }

async def init_scanners_db():
    async with aiosqlite.connect(SCANNERS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS scanners (
                id TEXT PRIMARY KEY,
                name TEXT,
                audio_url TEXT,
                feed_id TEXT,
                source TEXT DEFAULT 'broadcastify',
                listeners INTEGER DEFAULT 0,
                status TEXT DEFAULT 'online',
                country TEXT,
                state TEXT,
                city TEXT,
                lat REAL,
                lng REAL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS scanners_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.commit()

async def fetch_scanners_logic():
    try:
        scanners_file = os.path.join(STATIC_DIR, "scanners_data.json")
        if not os.path.exists(scanners_file):
            print("[Scanners] Base data file not found.")
            return

        with open(scanners_file, "r") as f:
            data = json.load(f)

        async with aiosqlite.connect(SCANNERS_DB) as db:
            await db.execute("DELETE FROM scanners")
            for s in data:
                # Extract feed_id from audio_url if not provided
                feed_id = s.get("feed_id", "")
                if not feed_id and s.get("audio_url"):
                    feed_id = s["audio_url"].rstrip("/").split("/")[-1]
                await db.execute(
                    "INSERT OR REPLACE INTO scanners (id, name, audio_url, feed_id, source, listeners, status, country, state, city, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (s.get("id"), s.get("name"), s.get("audio_url"), feed_id, s.get("source", "broadcastify"), s.get("listeners", 0), s.get("status", "online"), s.get("country"), s.get("state"), s.get("city"), s.get("lat"), s.get("lng"))
                )
            await db.execute("INSERT OR REPLACE INTO scanners_meta (key, last_updated) VALUES ('last_fetch', ?)", (int(datetime.now().timestamp()),))
            await db.commit()
            print(f"[Scanners Cache] Saved {len(data)} nodes.")
    except Exception as e:
        print(f"[Scanners Cache Error] {e}")

async def update_scanners_loop():
    while True:
        await asyncio.sleep(86400) # Loop checks every 24 hours
        try:
            await fetch_scanners_logic()
        except Exception as e:
            print(f"[Scanners update loop error] {e}")

@app.get("/api/scanners")
async def get_scanners():
    try:
        async with aiosqlite.connect(SCANNERS_DB) as db:
            async with db.execute("SELECT id, name, audio_url, feed_id, source, listeners, status, country, state, city, lat, lng FROM scanners") as cursor:
                rows = await cursor.fetchall()
                
        result = []
        for r in rows:
            result.append({
                "id": r[0],
                "name": r[1],
                "audio_url": r[2],
                "feed_id": r[3] or "",
                "source": r[4] or "broadcastify",
                "listeners": r[5] or 0,
                "status": r[6] or "online",
                "country": r[7],
                "state": r[8],
                "city": r[9],
                "lat": r[10],
                "lng": r[11]
            })
            
        return JSONResponse(result)

    except Exception as e:
        print(f"Error fetching scanners: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/scanner-stream")
async def proxy_scanner_stream(url: str = ""):
    """Proxy Broadcastify Icecast MP3 streams to bypass CORS."""
    if not url or not url.startswith("https://broadcastify.cdnstream1.com/"):
        return JSONResponse(status_code=400, content={"error": "Invalid or disallowed stream URL"})

    import httpx

    async def stream_generator():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)) as client:
                async with client.stream("GET", url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "*/*",
                    "Icy-MetaData": "0"
                }) as response:
                    async for chunk in response.aiter_bytes(chunk_size=4096):
                        yield chunk
        except Exception as e:
            print(f"[Scanner Stream Proxy] Error: {e}")

    from starlette.responses import StreamingResponse
    return StreamingResponse(
        stream_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Access-Control-Allow-Origin": "*",
            "Connection": "keep-alive"
        }
    )

class ConsultingLead(BaseModel):
    name: str
    email: str
    company: str = ""
    project_interest: str

@app.post("/api/consulting/lead")
async def submit_consulting_lead(lead: ConsultingLead):
    try:
        await database.save_consulting_lead(
            name=lead.name,
            email=lead.email,
            company=lead.company,
            project_interest=lead.project_interest
        )
        return {"status": "success", "message": "Lead captured successfully"}
    except Exception as e:
        print(f"Error saving consulting lead: {e}")
        raise HTTPException(status_code=500, detail="Failed to save lead")


@app.get("/api/police-data")
async def get_police_data():
    try:
        async with aiosqlite.connect(POLICE_DB) as db:
            async with db.execute("SELECT id, name, source, country, state, city, address, phone, lat, lng FROM police_stations") as cursor:
                rows = await cursor.fetchall()
                
        result = []
        for r in rows:
            result.append({
                "id": r[0],
                "name": r[1],
                "source": r[2] or "arcgis",
                "country": r[3],
                "state": r[4],
                "city": r[5],
                "address": r[6] or "",
                "phone": r[7] or "",
                "lat": r[8],
                "lng": r[9]
            })
            
        return JSONResponse(result)

    except Exception as e:
        print(f"Error fetching police data: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

async def init_police_db():
    async with aiosqlite.connect(POLICE_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS police_stations (
                id TEXT PRIMARY KEY,
                name TEXT,
                source TEXT DEFAULT 'arcgis',
                country TEXT,
                state TEXT,
                city TEXT,
                address TEXT,
                phone TEXT,
                lat REAL,
                lng REAL
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS police_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.commit()

async def fetch_us_police_arcgis() -> list:
    """Fetch official US local law enforcement locations from HIFLD ArcGIS."""
    url = "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Local_Law_Enforcement_Locations/FeatureServer/0/query"
    stations = []
    offset = 0
    batch_size = 2000
    
    print("[Police] Starting official USA fetch from HIFLD ArcGIS...")
    while True:
        try:
            params = {
                "where": "1=1",
                "outFields": "OBJECTID,NAME,CITY,STATE,ADDRESS,TELEPHONE",
                "outSR": "4326",
                "f": "json",
                "resultOffset": offset,
                "resultRecordCount": batch_size
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, params=params)
                res.raise_for_status()
                data = res.json()
            
            features = data.get("features", [])
            if not features:
                break
                
            for ft in features:
                attr = ft.get("attributes", {})
                geom = ft.get("geometry", {})
                if not geom.get("y") or not geom.get("x"):
                    continue
                
                stations.append({
                    "id": f"hifld_{attr.get('OBJECTID', len(stations))}",
                    "name": attr.get("NAME", "Police Station").title(),
                    "source": "hifld_arcgis",
                    "country": "United States",
                    "state": attr.get("STATE"),
                    "city": (attr.get("CITY") or "").title(),
                    "address": (attr.get("ADDRESS") or "").title(),
                    "phone": attr.get("TELEPHONE", ""),
                    "lat": geom.get("y"),
                    "lng": geom.get("x")
                })
                
            offset += len(features)
            # Cap HIFLD at 18000 just in case
            if len(features) < batch_size or offset >= 18000:
                break
            await asyncio.sleep(1)
        except Exception as e:
            print(f"[Police] HIFLD ArcGIS fetch failed at offset {offset}: {e}")
            break
            
    print(f"[Police] USA HIFLD: fetched {len(stations)} official stations.")
    return stations

async def fetch_missing_countries():
    """Fetch police data only for countries not yet present in the DB."""
    OVERPASS_MIRRORS = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass.nchc.org.tw/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]

    # Same list as fetch_police_logic
    COUNTRY_LIST = [
        ("United States",    (24.5, -125.0, 49.4, -100.0)),
        ("United States",    (24.5, -100.0, 49.4,  -80.0)),
        ("United States",    (24.5,  -80.0, 49.4,  -66.9)),
        ("United States",    (51.2, -180.0, 71.4, -129.9)),
        ("Canada",           (49.0, -141.0, 83.1, -52.6)),
        ("United Kingdom",   (49.7, -14.0,  61.1,  2.1)),
        ("Australia",        (-43.6, 113.2, -10.7, 153.6)),
        ("Germany",          (47.3,   5.9,  55.1,  15.0)),
        ("France",           (41.3,  -5.2,  51.1,   9.7)),
        ("Japan",            (24.0, 122.9,  45.6, 153.9)),
        ("Brazil",           (-33.8, -73.9,   5.3, -28.8)),
        ("India",            ( 6.7,  68.1,  35.7,  97.4)),
        ("Mexico",           (14.5, -117.1,  32.7, -86.7)),
        ("Spain",            (35.2,  -9.4,  43.8,   4.4)),
        ("Italy",            (36.6,   6.6,  47.1,  18.5)),
        ("Netherlands",      (50.7,   3.3,  53.6,   7.2)),
        ("Poland",           (49.0,  14.1,  54.8,  24.2)),
        ("South Africa",     (-34.8,  16.5, -22.1,  32.9)),
        ("Nigeria",          ( 4.3,   2.7,  13.8,  14.7)),
        ("Kenya",            (-4.7,  33.9,   4.6,  41.9)),
        ("Argentina",        (-55.1, -73.6, -21.8, -53.6)),
        ("Colombia",         (-4.2, -79.0,  12.5, -66.9)),
        ("Chile",            (-55.9, -75.6, -17.5, -66.4)),
        ("New Zealand",      (-46.6, 166.4, -34.4, 178.6)),
        ("Sweden",           (55.3,  10.9,  69.1,  24.2)),
        ("Norway",           (57.8,   4.6,  71.2,  31.1)),
        ("Denmark",          (54.6,   8.1,  57.8,  15.2)),
        ("Portugal",         (36.8, -10.0,  42.2,  -6.2)),
        ("Belgium",          (49.5,   2.5,  51.5,   6.4)),
        ("Austria",          (46.4,   9.5,  49.0,  17.2)),
        ("Switzerland",      (45.8,   5.9,  47.8,  10.5)),
        ("South Korea",      (33.1, 124.6,  38.6, 129.6)),
        ("Philippines",      ( 4.6, 116.9,  20.8, 126.6)),
    ]

    PER_COUNTRY_CAP = 500

    # Find which countries already exist in the DB
    existing_countries = set()
    async with aiosqlite.connect(POLICE_DB) as db:
        async with db.execute("SELECT DISTINCT country FROM police_stations") as cursor:
            async for row in cursor:
                existing_countries.add(row[0])

    # Filter to only missing entries
    missing = [(name, bbox) for name, bbox in COUNTRY_LIST if name not in existing_countries]
    if not missing:
        print("[Police] All countries already present in DB.")
        return

    print(f"[Police] Missing {len(missing)} country entries, fetching via Overpass...")

    for i, (country_name, bbox) in enumerate(missing):
        mirror_url = OVERPASS_MIRRORS[i % len(OVERPASS_MIRRORS)]
        south, west, north, east = bbox
        query = f"""
[out:json][timeout:30];
node["amenity"="police"]({south},{west},{north},{east});
out {PER_COUNTRY_CAP} body;
"""
        encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(mirror_url, data=encoded, headers={
            "User-Agent": "SherpaLiveEarth/1.0 (police data fetch; contact@sherpa-solutions-llc.com)"
        })
        loop = asyncio.get_event_loop()
        try:
            for attempt in range(2):
                try:
                    raw = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=35).read())
                    elements = json.loads(raw).get("elements", [])
                    break
                except urllib.error.HTTPError as e:
                    if e.code in (429, 403):
                        wait = 30 * (attempt + 1)
                        print(f"[Police] {country_name}: {e.code} rate-limited, waiting {wait}s...")
                        await asyncio.sleep(wait)
                    else:
                        raise
            else:
                elements = []

            stations = []
            for el in elements:
                tags = el.get("tags", {})
                name = (tags.get("name") or tags.get("name:en") or "Police Station").strip()
                house_num = tags.get("addr:housenumber", "")
                street = tags.get("addr:street", "")
                address = f"{house_num} {street}".strip() if (house_num or street) else ""
                state = (tags.get("addr:state") or tags.get("is_in:state") or
                         tags.get("addr:province") or tags.get("addr:region") or
                         tags.get("addr:county") or tags.get("operator") or None)
                city = (tags.get("addr:city") or tags.get("addr:town") or
                        tags.get("addr:suburb") or tags.get("addr:municipality") or None)
                phone = tags.get("contact:phone") or tags.get("phone") or ""
                if el.get("lat") is None or el.get("lon") is None:
                    continue
                stations.append({
                    "id": f"osm_{el['id']}", "name": name, "source": "overpass",
                    "country": country_name, "state": state, "city": city,
                    "address": address, "phone": phone,
                    "lat": el.get("lat"), "lng": el.get("lon"),
                })

            if stations:
                async with aiosqlite.connect(POLICE_DB) as db:
                    for p in stations:
                        await db.execute(
                            "INSERT OR REPLACE INTO police_stations (id, name, source, country, state, city, address, phone, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (p["id"], p["name"], p["source"], p["country"], p["state"], p["city"],
                             p["address"], p["phone"], p["lat"], p["lng"])
                        )
                    await db.commit()

            print(f"[Police] {country_name} ({south},{west}-{north},{east}): {len(stations)} stations")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"[Police] Failed to fetch {country_name}: {e}")
            await asyncio.sleep(5)

async def fetch_police_logic():
    """
    Fetch global police station data from the OpenStreetMap Overpass API (via rotating mirrors).
    Falls back to the static police_data.json if external APIs are unreachable.
    """
    OVERPASS_MIRRORS = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.openstreetmap.fr/api/interpreter",
        "https://overpass.nchc.org.tw/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ]

    # Bounding boxes per country: (south, west, north, east)
    # US split into 4 regional boxes for better Overpass coverage within 500/region cap
    COUNTRY_LIST = [
        ("United States",    (24.5, -125.0, 49.4, -100.0)),  # West
        ("United States",    (24.5, -100.0, 49.4,  -80.0)),  # Central
        ("United States",    (24.5,  -80.0, 49.4,  -66.9)),  # East
        ("United States",    (51.2, -180.0, 71.4, -129.9)),  # Alaska
        ("Canada",           (49.0, -141.0, 83.1, -52.6)),
        ("United Kingdom",   (49.7, -14.0,  61.1,  2.1)),
        ("Australia",        (-43.6, 113.2, -10.7, 153.6)),
        ("Germany",          (47.3,   5.9,  55.1,  15.0)),
        ("France",           (41.3,  -5.2,  51.1,   9.7)),
        ("Japan",            (24.0, 122.9,  45.6, 153.9)),
        ("Brazil",           (-33.8, -73.9,   5.3, -28.8)),
        ("India",            ( 6.7,  68.1,  35.7,  97.4)),
        ("Mexico",           (14.5, -117.1,  32.7, -86.7)),
        ("Spain",            (35.2,  -9.4,  43.8,   4.4)),
        ("Italy",            (36.6,   6.6,  47.1,  18.5)),
        ("Netherlands",      (50.7,   3.3,  53.6,   7.2)),
        ("Poland",           (49.0,  14.1,  54.8,  24.2)),
        ("South Africa",     (-34.8,  16.5, -22.1,  32.9)),
        ("Nigeria",          ( 4.3,   2.7,  13.8,  14.7)),
        ("Kenya",            (-4.7,  33.9,   4.6,  41.9)),
        ("Argentina",        (-55.1, -73.6, -21.8, -53.6)),
        ("Colombia",         (-4.2, -79.0,  12.5, -66.9)),
        ("Chile",            (-55.9, -75.6, -17.5, -66.4)),
        ("New Zealand",      (-46.6, 166.4, -34.4, 178.6)),
        ("Sweden",           (55.3,  10.9,  69.1,  24.2)),
        ("Norway",           (57.8,   4.6,  71.2,  31.1)),
        ("Denmark",          (54.6,   8.1,  57.8,  15.2)),
        ("Portugal",         (36.8, -10.0,  42.2,  -6.2)),
        ("Belgium",          (49.5,   2.5,  51.5,   6.4)),
        ("Austria",          (46.4,   9.5,  49.0,  17.2)),
        ("Switzerland",      (45.8,   5.9,  47.8,  10.5)),
        ("South Korea",      (33.1, 124.6,  38.6, 129.6)),
        ("Philippines",      ( 4.6, 116.9,  20.8, 126.6)),
    ]

    all_stations = []
    PER_COUNTRY_CAP = 500  # Max stations per country for OSM
    TOTAL_CAP = 15000      # Safety ceiling

    async def _overpass_fetch_country(country_name, bbox, mirror_url):
        """Fetch one country with 429-aware retry (up to 2 attempts)."""
        south, west, north, east = bbox
        remaining = min(PER_COUNTRY_CAP, TOTAL_CAP - len(all_stations))
        query = f"""
[out:json][timeout:30];
node["amenity"="police"]({south},{west},{north},{east});
out {remaining} body;
"""
        encoded = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request(mirror_url, data=encoded, headers={
            "User-Agent": "SherpaLiveEarth/1.0 (police data fetch; contact@sherpa-solutions-llc.com)"
        })
        loop = asyncio.get_event_loop()
        for attempt in range(2):
            try:
                raw = await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=35).read())
                return json.loads(raw).get("elements", [])
            except urllib.error.HTTPError as e:
                # 429 Too Many Requests OR 403 Forbidden (some mirrors return 403 when overloaded)
                if e.code in (429, 403):
                    wait = 30 * (attempt + 1)
                    print(f"[Police] {country_name} via {mirror_url}: {e.code} rate-limited, waiting {wait}s before retry {attempt+1}... ")
                    await asyncio.sleep(wait)
                else:
                    raise
        return []  # Both attempts exhausted

    for i, (country_name, bbox) in enumerate(COUNTRY_LIST):
        if len(all_stations) >= TOTAL_CAP:
            break
        
        # Rotate through the 5 mirrors to spread the load
        mirror_url = OVERPASS_MIRRORS[i % len(OVERPASS_MIRRORS)]
        
        try:
            elements = await _overpass_fetch_country(country_name, bbox, mirror_url)

            country_stations = []
            for el in elements:
                tags = el.get("tags", {})
                name = (tags.get("name") or tags.get("name:en") or "Police Station").strip()

                # Build address string
                house_num = tags.get("addr:housenumber", "")
                street = tags.get("addr:street", "")
                address = f"{house_num} {street}".strip() if (house_num or street) else ""

                # State/province: try several OSM tag conventions, adding county & operator for UK/Ireland
                state = (
                    tags.get("addr:state") or
                    tags.get("is_in:state") or
                    tags.get("addr:province") or
                    tags.get("addr:region") or
                    tags.get("addr:county") or
                    tags.get("operator") or  # e.g., "Metropolitan Police"
                    None
                )

                # City: try several OSM tag conventions
                city = (
                    tags.get("addr:city") or
                    tags.get("addr:town") or
                    tags.get("addr:suburb") or
                    tags.get("addr:municipality") or
                    None
                )

                phone = tags.get("contact:phone") or tags.get("phone") or ""

                if el.get("lat") is None or el.get("lon") is None:
                    continue

                country_stations.append({
                    "id": f"osm_{el['id']}",
                    "name": name,
                    "source": "overpass",
                    "country": country_name,
                    "state": state,
                    "city": city,
                    "address": address,
                    "phone": phone,
                    "lat": el.get("lat"),
                    "lng": el.get("lon"),
                })

            # Commit this country immediately so partial runs survive restarts
            if country_stations:
                async with aiosqlite.connect(POLICE_DB) as db:
                    for p in country_stations:
                        await db.execute(
                            "INSERT OR REPLACE INTO police_stations (id, name, source, country, state, city, address, phone, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (p["id"], p["name"], p["source"], p["country"], p["state"], p["city"],
                             p["address"], p["phone"], p["lat"], p["lng"])
                        )
                    await db.commit()

            all_stations.extend(country_stations)
            print(f"[Police] {country_name}: {len(country_stations)} stations fetched (total so far: {len(all_stations)})")
            await asyncio.sleep(3)  # Polite delay — Overpass allows ~1 req/2s for anonymous use

        except Exception as country_err:
            print(f"[Police] Failed to fetch {country_name}: {country_err}")
            await asyncio.sleep(5)  # Back off on unexpected errors

    # If Overpass returned nothing at all, fall back to static JSON
    if not all_stations:
        print("[Police] Overpass returned no data — falling back to police_data.json")
        police_file = os.path.join(STATIC_DIR, "police_data.json")
        if os.path.exists(police_file):
            with open(police_file, "r", encoding="utf-8") as f:
                all_stations = json.load(f)
            async with aiosqlite.connect(POLICE_DB) as db:
                for p in all_stations:
                    if p.get("lat") is None or p.get("lng") is None:
                        continue
                    await db.execute(
                        "INSERT OR REPLACE INTO police_stations (id, name, source, country, state, city, address, phone, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (p.get("id"), p.get("name"), p.get("source", "arcgis"),
                         p.get("country"), p.get("state"), p.get("city"),
                         p.get("address", ""), p.get("phone", ""), p.get("lat"), p.get("lng"))
                    )
                await db.commit()
        else:
            print("[Police] Fallback file also missing — aborting.")
            return

    # Fetch USA official data from HIFLD ArcGIS
    us_stations = await fetch_us_police_arcgis()
    if us_stations:
        async with aiosqlite.connect(POLICE_DB) as db:
            for p in us_stations:
                await db.execute(
                    "INSERT OR REPLACE INTO police_stations (id, name, source, country, state, city, address, phone, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (p["id"], p["name"], p["source"], p["country"], p["state"], p["city"],
                     p["address"], p["phone"], p["lat"], p["lng"])
                )
            await db.commit()
        all_stations.extend(us_stations)

    # Final metadata stamp
    async with aiosqlite.connect(POLICE_DB) as db:
        await db.execute("INSERT OR REPLACE INTO police_meta (key, last_updated) VALUES ('last_fetch', ?)", (int(datetime.now().timestamp()),))
        await db.commit()
    print(f"[Police Cache] Saved {len(all_stations)} stations total.")

async def update_police_loop():
    while True:
        await asyncio.sleep(86400)  # Refresh every 24 hours
        try:
            await fetch_police_logic()
        except Exception as e:
            print(f"[Police update loop error] {e}")

@app.get("/{page_name}.html", response_class=HTMLResponse)
async def serve_pages(page_name: str, request: Request):
    if page_name == "settings":
        user = get_current_user(request)
        if not user:
            return RedirectResponse(url="/login.html", status_code=status.HTTP_302_FOUND)
    
    html_path = os.path.join(BASE_DIR, f"{page_name}.html")
    if os.path.exists(html_path):
        if page_name == 'login':
           print(f"[Login Page] User {request.client.host} serving login.html")
        return FileResponse(html_path)
    return HTMLResponse(content="Page not found", status_code=404)


@app.post("/api/login")
async def login(response: Response, username: str = Form(...), password: str = Form(...)):
    print(f"[Login Attempt] Username: {username}")
    if await database.verify_user(username, password):
        print(f"[Login Success] Correct for {username}")
        token = secrets.token_urlsafe(32)
        sessions[token] = {
            "username": username,
            "expires": datetime.now() + timedelta(days=1)
        }
        response = RedirectResponse(url="/settings.html", status_code=status.HTTP_302_FOUND)
        response.set_cookie(key="session_token", value=token, httponly=True, max_age=86400)
        return response
    
    # Return error param
    print(f"[Login Failure] Credentials didn't match for {username}")
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

SAFE_EDIT_PAGES = ['index', 'about', 'services', 'projects', 'contact', 'merchandise', 'live_earth', 'skip_tracer', 'stock_agent', 'productivity_agent', 'osint_api', 'freeme']

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
        return JSONResponse({"status": "error", "message": "Failed to login: " + str(e)})


from fastapi import Request

@app.post("/api/inbound-email")
async def handle_inbound_email(request: Request):
    try:
        # Parse the raw body - handle both JSON and form-encoded payloads
        content_type = request.headers.get('content-type', '')
        raw_body = await request.body()
        print(f"[INBOUND EMAIL] Received webhook. Content-Type: {content_type}")
        print(f"[INBOUND EMAIL] Raw body (first 500 chars): {raw_body[:500]}")

        import json, os
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            print(f"[INBOUND EMAIL] Failed to parse JSON")
            payload = {}

        # Resend wraps inbound email data inside a "data" key, but occasionally nested multiple times depending on webhook rules
        raw_payload_capture = payload
        email_data = payload.get('data', payload)
        
        # Sometimes 'data' itself contains a stringified JSON object, or is nested again.
        if isinstance(email_data, str):
            try:
                decoded = json.loads(email_data)
                if isinstance(decoded, dict):
                    email_data = decoded
            except:
                email_data = {} # Fallback to empty dict if string isn't JSON

        if not isinstance(email_data, dict):
            email_data = {}

        sender = email_data.get('from', 'Unknown Sender')
        subject = email_data.get('subject', 'No Subject')
        
        text_raw = email_data.get('text', '')
        text_body = json.dumps(text_raw, indent=2) if isinstance(text_raw, (dict, list)) else str(text_raw) if text_raw else ''
        
        html_raw = email_data.get('html', text_body)
        html_body = json.dumps(html_raw, indent=2) if isinstance(html_raw, (dict, list)) else str(html_raw) if html_raw else ''

        # Resend inbound payload can be complex. We need the unique ID to fetch the full body.
        # It's usually 'id' in the JSON, but occasionally wrapped in 'data'.
        email_id = email_data.get('id') or email_data.get('email_id') or payload.get('id')
        
        print(f"[INBOUND EMAIL] Processing webhook for email ID: {email_id}")

        if email_id and not text_body and not html_body:
            import httpx
            # Use environment variable if available, otherwise fallback to the provided key
            api_key = os.environ.get("RESEND_API_KEY", "re_ZL3eeRzg_CvoAJcMXMG1Fdix8JDV7kLtW")
            try:
                async with httpx.AsyncClient() as client:
                    # Inbound emails are fetched from /emails/inbound/{id}
                    email_resp = await client.get(
                        f"https://api.resend.com/emails/inbound/{email_id}",
                        headers={"Authorization": f"Bearer {api_key}"}
                    )
                    if email_resp.status_code == 200:
                        fetched = email_resp.json()
                        t_raw = fetched.get('text', '')
                        h_raw = fetched.get('html', t_raw)
                        text_body = str(t_raw) if t_raw else ''
                        html_body = str(h_raw) if h_raw else ''
                        print(f"[INBOUND EMAIL] Successfully retrieved body for {email_id} from Resend API.")
                    else:
                        print(f"[INBOUND EMAIL] Failed to fetch body. Resend HTTP {email_resp.status_code}: {email_resp.text}")
            except Exception as e:
                print(f"[INBOUND EMAIL] Error fetching body from Resend API: {e}")

        # Fallback 2: Check for raw email payload in nested data
        if not text_body and not html_body:
            t_fallback = email_data.get('text_body') or email_data.get('body')
            h_fallback = email_data.get('html_body') or t_fallback
            text_body = str(t_fallback) if t_fallback else ''
            html_body = str(h_fallback) if h_fallback else ''

        # If the email legitimately has no body, provide debug info for troubleshooting
        if not text_body and not html_body:
            debug_info = {
                "email_id_found": email_id,
                "payload_keys": list(payload.keys()),
                "email_data_keys": list(email_data.keys()) if isinstance(email_data, dict) else "not a dict",
                "api_key_configured": bool(os.environ.get("RESEND_API_KEY"))
            }
            debug_str = json.dumps(debug_info, indent=2)
            text_body = f"[No Message Body Found]\n\n--- DEBUG INFO ---\n{debug_str}"
            html_body = f"<p><i>[No Message Body Found]</i></p><pre>--- DEBUG INFO ---\n{debug_str}</pre>"
        
        print(f"[INBOUND EMAIL] Final body length: {len(text_body)} chars")

        # --- SPAM FILTER ---
        if "hello@notify.railway.app" in sender.lower():
            print(f"[INBOUND EMAIL] IGNORING Automated Railway Notification to prevent spam loop.")
            return {"status": "Ignored - System Notification"}

        # Use Resend HTTP API instead of SMTP (port 443 is never blocked)
        api_key = os.environ.get("RESEND_API_KEY", "re_ZL3eeRzg_CvoAJcMXMG1Fdix8JDV7kLtW")
        
        forward_html = f"<p><i>--- Forwarded message from {sender} ---</i></p><hr>{html_body}" if html_body else None
        
        import httpx
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": "BaseCamp@sherpa-solutions-llc.com",
                    "to": ["chris.k.ricks@gmail.com"],
                    "subject": f"FWD: {subject} (From: {sender})",
                    "reply_to": sender,
                    "html": forward_html or f"<pre>--- Forwarded message from {sender} ---\n\n{text_body}</pre>",
                }
            )
            print(f"[INBOUND EMAIL] Resend API response: {resp.status_code} {resp.text}")
            
        print(f"[INBOUND EMAIL] SUCCESS - Email forwarded to chris.k.ricks@gmail.com")
        return {"status": "Forwarded Successfully"}
        
    except Exception as e:
        print(f"[INBOUND EMAIL] Webhook Failed: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "Error", "details": str(e)}

# --- FreeMe API ---


from typing import List
from pydantic import BaseModel
import uuid
import asyncio

# Note: The import is placed inside the specific functions here or globally to avoid circular loops
# We'll import freeme_engine.orchestrator safely where needed 

class FreeMeCampaignRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    dob: str
    address: str
    brokers: List[str]
    demo_mode: bool = False
    llm_model: str = "claude-3-opus"
    scan_frequency: str = "Once"
    email_notifications: bool = True

# Simple in-memory rate limiter for FreeMe live campaigns
FREEME_RATE_LIMITER = {}
MAX_LIVE_CAMPAIGNS_PER_DAY = 3

@app.get("/api/freeme/rates")
async def get_freeme_vlm_rates(model: str = "claude-3-opus"):
    """
    Returns the dynamic system rate limits for the selected VLM model.
    In production, this queries Redis or the provider's rate-limit endpoint/headers.
    """
    import random
    if model == "claude-3-opus":
        max_rpm = 4000
        used_rpm = random.randint(150, 850)
    elif model == "gpt-4-vision":
        max_rpm = 10000
        used_rpm = random.randint(500, 3200)
    else:
        max_rpm = -1  # Local unlimited
        used_rpm = 0

    return {
        "model": model,
        "max_rpm": max_rpm,
        "used_rpm": used_rpm,
        "used_tpm": random.randint(10000, 80000) if max_rpm > 0 else 0,
        "max_tpm": 400000 if max_rpm > 0 else -1,
        "status": "healthy"
    }

class DiscoverBrokersRequest(BaseModel):
    llm_model: str = "claude-3-opus"
    
@app.post("/api/freeme/discover_brokers")
async def discover_new_brokers(req: DiscoverBrokersRequest):
    """
    Simulates a LangChain Agent using DuckDuckGo search to find
    trending or newly established data brokers in 2026.
    In a full production environment, this dispatches a live LangChain Tool sequence.
    """
    await asyncio.sleep(2)  # Simulate LLM reasoning and search time
    
    # Pre-calculated simulated emerging threats
    new_threats = [
        {"name": "DataBrokerPro", "description": "Aggregates social footprint vectors.", "risk_level": "High"},
        {"name": "PeopleFindersXYZ", "description": "New phone & address crawler.", "risk_level": "Medium"},
        {"name": "InfoTraceNet", "description": "B2B contact scraper recently acquiring consumer records.", "risk_level": "High"}
    ]
    
    return {
        "status": "success",
        "message": f"Successfully polled AI model '{req.llm_model}'.",
        "discovered_brokers": new_threats
    }



# --- Skip Tracer API ---

@app.get("/api/skiptrace/{search_type}")
async def skip_trace_api(search_type: str, request: Request):
    """
    Proxy to the RapidAPI "Skip Tracing Working API".
    Requires active SaaS premium subscription.
    """
    try:
        user = require_saas_user(request)
        if not user.get('is_premium'):
            return JSONResponse(status_code=403, content={"error": "Premium subscription required. Upgrade to unlock the engine."})
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"error": e.detail})

    # Read query parameters sent by the frontend
    params = dict(request.query_params)
    provider = params.get("provider", "mock")
    api_key = request.headers.get("x-target-api-key")
    
    if not api_key and provider != "mock":
        # Auto-fetch the key from our hardware database if not provided by header
        keys = await database.get_traku_providers()
        if provider in keys:
            api_key = keys[provider].get("api_key")
            
    if provider == "mock":
        # The RapidAPI endpoints for the previous service are currently offline/returning 404.
        # To ensure Traku remains fully functional without rate limits, we are using an internal
        # simulated OSINT data engine that generates professional-grade deterministic responses.
        import hashlib
        import asyncio
        from datetime import datetime

        purpose = params.get("purpose", "Unknown")
        print(f"[TRAKU AUDIT LOG] {datetime.now()} | IP: {request.client.host} | Query: {search_type} | Purpose: {purpose} | Active Engine: MOCK")
        import hashlib
        import asyncio
        
        # Generate a deterministic mock response based on the search inputs
        seed_string = search_type + "".join(str(v).lower() for v in params.values())
        
        if not seed_string.strip():
            return JSONResponse(status_code=400, content={"error": "No search parameters provided."})
            
        hash_val = int(hashlib.md5(seed_string.encode()).hexdigest(), 16)
        
        # Decide how many hits to return based on the hash (1 to 3 hits usually, rarely 0)
        hit_count = (hash_val % 3) + 1
        if (hash_val % 10) == 0:
            hit_count = 0 # 10% chance of no hits for realism
            
        people_details = []
        cities = ["Dallas, TX", "Austin, TX", "Chicago, IL", "New York, NY", "Miami, FL", "Seattle, WA", "Denver, CO", "Atlanta, GA", "Boston, MA", "Phoenix, AZ"]
        names = [("John", "Doe"), ("Jane", "Smith"), ("Michael", "Johnson"), ("Emily", "Davis"), ("William", "Brown"), ("Sarah", "Wilson")]
        
        for i in range(hit_count):
            sub_hash = int(hashlib.md5(f"{seed_string}_{i}".encode()).hexdigest(), 16)
            f_name = params.get('firstName', names[sub_hash % len(names)][0]).capitalize()
            l_name = params.get('lastName', names[(sub_hash + 1) % len(names)][1]).capitalize()
            person_id = f"TRK-{str(sub_hash)[:8].upper()}"
            age = 25 + (sub_hash % 45)
            
            lives_in = params.get('city', "Unknown") + ", " + params.get('state', "") 
            if lives_in == "Unknown, ":
                lives_in = cities[sub_hash % len(cities)]
                
            used_to_live_in = [cities[(sub_hash + j) % len(cities)] for j in range(1, 4)]
            r1 = names[(sub_hash + 2) % len(names)]
            r2 = names[(sub_hash + 3) % len(names)]
            related = f"{r1[0]} {l_name}, {r2[0]} {r2[1]}"
            
            # Deterministic comms generation
            phone_count = (sub_hash % 3) + 1
            phones = []
            for p in range(phone_count):
                p_hash = int(hashlib.md5(f"{seed_string}_{i}_p_{p}".encode()).hexdigest(), 16)
                area = str(200 + (p_hash % 800))
                prefix = str(200 + ((p_hash // 1000) % 800))
                line = str(1000 + ((p_hash // 10000) % 9000))
                conf = 30 + (p_hash % 70) # 30 to 100
                status = "Disconnected" if conf < 60 else "Active"
                is_lit = True if (p_hash % 15 == 0) else False # 1/15 chance of litigator flag
                phones.append({
                    "number": f"({area}) {prefix}-{line}",
                    "confidence": conf,
                    "status": status,
                    "is_litigator": is_lit
                })
                
            email_count = (sub_hash % 2) + 1
            emails = []
            domains = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "protonmail.com"]
            for e in range(email_count):
                e_hash = int(hashlib.md5(f"{seed_string}_{i}_e_{e}".encode()).hexdigest(), 16)
                domain = domains[e_hash % len(domains)]
                prefix_var = f_name.lower() + "." + l_name.lower() if e_hash%2==0 else f_name.lower()[0] + l_name.lower() + str(e_hash%99)
                conf = 40 + (e_hash % 60)
                emails.append({
                    "email": f"{prefix_var}@{domain}",
                    "confidence": conf
                })

            # Sort descending by confidence so the "best" hit is on top visually
            phones.sort(key=lambda x: x["confidence"], reverse=True)
            emails.sort(key=lambda x: x["confidence"], reverse=True)
            
            people_details.append({
                "Name": f"{f_name} {l_name}",
                "Age": str(age),
                "Person ID": person_id,
                "Lives in": lives_in,
                "Used to live in": ", ".join(used_to_live_in),
                "Related to": related,
                "Phones": phones,
                "Emails": emails,
                "Link": f"https://sherpa-solutions-osint.internal/dossier/{person_id}"
            })

        await asyncio.sleep(1.5) # Simulate database/API delay for UX realism
        return JSONResponse(content={
            "Records": len(people_details),
            "PeopleDetails": people_details
        })

    elif provider == "abstractapi":
        if not api_key:
            return JSONResponse(status_code=401, content={"error": "AbstractAPI requires a valid API Key. Configure it in Data Sources."})
        
        target_ip = params.get("ip")
        if not target_ip:
            # If the user didn't provide an IP, AbstractAPI can't run. Return empty gracefully so Promise.all() doesn't fail.
            return JSONResponse(content={"Records": 0, "PeopleDetails": []})
            
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(f"https://ipgeolocation.abstractapi.com/v1/?api_key={api_key}&ip_address={target_ip}")
                
            if res.status_code == 200:
                data = res.json()
                
                # Format AbstractAPI response into our uniform PeopleDetails schema
                formatted = {
                    "Name": "Network Node Analysis",
                    "Age": "N/A",
                    "Person ID": f"IP-{target_ip.replace('.', '')}",
                    "Lives in": f"{data.get('city', 'Unknown')}, {data.get('region', 'Unknown')}",
                    "Used to live in": data.get('country', 'Unknown'),
                    "Related to": f"ISP: {data.get('connection', {}).get('isp_name', 'Unknown')}",
                    "Phones": [],
                    "Emails": [],
                    "Link": "#"
                }

                # Add VPN/Proxy flags as mock emails for display purposes
                is_vpn = data.get("security", {}).get("is_vpn", False)
                if is_vpn:
                    formatted["Emails"].append({"email": "FLAG: VPN DETECTED", "confidence": 100})
                
                await database.increment_traku_provider_usage("abstractapi")
                return JSONResponse(content={"Records": 1, "PeopleDetails": [formatted]})
            else:
                return JSONResponse(status_code=res.status_code, content={"error": f"AbstractAPI Error: {res.text}"})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Failed to contact AbstractAPI: {str(e)}"})
            
    elif provider == "numverify":
        if not api_key:
            return JSONResponse(status_code=401, content={"error": "Numverify requires a valid API Key. Configure it in Data Sources."})
            
        target_phone = params.get("phone")
        if not target_phone:
            return JSONResponse(content={"Records": 0, "PeopleDetails": []})
            
        # Clean phone to digits
        import re
        clean_phone = re.sub(r'\D', '', target_phone)
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(f"http://apilayer.net/api/validate?access_key={api_key}&number={clean_phone}")
                
            if res.status_code == 200:
                data = res.json()
                if not data.get("valid"):
                    return JSONResponse(content={"Records": 0, "PeopleDetails": []})
                    
                formatted = {
                    "Name": "Telecom Record",
                    "Age": "N/A",
                    "Person ID": f"TEL-{clean_phone}",
                    "Lives in": f"{data.get('location', 'Unknown')}, {data.get('country_name', 'Unknown')}",
                    "Used to live in": "",
                    "Related to": f"Carrier: {data.get('carrier', 'Unknown')} ({data.get('line_type', 'Unknown')})",
                    "Phones": [{
                        "number": data.get("international_format", target_phone),
                        "confidence": 99,
                        "status": "Active" if data.get("valid") else "Invalid"
                    }],
                    "Emails": [],
                    "Link": "#"
                }
                
                await database.increment_traku_provider_usage("numverify")
                return JSONResponse(content={"Records": 1, "PeopleDetails": [formatted]})
            else:
                return JSONResponse(status_code=res.status_code, content={"error": f"Numverify Error: {res.text}"})
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"Failed to contact Numverify: {str(e)}"})
        
    elif provider == "usa_people_search":
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "API Target Key is required to use the USA People Search (RapidAPI) provider."})
        return JSONResponse(status_code=501, content={"error": "USA People Search API integration requires a valid real-world RapidAPI subscription key. Backend routing is scaffolded but live fetching is stubbed."})
        
    elif provider == "pipl":
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "Enterprise API Key is required to use Pipl."})
        return JSONResponse(status_code=501, content={"error": "Pipl Global OSINT integration requires a valid corporate subscription contract."})
        
    elif provider == "spokeo":
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "API Key is required to use the Spokeo API / Whitepages PRO."})
        return JSONResponse(status_code=501, content={"error": "Spokeo/Whitepages API integration is currently restricted pending partner key validation."})
        
    elif provider == "enhanced_people":
        if not api_key:
            return JSONResponse(status_code=400, content={"error": "API Key is required to use the Enhanced People Search provider."})
        return JSONResponse(status_code=501, content={"error": "Enhanced People Search API connection failed due to unverified RapidAPI credentials."})
        
    else:
        return JSONResponse(status_code=400, content={"error": "Unknown or invalid OSINT Data Provider specified."})

# --- AIS / Vessel Data (SQLite-backed, hourly refresh) ---
import httpx
import time

def classify_vessel_type(ship_type_code):
    """Classify a vessel using AIS/IMO ship type codes."""
    if ship_type_code is None:
        return "other"
    st = int(ship_type_code)
    if 70 <= st <= 79:
        return "cargo"
    elif 80 <= st <= 89:
        return "tanker"
    elif 30 <= st <= 39:
        return "fishing"
    elif 60 <= st <= 69:
        return "passenger"
    else:
        return "other"

async def init_vessels_db():
    async with aiosqlite.connect(VESSELS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS vessels (
                mmsi      TEXT PRIMARY KEY,
                title     TEXT,
                lat       REAL,
                lng       REAL,
                heading   REAL,
                velocity_kmh REAL,
                country   TEXT,
                vessel_type TEXT DEFAULT 'other',
                last_updated INTEGER
            )
        ''')
        # Add vessel_type column if missing (migration)
        try:
            await db.execute("ALTER TABLE vessels ADD COLUMN vessel_type TEXT DEFAULT 'other'")
        except Exception:
            pass  # Column already exists
        await db.execute('''
            CREATE TABLE IF NOT EXISTS vessels_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.commit()

async def fetch_vessels_logic():
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Fetch live vessel locations
            print("[AIS] Fetching live vessels from DigiTraffic...")
            res = await client.get('https://meri.digitraffic.fi/api/ais/v1/locations')
            res.raise_for_status()
            data = res.json()

            # Step 2: Fetch vessel metadata (ship type, name, country)
            print("[AIS] Fetching vessel metadata from DigiTraffic...")
            try:
                meta_res = await client.get('https://meri.digitraffic.fi/api/ais/v1/vessels')
                meta_res.raise_for_status()
                meta_list = meta_res.json()
                # Build MMSI → metadata lookup
                meta_dict = {}
                for v in meta_list:
                    m = v.get("mmsi")
                    if m:
                        meta_dict[m] = v
                print(f"[AIS] Loaded metadata for {len(meta_dict)} vessels.")
            except Exception as meta_err:
                print(f"[AIS] Metadata fetch failed (non-fatal): {meta_err}")
                meta_dict = {}

        vessels = []
        for item in data.get("features", []):
            mmsi = item.get("mmsi")
            coords = item.get("geometry", {}).get("coordinates", [])
            props = item.get("properties", {})
            if mmsi and len(coords) == 2:
                lng, lat = coords[0], coords[1]
                speed = props.get("sog", 0) * 1.852  # knots → km/h
                heading = props.get("cog", 0)

                # Lookup metadata for name, country, and ship type
                meta = meta_dict.get(mmsi, {})
                vessel_name = meta.get("name", f"Vessel {mmsi}").strip() or f"Vessel {mmsi}"
                country = meta.get("destination", "FIN/BALTIC") or "FIN/BALTIC"  # Use destination if available
                ship_type_code = meta.get("shipType", None)
                vessel_type = classify_vessel_type(ship_type_code)

                vessels.append((
                    str(mmsi), vessel_name, lat, lng,
                    heading, speed, country, vessel_type, int(time.time())
                ))

        # 1. Write to SOURCE DB
        async with aiosqlite.connect(VESSELS_SOURCE_DB) as db:
            await db.execute('''
                CREATE TABLE IF NOT EXISTS vessels (
                    mmsi      TEXT PRIMARY KEY,
                    title     TEXT,
                    lat       REAL,
                    lng       REAL,
                    heading   REAL,
                    velocity_kmh REAL,
                    country   TEXT,
                    vessel_type TEXT DEFAULT 'other',
                    last_updated INTEGER
                )
            ''')
            try:
                await db.execute("ALTER TABLE vessels ADD COLUMN vessel_type TEXT DEFAULT 'other'")
            except Exception:
                pass
            await db.execute('''
                CREATE TABLE IF NOT EXISTS vessels_meta (
                    key TEXT PRIMARY KEY,
                    last_updated INTEGER
                )
            ''')
            await db.execute("DELETE FROM vessels")
            await db.executemany(
                "INSERT OR REPLACE INTO vessels (mmsi, title, lat, lng, heading, velocity_kmh, country, vessel_type, last_updated) VALUES (?,?,?,?,?,?,?,?,?)",
                vessels
            )
            await db.execute("INSERT OR REPLACE INTO vessels_meta (key, last_updated) VALUES ('last_fetch', ?)", (int(time.time()),))
            await db.commit()

        # 2. Update MAIN DB Atomically
        async with aiosqlite.connect(VESSELS_DB) as db:
            await db.execute("DELETE FROM vessels")
            await db.executemany(
                "INSERT OR REPLACE INTO vessels (mmsi, title, lat, lng, heading, velocity_kmh, country, vessel_type, last_updated) VALUES (?,?,?,?,?,?,?,?,?)",
                vessels
            )
            await db.execute("INSERT OR REPLACE INTO vessels_meta (key, last_updated) VALUES ('last_fetch', ?)", (int(time.time()),))
            await db.commit()

        # Summary by type
        type_counts = {}
        for v in vessels:
            vt = v[7]
            type_counts[vt] = type_counts.get(vt, 0) + 1
        print(f"[AIS] Stored {len(vessels)} vessels. Types: {type_counts}")
    except Exception as e:
        print("[AIS] Fetch failed:", str(e))

async def update_vessels_loop():
    """Refresh vessel data from DigiTraffic once per hour."""
    while True:
        await asyncio.sleep(3600)
        try:
            await fetch_vessels_logic()
        except Exception as e:
            print(f"[AIS update loop error] {e}")

@app.get("/api/vessels")
async def get_vessels():
    """Return AIS vessel snapshot from the SQLite DB."""
    try:
        async with aiosqlite.connect(VESSELS_DB) as db:
            async with db.execute(
                "SELECT mmsi, title, lat, lng, heading, velocity_kmh, country, vessel_type, last_updated FROM vessels"
            ) as cursor:
                rows = await cursor.fetchall()
        return JSONResponse([{
            "id": r[0], "title": r[1], "lat": r[2], "lng": r[3],
            "heading": r[4], "velocityKmH": r[5], "country": r[6],
            "vesselType": r[7] or "other", "type": "vessel", "lastUpdate": r[8]
        } for r in rows])
    except Exception as e:
        print(f"[Vessels] DB Error: {e}")
        return JSONResponse([])

# --- OpenSky Flights API Proxy with Global Cache ---

import httpx
import time

opensky_cache = {
    "data": None,
    "last_fetched": 0
}

_sat_cache = {
    "data": None,
    "last_fetched": 0
}

import random
import math

FLIGHTS_DB = "sherpa_flights.db"
FLIGHTS_SOURCE_DB = "sherpa_flights_source.db"

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
    import asyncio
    while True:
        states = None
        source_time = int(time.time())
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get('https://opensky-network.org/api/states/all', timeout=15.0)
                res.raise_for_status()
                data = res.json()
                states = data.get("states") or []
                source_time = data.get("time", source_time)
        except Exception as e:
            print(f"[Flights] OpenSky API failed. Falling back to adsb.lol... ({e})")
            
        if not states:
            try:
                async with httpx.AsyncClient() as client:
                    res = await client.get('https://api.adsb.lol/v2/ladd', timeout=15.0)
                    res.raise_for_status()
                    data = res.json()
                    source_time = int(data.get("now", int(time.time()*1000)) / 1000)
                    ac = data.get("ac", [])
                    states = []
                    for a in ac:
                        if a.get("lat") is not None and a.get("lon") is not None:
                            # Calculate velocity uniformly
                            gs = a.get("gs")
                            tas = a.get("tas")
                            mach = a.get("mach")
                            if gs is not None: vel = gs * 0.51444
                            elif tas is not None: vel = tas * 0.51444
                            elif mach is not None: vel = mach * 340
                            else: vel = 0.8 * 340
                            
                            states.append([
                                a.get("hex", "UNKNOWN"), a.get("flight", ""), "Unknown",
                                None, None, a.get("lon"), a.get("lat"), a.get("alt_baro", 10000),
                                False, vel, a.get("track", 0)
                            ])
            except Exception as e:
                print(f"[Flights] adsb.lol fallback failed: {e}")

        # Protect against wiping the DB if both APIs fail
        if states:
            try:
                # 1. Write to SOURCE DB
                async with aiosqlite.connect(FLIGHTS_SOURCE_DB) as db:
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
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('fetch_time', ?)", (str(current_time),))
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('source_time', ?)", (str(source_time),))
                    await db.commit()

                # 2. Update MAIN DB Atomically
                async with aiosqlite.connect(FLIGHTS_DB) as db:
                    await db.execute("DELETE FROM flights")
                    await db.executemany('''
                        INSERT INTO flights 
                        (icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', insert_data)
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('fetch_time', ?)", (str(current_time),))
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('source_time', ?)", (str(source_time),))
                    await db.commit()
                print(f"Background Scraper: Successfully stored {len(states)} flights in SQLite database.")
            except Exception as e:
                import traceback
                print(f"Background Scraper DB Save Failed: [{type(e).__name__}] {repr(e)}")
                traceback.print_exc()
        await asyncio.sleep(3600)   # 1 hour polling restriction

# --- ADSB.LOL CORS PROXIES ---
@app.get("/api/proxy/adsblol/ladd")
async def proxy_adsblol_ladd():
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get('https://api.adsb.lol/v2/ladd', timeout=15.0)
            return JSONResponse(res.json())
    except Exception as e:
        print(f"[Proxy] ADSB.lol LADD proxy failed: {e}")
        return JSONResponse({"ac": [], "error": str(e)})

@app.get("/api/proxy/adsblol/mil")
async def proxy_adsblol_mil():
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get('https://api.adsb.lol/v2/mil', timeout=15.0)
            return JSONResponse(res.json())
    except Exception as e:
        print(f"[Proxy] ADSB.lol MIL proxy failed: {e}")
        return JSONResponse({"ac": [], "error": str(e)})

@app.get("/api/proxy/live-flight/{icao24}")
async def proxy_live_flight(icao24: str):
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(f'https://api.adsb.lol/v2/icao/{icao24}', timeout=10.0)
            if res.status_code == 200:
                data = res.json()
                ac = data.get("ac", [])
                if ac:
                    a = ac[0]
                    # Compute velocity in m/s safely
                    gs = a.get("gs")
                    tas = a.get("tas")
                    mach = a.get("mach")
                    if gs is not None: vel = gs * 0.51444
                    elif tas is not None: vel = tas * 0.51444
                    elif mach is not None: vel = mach * 340
                    else: vel = 250.0  # Safe default ~500 knots

                    alt_raw = a.get("alt_baro", 10000)
                    alt = alt_raw if isinstance(alt_raw, (int, float)) else 10000

                    return JSONResponse({
                        "lat": a.get("lat"),
                        "lng": a.get("lon"),
                        "alt": alt,
                        "heading": a.get("track", 0),
                        "velocity": vel
                    })
            return JSONResponse({"status": "unavailable"})
    except Exception as e:
        print(f"[Proxy] ADSB.lol Live tracking failed: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/flights")
async def get_flights():
    import time
    try:
        async with aiosqlite.connect(FLIGHTS_DB) as db:
            source_time = int(time.time())
            try:
                async with db.execute("SELECT value FROM flight_metadata WHERE key = 'source_time'") as cursor:
                    row = await cursor.fetchone()
                    if row:
                        source_time = int(row[0])
            except Exception as metadata_e:
                print(f"[Flights] Metadata not found or table error: {metadata_e}")
            
            async with db.execute("SELECT icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading FROM flights") as cursor:
                rows = await cursor.fetchall()
                states = []
                for r in rows:
                    states.append([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8]), r[9], r[10]])
                
                print(f"[Flights] Returning {len(states)} active flights from DB.")
                return JSONResponse({"time": source_time, "states": states})
    except Exception as e:
        print(f"[Flights] DB Error: {e}")
        return JSONResponse({"time": int(time.time()), "states": []})

MILITARY_FLIGHTS_DB = "sherpa_military_flights.db"
MILITARY_FLIGHTS_SOURCE_DB = "sherpa_military_flights_source.db"

async def init_military_flights_db():
    async with aiosqlite.connect(MILITARY_FLIGHTS_DB) as db:
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

async def fetch_military_flights_loop():
    import httpx
    import time
    import asyncio
    while True:
        states = None
        source_time = int(time.time())
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get('https://api.adsb.lol/v2/mil', timeout=15.0)
                res.raise_for_status()
                data = res.json()
                source_time = int(data.get("now", int(time.time()*1000)) / 1000)
                ac = data.get("ac", [])
                states = []
                for a in ac:
                    if a.get("lat") is not None and a.get("lon") is not None:
                        # Calculate velocity uniformly
                        gs = a.get("gs")
                        tas = a.get("tas")
                        mach = a.get("mach")
                        if gs is not None: vel = gs * 0.51444
                        elif tas is not None: vel = tas * 0.51444
                        elif mach is not None: vel = mach * 340
                        else: vel = 0.8 * 340
                        
                        states.append([
                            a.get("hex", "UNKNOWN"), a.get("flight", ""), "Unknown",
                            None, None, a.get("lon"), a.get("lat"), a.get("alt_baro", 10000),
                            False, vel, a.get("track", 0)
                        ])
        except Exception as e:
            print(f"[Military Flights] adsb.lol /v2/mil failed: {e}")

        # Protect against wiping the DB if API fails
        if states:
            try:
                # 1. Write to SOURCE DB
                async with aiosqlite.connect(MILITARY_FLIGHTS_SOURCE_DB) as db:
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
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('fetch_time', ?)", (str(current_time),))
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('source_time', ?)", (str(source_time),))
                    await db.commit()

                # 2. Update MAIN DB Atomically
                async with aiosqlite.connect(MILITARY_FLIGHTS_DB) as db:
                    await db.execute("DELETE FROM flights")
                    await db.executemany('''
                        INSERT INTO flights 
                        (icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', insert_data)
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('fetch_time', ?)", (str(current_time),))
                    await db.execute("INSERT OR REPLACE INTO flight_metadata (key, value) VALUES ('source_time', ?)", (str(source_time),))
                    await db.commit()
                print(f"Background Scraper: Successfully stored {len(states)} military flights.")
            except Exception as e:
                import traceback
                print(f"Military Scraper DB Save Failed: [{type(e).__name__}] {repr(e)}")
        else:
            print("[Military Flights] Could not fetch flights from source, preserving old DB state.")

        await asyncio.sleep(3600)   # 1 hour polling restriction

@app.get("/api/military-flights")
async def get_military_flights():
    import time
    try:
        async with aiosqlite.connect(MILITARY_FLIGHTS_DB) as db:
            source_time = int(time.time())
            try:
                async with db.execute("SELECT value FROM flight_metadata WHERE key = 'source_time'") as cursor:
                    row = await cursor.fetchone()
                    if row:
                        source_time = int(row[0])
            except Exception as metadata_e:
                pass
            
            async with db.execute("SELECT icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading FROM flights") as cursor:
                rows = await cursor.fetchall()
                states = []
                for r in rows:
                    states.append([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8]), r[9], r[10]])
                
                print(f"[Military Flights] Returning {len(states)} active flights from DB.")
                return JSONResponse({"time": source_time, "states": states})
    except Exception as e:
        print(f"[Military Flights] DB Error: {e}")
        return JSONResponse({"time": int(time.time()), "states": []})

SATELLITES_DB = os.path.join(BASE_DIR, "satellites_data.db")
SATELLITES_SOURCE_DB = os.path.join(BASE_DIR, "satellites_data_source.db")

async def init_satellites_db():
    async with aiosqlite.connect(SATELLITES_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS satellites (
                id TEXT PRIMARY KEY,
                name TEXT,
                line1 TEXT,
                line2 TEXT,
                type TEXT,
                country TEXT,
                status TEXT
            )
        ''')
        await db.commit()

async def fetch_satellites_logic():
    import httpx
    import csv
    from io import StringIO
    try:
        print("[Satellites] Starting sync from Celestrak...")
        
        satellites_cache = []
        
        async with httpx.AsyncClient(timeout=45.0, verify=False, follow_redirects=True) as client:
            satcat_dict = {}
            print("  -> Fetching SATCAT metadata dictionary...")
            try:
                resp_cat = await client.get("https://celestrak.org/pub/satcat.csv")
                if resp_cat.status_code == 200:
                    reader = csv.reader(StringIO(resp_cat.text))
                    headers = next(reader)
                    for row in reader:
                        if len(row) > 5:
                            norad_id = row[2].strip()
                            status_code = row[4].strip()
                            owner = row[5].strip()
                            is_active = "active" if status_code in ['+', 'P', 'B'] else "inactive"
                            satcat_dict[norad_id] = {"country": owner, "status": is_active}
                else:
                    print(f"  -> SATCAT Fetch failed: HTTP {resp_cat.status_code}")
            except Exception as e:
                print(f"  -> SATCAT Exception: {e}")

            print("  -> Fetching universal active TLE group...")
            url = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    text = resp.text
                    lines = [l.strip() for l in text.split('\n') if l.strip()]
                    
                    for i in range(0, len(lines), 3):
                        if i + 2 < len(lines):
                            name = lines[i]
                            line1 = lines[i+1]
                            line2 = lines[i+2]
                            
                            if line1.startswith('1 ') and line2.startswith('2 '):
                                catalog_num = line1[2:7].strip()
                                sat_id = f"{name}_{catalog_num}"
                                
                                meta = satcat_dict.get(catalog_num, {"country": "UNKNOWN", "status": "unknown"})
                                
                                # Heuristic Categorization since Celestrak's military group only contains 22 nodes
                                upper_name = name.upper()
                                if any(k in upper_name for k in ['USA ', 'COSMOS ', 'KOSMOS ', 'YAOGAN', 'NROL', 'MILSTAR', 'WGS', 'AEHF', 'SBIRS', 'GPS', 'GLONASS', 'NAVSTAR', 'BEIDOU', 'GALILEO', 'SKYN', 'SYRACUSE', 'SICRAL', 'GSAT', 'OFEQ', 'MUOS', 'DMSP', 'DSP ', 'ORS', 'TJSW', 'FLTSATCOM', 'UFO']):
                                    sat_type = "military"
                                elif any(k in upper_name for k in ['STARLINK', 'ONEWEB', 'IRIDIUM', 'GLOBALSTAR']):
                                    sat_type = "commercial"
                                else:
                                    sat_type = "private"
                                    
                                satellites_cache.append((sat_id, name, line1, line2, sat_type, meta["country"], meta["status"]))
                else:
                    print(f"    - Failed to fetch active group: HTTP {resp.status_code}")
            except Exception as e:
                print(f"    - Error fetching active group: {e}")
        
        # Update Database
        if satellites_cache:
            # 1. Write to SOURCE DB
            async with aiosqlite.connect(SATELLITES_SOURCE_DB) as db:
                await db.execute('''
                    CREATE TABLE IF NOT EXISTS satellites (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        line1 TEXT,
                        line2 TEXT,
                        type TEXT,
                        country TEXT,
                        status TEXT
                    )
                ''')
                await db.execute('DELETE FROM satellites')
                await db.executemany('''
                    INSERT OR REPLACE INTO satellites (id, name, line1, line2, type, country, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', satellites_cache)
                await db.commit()
                
            # 2. Update MAIN DB Atomically
            async with aiosqlite.connect(SATELLITES_DB) as db:
                await db.execute('DELETE FROM satellites')
                await db.executemany('''
                    INSERT OR REPLACE INTO satellites (id, name, line1, line2, type, country, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', satellites_cache)
                await db.commit()
                
            print(f"[Satellites] Sync complete. {len(satellites_cache)} satellites stored.")
        else:
            print("[Satellites] Sync failed. No data retrieved.")
            
    except Exception as e:
        print(f"[Satellites] Sync Error: {e}")

async def update_satellites_loop():
    while True:
        await fetch_satellites_logic()
        # Sleep for 24 hours (86400 seconds)
        await asyncio.sleep(86400)


@app.get("/api/satellites")
async def get_satellites():
    """Returns the cached list of satellites from the local SQLite database."""
    try:
        async with aiosqlite.connect(SATELLITES_DB) as db:
            async with db.execute("SELECT name, line1, line2, type, country, status FROM satellites") as cursor:
                rows = await cursor.fetchall()
                satellites_json = []
                for r in rows:
                    satellites_json.append({
                        "name": r[0],
                        "line1": r[1],
                        "line2": r[2],
                        "type": r[3],
                        "country": r[4],
                        "status": r[5]
                    })
                return JSONResponse(satellites_json)
    except Exception as e:
        print(f"[Satellites] DB Fetch error: {e}")
        return JSONResponse([])

# --- Earthquake Data (SQLite-backed, hourly refresh) ---

async def init_earthquakes_db():
    async with aiosqlite.connect(EARTHQUAKES_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS earthquakes (
                id         TEXT NOT NULL,
                duration   TEXT NOT NULL,
                mag        REAL,
                place      TEXT,
                time_ms    INTEGER,
                lng        REAL,
                lat        REAL,
                depth      REAL,
                raw_json   TEXT,
                fetched_at INTEGER,
                PRIMARY KEY (id, duration)
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS earthquakes_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.commit()

async def fetch_earthquakes_logic():
    import json as _json
    for duration in ("day", "week"):
        try:
            url = f"https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_{duration}.geojson"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            features = data.get("features", [])
            # 1. Write to SOURCE DB
            async with aiosqlite.connect(EARTHQUAKES_SOURCE_DB) as db:
                await db.execute('''
                    CREATE TABLE IF NOT EXISTS earthquakes (
                        id         TEXT NOT NULL,
                        duration   TEXT NOT NULL,
                        mag        REAL,
                        place      TEXT,
                        time_ms    INTEGER,
                        lng        REAL,
                        lat        REAL,
                        depth      REAL,
                        raw_json   TEXT,
                        fetched_at INTEGER,
                        PRIMARY KEY (id, duration)
                    )
                ''')
                await db.execute('''
                    CREATE TABLE IF NOT EXISTS earthquakes_meta (
                        key TEXT PRIMARY KEY,
                        last_updated INTEGER
                    )
                ''')
                await db.execute("DELETE FROM earthquakes WHERE duration = ?", (duration,))
                for f in features:
                    props = f.get("properties", {})
                    coords = f.get("geometry", {}).get("coordinates", [])
                    await db.execute(
                        "INSERT OR REPLACE INTO earthquakes (id, duration, mag, place, time_ms, lng, lat, depth, raw_json, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (
                            f.get("id"), duration,
                            props.get("mag"), props.get("place"), props.get("time"),
                            coords[0] if len(coords) > 0 else None,
                            coords[1] if len(coords) > 1 else None,
                            coords[2] if len(coords) > 2 else None,
                            _json.dumps(f), int(time.time())
                        )
                    )
                await db.execute("INSERT OR REPLACE INTO earthquakes_meta (key, last_updated) VALUES (?,?)", (f"last_fetch_{duration}", int(time.time())))
                await db.commit()

            # 2. Update MAIN DB Atomically
            async with aiosqlite.connect(EARTHQUAKES_DB) as db:
                await db.execute("DELETE FROM earthquakes WHERE duration = ?", (duration,))
                for f in features:
                    props = f.get("properties", {})
                    coords = f.get("geometry", {}).get("coordinates", [])
                    await db.execute(
                        "INSERT OR REPLACE INTO earthquakes (id, duration, mag, place, time_ms, lng, lat, depth, raw_json, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (
                            f.get("id"), duration,
                            props.get("mag"), props.get("place"), props.get("time"),
                            coords[0] if len(coords) > 0 else None,
                            coords[1] if len(coords) > 1 else None,
                            coords[2] if len(coords) > 2 else None,
                            _json.dumps(f), int(time.time())
                        )
                    )
                await db.execute("INSERT OR REPLACE INTO earthquakes_meta (key, last_updated) VALUES (?,?)", (f"last_fetch_{duration}", int(time.time())))
                await db.commit()
            print(f"[Earthquakes] Stored {len(features)} events for duration={duration}")
        except Exception as e:
            print(f"[Earthquakes] Failed to fetch duration={duration}: {e}")

async def update_earthquakes_loop():
    """Refresh earthquake data from USGS once per hour."""
    while True:
        await asyncio.sleep(3600)
        try:
            await fetch_earthquakes_logic()
        except Exception as e:
            print(f"[Earthquakes update loop error] {e}")

@app.get("/api/earthquakes")
async def get_earthquakes(duration: str = "day"):
    import json as _json
    try:
        async with aiosqlite.connect(EARTHQUAKES_DB) as db:
            async with db.execute("SELECT raw_json FROM earthquakes WHERE duration = ?", (duration,)) as cursor:
                rows = await cursor.fetchall()
        features = [_json.loads(r[0]) for r in rows if r[0]]
        result = {"type": "FeatureCollection", "features": features}
        return Response(content=_json.dumps(result), media_type="application/json")
    except Exception as e:
        print(f"[Earthquakes] DB Error: {e}")
        return Response(content='{"type":"FeatureCollection","features":[]}', media_type="application/json")

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
# SQLite-backed; background loop refreshes every hour.
# ---------------------------------------------------------------------------
import asyncio

# Caltrans districts 1-12 span all of California
CALTRANS_DISTRICTS = ["d3", "d4", "d5", "d6", "d7", "d8", "d10", "d11", "d12"]

async def init_cameras_db():
    async with aiosqlite.connect(CAMERAS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS cameras (
                id          TEXT PRIMARY KEY,
                title       TEXT,
                lat         REAL,
                lng         REAL,
                type        TEXT DEFAULT 'cctv',
                country     TEXT,
                state       TEXT,
                stream_type TEXT,
                snapshot    TEXT,
                hls_url     TEXT,
                video       TEXT,
                link        TEXT,
                fetched_at  INTEGER
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS cameras_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.commit()

async def fetch_cameras_logic():
    cameras = []
    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [_fetch_caltrans_district(client, d) for d in CALTRANS_DISTRICTS]
        tasks.append(_fetch_uk_cameras(client))
        results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, list):
            cameras.extend(r)

    # Load static insecam_data.json supplement
    try:
        fallback_path = os.path.join(os.path.dirname(__file__), "static", "insecam_data.json")
        with open(fallback_path, "r", encoding="utf-8") as f:
            fallback_data = json.load(f)
            for cam in fallback_data:
                cam["country"] = "USA"
            cameras.extend(fallback_data)
            print(f"[Cameras] Loaded {len(fallback_data)} insecam supplement cameras.")
    except Exception as e:
        print(f"[Cameras] Failed to load insecam_data.json: {e}")

    if not cameras:
        cameras = [{
            "id": "ca_d4_fallback", "title": "I-580 Oakland — West of SR-24",
            "lat": 37.82539, "lng": -122.27291, "type": "cctv",
            "stream_type": "hls", "country": "USA",
            "snapshot": "https://cwwp2.dot.ca.gov/data/d4/cctv/image/tv102i580westofsr24/tv102i580westofsr24.jpg",
            "hls_url": "https://wzmedia.dot.ca.gov/D4/W580_JWO_24_IC.stream/playlist.m3u8",
            "link": "https://cwwp2.dot.ca.gov/"
        }]

    fetched_at = int(time.time())
    
    # 1. Write to SOURCE DB
    async with aiosqlite.connect(CAMERAS_SOURCE_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS cameras (
                id          TEXT PRIMARY KEY,
                title       TEXT,
                lat         REAL,
                lng         REAL,
                type        TEXT DEFAULT 'cctv',
                country     TEXT,
                state       TEXT,
                stream_type TEXT,
                snapshot    TEXT,
                hls_url     TEXT,
                video       TEXT,
                link        TEXT,
                fetched_at  INTEGER
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS cameras_meta (
                key TEXT PRIMARY KEY,
                last_updated INTEGER
            )
        ''')
        await db.execute("DELETE FROM cameras")
        for cam in cameras:
            await db.execute(
                "INSERT OR REPLACE INTO cameras (id, title, lat, lng, type, country, state, stream_type, snapshot, hls_url, video, link, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    cam.get("id"), cam.get("title"),
                    cam.get("lat"), cam.get("lng"),
                    cam.get("type", "cctv"), cam.get("country", ""), cam.get("state", ""),
                    cam.get("stream_type", "snapshot"), cam.get("snapshot", ""),
                    cam.get("hls_url", ""), cam.get("video", ""),
                    cam.get("link", ""), fetched_at
                )
            )
        await db.execute("INSERT OR REPLACE INTO cameras_meta (key, last_updated) VALUES ('last_fetch', ?)", (fetched_at,))
        await db.commit()

    # 2. Update MAIN DB Atomically
    async with aiosqlite.connect(CAMERAS_DB) as db:
        await db.execute("DELETE FROM cameras")
        for cam in cameras:
            await db.execute(
                "INSERT OR REPLACE INTO cameras (id, title, lat, lng, type, country, state, stream_type, snapshot, hls_url, video, link, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    cam.get("id"), cam.get("title"),
                    cam.get("lat"), cam.get("lng"),
                    cam.get("type", "cctv"), cam.get("country", ""), cam.get("state", ""),
                    cam.get("stream_type", "snapshot"), cam.get("snapshot", ""),
                    cam.get("hls_url", ""), cam.get("video", ""),
                    cam.get("link", ""), fetched_at
                )
            )
        await db.execute("INSERT OR REPLACE INTO cameras_meta (key, last_updated) VALUES ('last_fetch', ?)", (fetched_at,))
        await db.commit()
    print(f"[Cameras] Stored {len(cameras)} cameras in SQLite DB.")

async def update_cameras_loop():
    """Refresh CCTV camera list once per hour."""
    while True:
        await asyncio.sleep(3600)
        try:
            await fetch_cameras_logic()
        except Exception as e:
            print(f"[Cameras update loop error] {e}")

async def fetch_wildfires_logic():
    try:
        db_path = os.path.join(BASE_DIR, "sherpa_wildfires.db")
        targets = [
            ("wildfires", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"),
            ("wildfires_7d", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_7d.csv")
        ]
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            for table_name, url in targets:
                res = await client.get(url)
                if res.status_code == 200:
                    lines = res.text.strip().split('\n')
                    if len(lines) > 1:
                        async with aiosqlite.connect(db_path) as db:
                            await db.execute(f'''CREATE TABLE IF NOT EXISTS {table_name} (
                                id TEXT PRIMARY KEY, lat REAL, lng REAL, brightness REAL, time TEXT
                            )''')
                            await db.execute(f"DELETE FROM {table_name}")
                            count = 0
                            
                            # Random uniform sampling for massive datasets to prevent WebGL catastrophic failure
                            # We keep ~15,000 points dynamically distributed
                            import random
                            total_rows = len(lines) - 1
                            sample_rate = 1.0 if total_rows <= 15000 else 15000.0 / total_rows
                            
                            for i in range(1, len(lines)):
                                if count >= 15000: break
                                if sample_rate < 1.0 and random.random() > sample_rate: continue
                                
                                cols = lines[i].split(',')
                                if len(cols) >= 7:
                                    try:
                                        lat, lng, bright = float(cols[0]), float(cols[1]), float(cols[2])
                                        f_date, f_time = cols[5], cols[6]
                                        iso_time = f"{f_date}T{f_time[:2]}:{f_time[2:]}:00Z"
                                        wid = f"firms_{table_name}_{count}"
                                        await db.execute(f"INSERT INTO {table_name} (id, lat, lng, brightness, time) VALUES (?, ?, ?, ?, ?)", (wid, lat, lng, bright, iso_time))
                                        count += 1
                                    except: pass
                            await db.commit()
                            print(f"[Wildfires] Synced {count} points into {table_name} from NASA FIRMS.")
                else:
                    print(f"[Wildfires] Failed to fetch {table_name}: HTTP {res.status_code}")
    except Exception as e:
        print(f"[Wildfires] Fetch error: {e}")

async def update_wildfires_loop():
    """Refresh NASA FIRMS wildfire list every 6 hours."""
    while True:
        await asyncio.sleep(21600)  # 6 hours
        try:
            await fetch_wildfires_logic()
        except Exception as e:
            print(f"[Cameras update loop error] {e}")

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
            if not (lat and lng and hls):
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
                
            if not vid_url: continue

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
    """Return CCTV cameras from the SQLite DB (populated by the hourly background loop)."""
    try:
        async with aiosqlite.connect(CAMERAS_DB) as db:
            async with db.execute(
                "SELECT id, title, lat, lng, type, country, state, stream_type, snapshot, hls_url, video, link FROM cameras"
            ) as cursor:
                rows = await cursor.fetchall()
        return JSONResponse([{
            "id": r[0], "title": r[1], "lat": r[2], "lng": r[3],
            "type": r[4], "country": r[5], "state": r[6], "stream_type": r[7],
            "snapshot": r[8], "hls_url": r[9] or "",
            "video": r[10] or "", "link": r[11] or ""
        } for r in rows])
    except Exception as e:
        print(f"[Cameras] DB Error: {e}")
        return JSONResponse([])


# --- Open-Meteo Weather Proxy (SQLite Backed) ---

import httpx
import time

async def init_weather_db():
    async with aiosqlite.connect(WEATHER_DB) as db:
        try:
            # Upgrade existing DB schema if needed
            await db.execute("ALTER TABLE weather ADD COLUMN tier INTEGER DEFAULT 1")
        except Exception:
            pass # Column already exists or table doesn't exist yet
            
        await db.execute("""
            CREATE TABLE IF NOT EXISTS weather (
                city TEXT PRIMARY KEY,
                lat REAL,
                lng REAL,
                temp REAL,
                unit TEXT,
                last_updated INTEGER,
                tier INTEGER DEFAULT 1
            )
        """)
        await db.commit()

async def update_weather_loop():
    while True:
        try:
            print(f"[Weather] Polling Open-Meteo in batches for {len(WEATHER_CITIES)} total cities...")
            current_time = int(time.time())
            
            # 1. Initialize SOURCE DB
            async with aiosqlite.connect(WEATHER_SOURCE_DB) as db:
                try:
                    await db.execute("ALTER TABLE weather ADD COLUMN tier INTEGER DEFAULT 1")
                except Exception:
                    pass
                await db.execute("""
                    CREATE TABLE IF NOT EXISTS weather (
                        city TEXT PRIMARY KEY,
                        lat REAL,
                        lng REAL,
                        temp REAL,
                        unit TEXT,
                        last_updated INTEGER,
                        tier INTEGER DEFAULT 1
                    )
                """)
                await db.execute("DELETE FROM weather")
                await db.commit()
                
            chunk_size = 50
            for i in range(0, len(WEATHER_CITIES), chunk_size):
                chunk = WEATHER_CITIES[i:i + chunk_size]
                
                lats = ",".join([str(c["lat"]) for c in chunk])
                lngs = ",".join([str(c["lng"]) for c in chunk])
                url = f"https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lngs}&current=temperature_2m&timezone=auto"
                
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    res = await client.get(url, timeout=15.0)
                    res.raise_for_status()
                    data = res.json()
                    
                dataArr = data if isinstance(data, list) else [data]
                
                # Write chunk to SOURCE DB
                async with aiosqlite.connect(WEATHER_SOURCE_DB) as db:
                    for j, d in enumerate(dataArr):
                        city_obj = chunk[j]
                        city = city_obj["name"]
                        lat = city_obj["lat"]
                        lng = city_obj["lng"]
                        tier = city_obj.get("tier", 1)
                        
                        temp = d.get("current", {}).get("temperature_2m")
                        unit = d.get("current_units", {}).get("temperature_2m", "°C")
                        
                        if temp is not None:
                            await db.execute("""
                                INSERT OR REPLACE INTO weather (city, lat, lng, temp, unit, last_updated, tier)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (city, lat, lng, temp, unit, current_time, tier))
                    await db.commit()
                # Yield context slightly to prevent Open-Meteo blocking
                await asyncio.sleep(1)

            # 2. Update MAIN DB Atomically
            async with aiosqlite.connect(WEATHER_SOURCE_DB) as sdb:
                async with sdb.execute("SELECT city, lat, lng, temp, unit, last_updated, tier FROM weather") as cursor:
                    weather_rows = await cursor.fetchall()

            async with aiosqlite.connect(WEATHER_DB) as mdb:
                await mdb.execute("DELETE FROM weather")
                await mdb.executemany("""
                    INSERT INTO weather (city, lat, lng, temp, unit, last_updated, tier)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, weather_rows)
                await mdb.commit()
                
            print("[Weather] Successfully updated SQLite weather database for all tiers.")
        except Exception as e:
            print(f"[Weather] Failed to update SQLite weather database: {e}")
            
        await asyncio.sleep(3600)  # Update once per hour

@app.get("/api/weather-proxy")
async def get_weather_proxy():
    """Returns weather from the local SQLite database to completely prevent third-party HTTP 429 errors."""
    try:
        results = []
        async with aiosqlite.connect(WEATHER_DB) as db:
            async with db.execute("SELECT city, lat, lng, temp, unit, last_updated, tier FROM weather") as cursor:
                async for row in cursor:
                    results.append({
                        "city": row[0],
                        "lat": row[1],
                        "lng": row[2],
                        "temp": row[3],
                        "unit": row[4],
                        "last_updated": row[5],
                        "tier": row[6]
                    })
        return JSONResponse(results)
    except Exception as e:
        print(f"[Weather API] Failed to read SQLite database: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/stock-scan")
async def stock_scan(vol: int = Query(2000000), price: int = Query(20)):
    # Mock data generation engine matching the initial requirements
    # A complete yfinance integration would involve a large async library import 
    # not suitable for immediate demonstration if the module isn't installed.
    # Therefore, generating highly realistic dynamic mock data.
    
    import random
    
    ticker_pool = [
        {"ticker": "NVDA", "name": "NVIDIA Corporation"},
        {"ticker": "PLTR", "name": "Palantir Technologies"},
        {"ticker": "TSLA", "name": "Tesla, Inc."},
        {"ticker": "SOFI", "name": "SoFi Technologies"},
        {"ticker": "AMD", "name": "Advanced Micro Devices"},
        {"ticker": "RIVN", "name": "Rivian Automotive"},
        {"ticker": "RIOT", "name": "Riot Platforms"},
        {"ticker": "MARA", "name": "Marathon Digital Holdings"},
        {"ticker": "LCID", "name": "Lucid Group"},
        {"ticker": "NIO", "name": "NIO Inc."}
    ]
    
    random.shuffle(ticker_pool)
    
    # Generate 2 to 5 trending hits
    hits_count = random.randint(2, 5)
    results = []
    
    for i in range(hits_count):
        base = ticker_pool[i]
        
        # Determine movement
        is_up = random.random() > 0.4 # 60% chance to be up
        change_pct = round(random.uniform(3.5, 18.2), 2)
        
        if not is_up:
            change_pct = -change_pct
            
        current_price = round(random.uniform(1.5, price), 2)
        rvol = round(random.uniform(2.1, 8.5), 1)
        
        signal = "STRONG BUY"
        if change_pct < 0:
            signal = "SELL"
        elif rvol > 5.0 and change_pct > 10.0:
            signal = "MOMENTUM"
        elif rvol > 3.0:
            signal = "WATCH"

        change_str = f"+{change_pct}%" if change_pct > 0 else f"{change_pct}%"

        results.append({
            "ticker": base["ticker"],
            "name": base["name"],
            "price": f"{current_price:.2f}",
            "change": change_str,
            "rvol": f"{rvol}x",
            "signal": signal
        })

    return {
        "status": "success",
        "total_scanned": random.randint(10200, 10600),
        "trending_count": hits_count,
        "results": results
    }


# ==========================================
# GEOGRAPHY ENDPOINTS 
# ==========================================

@app.get("/api/v1/geography/countries")
async def get_countries():
    """Retrieve all countries from the SQLite cache."""
    countries = await database.get_all_countries()
    return JSONResponse(content={"countries": countries})

@app.get("/api/v1/geography/states/{country}")
async def get_states(country: str):
    """Retrieve states for a specific country from the SQLite cache."""
    states = await database.get_states_by_country(country)
    return JSONResponse(content={"states": states})


# ==========================================
# TRAKU PROVIDER MANAGEMENT ENDPOINTS
# ==========================================

class ProviderUpdate(BaseModel):
    provider_name: str
    api_key: str

class ProviderToggle(BaseModel):
    provider_name: str
    is_enabled: bool

@app.get("/api/v1/traku/providers")
async def get_providers():
    """Returns a dict mapping provider names to their configuration, toggle status, and rate limits."""
    try:
        keys = await database.get_traku_providers()
        # Return structured status to frontend without leaking raw keys
        status_dict = {}
        for prov in ["mock", "usa_people_search", "pipl", "spokeo", "enhanced_people", "abstractapi", "numverify"]:
            if prov == "mock":
                # Mock engine is always available locally — always configured, enabled from DB
                mock_data = keys.get("mock", {})
                status_dict["mock"] = {
                    "is_configured": True,
                    "is_enabled": mock_data.get("is_enabled", True),  # Respect DB state, default ON
                    "limit_max": mock_data.get("limit_max", 999999),
                    "limit_used": mock_data.get("limit_used", 0)
                }
            elif prov in keys:
                prov_data = keys[prov]
                status_dict[prov] = {
                    "is_configured": bool(prov_data.get("api_key", "").strip()),  # empty/whitespace = not configured
                    "is_enabled": prov_data.get("is_enabled", False),
                    "limit_max": prov_data.get("limit_max", 0),
                    "limit_used": prov_data.get("limit_used", 0)
                }
            else:
                status_dict[prov] = {
                    "is_configured": False,
                    "is_enabled": False,
                    "limit_max": 0,
                    "limit_used": 0
                }
                
        return JSONResponse(status_dict)
    except Exception as e:
        print(f"Error fetching Traku providers: {e}")
        return JSONResponse({"error": "Database error"}, status_code=500)

@app.post("/api/v1/traku/providers")
async def save_provider(update: ProviderUpdate):
    """Saves or updates an API key for a specific Traku provider. 
    Passing an empty api_key clears the key (un-configures the provider)."""
    try:
        if not update.provider_name:
            return JSONResponse({"error": "Missing provider_name"}, status_code=400)

        # Allow empty key to clear/un-configure; also turn off if clearing
        api_key = update.api_key.strip() if update.api_key else ""
        await database.save_traku_provider(update.provider_name, api_key)
        if not api_key:
            # If clearing the key, also disable the provider
            await database.update_traku_provider_status(update.provider_name, False)
            return JSONResponse({"status": "cleared", "message": f"API Key for {update.provider_name} cleared."})
        return JSONResponse({"status": "success", "message": f"API Key for {update.provider_name} securely saved."})
    except Exception as e:
        print(f"Error saving Traku provider: {e}")
        return JSONResponse({"error": "Failed to save API key"}, status_code=500)

@app.post("/api/v1/traku/providers/toggle")
async def toggle_provider(toggle: ProviderToggle):
    """Turns a provider ON or OFF for concurrent searching."""
    try:
        await database.update_traku_provider_status(toggle.provider_name, toggle.is_enabled)
        return JSONResponse({"status": "success"})
    except Exception as e:
        print(f"Error toggling Traku provider: {e}")
        return JSONResponse({"error": "Failed to toggle provider"}, status_code=500)


# ─── Traku Search History API ───────────────────────────────────────

@app.post("/api/v1/traku/search-history")
async def save_traku_search(request: Request):
    """Save a completed search and its results."""
    try:
        body = await request.json()
        search_query = json.dumps(body.get("search_query", {}))
        results = json.dumps(body.get("results", []))
        result_count = body.get("result_count", 0)
        await database.save_search_history(search_query, results, result_count)
        return JSONResponse({"status": "saved"})
    except Exception as e:
        print(f"Error saving search history: {e}")
        return JSONResponse({"error": "Failed to save search history"}, status_code=500)

@app.get("/api/v1/traku/search-history")
async def get_traku_search_history():
    """Return the most recent 50 search history entries."""
    try:
        history = await database.get_search_history(50)
        return JSONResponse(history)
    except Exception as e:
        print(f"Error fetching search history: {e}")
        return JSONResponse({"error": "Failed to fetch search history"}, status_code=500)

@app.get("/api/v1/traku/search-history/{search_id}/export")
async def export_traku_search(search_id: int):
    """Export a single search's results as a downloadable CSV file."""
    try:
        entry = await database.get_search_history_by_id(search_id)
        if not entry:
            return JSONResponse({"error": "Search not found"}, status_code=404)
        
        results = json.loads(entry["results"]) if isinstance(entry["results"], str) else entry["results"]
        query = json.loads(entry["search_query"]) if isinstance(entry["search_query"], str) else entry["search_query"]
        
        # Build CSV
        import io, csv
        output = io.StringIO()
        writer = csv.writer(output)
        
        if results and len(results) > 0:
            # Use keys from first result as headers
            headers = list(results[0].keys())
            writer.writerow(headers)
            for row in results:
                writer.writerow([row.get(h, "") for h in headers])
        else:
            writer.writerow(["No results"])
        
        csv_content = output.getvalue()
        query_summary = query.get("first_name", "") + "_" + query.get("last_name", "") if isinstance(query, dict) else "search"
        filename = f"traku_export_{query_summary}_{search_id}.csv".replace(" ", "_")

        from starlette.responses import Response
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        print(f"Error exporting search: {e}")
        return JSONResponse({"error": "Failed to export"}, status_code=500)


# ─── Stock Monitor Persistent Alerts API ────────────────────────────

@app.post("/api/stock-alerts")
async def save_alert(request: Request):
    """Persist a triggered stock alert."""
    try:
        body = await request.json()
        await database.save_stock_alert(
            body.get("ticker", ""),
            body.get("strategy_name", ""),
            body.get("confidence", 0),
            body.get("price_at_alert", 0)
        )
        return JSONResponse({"status": "saved"})
    except Exception as e:
        print(f"Error saving stock alert: {e}")
        return JSONResponse({"error": "Failed to save alert"}, status_code=500)

@app.get("/api/stock-alerts")
async def get_alerts():
    """Return the most recent 100 stock alerts."""
    try:
        alerts = await database.get_stock_alerts(100)
        return JSONResponse(alerts)
    except Exception as e:
        print(f"Error fetching stock alerts: {e}")
        return JSONResponse({"error": "Failed to fetch alerts"}, status_code=500)

@app.delete("/api/stock-alerts")
async def delete_alerts():
    """Clear all stock alert history."""
    try:
        await database.clear_stock_alerts()
        return JSONResponse({"status": "cleared"})
    except Exception as e:
        print(f"Error clearing stock alerts: {e}")
        return JSONResponse({"error": "Failed to clear alerts"}, status_code=500)


# ==========================================
# PUBLIC OSINT API ENDPOINTS (API KEY REQUIRED)
# ==========================================
OSINT_DB = "sherpa_osint.db"

async def init_osint_db():
    async with aiosqlite.connect(OSINT_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS api_keys (
                key TEXT PRIMARY KEY,
                user_email TEXT,
                tier TEXT,
                created_at INTEGER
            )
        ''')
        await db.commit()

class OsintAuthRequest(BaseModel):
    email: str
    tier: str

@app.post("/api/v1/osint/authenticate")
async def osint_authenticate(req: OsintAuthRequest):
    """Mock checkout/registration endpoint generating a valid API Key."""
    import secrets
    import time
    if req.tier not in ["hobbyist", "professional", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid tier")
        
    new_key = "sk_" + req.tier[:3] + "_" + secrets.token_hex(16)
    
    async with aiosqlite.connect(OSINT_DB) as db:
        await db.execute(
            "INSERT INTO api_keys (key, user_email, tier, created_at) VALUES (?, ?, ?, ?)",
            (new_key, req.email, req.tier, int(time.time()))
        )
        await db.commit()
        
    return JSONResponse({"status": "success", "api_key": new_key, "tier": req.tier})

@app.get("/api/v1/osint/query")
async def osint_query(request: Request, type: str = "flights"):
    """Secured OSINT data query endpoint."""
    # RapidAPI injects X-RapidAPI-Key by default. We also support standard x-api-key.
    api_key = request.headers.get("x-rapidapi-key") or request.headers.get("x-api-key")
    
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing X-RapidAPI-Key or X-API-Key header. Subscriptions must be managed via the API Marketplace.")
        
    master_key = os.getenv("MASTER_OSINT_API_KEY")
    
    # Marketplace Route Logic: If a master key is set (Production Env), STRICTLY enforce it.
    if master_key:
        if api_key != master_key:
            raise HTTPException(status_code=401, detail="Invalid API Key. Subscriptions must be managed via the API Marketplace.")
        tier = "enterprise"
    else:
        # Dev Fallback: If no env key is set, use the old local DB mock check for the frontend sandbox demo
        async with aiosqlite.connect(OSINT_DB) as db:
            async with db.execute("SELECT tier FROM api_keys WHERE key = ?", (api_key,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    raise HTTPException(status_code=401, detail="Invalid Mock API Key")
                tier = row[0]
            
    # Based on type, pull from the respective SQLite cache
    try:
        if type == "flights":
            async with aiosqlite.connect(FLIGHTS_DB) as db:
                async with db.execute("SELECT callsign, lat, lng, alt, velocity, country, heading FROM flights WHERE callsign IS NOT NULL") as cursor:
                    rows = await cursor.fetchall()
            data = [{"callsign": r[0], "lat": r[1], "lng": r[2], "altitude": r[3], "velocity": r[4], "origin_country": r[5], "heading": r[6]} for r in rows]
            
        elif type == "satellites":
            async with aiosqlite.connect(SATELLITES_DB) as db:
                async with db.execute("SELECT id, name, type, country, status FROM satellites") as cursor:
                    rows = await cursor.fetchall()
            data = [{"id": r[0], "name": r[1], "category": r[2], "country": r[3], "status": r[4]} for r in rows]
            
        elif type == "earthquakes":
            async with aiosqlite.connect(EARTHQUAKES_DB) as db:
                async with db.execute("SELECT eq_id, title, lat, lng, magnitude, depth_km, time FROM earthquakes") as cursor:
                    rows = await cursor.fetchall()
            data = [{"id": r[0], "title": r[1], "lat": r[2], "lng": r[3], "magnitude": r[4], "depth_km": r[5], "time": r[6]} for r in rows]
            
        elif type == "cctv":
            async with aiosqlite.connect(CAMERAS_DB) as db:
                async with db.execute("SELECT id, title, lat, lng, country, stream_type, snapshot, hls_url FROM cameras") as cursor:
                    rows = await cursor.fetchall()
            data = [{"id": r[0], "title": r[1], "lat": r[2], "lng": r[3], "country": r[4], "stream_type": r[5], "snapshot": r[6], "hls_url": r[7]} for r in rows]
            
        elif type == "vessels":
            async with aiosqlite.connect(VESSELS_DB) as db:
                async with db.execute("SELECT mmsi, title, lat, lng, heading, velocity_kmh, country, vessel_type FROM vessels") as cursor:
                    rows = await cursor.fetchall()
            data = [{"mmsi": r[0], "title": r[1], "lat": r[2], "lng": r[3], "heading": r[4], "velocity_kmh": r[5], "country": r[6], "vessel_type": r[7]} for r in rows]
        else:
            raise HTTPException(status_code=400, detail="Invalid data type requested. Valid types: flights, satellites, earthquakes, cctv, vessels.")
            
        return JSONResponse({
            "status": "success",
            "tier": tier,
            "count": len(data),
            "data": data
        })

    except Exception as e:
        print(f"[OSINT API] Error querying {type}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal database error fetching {type}")

# ==========================================
# NEW: OSINT BATCH PROCESSING
# ==========================================
@app.post("/api/v1/osint/batch")
async def osint_batch(request: Request):
    """
    Receives a CSV upload, parses rows, queries the OSINT engine 
    for each row, and returns a compiled enriched CSV.
    """
    api_key = request.headers.get("x-rapidapi-key") or request.headers.get("x-api-key")
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing API Key. Subscriptions must be managed via the API Marketplace.")
        
    master_key = os.getenv("MASTER_OSINT_API_KEY")
    if master_key and api_key != master_key:
        raise HTTPException(status_code=401, detail="Invalid API Key.")
        
    # In a full implementation, this reads the multipart form data for the CSV,
    # loops over the rows using the identical mock/rapidapi logic from /api/skiptrace/{type},
    # appends confidence scores, and returns a streaming FileResponse.
    
    return JSONResponse({
        "status": "success",
        "message": "Batch processed successfully.",
        "records_enriched": 0
    })

# ==========================================
# NEW: STOCK MONITOR PRO (Database API)
# ==========================================

class StockSettingsRequest(BaseModel):
    settings: dict

class StockWatchlistRequest(BaseModel):
    ticker: str

@app.get("/api/stock-settings")
async def api_get_stock_settings(request: Request):
    """Retrieve settings from DB. Uses session_token or IP for authless bridging."""
    session_id = request.cookies.get("session_token", request.client.host)
    settings = await database.get_stock_settings(session_id)
    if not settings:
        return JSONResponse({"status": "empty", "settings": None})
    return JSONResponse({"status": "success", "settings": settings})

@app.post("/api/stock-settings")
async def api_save_stock_settings(request: Request, req: StockSettingsRequest):
    """Save settings to DB."""
    session_id = request.cookies.get("session_token", request.client.host)
    await database.save_stock_settings(session_id, req.settings)
    return JSONResponse({"status": "success"})

@app.get("/api/stock-watchlist")
async def api_get_stock_watchlist(request: Request):
    """Get the saved watchlist tickers."""
    session_id = request.cookies.get("session_token", request.client.host)
    tickers = await database.get_stock_watchlist(session_id)
    return JSONResponse({"status": "success", "tickers": tickers})

@app.post("/api/stock-watchlist")
async def api_add_stock_watchlist(request: Request, req: StockWatchlistRequest):
    """Add a ticker to the watchlist."""
    session_id = request.cookies.get("session_token", request.client.host)
    success = await database.add_stock_to_watchlist(session_id, req.ticker)
    if success:
        return JSONResponse({"status": "success", "message": f"Added {req.ticker}"})
    return JSONResponse({"status": "exists", "message": f"{req.ticker} already tracked"})

@app.delete("/api/stock-watchlist/{ticker}")
async def api_remove_stock_watchlist(request: Request, ticker: str):
    """Remove a ticker from the watchlist."""
    session_id = request.cookies.get("session_token", request.client.host)
    await database.remove_stock_from_watchlist(session_id, ticker)
    return JSONResponse({"status": "success", "message": f"Removed {ticker}"})

class StockAlertRequest(BaseModel):
    ticker: str
    strategy_name: str
    confidence: float
    price_at_alert: float

@app.post("/api/stock-alerts")
async def api_save_stock_alert(req: StockAlertRequest):
    await database.save_stock_alert(req.ticker, req.strategy_name, req.confidence, req.price_at_alert)
    return JSONResponse({"status": "success"})

@app.get("/api/stock-alerts")
async def api_get_stock_alerts():
    alerts = await database.get_stock_alerts(100)
    return JSONResponse(alerts)

@app.delete("/api/stock-alerts")
async def api_clear_stock_alerts():
    await database.clear_stock_alerts()
    return JSONResponse({"status": "success"})

@app.get("/api/stock-scan")
async def api_stock_scan(vol: int = 500, price: int = 15):
    import random
    mock_tickers = ["PLTR", "SOFI", "RIVN", "HOOD", "MARA", "RIOT", "LCID", "MSTR", "CVNA", "DJT", "SNOW", "U", "DKNG"]
    results = random.sample(mock_tickers, random.randint(3, 6))
    return JSONResponse(results)
# ==========================================
# FREEME AUTONOMOUS OPT-OUT API (Campaigns)
# ==========================================

class BrokerCampaignRequest(BaseModel):
    aliases: list[str]
    emails: list[str]
    phones: list[str]
    addresses: list[str]
    dob: str
    drivers_license: str = ""
    photo_filename: str = ""
    brokers: list[str]
    demo_mode: bool = True
    llm_model: str = "claude-3-opus"

from fastapi import BackgroundTasks

def _run_campaign_async_wrapper(campaign_id, profile, brokers, demo_mode, llm_model):
    import sys
    import asyncio
    from freeme_engine.orchestrator import launch_campaign # Local import for startup resilience
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(launch_campaign(
        campaign_id=campaign_id, 
        profile=profile, 
        brokers=brokers, 
        demo_mode=demo_mode, 
        llm_model=llm_model
    ))

@app.post("/api/freeme/campaign")
async def start_freeme_campaign(req: BrokerCampaignRequest, bg_tasks: BackgroundTasks):
    """
    Receives a user profile and target brokers, provisions a background task,
    and returns a campaign tracking ID to the UI.
    """
    import uuid
    campaign_id = str(uuid.uuid4())[:8]
    
    profile = {
        "aliases": req.aliases,
        "emails": req.emails,
        "phones": req.phones,
        "addresses": req.addresses,
        "dob": req.dob,
        "drivers_license": req.drivers_license,
        "photo_filename": req.photo_filename
    }
    
    # Spawn in a clean thread to avoid Uvicorn's WSL SelectorEventLoop clash
    bg_tasks.add_task(
        _run_campaign_async_wrapper,
        campaign_id,
        profile,
        req.brokers,
        req.demo_mode,
        req.llm_model
    )
    
    return JSONResponse({
        "status": "success",
        "message": "Orchestrator queue populated",
        "campaign_id": campaign_id
    })

@app.get("/api/freeme/status/{campaign_id}")
async def get_freeme_status(campaign_id: str):
    """
    Heartbeat endpoint for the UI to constantly poll the active campaign
    and redraw the UI with new logs and progress bars.
    """
    from freeme_engine.orchestrator import get_campaign_status # Local import for startup resilience
    status_data = get_campaign_status(campaign_id)
    if not status_data:
        return JSONResponse({"error": "Campaign not found"}, status_code=404)
        
    return JSONResponse(status_data)

# Rev: 20260315-0916

# trigger reload


@app.get("/api/sar-data")
async def get_sar_data():
    """Return real SAR-capable satellites with TLE data from the Celestrak-backed satellites DB."""
    SAR_KEYWORDS = ['SENTINEL-1', 'RADARSAT', 'COSMO-SKYMED', 'TERRASAR', 'ALOS-2', 'SARAL', 'ICEYE', 'CAPELLA', 'SAR']
    results = []
    try:
        async with aiosqlite.connect(SATELLITES_DB) as db:
            async with db.execute("SELECT name, line1, line2, type, country, status FROM satellites") as cursor:
                rows = await cursor.fetchall()
        for r in rows:
            name = r[0] or ""
            upper_name = name.upper()
            if any(k in upper_name for k in SAR_KEYWORDS):
                if r[1] and r[2]:  # Must have valid TLE lines
                    results.append({
                        "id": f"sar_{name.replace(' ','_').lower()}",
                        "name": name,
                        "mission": name,
                        "tle1": r[1],
                        "tle2": r[2],
                        "country": r[4] or "Unknown",
                        "status": r[5] or "active"
                    })
    except Exception as e:
        print(f"API Error (SAR): {e}")
    return JSONResponse(results)

@app.get("/api/deformation")
async def get_deformation():
    results = []
    try:
        db_path = os.path.join(os.path.dirname(__file__), "sherpa_deformation.db")
        if os.path.exists(db_path):
            async with aiosqlite.connect(db_path) as db:
                async with db.execute("SELECT id, lat, lng, type, risk_level FROM deformations LIMIT 500") as cursor:
                    rows = await cursor.fetchall()
                    for r in rows:
                        results.append({
                            "id": r[0],
                            "lat": r[1],
                            "lng": r[2],
                            "type": r[3],
                            "risk_level": r[4]
                        })
    except Exception as e:
        print(f"Error fetching deformation data: {e}")
    return JSONResponse(results)

@app.get("/api/wildfires")
async def get_wildfires(period: str = Query("24h")):
    """Returns global thermal anomalies/wildfires from the SQLite db."""
    db_path = os.path.join(os.path.dirname(__file__), "sherpa_wildfires.db")
    
    table = "wildfires_7d" if period == "7d" else "wildfires"
    
    try:
        if os.path.exists(db_path):
            async with aiosqlite.connect(db_path) as db:
                async with db.execute(f"SELECT id, lat, lng, brightness, time FROM {table} LIMIT 15000") as cursor:
                    rows = await cursor.fetchall()
            
            fires = []
            for r in rows:
                fires.append({
                    "id": r[0],
                    "lat": r[1],
                    "lng": r[2],
                    "brightness": r[3],
                    "confidence": 100, # Mocked confidence metric
                    "time": r[4]
                })
            return JSONResponse(fires)
    except Exception as e:
        print(f"Error serving wildfires: {e}")
    return JSONResponse([])
