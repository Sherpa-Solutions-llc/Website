import os
import secrets
import asyncio
import aiosqlite
import urllib.request
import urllib.parse
import urllib.error
import json
from datetime import datetime, timedelta
import traceback
from fastapi import FastAPI, Request, Form, Response, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import database

from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI()

WEATHER_DB = "weather.db"
POLICE_DB = "sherpa_police.db"
SCANNERS_DB = "sherpa_scanners.db"
VESSELS_DB = "sherpa_vessels.db"
EARTHQUAKES_DB = "sherpa_earthquakes.db"
CAMERAS_DB = "sherpa_cameras.db"
from weather_cities import WEATHER_CITIES

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

@app.get("/api/health")
async def health_check():
    """Railway healthcheck endpoint"""
    return {"status": "ok", "service": "sherpa-solutions-api"}

@app.on_event("startup")
async def startup_event():
    await database.init_db()
    await init_flights_db()
    await init_satellites_db()
    await init_weather_db()
    await init_police_db()
    await init_scanners_db()
    await init_vessels_db()
    await init_earthquakes_db()
    await init_cameras_db()

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

        except Exception as e:
            print(f"[Startup] Background prime failed: {e}")

    asyncio.create_task(prime_databases_background())
    asyncio.create_task(fetch_flights_loop())
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
        return FileResponse(html_path)
    return HTMLResponse(content="Page not found", status_code=404)


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
        return JSONResponse({"status": "error", "message": "Failed to login: " + str(e)})

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
                    print("[Flights] No metadata found in DB yet.")
                    return JSONResponse({"time": int(time.time()), "states": []})
                source_time = int(row[0])
            
            async with db.execute("SELECT icao24, callsign, country, time_position, last_contact, lng, lat, alt, on_ground, velocity, heading FROM flights WHERE on_ground = 0") as cursor:
                rows = await cursor.fetchall()
                states = []
                for r in rows:
                    states.append([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], bool(r[8]), r[9], r[10]])
                
                print(f"[Flights] Returning {len(states)} active flights from DB.")
                return JSONResponse({"time": source_time, "states": states})
    except Exception as e:
        print(f"[Flights] DB Error: {e}")
        return JSONResponse({"time": int(time.time()), "states": []})

SATELLITES_DB = os.path.join(BASE_DIR, "satellites_data.db")

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
    async with aiosqlite.connect(CAMERAS_DB) as db:
        await db.execute("DELETE FROM cameras")
        for cam in cameras:
            await db.execute(
                "INSERT OR REPLACE INTO cameras (id, title, lat, lng, type, country, stream_type, snapshot, hls_url, video, link, fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    cam.get("id"), cam.get("title"),
                    cam.get("lat"), cam.get("lng"),
                    cam.get("type", "cctv"), cam.get("country", ""),
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
    """Return CCTV cameras from the SQLite DB (populated by the hourly background loop)."""
    try:
        async with aiosqlite.connect(CAMERAS_DB) as db:
            async with db.execute(
                "SELECT id, title, lat, lng, type, country, stream_type, snapshot, hls_url, video, link FROM cameras"
            ) as cursor:
                rows = await cursor.fetchall()
        return JSONResponse([{
            "id": r[0], "title": r[1], "lat": r[2], "lng": r[3],
            "type": r[4], "country": r[5], "stream_type": r[6],
            "snapshot": r[7], "hls_url": r[8] or "",
            "video": r[9] or "", "link": r[10] or ""
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
                
                async with aiosqlite.connect(WEATHER_DB) as db:
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
