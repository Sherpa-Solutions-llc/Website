import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
cur.execute("SELECT element_id, html_content FROM content WHERE element_id LIKE '%counterintelligence%td%' LIMIT 15")
rows = cur.fetchall()
for r in rows:
    print(r[0], "=>", repr(r[1]))
conn.close()
