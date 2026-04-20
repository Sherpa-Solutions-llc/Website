import sqlite3
db = sqlite3.connect('sherpa_cms.db')
rows = db.execute("SELECT id, element_id, html_content FROM content WHERE html_content LIKE '%Aircraft%'").fetchall()
for r in rows:
    print(r)
db.close()
