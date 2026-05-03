import aiosqlite
import json
import uuid
import datetime
import os

DB_PATH = "sherpa_agents.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        # Create sessions table
        await db.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title TEXT
            )
        ''')
        # Create messages table (for the UI chat history)
        await db.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                role TEXT,
                agent_name TEXT,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions (session_id)
            )
        ''')
        # Create agent memory table (for the internal LLM context window)
        await db.execute('''
            CREATE TABLE IF NOT EXISTS agent_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                agent_name TEXT,
                role TEXT,
                content TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions (session_id)
            )
        ''')
        await db.commit()

async def create_session(title="New Session") -> str:
    session_id = str(uuid.uuid4())
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('INSERT INTO sessions (session_id, title) VALUES (?, ?)', (session_id, title))
        await db.commit()
    return session_id

async def get_most_recent_session() -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT session_id FROM sessions ORDER BY created_at DESC LIMIT 1') as cursor:
            row = await cursor.fetchone()
            if row:
                return row['session_id']
            return None

async def save_message(session_id: str, role: str, content: str, agent_name: str = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'INSERT INTO messages (session_id, role, agent_name, content) VALUES (?, ?, ?, ?)',
            (session_id, role, agent_name, content)
        )
        await db.commit()

async def get_messages(session_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC', (session_id,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def save_agent_memory(session_id: str, agent_name: str, role: str, content: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            'INSERT INTO agent_memory (session_id, agent_name, role, content) VALUES (?, ?, ?, ?)',
            (session_id, agent_name, role, content)
        )
        await db.commit()

async def get_agent_memory(session_id: str, agent_name: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT * FROM agent_memory WHERE session_id = ? AND agent_name = ? ORDER BY timestamp ASC', (session_id, agent_name)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]
