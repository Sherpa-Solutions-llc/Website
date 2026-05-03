import sqlite3
import os

db_path = "sherpa_cms.db"
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    try:
        for row in conn.execute("SELECT element_id, html_content FROM content WHERE element_id LIKE 'project-link-%'"):
            print(row)
    except Exception as e:
        print(e)
else:
    print("DB not found")
