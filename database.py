import aiosqlite
import bcrypt
import json
import sqlite3
import httpx

DB_NAME = "sherpa_cms.db"
STOCKS_DB = "sherpa_stocks.db"
TRAKU_DB = "sherpa_traku.db"

async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin BOOLEAN DEFAULT 0
        )
        ''')
        
        await db.execute('''
        CREATE TABLE IF NOT EXISTS content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            element_id TEXT UNIQUE NOT NULL,
            html_content TEXT NOT NULL
        )
        ''')
        await db.commit()
        
        # Seed the requested admin user
        await seed_admin("cricks", "Friday13!")

async def seed_admin(username, password):
    # Hash the password with bcrypt
    salt = bcrypt.gensalt()
    pwd_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    async with aiosqlite.connect(DB_NAME) as db:
        try:
            await db.execute('''
            INSERT INTO users (username, password_hash, is_admin)
            VALUES (?, ?, 1)
            ''', (username, pwd_hash))
            await db.commit()
            print(f"Seeded admin user: {username}")
        except aiosqlite.IntegrityError:
            # User already exists
            pass

async def verify_user(username, password):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT password_hash FROM users WHERE username = ?', (username,)) as cursor:
            row = await cursor.fetchone()
            if row:
                stored_hash = row[0].encode('utf-8')
                if bcrypt.checkpw(password.encode('utf-8'), stored_hash):
                    return True
            return False

async def get_all_users():
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT id, username, is_admin FROM users') as cursor:
            rows = await cursor.fetchall()
            return [{"id": r[0], "username": r[1], "is_admin": bool(r[2])} for r in rows]

async def add_admin_user(username, password):
    salt = bcrypt.gensalt()
    pwd_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    async with aiosqlite.connect(DB_NAME) as db:
        try:
            await db.execute('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)', (username, pwd_hash))
            await db.commit()
            return True
        except aiosqlite.IntegrityError:
            return False

async def remove_admin_user(user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('DELETE FROM users WHERE id = ?', (user_id,))
        await db.commit()

async def edit_admin_password(user_id, new_password):
    salt = bcrypt.gensalt()
    pwd_hash = bcrypt.hashpw(new_password.encode('utf-8'), salt).decode('utf-8')
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (pwd_hash, user_id))
        await db.commit()

async def revoke_admin_access(user_id):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE users SET is_admin = 0 WHERE id = ?', (user_id,))
        await db.commit()


async def get_all_content():
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT element_id, html_content FROM content') as cursor:
            rows = await cursor.fetchall()
            return {r[0]: r[1] for r in rows}

async def register_content_default(element_id, default_content):
    async with aiosqlite.connect(DB_NAME) as db:
        try:
            await db.execute('INSERT INTO content (element_id, html_content) VALUES (?, ?)', (element_id, default_content))
            await db.commit()
        except aiosqlite.IntegrityError:
            pass

async def update_content(element_id, new_content):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE content SET html_content = ? WHERE element_id = ?', (new_content, element_id))
        await db.commit()

# --- Stock Monitor Pro Database Functions ---

async def init_stock_db():
    async with aiosqlite.connect(STOCKS_DB) as db:
        # Settings Table: Holds volume, rvol, price, active_strategy (using session_id as primary key if no auth)
        await db.execute('''
        CREATE TABLE IF NOT EXISTS stock_settings (
            session_id TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL
        )
        ''')
        
        # Watchlist Table
        await db.execute('''
        CREATE TABLE IF NOT EXISTS stock_watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            ticker TEXT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, ticker)
        )
        ''')
        await db.commit()

async def get_stock_settings(session_id: str):
    async with aiosqlite.connect(STOCKS_DB) as db:
        async with db.execute('SELECT settings_json FROM stock_settings WHERE session_id = ?', (session_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
            return None

async def save_stock_settings(session_id: str, settings: dict):
    settings_str = json.dumps(settings)
    async with aiosqlite.connect(STOCKS_DB) as db:
        await db.execute('''
            INSERT INTO stock_settings (session_id, settings_json)
            VALUES (?, ?)
            ON CONFLICT(session_id) DO UPDATE SET settings_json=excluded.settings_json
        ''', (session_id, settings_str))
        await db.commit()

async def get_stock_watchlist(session_id: str):
    async with aiosqlite.connect(STOCKS_DB) as db:
        async with db.execute('SELECT ticker FROM stock_watchlist WHERE session_id = ? ORDER BY added_at DESC', (session_id,)) as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]

async def add_stock_to_watchlist(session_id: str, ticker: str):
    ticker = ticker.upper()
    async with aiosqlite.connect(STOCKS_DB) as db:
        try:
            await db.execute('INSERT INTO stock_watchlist (session_id, ticker) VALUES (?, ?)', (session_id, ticker))
            await db.commit()
            return True
        except aiosqlite.IntegrityError:
            return False # Already exists

async def remove_stock_from_watchlist(session_id: str, ticker: str):
    ticker = ticker.upper()
    async with aiosqlite.connect(STOCKS_DB) as db:
        await db.execute('DELETE FROM stock_watchlist WHERE session_id = ? AND ticker = ?', (session_id, ticker))
        await db.commit()

# --- Traku API Provider Database Functions ---

async def init_traku_db():
    async with aiosqlite.connect(TRAKU_DB) as db:
        # Provider Table: Stores the API keys for premium providers
        # We index by provider_name (e.g. 'pipl', 'spokeo')
        await db.execute('''
        CREATE TABLE IF NOT EXISTS traku_providers (
            provider_name TEXT PRIMARY KEY,
            api_key TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Schema migration: add is_enabled, limit_max, limit_used
        try:
            await db.execute('ALTER TABLE traku_providers ADD COLUMN is_enabled BOOLEAN DEFAULT 0')
        except sqlite3.OperationalError:
            pass # Column already exists
            
        try:
            await db.execute('ALTER TABLE traku_providers ADD COLUMN limit_max INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
            
        try:
            await db.execute('ALTER TABLE traku_providers ADD COLUMN limit_used INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
            
        # Seed Mock Data provider (ON by default on first install only)
        await db.execute('''
            INSERT OR IGNORE INTO traku_providers (provider_name, api_key, is_enabled, limit_max, limit_used)
            VALUES (?, ?, ?, ?, ?)
        ''', ('mock', 'mk_sk_sherpa_engine_local_8f9c2a1b', 1, 999999, 0))

        # Seed AbstractAPI for IP Tracing (10,000 free requests/month)
        await db.execute('''
            INSERT OR IGNORE INTO traku_providers (provider_name, api_key, is_enabled, limit_max, limit_used)
            VALUES (?, ?, ?, ?, ?)
        ''', ('abstractapi', '', 0, 10000, 0))

        # Force AbstractAPI off if no key is configured (fixes persistent state on Railway restarts)
        await db.execute('''
            UPDATE traku_providers
            SET is_enabled = 0
            WHERE provider_name = 'abstractapi' AND api_key = ''
        ''')

        # Seed Numverify for Phone Validation (100 free requests/month)
        await db.execute('''
            INSERT OR IGNORE INTO traku_providers (provider_name, api_key, is_enabled, limit_max, limit_used)
            VALUES (?, ?, ?, ?, ?)
        ''', ('numverify', '', 0, 100, 0))

        # Force Numverify off if no key is configured (fixes persistent state on Railway restarts)
        await db.execute('''
            UPDATE traku_providers
            SET is_enabled = 0
            WHERE provider_name = 'numverify' AND api_key = ''
        ''')
        
        # --- Geography / Default Dropdown Data ---
        await db.execute('''
        CREATE TABLE IF NOT EXISTS traku_geography (
            country TEXT NOT NULL,
            state TEXT NOT NULL,
            UNIQUE(country, state)
        )
        ''')
        await db.commit()

        # Check if geography data is already seeded
        async with db.execute('SELECT COUNT(*) FROM traku_geography') as cursor:
            count = (await cursor.fetchone())[0]
            if count == 0:
                print("Seeding geographic data from countriesnow.space API...")
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        response = await client.get("https://countriesnow.space/api/v0.1/countries/states")
                        if response.status_code == 200:
                            data = response.json()
                            if not data.get('error') and data.get('data'):
                                countries = data['data']
                                insert_data = []
                                for ci in countries:
                                    country = ci.get("name", "")
                                    states = ci.get("states", [])
                                    # If a country has no states, insert a single row with state = 'N/A'
                                    if not states:
                                        insert_data.append((country, "N/A"))
                                    else:
                                        for st in states:
                                            state_name = st.get("name", "")
                                            insert_data.append((country, state_name))
                                
                                await db.executemany('''
                                    INSERT OR IGNORE INTO traku_geography (country, state) 
                                    VALUES (?, ?)
                                ''', insert_data)
                                await db.commit()
                                print(f"Successfully seeded {len(insert_data)} geographic rows.")
                        else:
                            print(f"Warning: Failed to seed geography data: HTTP {response.status_code}")
                except Exception as e:
                    print(f"Warning: Database seeding for geography failed: {str(e)}")

async def get_all_countries():
    """Returns a list of all distinct countries in the DB, placing 'United States' at index 0."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        async with db.execute('SELECT DISTINCT country FROM traku_geography ORDER BY country ASC') as cursor:
            rows = await cursor.fetchall()
            countries = [r[0] for r in rows]
            
            # Move US to front
            if "United States" in countries:
                countries.remove("United States")
                countries.insert(0, "United States")
            return countries

async def get_states_by_country(country_name: str):
    """Returns a list of states for a specific country."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        async with db.execute('SELECT state FROM traku_geography WHERE country = ? ORDER BY state ASC', (country_name,)) as cursor:
            rows = await cursor.fetchall()
            return [r[0] for r in rows if r[0] != "N/A"]

async def get_traku_providers():
    """Returns a dict of all saved provider keys and their toggle status and rate limits"""
    async with aiosqlite.connect(TRAKU_DB) as db:
        async with db.execute('SELECT provider_name, api_key, is_enabled, limit_max, limit_used FROM traku_providers') as cursor:
            rows = await cursor.fetchall()
            return {
                row[0]: {
                    "api_key": row[1], 
                    "is_enabled": bool(row[2]), 
                    "limit_max": row[3] or 0, 
                    "limit_used": row[4] or 0
                } for row in rows
            }

async def save_traku_provider(provider_name: str, api_key: str):
    """Inserts or updates a provider's API key"""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            INSERT INTO traku_providers (provider_name, api_key, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(provider_name) DO UPDATE SET 
                api_key=excluded.api_key, 
                updated_at=CURRENT_TIMESTAMP
        ''', (provider_name, api_key))
        await db.commit()

async def update_traku_provider_status(provider_name: str, is_enabled: bool):
    """Updates the toggle status (is_enabled) for a provider"""
    async with aiosqlite.connect(TRAKU_DB) as db:
        # If the provider doesn't exist yet, we can't toggle it, but the UI shouldn't allow toggling until a key is saved anyway.
        await db.execute('''
            UPDATE traku_providers 
            SET is_enabled = ?
            WHERE provider_name = ?
        ''', (1 if is_enabled else 0, provider_name))
        await db.commit()

async def increment_traku_provider_usage(provider_name: str):
    """Safely increments the usage count for a given provider"""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            UPDATE traku_providers
            SET limit_used = limit_used + 1
            WHERE provider_name = ?
        ''', (provider_name,))
        await db.commit()


# ─── Traku Search History ───────────────────────────────────────────

async def init_traku_search_history():
    """Create the search history table if it doesn't exist."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS traku_search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                search_query TEXT NOT NULL,
                results TEXT NOT NULL,
                result_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        await db.commit()

async def save_search_history(search_query: str, results: str, result_count: int):
    """Persist a completed Traku search and its results (both stored as JSON strings)."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            INSERT INTO traku_search_history (search_query, results, result_count)
            VALUES (?, ?, ?)
        ''', (search_query, results, result_count))
        await db.commit()

async def get_search_history(limit: int = 50):
    """Return the most recent search history entries."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            'SELECT * FROM traku_search_history ORDER BY created_at DESC LIMIT ?', (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def get_search_history_by_id(search_id: int):
    """Return a single search history entry by ID."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            'SELECT * FROM traku_search_history WHERE id = ?', (search_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


# ─── Stock Monitor Persistent Alerts ────────────────────────────────

async def init_stock_alerts():
    """Create the stock alerts table if it doesn't exist."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS stock_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                strategy_name TEXT NOT NULL,
                confidence REAL DEFAULT 0,
                price_at_alert REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        await db.commit()

async def save_stock_alert(ticker: str, strategy_name: str, confidence: float, price_at_alert: float):
    """Persist a triggered stock alert from the analytics engine."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('''
            INSERT INTO stock_alerts (ticker, strategy_name, confidence, price_at_alert)
            VALUES (?, ?, ?, ?)
        ''', (ticker, strategy_name, confidence, price_at_alert))
        await db.commit()

async def get_stock_alerts(limit: int = 100):
    """Return the most recent stock alerts."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            'SELECT * FROM stock_alerts ORDER BY created_at DESC LIMIT ?', (limit,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def clear_stock_alerts():
    """Delete all stock alerts."""
    async with aiosqlite.connect(TRAKU_DB) as db:
        await db.execute('DELETE FROM stock_alerts')
        await db.commit()
