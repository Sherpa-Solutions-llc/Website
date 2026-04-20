import sqlite3

db = sqlite3.connect('sherpa_cameras.db')

# Check Michigan cameras
print("=== Michigan cameras ===")
rows = db.execute("SELECT id, title, snapshot, hls_url, link FROM cameras WHERE state='Michigan' LIMIT 5").fetchall()
for r in rows:
    print(f"  id={r[0]}, title={r[1]}")
    print(f"    snapshot={r[2]}")
    print(f"    hls_url={r[3]}")
    print(f"    link={r[4]}")

# Check a California camera (these should work)
print("\n=== California cameras (should work) ===")
rows = db.execute("SELECT id, title, snapshot, hls_url FROM cameras WHERE state='' AND id LIKE 'ca_%' LIMIT 3").fetchall()
for r in rows:
    print(f"  id={r[0]}, title={r[1]}")
    print(f"    snapshot={r[2]}")
    print(f"    hls_url={r[3]}")

# Count cameras with empty or placeholder snapshots
print("\n=== Stats ===")
total = db.execute("SELECT COUNT(*) FROM cameras").fetchone()[0]
empty_snap = db.execute("SELECT COUNT(*) FROM cameras WHERE snapshot IS NULL OR snapshot = ''").fetchall()[0][0]
has_snap = db.execute("SELECT COUNT(*) FROM cameras WHERE snapshot IS NOT NULL AND snapshot != ''").fetchall()[0][0]
print(f"Total cameras: {total}")
print(f"With snapshot URL: {has_snap}")
print(f"Without snapshot URL: {empty_snap}")

# Check what a non-CA/UK camera snapshot looks like
print("\n=== Sample snapshots from seed states ===")
for st in ['Texas', 'New York', 'Florida', 'Ohio']:
    rows = db.execute("SELECT title, snapshot FROM cameras WHERE state=? LIMIT 1", (st,)).fetchall()
    for r in rows:
        print(f"  {st}: {r[0]} -> {r[1][:120] if r[1] else 'NONE'}")

db.close()
