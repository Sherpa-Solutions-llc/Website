import aiosqlite
import os
import bcrypt
import json
import sqlite3
import httpx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "sherpa_cms.db")
STOCKS_DB = os.path.join(BASE_DIR, "sherpa_stocks.db")
TRAKU_DB = os.path.join(BASE_DIR, "sherpa_traku.db")

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
        
        await db.execute('''
        CREATE TABLE IF NOT EXISTS saas_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_premium BOOLEAN DEFAULT 0,
            stripe_customer_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

# --- SaaS Authentication Layer ---
async def create_saas_user(email, password):
    salt = bcrypt.gensalt()
    pwd_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    async with aiosqlite.connect(DB_NAME) as db:
        try:
            await db.execute('''
            INSERT INTO saas_users (email, password_hash)
            VALUES (?, ?)
            ''', (email, pwd_hash))
            await db.commit()
            
            async with db.execute('SELECT id, email, is_premium, stripe_customer_id FROM saas_users WHERE email = ?', (email,)) as cursor:
                row = await cursor.fetchone()
                return {"id": row[0], "email": row[1], "is_premium": bool(row[2]), "stripe_customer_id": row[3]}
        except aiosqlite.IntegrityError:
            return None # Email already exists

async def verify_saas_user(email, password):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute('SELECT id, email, password_hash, is_premium, stripe_customer_id FROM saas_users WHERE email = ?', (email,)) as cursor:
            row = await cursor.fetchone()
            if row:
                stored_hash = row[2].encode('utf-8')
                if bcrypt.checkpw(password.encode('utf-8'), stored_hash):
                    return {"id": row[0], "email": row[1], "is_premium": bool(row[3]), "stripe_customer_id": row[4]}
        return None

async def upgrade_saas_user_to_premium(email, stripe_customer_id):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('UPDATE saas_users SET is_premium = 1, stripe_customer_id = ? WHERE email = ?', (stripe_customer_id, email))
        await db.commit()

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

# ─── Consulting Leads ───────────────────────────────────────────────

async def init_consulting_leads():
    """Create the consulting leads table if it doesn't exist."""
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS consulting_leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                company TEXT,
                project_interest TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        await db.commit()

async def save_consulting_lead(name: str, email: str, company: str, project_interest: str):
    """Save a new consulting lead."""
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''
            INSERT INTO consulting_leads (name, email, company, project_interest)
            VALUES (?, ?, ?, ?)
        ''', (name, email, company, project_interest))
        await db.commit()

# ─── Open Vote Prototype ───────────────────────────────────────────
VOTERS_DB = os.path.join(BASE_DIR, "sherpa_voters.db")

async def init_open_vote_db():
    async with aiosqlite.connect(VOTERS_DB) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS open_vote_polls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                region TEXT NOT NULL,
                active BOOLEAN DEFAULT 1,
                year INTEGER DEFAULT 2024
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS open_vote_options (
                id TEXT NOT NULL,
                poll_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                votes INTEGER DEFAULT 0,
                color TEXT NOT NULL,
                electoral_votes INTEGER DEFAULT 0,
                FOREIGN KEY(poll_id) REFERENCES open_vote_polls(id)
            )
        ''')
        try:
            await db.execute('ALTER TABLE open_vote_options ADD COLUMN electoral_votes INTEGER DEFAULT 0')
        except sqlite3.OperationalError:
            pass
        await db.execute('''
            CREATE TABLE IF NOT EXISTS open_vote_state_tallies (
                poll_id INTEGER NOT NULL,
                option_id TEXT NOT NULL,
                state_code TEXT NOT NULL,
                votes INTEGER DEFAULT 0,
                PRIMARY KEY (poll_id, option_id, state_code),
                FOREIGN KEY(poll_id) REFERENCES open_vote_polls(id)
            )
        ''')
        await db.commit()
        
        # Check if empty, then seed
        async with db.execute('SELECT COUNT(*) FROM open_vote_polls') as cursor:
            count = (await cursor.fetchone())[0]
            if count == 0:
                print("Seeding Initial Open Vote Polls...")
                await seed_open_vote_polls()

async def seed_open_vote_polls():
    polls_seed = [
        {"id": 1, "year": 2024, "category": "Referendum", "title": "Global Legalization of Adult-Use Cannabis", "description": "Should cannabis be removed from international drug control treaties and legalized for adult recreational use globally?", "region": "Global", "active": True, "options": [{"id": "opt1", "label": "Approve (Full Legalization)", "votes": 89432, "color": "#3fb950"}, {"id": "opt2", "label": "Approve (Medical Only)", "votes": 34105, "color": "#58a6ff"}, {"id": "opt3", "label": "Reject (Maintain Prohibition)", "votes": 19056, "color": "#f85149"}]},
        {"id": 2, "year": 2024, "category": "Approval Rating", "title": "United Nations Secretariat Global Confidence", "description": "Do you have confidence in the current direction and effectiveness of the UN Secretariat?", "region": "Global", "active": False, "options": [{"id": "opt1", "label": "Favorable", "votes": 45210, "color": "#3fb950"}, {"id": "opt2", "label": "Neutral / Undecided", "votes": 62890, "color": "#8b949e"}, {"id": "opt3", "label": "Unfavorable", "votes": 115802, "color": "#f85149"}]},
        {"id": 3, "year": 2024, "category": "Political Initiative", "title": "Universal Basic Income (UBI) Mandate", "description": "Should a global taxation framework be established to fund a localized Universal Basic Income baseline?", "region": "Global", "active": True, "options": [{"id": "opt1", "label": "Strongly Support", "votes": 105423, "color": "#3fb950"}, {"id": "opt2", "label": "Support with Means Testing", "votes": 45612, "color": "#58a6ff"}, {"id": "opt3", "label": "Oppose", "votes": 98450, "color": "#f85149"}]},
        {"id": 4, "year": 2024, "category": "Presidential Election", "title": "2024 United States Presidential Election", "description": "Official results for the 2024 Presidential Election of the United States of America.", "region": "US", "active": False, "options": [{"id": "opt1", "label": "Republican Nominee (Trump)", "votes": 77302580, "color": "#f85149", "electoral_votes": 312}, {"id": "opt2", "label": "Democratic Nominee (Harris)", "votes": 75017613, "color": "#58a6ff", "electoral_votes": 226}]},
        {"id": 5, "year": 2024, "category": "National Senate", "title": "2024 US Senate - Pennsylvania", "description": "General election to represent Pennsylvania in the United States Senate.", "region": "US", "active": False, "options": [{"id": "opt1", "label": "Dave McCormick (R)", "votes": 3399295, "color": "#f85149"}, {"id": "opt2", "label": "Bob Casey Jr. (D)", "votes": 3384180, "color": "#58a6ff"}]},
        {"id": 6, "year": 2024, "category": "Congressional District", "title": "2024 US House - NY 14th District", "description": "General election for the 14th Congressional District of New York.", "region": "US", "active": False, "options": [{"id": "opt1", "label": "Alexandria Ocasio-Cortez (D)", "votes": 132714, "color": "#58a6ff"}, {"id": "opt2", "label": "Tina Forte (R)", "votes": 59078, "color": "#f85149"}]},
        {"id": 7, "year": 2024, "category": "General Election", "title": "UK General Election 2024", "description": "Vote for the next Prime Minister and governing party of the United Kingdom.", "region": "UK", "active": False, "options": [{"id": "opt1", "label": "Labour Party", "votes": 9731363, "color": "#e4003b"}, {"id": "opt2", "label": "Conservative Party", "votes": 6814469, "color": "#0087dc"}, {"id": "opt3", "label": "Reform UK", "votes": 4117610, "color": "#12b6cf"}, {"id": "opt4", "label": "Liberal Democrats", "votes": 3519143, "color": "#faa61a"}]},
        {"id": 8, "year": 2024, "category": "Legislative Election", "title": "French Legislative Election 2024 (Round 2)", "description": "Snap legislative election to determine the composition of the French National Assembly.", "region": "France", "active": False, "options": [{"id": "opt1", "label": "New Popular Front (NFP)", "votes": 7005500, "color": "#e4003b"}, {"id": "opt2", "label": "Ensemble (ENS)", "votes": 6314000, "color": "#faa61a"}, {"id": "opt3", "label": "National Rally (RN)", "votes": 8740000, "color": "#00008b"}]}
    ]
    US_STATE_WEIGHTS = {
        "California": 0.118, "Texas": 0.088, "Florida": 0.065, "New York": 0.059, "Pennsylvania": 0.039,
        "Illinois": 0.038, "Ohio": 0.035, "Georgia": 0.032, "North Carolina": 0.031, "Michigan": 0.030,
        "New Jersey": 0.028, "Virginia": 0.026, "Washington": 0.023, "Arizona": 0.022, "Massachusetts": 0.021,
        "Tennessee": 0.021, "Indiana": 0.020, "Maryland": 0.018, "Missouri": 0.018, "Wisconsin": 0.018,
        "Colorado": 0.017, "Minnesota": 0.017, "South Carolina": 0.015, "Alabama": 0.015, "Louisiana": 0.014,
        "Kentucky": 0.013, "Oregon": 0.013, "Oklahoma": 0.012, "Connecticut": 0.011, "Utah": 0.010,
        "Iowa": 0.010, "Nevada": 0.009, "Arkansas": 0.009, "Mississippi": 0.009, "Kansas": 0.009,
        "New Mexico": 0.006, "Nebraska": 0.006, "Idaho": 0.006, "West Virginia": 0.005, "Hawaii": 0.004,
        "New Hampshire": 0.004, "Maine": 0.004, "Rhode Island": 0.003, "Montana": 0.003, "Delaware": 0.003,
        "South Dakota": 0.003, "North Dakota": 0.002, "Alaska": 0.002, "District of Columbia": 0.002, 
        "Vermont": 0.002, "Wyoming": 0.002
    }
    
    async with aiosqlite.connect(VOTERS_DB) as db:
        for p in polls_seed:
            await db.execute('INSERT INTO open_vote_polls (id, category, title, description, region, active, year) VALUES (?, ?, ?, ?, ?, ?, ?)', (p["id"], p["category"], p["title"], p["description"], p["region"], 1 if p["active"] else 0, p["year"]))
            for opt in p["options"]:
                await db.execute('INSERT INTO open_vote_options (id, poll_id, label, votes, color, electoral_votes) VALUES (?, ?, ?, ?, ?, ?)', (opt["id"], p["id"], opt["label"], opt["votes"], opt["color"], opt.get("electoral_votes", 0)))
                
                if p["region"] == "Global" or p["region"] == "US":
                    for state, weight in US_STATE_WEIGHTS.items():
                        if p["id"] == 6:
                            state_votes = opt["votes"] if state == "New York" else 0
                            await db.execute('INSERT INTO open_vote_state_tallies (poll_id, option_id, state_code, votes) VALUES (?, ?, ?, ?)', (p["id"], opt["id"], state, state_votes))
                            continue
                            
                        bias = 1.0
                        hash_val = ord(state[0]) + ord(state[-1])
                        opt_label = opt["label"].lower()
                        if "harris" in opt_label or "democrat" in opt_label:
                            bias = 1.3 if hash_val % 2 == 0 else 0.7
                        elif "trump" in opt_label or "republican" in opt_label:
                            bias = 1.3 if hash_val % 2 != 0 else 0.7
                            
                        # Add a strong secondary deterministic factor based purely on the spelling of the state 
                        # so that some states heavily favor one party.
                        state_hash = sum(ord(c) for c in state)
                        if "democrat" in opt_label or "harris" in opt_label:
                            if state_hash % 3 == 0:
                                bias *= 1.8
                            elif state_hash % 3 == 1:
                                bias *= 0.4
                        elif "republican" in opt_label or "trump" in opt_label:
                            if state_hash % 3 == 1:
                                bias *= 1.8
                            elif state_hash % 3 == 0:
                                bias *= 0.4

                        variance = (0.8 + ((len(state) * len(opt["label"]) % 20) / 100)) * bias
                        state_votes = int(opt["votes"] * weight * variance)
                        await db.execute('INSERT INTO open_vote_state_tallies (poll_id, option_id, state_code, votes) VALUES (?, ?, ?, ?)', (p["id"], opt["id"], state, state_votes))
                        
        await db.commit()

async def get_all_open_vote_polls():
    async with aiosqlite.connect(VOTERS_DB) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM open_vote_polls') as cursor:
            polls = [dict(r) for r in await cursor.fetchall()]
        
        for p in polls:
            async with db.execute('SELECT * FROM open_vote_options WHERE poll_id = ?', (p["id"],)) as cursor:
                p["options"] = [dict(r) for r in await cursor.fetchall()]
                
                for opt in p["options"]:
                    async with db.execute('SELECT state_code, votes FROM open_vote_state_tallies WHERE poll_id = ? AND option_id = ?', (p["id"], opt["id"])) as state_cursor:
                        opt["state_tallies"] = [{"state": row["state_code"], "votes": row["votes"]} for row in await state_cursor.fetchall()]
                        
            p["active"] = bool(p["active"])
        return polls

async def get_open_vote_years():
    async with aiosqlite.connect(VOTERS_DB) as db:
        async with db.execute('SELECT DISTINCT year FROM open_vote_polls ORDER BY year DESC') as cursor:
            rows = await cursor.fetchall()
            return [r[0] for r in rows]

async def get_open_vote_polls_lazy(year: int, category_filter: str = None):
    async with aiosqlite.connect(VOTERS_DB) as db:
        db.row_factory = aiosqlite.Row
        
        query = "SELECT * FROM open_vote_polls WHERE year = ?"
        params = [year]
        if category_filter:
            if category_filter == "Federal":
                query += " AND (category LIKE '%President%' OR category LIKE '%Senate%' OR category LIKE '%House%' OR category LIKE '%Congressional District%')"
            elif category_filter == "State":
                query += " AND category LIKE '%Governor%'"
            elif category_filter == "Local":
                query += " AND category LIKE '%Mayor%'"
            elif category_filter == "Special":
                query += " AND category LIKE '%Special%'"
        
        async with db.execute(query, params) as cursor:
            polls = [dict(r) for r in await cursor.fetchall()]
            
        for p in polls:
            async with db.execute('SELECT * FROM open_vote_options WHERE poll_id = ?', (p["id"],)) as cursor:
                p["options"] = [dict(r) for r in await cursor.fetchall()]
                
                for opt in p["options"]:
                    async with db.execute('SELECT state_code, votes FROM open_vote_state_tallies WHERE poll_id = ? AND option_id = ?', (p["id"], opt["id"])) as state_cursor:
                        opt["state_tallies"] = [{"state": row["state_code"], "votes": row["votes"]} for row in await state_cursor.fetchall()]
                        
            p["active"] = bool(p["active"])
        return polls

async def create_open_vote_poll(category: str, title: str, description: str, region: str, active: bool, options: list, year: int = 2024):
    async with aiosqlite.connect(VOTERS_DB) as db:
        cursor = await db.execute('''
            INSERT INTO open_vote_polls (category, title, description, region, active, year)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (category, title, description, region, 1 if active else 0, year))
        poll_id = cursor.lastrowid
        
        for idx, opt in enumerate(options):
            await db.execute('''
                INSERT INTO open_vote_options (id, poll_id, label, votes, color, electoral_votes)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (opt.get("id", f"opt{idx+1}"), poll_id, opt["label"], opt.get("votes", 0), opt.get("color", "#58a6ff"), opt.get("electoral_votes", 0)))
        await db.commit()
        return poll_id

async def increment_open_vote_option(poll_id: int, option_id: str, state_code: str = ""):
    async with aiosqlite.connect(VOTERS_DB) as db:
        await db.execute('UPDATE open_vote_options SET votes = votes + 1 WHERE poll_id = ? AND id = ?', (poll_id, option_id))
        if state_code:
            await db.execute('UPDATE open_vote_state_tallies SET votes = votes + 1 WHERE poll_id = ? AND option_id = ? AND state_code = ?', (poll_id, option_id, state_code))
        await db.commit()
