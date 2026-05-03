import os
import rembg

logo_path = r'c:\Users\choos\Documents\Antigravity\sherpa_solutions\static\dcsa_sherpa_logo.png'

print("Starting rembg...")
try:
    with open(logo_path, "rb") as i:
        input_data = i.read()
        
    print("Removing background...")
    output_data = rembg.remove(input_data)
    
    with open(logo_path, "wb") as o:
        o.write(output_data)
        
    print("rembg success! Saved clean logo to", logo_path)
except Exception as e:
    print("rembg failed: ", e)
