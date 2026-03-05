import os

base = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions'
logo_path = os.path.join(base, "sherpa_logo_source.jpg")
out_path = os.path.join(base, "sherpa_logo_source_clean.png")

print("Starting rembg on true original logo...")
try:
    import rembg
    with open(logo_path, "rb") as i:
        with open(out_path, "wb") as o:
            input_data = i.read()
            output_data = rembg.remove(input_data)
            o.write(output_data)
    print("rembg success!")
except Exception as e:
    print("rembg failed: ", e)
