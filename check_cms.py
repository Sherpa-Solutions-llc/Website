import sqlite3
db = sqlite3.connect('sherpa_cms.db')
# Delete all stale CMS overrides for live_earth page that are breaking the sidebar labels
c = db.cursor()
c.execute("DELETE FROM content WHERE element_id LIKE 'auto-live_earth-%'")
deleted = c.rowcount
db.commit()
print(f"Deleted {deleted} stale live_earth CMS overrides")
db.close()
