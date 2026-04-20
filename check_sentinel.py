import urllib.request, json

data = json.loads(urllib.request.urlopen('http://127.0.0.1:8001/api/sar-data').read().decode('utf-8'))
print(f"Total SAR satellites: {len(data)}")
for s in data:
    name = s.get('name','?')
    country = s.get('country','?')
    has_tle = bool(s.get('tle1') and s.get('tle2'))
    print(f"  {name} ({country}) - TLE: {'YES' if has_tle else 'NO'}")
