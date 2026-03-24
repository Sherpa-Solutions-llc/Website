"""
One-time script: clears the stale AbstractAPI key from sherpa_traku.db.
This ensures is_configured returns False and badge shows "Enter API Key".
"""
import sqlite3, os

db_path = os.path.join(os.path.dirname(__file__), "sherpa_traku.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Show current state
cur.execute("SELECT provider_name, api_key, is_enabled FROM traku_providers WHERE provider_name='abstractapi'")
row = cur.fetchone()
print(f"Before: provider={row[0]}, key='{row[1]}', enabled={row[2]}")

# Clear the key and turn off
cur.execute("UPDATE traku_providers SET api_key='', is_enabled=0 WHERE provider_name='abstractapi'")
conn.commit()

cur.execute("SELECT provider_name, api_key, is_enabled FROM traku_providers WHERE provider_name='abstractapi'")
row = cur.fetchone()
print(f"After:  provider={row[0]}, key='{row[1]}', enabled={row[2]}")

conn.close()
print("Done. Hard-refresh Traku to see 'Enter API Key' badge on AbstractAPI.")
