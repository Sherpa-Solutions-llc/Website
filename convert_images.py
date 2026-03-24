import os
import sys

try:
    from PIL import Image
except ImportError:
    print("Pillow is not installed. Installing...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image

def find_large_images(directory, min_size=500*1024):
    large_images = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                filepath = os.path.join(root, file)
                if os.path.getsize(filepath) > min_size:
                    large_images.append(filepath)
    return large_images

def convert_images(directory):
    large_files = find_large_images(directory)
    if not large_files:
        print("No images > 500KB found.")
        return
    for file in large_files:
        try:
            with Image.open(file) as img:
                # Convert to RGB if necessary for webp (e.g. some RGBA pngs)
                # WebP supports RGBA natively, so usually fine unless it's a specific mode.
                out_name = file.rsplit('.', 1)[0] + '.webp'
                img.save(out_name, 'webp', quality=85)
                print(f"Converted {file} to {out_name}")
            # we will delete the original file safely after confirming it's done
            os.remove(file)
            print(f"Removed original {file}")
        except Exception as e:
            print(f"Failed to convert {file}: {e}")

if __name__ == '__main__':
    convert_images('.')
