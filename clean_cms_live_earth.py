import sqlite3
db = sqlite3.connect('sherpa_cms.db')
cursor = db.cursor()
cursor.execute("DELETE FROM content WHERE element_id LIKE 'auto-live_earth-%'")
deleted_count = cursor.rowcount
db.commit()
print(f"Deleted {deleted_count} stale live_earth CMS entries.")
db.close()
