import sqlite3
import json

conn = sqlite3.connect('sherpa_cms.db')
c = conn.cursor()
c.execute("SELECT element_id, html_content FROM content WHERE element_id LIKE '%index-h1-13%' OR element_id LIKE '%index-span-14%'")
for row in c.fetchall():
    print(f"{row[0]}: {row[1]}")
