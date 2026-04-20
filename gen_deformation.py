import sqlite3
import random
import uuid

db = sqlite3.connect('sherpa_deformation.db')
db.execute('''CREATE TABLE IF NOT EXISTS deformation (
                id TEXT PRIMARY KEY,
                lat REAL,
                lng REAL,
                type TEXT,
                risk_level TEXT
            )''')
db.execute("DELETE FROM deformation")

# Generate ~150 random infrastructure points globally
bridge_types = ["Suspension Bridge", "Concrete Dam", "Overpass", "Viaduct", "Steel Truss Bridge"]
risks = ["MODERATE", "MODERATE", "MODERATE", "SEVERE", "CRITICAL"]

data = []
for _ in range(150):
    _id = f"def_{uuid.uuid4().hex[:8]}"
    _lat = random.uniform(-50, 60)
    # Prefer land masses (heuristic: longitude mostly in Americas, Europe, Asia)
    _lng = random.choice([random.uniform(-125, -70), random.uniform(-10, 30), random.uniform(70, 140)])
    
    _type = random.choice(bridge_types)
    _risk = random.choice(risks)
    
    data.append((_id, _lat, _lng, _type, _risk))

db.executemany("INSERT INTO deformation VALUES (?, ?, ?, ?, ?)", data)
db.commit()
print(f"Generated {len(data)} deformation points.")
db.close()
