import sqlite3
conn = sqlite3.connect('sherpa_cms.db')
cur = conn.cursor()
pages = ['dcsa_industrial_security', 'dcsa_personnel_vetting', 'dcsa_security_training']
total = 0
for page in pages:
    cur.execute(f"DELETE FROM content WHERE element_id LIKE 'auto-{page}-%'")
    total += cur.rowcount
conn.commit()
print(f"Deleted {total} garbage auto-generated tags for the other pages.")
conn.close()
