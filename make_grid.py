import os
from PIL import Image, ImageDraw, ImageFont

base = r"c:\Users\choos\Documents\Antigravity\sherpa_solutions"
models = ["bp_pd_30l", "bp_nomatic_bag", "bp_nomatic_pack"]

for model in models:
    images = []
    for i in range(1, 7):
        ext = "jpg" if "pd_30l" in model or "nomatic_pack_2" in model else "png"
        path = os.path.join(base, f"{model}_{i}.{ext}")
        if not os.path.exists(path):
            path = os.path.join(base, f"{model}_{i}.jpg")
            if not os.path.exists(path):
                path = os.path.join(base, f"{model}_{i}.png")
        if os.path.exists(path):
            try:
                img = Image.open(path).convert("RGB")
                img = img.resize((400, 400))
                draw = ImageDraw.Draw(img)
                draw.rectangle([(10, 10), (50, 50)], fill="black")
                draw.text((20, 20), str(i), fill="white")
                images.append(img)
            except Exception as e:
                print(f"Error opening {path}: {e}")

    if not images:
        continue
        
    grid_w = 3 * 400
    grid_h = 2 * 400
    grid = Image.new("RGB", (grid_w, grid_h), "white")
    for idx, img in enumerate(images):
        x = (idx % 3) * 400
        y = (idx // 3) * 400
        grid.paste(img, (x, y))
        
    grid.save(os.path.join(base, f"grid_{model}.jpg"))
    print(f"Saved grid_{model}.jpg")
