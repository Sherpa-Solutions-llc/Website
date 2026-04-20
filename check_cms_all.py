import sqlite3
db = sqlite3.connect('sherpa_cms.db')
rows = db.execute("SELECT id, element_id, html_content FROM content WHERE element_id LIKE 'auto-live_earth-%'").fetchall()
for r in rows:
    print(r)
db.close()
