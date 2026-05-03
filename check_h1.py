import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
cur.execute("SELECT html_content FROM content WHERE element_id='auto-dcsa-personnel-vetting-h1-1'")
row = cur.fetchone()
print("VALUE:", repr(row[0]) if row else "NOT FOUND")
conn.close()
