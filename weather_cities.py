# weather_cities.py

# Tier 1: Major Global Cities (Visible at all zoom levels)
# Tier 2: US Largest State Cities (Visible when zoomed in to country/region level)
# Tier 3: US State Capitals (Visible when zoomed intimately into state levels)

WEATHER_CITIES = [
    # TIER 1: GLOBAL MEGA-CITIES
    {"name": "New York", "lat": 40.71, "lng": -74.01, "tier": 1},
    {"name": "London", "lat": 51.51, "lng": -0.13, "tier": 1},
    {"name": "Tokyo", "lat": 35.69, "lng": 139.69, "tier": 1},
    {"name": "Sydney", "lat": -33.87, "lng": 151.21, "tier": 1},
    {"name": "Paris", "lat": 48.85, "lng": 2.35, "tier": 1},
    {"name": "Moscow", "lat": 55.75, "lng": 37.62, "tier": 1},
    {"name": "Beijing", "lat": 39.90, "lng": 116.41, "tier": 1},
    {"name": "Cairo", "lat": 30.04, "lng": 31.24, "tier": 1},
    {"name": "Rio", "lat": -22.91, "lng": -43.17, "tier": 1},
    {"name": "Cape", "lat": -33.93, "lng": 18.42, "tier": 1},
    {"name": "Mumbai", "lat": 19.08, "lng": 72.88, "tier": 1},
    {"name": "Dubai", "lat": 25.20, "lng": 55.27, "tier": 1},
    {"name": "Singapore", "lat": 1.29, "lng": 103.85, "tier": 1},
    {"name": "Los Angeles", "lat": 34.05, "lng": -118.24, "tier": 1},
    {"name": "Toronto", "lat": 43.70, "lng": -79.42, "tier": 1},
    {"name": "Mexico City", "lat": 19.43, "lng": -99.13, "tier": 1},
    {"name": "Buenos Aires", "lat": -34.60, "lng": -58.38, "tier": 1},
    {"name": "Istanbul", "lat": 41.01, "lng": 28.97, "tier": 1},
    {"name": "Rome", "lat": 41.90, "lng": 12.50, "tier": 1},
    {"name": "Seoul", "lat": 37.57, "lng": 126.98, "tier": 1},
    {"name": "Bangkok", "lat": 13.75, "lng": 100.50, "tier": 1},

    # TIER 2: LARGEST CITIES BY STATE (Only those not already in Tier 1)
    {"name": "Birmingham", "lat": 33.52, "lng": -86.80, "tier": 2}, # AL
    {"name": "Anchorage", "lat": 61.21, "lng": -149.90, "tier": 2}, # AK
    {"name": "Phoenix", "lat": 33.44, "lng": -112.07, "tier": 2}, # AZ (Also Capital)
    {"name": "Little Rock", "lat": 34.74, "lng": -92.28, "tier": 2}, # AR (Also Capital)
    {"name": "Denver", "lat": 39.73, "lng": -104.99, "tier": 2}, # CO (Also Capital)
    {"name": "Bridgeport", "lat": 41.17, "lng": -73.19, "tier": 2}, # CT
    {"name": "Wilmington", "lat": 39.73, "lng": -75.54, "tier": 2}, # DE
    {"name": "Jacksonville", "lat": 30.33, "lng": -81.65, "tier": 2}, # FL
    {"name": "Atlanta", "lat": 33.74, "lng": -84.38, "tier": 2}, # GA (Also Capital)
    {"name": "Honolulu", "lat": 21.30, "lng": -157.85, "tier": 2}, # HI (Also Capital)
    {"name": "Boise", "lat": 43.61, "lng": -116.20, "tier": 2}, # ID (Also Capital)
    {"name": "Chicago", "lat": 41.87, "lng": -87.62, "tier": 2}, # IL
    {"name": "Indianapolis", "lat": 39.76, "lng": -86.15, "tier": 2}, # IN (Also Capital)
    {"name": "Des Moines", "lat": 41.60, "lng": -93.60, "tier": 2}, # IA (Also Capital)
    {"name": "Wichita", "lat": 37.68, "lng": -97.33, "tier": 2}, # KS
    {"name": "Louisville", "lat": 38.25, "lng": -85.75, "tier": 2}, # KY
    {"name": "New Orleans", "lat": 29.95, "lng": -90.07, "tier": 2}, # LA
    {"name": "Portland", "lat": 43.66, "lng": -70.25, "tier": 2}, # ME
    {"name": "Baltimore", "lat": 39.29, "lng": -76.61, "tier": 2}, # MD
    {"name": "Boston", "lat": 42.36, "lng": -71.05, "tier": 2}, # MA (Also Capital)
    {"name": "Detroit", "lat": 42.33, "lng": -83.04, "tier": 2}, # MI
    {"name": "Minneapolis", "lat": 44.97, "lng": -93.26, "tier": 2}, # MN
    {"name": "Jackson", "lat": 32.29, "lng": -90.18, "tier": 2}, # MS (Also Capital)
    {"name": "Kansas City", "lat": 39.09, "lng": -94.57, "tier": 2}, # MO
    {"name": "Billings", "lat": 45.78, "lng": -108.50, "tier": 2}, # MT
    {"name": "Omaha", "lat": 41.25, "lng": -95.93, "tier": 2}, # NE
    {"name": "Las Vegas", "lat": 36.16, "lng": -115.13, "tier": 2}, # NV
    {"name": "Manchester", "lat": 42.99, "lng": -71.45, "tier": 2}, # NH
    {"name": "Newark", "lat": 40.73, "lng": -74.17, "tier": 2}, # NJ
    {"name": "Albuquerque", "lat": 35.08, "lng": -106.65, "tier": 2}, # NM
    {"name": "Charlotte", "lat": 35.22, "lng": -80.84, "tier": 2}, # NC
    {"name": "Fargo", "lat": 46.87, "lng": -96.78, "tier": 2}, # ND
    {"name": "Columbus", "lat": 39.96, "lng": -83.00, "tier": 2}, # OH (Also Capital)
    {"name": "Oklahoma City", "lat": 35.46, "lng": -97.51, "tier": 2}, # OK (Also Capital)
    {"name": "Portland, OR", "lat": 45.51, "lng": -122.67, "tier": 2}, # OR
    {"name": "Philadelphia", "lat": 39.95, "lng": -75.16, "tier": 2}, # PA
    {"name": "Providence", "lat": 41.82, "lng": -71.41, "tier": 2}, # RI (Also Capital)
    {"name": "Charleston", "lat": 32.77, "lng": -79.93, "tier": 2}, # SC
    {"name": "Sioux Falls", "lat": 43.54, "lng": -96.73, "tier": 2}, # SD
    {"name": "Nashville", "lat": 36.16, "lng": -86.78, "tier": 2}, # TN (Also Capital)
    {"name": "Houston", "lat": 29.76, "lng": -95.36, "tier": 2}, # TX
    {"name": "Salt Lake", "lat": 40.76, "lng": -111.89, "tier": 2}, # UT (Also Capital)
    {"name": "Burlington", "lat": 44.47, "lng": -73.21, "tier": 2}, # VT
    {"name": "VA Beach", "lat": 36.85, "lng": -75.97, "tier": 2}, # VA
    {"name": "Seattle", "lat": 47.60, "lng": -122.33, "tier": 2}, # WA
    {"name": "Charleston, WV", "lat": 38.34, "lng": -81.63, "tier": 2}, # WV (Also Capital)
    {"name": "Milwaukee", "lat": 43.03, "lng": -87.90, "tier": 2}, # WI
    {"name": "Cheyenne", "lat": 41.13, "lng": -104.82, "tier": 2}, # WY (Also Capital)

    # TIER 3: STATE CAPITALS (Excluding those already represented in Tier 1 or Tier 2 as largest city)
    {"name": "Montgomery", "lat": 32.37, "lng": -86.30, "tier": 3}, # AL
    {"name": "Juneau", "lat": 58.30, "lng": -134.41, "tier": 3}, # AK
    {"name": "Sacramento", "lat": 38.58, "lng": -121.49, "tier": 3}, # CA
    {"name": "Hartford", "lat": 41.76, "lng": -72.67, "tier": 3}, # CT
    {"name": "Dover", "lat": 39.15, "lng": -75.52, "tier": 3}, # DE
    {"name": "Tallahassee", "lat": 30.43, "lng": -84.28, "tier": 3}, # FL
    {"name": "Springfield", "lat": 39.78, "lng": -89.65, "tier": 3}, # IL
    {"name": "Topeka", "lat": 39.04, "lng": -95.67, "tier": 3}, # KS
    {"name": "Frankfort", "lat": 38.20, "lng": -84.87, "tier": 3}, # KY
    {"name": "Baton Rouge", "lat": 30.45, "lng": -91.14, "tier": 3}, # LA
    {"name": "Augusta", "lat": 44.31, "lng": -69.77, "tier": 3}, # ME
    {"name": "Annapolis", "lat": 38.97, "lng": -76.49, "tier": 3}, # MD
    {"name": "Lansing", "lat": 42.73, "lng": -84.55, "tier": 3}, # MI
    {"name": "St. Paul", "lat": 44.95, "lng": -93.08, "tier": 3}, # MN
    {"name": "Jefferson", "lat": 38.57, "lng": -92.17, "tier": 3}, # MO
    {"name": "Helena", "lat": 46.58, "lng": -112.01, "tier": 3}, # MT
    {"name": "Lincoln", "lat": 40.81, "lng": -96.68, "tier": 3}, # NE
    {"name": "Carson", "lat": 39.16, "lng": -119.76, "tier": 3}, # NV
    {"name": "Concord", "lat": 43.20, "lng": -71.53, "tier": 3}, # NH
    {"name": "Trenton", "lat": 40.21, "lng": -74.75, "tier": 3}, # NJ
    {"name": "Santa Fe", "lat": 35.68, "lng": -105.93, "tier": 3}, # NM
    {"name": "Albany", "lat": 42.65, "lng": -73.75, "tier": 3}, # NY
    {"name": "Raleigh", "lat": 35.77, "lng": -78.63, "tier": 3}, # NC
    {"name": "Bismarck", "lat": 46.80, "lng": -100.78, "tier": 3}, # ND
    {"name": "Salem", "lat": 44.94, "lng": -123.03, "tier": 3}, # OR
    {"name": "Harrisburg", "lat": 40.27, "lng": -76.88, "tier": 3}, # PA
    {"name": "Columbia", "lat": 34.00, "lng": -81.03, "tier": 3}, # SC
    {"name": "Pierre", "lat": 44.36, "lng": -100.35, "tier": 3}, # SD
    {"name": "Austin", "lat": 30.26, "lng": -97.74, "tier": 3}, # TX
    {"name": "Montpelier", "lat": 44.26, "lng": -72.57, "tier": 3}, # VT
    {"name": "Richmond", "lat": 37.54, "lng": -77.43, "tier": 3}, # VA
    {"name": "Olympia", "lat": 47.03, "lng": -122.89, "tier": 3}, # WA
    {"name": "Madison", "lat": 43.07, "lng": -89.40, "tier": 3}, # WI
]

