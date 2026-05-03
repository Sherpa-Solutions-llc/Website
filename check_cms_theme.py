import sqlite3
import os

DB_NAME = "sherpa_cms.db"

def check_theme_colors():
    if not os.path.exists(DB_NAME):
        print(f"Database {DB_NAME} not found.")
        return
    
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT html_content FROM content WHERE element_id = 'custom-theme-colors'")
        row = cursor.fetchone()
        if row:
            print("Found custom-theme-colors in database:")
            print("-" * 20)
            print(row[0])
            print("-" * 20)
        else:
            print("No custom-theme-colors found in database.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    check_theme_colors()
