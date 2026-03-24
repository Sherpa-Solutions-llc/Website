import shutil, os
src = r'C:\Users\choos\.gemini\antigravity\scratch\worldview\satellite.png'
dst = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\static\satellite.png'
shutil.copy(src, dst)
print(f"Copied: {os.path.getsize(dst)} bytes")
