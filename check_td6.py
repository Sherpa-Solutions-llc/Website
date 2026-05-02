import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
cur.execute("SELECT html_content FROM content WHERE element_id='auto-dcsa_counterintelligence-td-6'")
row = cur.fetchone()
print("VALUE for td-6:", repr(row[0]) if row else "NOT FOUND")
cur.execute("SELECT html_content FROM content WHERE element_id='auto-dcsa_counterintelligence-td-7'")
row = cur.fetchone()
print("VALUE for td-7:", repr(row[0]) if row else "NOT FOUND")
conn.close()
