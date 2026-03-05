import aiosqlite
import bcrypt

DB_NAME = "sherpa_cms.db"

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

async def update_content(element_id, html_content):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute('''
        INSERT INTO content (element_id, html_content) 
        VALUES (?, ?) 
        ON CONFLICT(element_id) DO UPDATE SET html_content=excluded.html_content
        ''', (element_id, html_content))
        await db.commit()
