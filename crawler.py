import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

START_URL = "https://www.sherpa-solutions-llc.com/"
DOMAIN = "www.sherpa-solutions-llc.com"

visited = set()
broken_links = []
internal_links_to_visit = [START_URL]

while internal_links_to_visit and len(visited) < 50:
    url = internal_links_to_visit.pop(0)
    if url in visited:
        continue
    visited.add(url)
    
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code != 200:
            broken_links.append({"url": url, "status": resp.status_code, "source": "Internal"})
            continue
            
        soup = BeautifulSoup(resp.text, "html.parser")
        for a in soup.find_all("a", href=True):
            link = a['href']
            full_url = urljoin(url, link)
            parsed = urlparse(full_url)
            
            # Remove fragments
            full_url = full_url.split('#')[0]
            
            if full_url in visited or not full_url.startswith("http"):
                continue
                
            if parsed.netloc == DOMAIN:
                if full_url not in internal_links_to_visit:
                    internal_links_to_visit.append(full_url)
            else:
                # External link check
                try:
                    ext_resp = requests.head(full_url, timeout=3, allow_redirects=True)
                    if ext_resp.status_code >= 400:
                        broken_links.append({"url": full_url, "status": ext_resp.status_code, "source": url})
                except Exception as e:
                    broken_links.append({"url": full_url, "status": "Error", "source": url})
                visited.add(full_url)
                
    except Exception as e:
        broken_links.append({"url": url, "status": "Error", "source": "Internal"})

print("=== CRAWL COMPLETE ===")
print(f"Pages visited: {len(visited)}")
print("Broken Links Found:")
for b in broken_links:
    print(b)
