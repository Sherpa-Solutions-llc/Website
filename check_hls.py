import sqlite3

db = sqlite3.connect('sherpa_cameras.db')
rows = db.execute("SELECT id, hls_url FROM cameras WHERE hls_url IS NOT NULL AND hls_url != '' LIMIT 10").fetchall()
for r in rows:
    print(r)
db.close()
