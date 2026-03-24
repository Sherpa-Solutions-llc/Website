import sqlite3, os

def update_cms():
    db_path = "sherpa_cms.db"
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found in {os.getcwd()}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    updates = [
        ('homepage-hero-heading', 'Forging a path to your <span>success.</span>'),
        ('homepage-hero-paragraph', "At Sherpa Solutions LLC, we provide the navigational expertise, operational infrastructure, and steadfast support required to successfully scale your business in today's demanding landscape.")
    ]
    
    for eid, content in updates:
        cursor.execute("INSERT OR REPLACE INTO content (element_id, html_content) VALUES (?, ?)", (eid, content))
    
    conn.commit()
    print("CMS content updated successfully.")
    
    cursor.execute("SELECT element_id, html_content FROM content WHERE element_id LIKE 'homepage-hero%'")
    for row in cursor.fetchall():
        print(f"ID: {row[0]} | Content: {row[1]}")
    
    conn.close()

if __name__ == "__main__":
    update_cms()
