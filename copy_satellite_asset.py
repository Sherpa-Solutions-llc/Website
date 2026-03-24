"""
One-time script to copy the satellite image into the static assets folder.
Run with: python copy_satellite_asset.py
"""
import shutil, os, sys

SRC = r'C:\Users\choos\.gemini\antigravity\brain\1e7f9094-3263-4bf0-9eff-a6faf6f926a3\satellite_icon_1773119755804.png'
DST = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\static\satellite.png'

# Also try the original scratch version as fallback
SRC_ALT = r'C:\Users\choos\.gemini\antigravity\scratch\worldview\satellite.png'

def copy_file(src, dst):
    if not os.path.exists(src):
        print(f"Source not found: {src}")
        return False
    shutil.copy(src, dst)
    print(f"Copied {os.path.getsize(dst):,} bytes -> {dst}")
    return True

if not copy_file(SRC, DST):
    if not copy_file(SRC_ALT, DST):
        print("ERROR: Could not find any source satellite image.")
        sys.exit(1)

print("Done! satellite.png is now in static/")
