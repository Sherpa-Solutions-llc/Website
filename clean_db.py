import sqlite3
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
cur.execute("DELETE FROM content WHERE element_id LIKE 'auto-dcsa_counterintelligence-%'")
conn.commit()
print("Deleted", cur.rowcount, "garbage auto-generated tags.")
conn.close()
