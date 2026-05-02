import sqlite3
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM content WHERE element_id LIKE 'auto-dcsa_counterintelligence-%'")
print("Underscore tags (auto-generated):", cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM content WHERE element_id LIKE 'auto-dcsa-counterintelligence-%'")
print("Dash tags (hardcoded):", cur.fetchone()[0])
conn.close()
