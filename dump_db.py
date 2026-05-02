import sqlite3

conn = sqlite3.connect('sherpa_cms.db')
c = conn.cursor()
c.execute("SELECT element_id, html_content FROM content WHERE element_id LIKE 'auto-dcsa-dashboard-%'")
rows = c.fetchall()
for row in rows:
    print(f"{row[0]}: {row[1]}")
conn.close()
