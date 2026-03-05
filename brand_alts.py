import os
import glob
from PIL import Image

def process_logo(logo_path):
    img = Image.open(logo_path).convert("RGBA")
    data = list(img.getdata())
    new_data = []
    width, height = img.size
    text_start_y = int(height * 0.55)
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = data[y * width + x]
            if r > 220 and g > 220 and b > 220:
                new_data.append((255, 255, 255, 0))
            else:
                if y > text_start_y and r < 140 and g < 140 and b < 140:
                    new_data.append((255, 120, 0, a))
                else:
                    new_data.append((r, g, b, a))
                    
    img.putdata(new_data)
    return img

def apply_branding_to_alts():
    base_dir = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
    logo_path = os.path.join(base_dir, "sherpa_logo.png")
    
    if not os.path.exists(logo_path):
        print("Logo not found")
        return
        
    logo_transparent = process_logo(logo_path)
    alpha = logo_transparent.split()[3]
    alpha = alpha.point(lambda p: int(p * 0.95))
    logo_transparent.putalpha(alpha)
    
    alt_images = glob.glob(os.path.join(base_dir, "*_alt_*.png"))
    
    for prod_path in alt_images:
        try:
            img = Image.open(prod_path).convert("RGBA")
            
            # Use smaller watermark-style logo for alternate angles
            config_scale = 0.15
            logo_width = int(img.width * config_scale)
            aspect = logo_transparent.height / logo_transparent.width
            logo_height = int(logo_width * aspect)
            
            logo_resized = logo_transparent.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
            
            # Place in bottom right corner
            x = img.width - logo_width - int(img.width * 0.05)
            y = img.height - logo_height - int(img.height * 0.05)
            
            img.paste(logo_resized, (x, y), logo_resized)
            img.save(prod_path, "PNG")
            print(f"Successfully branded {os.path.basename(prod_path)}")
        except Exception as e:
            print(f"Failed on {os.path.basename(prod_path)}: {e}")

if __name__ == "__main__":
    apply_branding_to_alts()
