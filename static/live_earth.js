// ----- UI & STATE MANAGEMENT -----
const isMobile = window.innerWidth <= 768;

// Performance caps — satellite entities have per-frame CallbackProperty callbacks too;
// keep this reasonable. Flights use viewport culling instead (no hard cap).
const SAT_DISPLAY_CAP = isMobile ? 200 : 1500;

const state = {
    layers: {
        flights: true,
        military: false,
        satellites: false,
        earthquakes: false,
        traffic: false,
        weather: false,
        cctv: false
    },
    flights: [],
    satellites: [],
    earthquakes: [],
    weatherData: [],
    traffic: [],
    cctv_cameras: [],
    target: null,
    lastFetchTime: 0
};

// Active weather imagery layer (RainViewer) — stored outside entities so
// it persists across entity refresh calls
let _weatherImageryLayer = null;
let _weatherLastType = null; // track which layer type is currently applied

// Clock Update
setInterval(() => {
    const now = new Date();
    document.getElementById('clock-display').innerHTML = now.toISOString().replace('T', '<br>').replace('Z', ' UTC');
}, 1000);

// Layer Toggles
window.toggleLayer = function (layerName) {
    state.layers[layerName] = !state.layers[layerName];
    const el = document.getElementById(`layer-${layerName}`);
    const toggleIcon = el.querySelector('.layer-toggle i');

    if (state.layers[layerName]) {
        el.classList.add('active');
        toggleIcon.className = 'fa-solid fa-toggle-on';
    } else {
        el.classList.remove('active');
        toggleIcon.className = 'fa-solid fa-toggle-off';
    }

    updateGlobeData();
};


// ----- CESIUM INITIALIZATION -----
const viewer = new Cesium.Viewer('globe-container', {
    imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    }),
    animation: false,
    timeline: false,
    infoBox: false,
    selectionIndicator: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    scene3DOnly: true
});

// ----- PERFORMANCE SETTINGS -----
// requestRenderMode: only re-render when the scene actually changes.
// This is the single biggest CPU win when the user isn't rotating the globe.
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = Infinity; // don't re-render on timeouts alone

// Cap frame rate at 30fps — halves render cost with barely perceptible quality loss.
viewer.targetFrameRate = 30;

// Lower resolution scale on mobile to cut GPU fill-rate cost.
if (isMobile) {
    viewer.resolutionScale = 0.75;
}

// Remove default double-click behavior
viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// Hide cesium credit bottom bar visually
const creditContainer = document.querySelector('.cesium-viewer-bottom');
if (creditContainer) creditContainer.style.display = 'none';

// Hover/Click Object Picking
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

// MOUSE_MOVE hover detection: skip on mobile (saves CPU; no hover on touch anyway)
if (!isMobile) {
    handler.setInputAction(function (movement) {
        const pickedObject = viewer.scene.pick(movement.position);
        document.body.style.cursor =
            (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.customData)
            ? 'pointer' : 'default';
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

handler.setInputAction(function (movement) {
    const pickedObject = viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.customData) {
        lockTarget(pickedObject.id.customData);
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


// ----- AIRPLANE ICON GENERATOR -----
// SVG string for an airplane pointing upwards (0 degrees heading)
const airplaneSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="32" height="32"><path fill="WHITE" d="M448 336v-40L288 192V79.2c0-17.7-14.8-31.2-32-31.2s-32 13.5-32 31.2V192L64 296v40l160-48v113.6l-48 31.2V464l80-16 80 16v-31.2l-48-31.2V288l160 48z"/></svg>`;


// ----- DATA FETCHING -----

async function fetchFlights() {
    try {
        const res = await fetch('https://sherpa-solutions-api-production.up.railway.app/api/flights');
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();

        const timestamp = data.time;
        const activeStates = data.states || [];

        state.flights = activeStates
            .filter(s => s[5] !== null && s[6] !== null && s[8] === false)
            .map(s => {
                const velocityKmH = (s[9] || 0) * 3.6;
                const isMilitary = s[1] ? s[1].trim().startsWith("RCH") || s[1].trim().startsWith("AF") || s[1].trim().startsWith("RRR") || s[1].trim().startsWith("CNV") : false;

                // Precompute perfectly stable ECEF AlignedAxis vector for 3D orientation
                const lngRad = Cesium.Math.toRadians(s[5]);
                const latRad = Cesium.Math.toRadians(s[6]);
                const headingRad = Cesium.Math.toRadians(s[10] || 0);

                const cosLat = Math.cos(latRad);
                const sinLat = Math.sin(latRad);
                const cosLng = Math.cos(lngRad);
                const sinLng = Math.sin(lngRad);

                // Local East and North tangent vectors
                const eastX = -sinLng;
                const eastY = cosLng;
                const eastZ = 0;

                const northX = -sinLat * cosLng;
                const northY = -sinLat * sinLng;
                const northZ = cosLat;

                // Compass heading mapping: 0 = North, 90 = East
                const cosH = Math.cos(headingRad);
                const sinH = Math.sin(headingRad);

                const alignedAxis = new Cesium.Cartesian3(
                    northX * cosH + eastX * sinH,
                    northY * cosH + eastY * sinH,
                    northZ * cosH + eastZ * sinH
                );

                return {
                    id: s[0],
                    callsign: s[1] ? s[1].trim() : 'UNKNOWN',
                    country: s[2],
                    startLng: s[5], 
                    startLat: s[6],
                    lng: s[5], 
                    lat: s[6],
                    alt: s[7] || 10000,
                    velocity: s[9] || 0,
                    velocityKmH: velocityKmH,
                    heading: s[10] || 0,
                    alignedAxis: alignedAxis,
                    lastUpdate: timestamp,
                    fetchTime: performance.now(),
                    isMilitary: isMilitary,
                    type: 'flight'
                };
            });

        document.getElementById('loading-overlay').style.display = 'none';
        updateGlobeData();
    } catch (e) {
        console.error("Flight fetch failed:", e);
        document.getElementById('loading-overlay').style.display = 'none';
        setTimeout(fetchFlights, 10000);
    }
}

async function fetchEarthquakes() {
    try {
        const duration = document.getElementById('quake-duration')?.value || 'days';
        let url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
        if (duration === 'weeks') url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson';
        if (duration === 'months') url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';

        const res = await fetch(url);
        const data = await res.json();
        state.earthquakes = data.features.map(f => ({
            id: f.id,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            mag: f.properties.mag,
            title: f.properties.title,
            type: 'earthquake'
        }));
        updateGlobeData();
    } catch (e) {
        console.error("Earthquake fetch failed:", e);
    }
}

async function fetchSatellites() {
    try {
        // Fetch real, live active satellite TLEs from CelesTrak
        const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
        if (!res.ok) throw new Error('CelesTrak API Error');
        const text = await res.text();

        const lines = text.split('\n').filter(l => l.trim().length > 0);
        state.satellites = [];

        // Parse TLE data (3 lines per satellite)
        for (let i = 0; i < lines.length; i += 3) {
            if (i + 2 >= lines.length) break;

            const name = lines[i].trim();
            const tleLine1 = lines[i + 1];
            const tleLine2 = lines[i + 2];

            // Initialize satellite record using satellite.js
            const satRec = satellite.twoline2satrec(tleLine1, tleLine2);

            // Try to figure out type loosely based on name
            let subtype = 'commercial';
            const upperName = name.toUpperCase();
            if (upperName.includes('STARLINK') || upperName.includes('ONEWEB')) subtype = 'commercial';
            else if (upperName.includes('USA') || upperName.includes('COSMOS') || upperName.includes('MILSTAR')) subtype = 'military';
            else if (upperName.includes('NOAA') || upperName.includes('GOES') || upperName.includes('ISS')) subtype = 'private'; // using 'private' bucket for gov/science for now

            const catalogNum = tleLine1.substring(2, 7).trim();
            const satId = name + '_' + catalogNum;

            state.satellites.push({
                id: satId,
                type: 'satellite',
                subtype: subtype,
                satRec: satRec
            });
        }
        updateGlobeData();
    } catch (e) {
        console.error("Satellite fetch failed:", e);
    }
}

const majorCities = [
    { name: "New York", lat: 40.71, lng: -74.01 },
    { name: "London", lat: 51.51, lng: -0.13 },
    { name: "Tokyo", lat: 35.69, lng: 139.69 },
    { name: "Sydney", lat: -33.87, lng: 151.21 },
    { name: "Paris", lat: 48.85, lng: 2.35 },
    { name: "Moscow", lat: 55.75, lng: 37.62 },
    { name: "Beijing", lat: 39.90, lng: 116.41 },
    { name: "Cairo", lat: 30.04, lng: 31.24 },
    { name: "Rio", lat: -22.91, lng: -43.17 },
    { name: "Cape Town", lat: -33.93, lng: 18.42 },
    { name: "Mumbai", lat: 19.08, lng: 72.88 },
    { name: "Dubai", lat: 25.20, lng: 55.27 },
    { name: "Singapore", lat: 1.29, lng: 103.85 },
    { name: "Los Angeles", lat: 34.05, lng: -118.24 },
    { name: "Toronto", lat: 43.70, lng: -79.42 },
    { name: "Mexico City", lat: 19.43, lng: -99.13 },
    { name: "Buenos Aires", lat: -34.60, lng: -58.38 },
    { name: "Istanbul", lat: 41.01, lng: 28.97 },
    { name: "Rome", lat: 41.90, lng: 12.50 },
    { name: "Seoul", lat: 37.57, lng: 126.98 },
    { name: "Bangkok", lat: 13.75, lng: 100.50 }
];

async function fetchCCTVs() {
    try {
        const res = await fetch('https://sherpa-solutions-api-production.up.railway.app/api/cameras?_t=' + Date.now());
        if (!res.ok) throw new Error('cameras API unavailable');
        const data = await res.json();
        state.cctv_cameras = data;
        const cctvEl = document.getElementById('layer-cctv');
        if (cctvEl) cctvEl.querySelector('.layer-count').innerText = data.length;
        console.log(`[CCTV] Loaded ${data.length} cameras (WSDOT, Oregon, UK, Norway, BC Canada)`);
        if (state.layers.cctv) updateGlobeData();
    } catch (e) {
        console.warn('[CCTV] /api/cameras failed, falling back to static file:', e);
        try {
            const res2 = await fetch('/static/insecam_data.json');
            if (!res2.ok) throw new Error('static file also missing');
            const data = await res2.json();
            state.cctv_cameras = data;
            if (state.layers.cctv) updateGlobeData();
        } catch (e2) {
            console.error('[CCTV] All camera sources failed:', e2);
        }
    }
}

async function fetchWeather() {
    try {
        const lats = majorCities.map(c => c.lat).join(',');
        const lngs = majorCities.map(c => c.lng).join(',');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=temperature_2m`;
        const res = await fetch(url);
        const data = await res.json();

        state.weatherData = data.map((d, i) => ({
            city: majorCities[i].name,
            lat: majorCities[i].lat,
            lng: majorCities[i].lng,
            temp: d.current.temperature_2m,
            unit: d.current_units.temperature_2m
        }));

        if (state.layers.weather) updateGlobeData();
    } catch (e) {
        console.error("Weather fetch failed:", e);
    }
}

function fetchTraffic() {
    state.traffic = [];
    let id_counter = 0;
    majorCities.forEach(city => {
        // Generate 5-25 traffic spots clustered around each major city
        const numSpots = Math.floor(Math.random() * 20) + 5;
        for (let i = 0; i < numSpots; i++) {
            state.traffic.push({
                id: ++id_counter,
                lat: city.lat + (Math.random() - 0.5) * 0.4,
                lng: city.lng + (Math.random() - 0.5) * 0.4,
                severity: Math.random() > 0.85 ? 'HIGH' : (Math.random() > 0.4 ? 'MODERATE' : 'LOW'),
                size: Math.floor(Math.random() * 8) + 3,
                type: 'traffic',
                title: `${city.name.toUpperCase()} TRAFFIC ALERT`
            });
        }
    });
}

function updateGlobeData() {
    const counts = { flights: 0, military: 0, satellites: 0, earthquakes: 0, cctvs: 0, traffic: 0 };

    // Using viewer.entities block updates requires suspendEvents to be fast
    viewer.entities.suspendEvents();
    viewer.entities.removeAll();

    // Flight Layer — viewport culling: only render flights visible in the current camera view.
    // This replaces the old fixed cap, allowing all flight data to be tracked while keeping entity
    // counts proportional to zoom level (zoomed in = fewer flights, zoomed out = more area covered).
    if (state.layers.flights || state.layers.military) {
        const flightType = document.getElementById('flight-type')?.value || 'all';
        const flightSpeedFilter = document.getElementById('flight-speed')?.value || 'all';
        const militarySpeedFilter = document.getElementById('military-speed')?.value || 'all';

        const earthRadius = 6371000;

        // --- Viewport bounds via camera.computeViewRectangle ---
        // Returns undefined when the camera is so high it can see the full globe (horizon clips);
        // in that case we skip the spatial filter and rely on a generous safety cap.
        const viewRect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
        let vWest, vEast, vSouth, vNorth;
        const hasViewRect = Cesium.defined(viewRect);
        if (hasViewRect) {
            vWest  = Cesium.Math.toDegrees(viewRect.west);
            vEast  = Cesium.Math.toDegrees(viewRect.east);
            vSouth = Cesium.Math.toDegrees(viewRect.south);
            vNorth = Cesium.Math.toDegrees(viewRect.north);
        }

        // Helper: is a flight within the visible viewport?
        function inView(lat, lng) {
            if (!hasViewRect) return true; // show all when full-globe view
            if (lat < vSouth || lat > vNorth) return false;
            // Handle antimeridian wrap (vWest > vEast when the rect spans the 180° line)
            if (vWest <= vEast) return lng >= vWest && lng <= vEast;
            return lng >= vWest || lng <= vEast;
        }

        // Walk all flights, apply user filters + viewport cull
        const civFlights = [];
        const milFlights = [];
        // Full-globe safety cap (only used if computeViewRectangle returned undefined)
        const GLOBAL_CAP = isMobile ? 1000 : 3000;

        state.flights.forEach(f => {
            const speedKmh = f.velocity * 3.6;

            let speedMatch = true;
            if (flightSpeedFilter === '0-500' && speedKmh >= 500) speedMatch = false;
            if (flightSpeedFilter === '500-1000' && (speedKmh < 500 || speedKmh >= 1000)) speedMatch = false;
            if (flightSpeedFilter === '1000+' && speedKmh < 1000) speedMatch = false;

            let milSpeedMatch = true;
            if (militarySpeedFilter === '0-500' && speedKmh >= 500) milSpeedMatch = false;
            if (militarySpeedFilter === '500-1000' && (speedKmh < 500 || speedKmh >= 1000)) milSpeedMatch = false;
            if (militarySpeedFilter === '1000+' && speedKmh < 1000) milSpeedMatch = false;

            if (speedMatch && state.layers.flights && !f.isMilitary &&
                (flightType === 'all' || (flightType === 'commercial' && f.callsign !== 'UNKNOWN') || (flightType === 'private' && f.callsign === 'UNKNOWN')) &&
                inView(f.lat, f.lng)) {
                civFlights.push(f);
            }
            if (milSpeedMatch && state.layers.military && f.isMilitary && inView(f.lat, f.lng)) {
                milFlights.push(f);
            }
        });

        // Apply cap only when full-globe (viewRect undefined) — visible count is naturally bounded otherwise
        const civVisible = hasViewRect ? civFlights : civFlights.slice(0, Math.round(GLOBAL_CAP * 0.9));
        const milVisible = hasViewRect ? milFlights : milFlights.slice(0, Math.round(GLOBAL_CAP * 0.1));

        // Show total qualifying flights in UI (not just visible subset)
        counts.flights  = civFlights.length;
        counts.military = milFlights.length;

        [...civVisible, ...milVisible].forEach(f => {
            const colorHex = f.isMilitary ? '#ff4757' : '#00d2ff';
            const headingRad = Cesium.Math.toRadians(f.heading);

            viewer.entities.add({
                id: f.id,
                position: new Cesium.CallbackProperty((time, result) => {
                    const now = performance.now();
                    const dt = (now - f.fetchTime) / 1000;
                    const dist = f.velocity * dt;
                    const angularDist = dist / earthRadius;

                    const startLatRad = Cesium.Math.toRadians(f.startLat);
                    const startLngRad = Cesium.Math.toRadians(f.startLng);

                    const newLatRad = Math.asin(
                        Math.sin(startLatRad) * Math.cos(angularDist) +
                        Math.cos(startLatRad) * Math.sin(angularDist) * Math.cos(headingRad)
                    );
                    const newLngRad = startLngRad + Math.atan2(
                        Math.sin(headingRad) * Math.sin(angularDist) * Math.cos(startLatRad),
                        Math.cos(angularDist) - Math.sin(startLatRad) * Math.sin(newLatRad)
                    );

                    f.lat = Cesium.Math.toDegrees(newLatRad);
                    f.lng = Cesium.Math.toDegrees(newLngRad);

                    const p2 = Cesium.Cartesian3.fromRadians(newLngRad, newLatRad, f.alt, viewer.scene.globe.ellipsoid, result);
                    return p2;
                }, false),
                billboard: {
                    image: airplaneSvg,
                    color: Cesium.Color.fromCssColorString(colorHex),
                    rotation: 0,
                    alignedAxis: f.alignedAxis,
                    scale: 0.6
                },
                customData: f
            });
        });
    }

    // Satellites — also capped to SAT_DISPLAY_CAP
    if (state.layers.satellites) {
        const satType = document.getElementById('satellite-type')?.value || 'all';
        let satCount = 0;

        for (const s of state.satellites) {
            if (satType !== 'all' && s.subtype !== satType) continue;
            if (satCount >= SAT_DISPLAY_CAP) break;
            satCount++;
            counts.satellites++;

                viewer.entities.add({
                    id: s.id,
                    position: new Cesium.CallbackProperty((time, result) => {
                        const now = new Date();
                        const positionAndVelocity = satellite.propagate(s.satRec, now);
                        const positionEci = positionAndVelocity.position;

                        if (!positionEci || isNaN(positionEci.x)) {
                            // Can happen if TLE is invalid or too old
                            return undefined;
                        }

                        const gmst = satellite.gstime(now);
                        const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                        const lng = satellite.degreesLong(positionGd.longitude);
                        const lat = satellite.degreesLat(positionGd.latitude);
                        const alt = positionGd.height * 1000; // satellite.js height is in km, cesium expects meters

                        // Keep internal state updated for the HUD
                        s.lat = lat;
                        s.lng = lng;
                        s.alt = alt;

                        const vVec = positionAndVelocity.velocity;
                        if (vVec) {
                            const speedKmS = Math.sqrt(vVec.x * vVec.x + vVec.y * vVec.y + vVec.z * vVec.z);
                            s.velocityKmH = speedKmS * 3600;
                        } else {
                            s.velocityKmH = 0;
                        }

                        return Cesium.Cartesian3.fromDegrees(lng, lat, alt, viewer.scene.globe.ellipsoid, result);
                    }, false),
                    billboard: {
                        image: '/static/satellite.png',
                        scale: 0.12,
                        verticalOrigin: Cesium.VerticalOrigin.CENTER,
                        horizontalOrigin: Cesium.HorizontalOrigin.CENTER
                    },
                    description: `<b>${s.id}</b>`,
                    customData: s
            });
        }
    }

    // Earthquakes
    if (state.layers.earthquakes) {
        state.earthquakes.forEach(e => {
            counts.earthquakes++;
            viewer.entities.add({
                id: e.id,
                position: Cesium.Cartesian3.fromDegrees(e.lng, e.lat, 0),
                point: {
                    pixelSize: Math.max(e.mag * 4, 4),
                    color: Cesium.Color.ORANGE.withAlpha(0.6),
                    outlineColor: Cesium.Color.RED,
                    outlineWidth: 1
                },
                customData: e
            });
        });
    }

    // CCTV
    if (state.layers.cctv) {
        const cctvMode = document.getElementById('cctv-mode')?.value || 'all';
        state.cctv_cameras.forEach(cam => {
            if (cctvMode === 'usa' && cam.country !== 'USA') return;
            if (cctvMode === 'uk' && cam.country !== 'UK') return;

            counts.cctvs++;
            viewer.entities.add({
                id: cam.id,
                // Raise altitude so icons clear terrain and are easier to click
                position: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat, 500),
                billboard: {
                    // Larger icon (36x36) for better click target
                    image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="36" height="36"><path fill="%237bed9f" d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2V384c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 337.1V320 192 174.9l14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z"/></svg>',
                    scale: 1.0,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    // Ensure it always renders on top of terrain/other entities
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                customData: cam
            });
        });
    }

    // Traffic
    if (state.layers.traffic) {
        const trafficSort = document.getElementById('traffic-type')?.value || 'current';
        state.traffic.forEach(t => {
            counts.traffic++;
            viewer.entities.add({
                id: 'traffic_' + t.id,
                position: Cesium.Cartesian3.fromDegrees(t.lng, t.lat, 250),
                point: {
                    pixelSize: trafficSort === 'accidents' ? t.size + 4 : t.size,
                    color: t.severity === 'HIGH' ? Cesium.Color.RED.withAlpha(0.9) : (t.severity === 'MODERATE' ? Cesium.Color.ORANGE.withAlpha(0.8) : Cesium.Color.YELLOW.withAlpha(0.7)),
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1
                },
                customData: t
            });
        });
    }

    viewer.entities.resumeEvents();
    // Force a redraw now that entities are updated (required in requestRenderMode)
    viewer.scene.requestRender();

    // Update UI
    const flightCountEl = document.getElementById('count-flights');
    if (flightCountEl) flightCountEl.innerText = counts.flights;
    const milEl = document.getElementById('layer-military');
    if (milEl) milEl.querySelector('.layer-count').innerText = counts.military;
    const satEl = document.getElementById('layer-satellites');
    if (satEl) satEl.querySelector('.layer-count').innerText = counts.satellites;
    const eqEl = document.getElementById('layer-earthquakes');
    if (eqEl) eqEl.querySelector('.layer-count').innerText = counts.earthquakes;
    const cctvEl = document.getElementById('layer-cctv');
    if (cctvEl) cctvEl.querySelector('.layer-count').innerText = counts.cctvs;
    const trafficEl = document.getElementById('layer-traffic');
    if (trafficEl) trafficEl.querySelector('.layer-count').innerText = counts.traffic;

    // Weather: imagery layers are managed separately (not as entities)
    if (state.layers.weather) {
        const weatherType = document.getElementById('weather-layer')?.value || 'rain';
        const weatherP = document.getElementById('layer-weather').querySelector('p');
        if (weatherP) weatherP.innerText = `Active: ${weatherType}`;

        if (weatherType === 'temperature' && state.weatherData) {
            state.weatherData.forEach(w => {
                viewer.entities.add({
                    id: 'weather_' + w.city,
                    position: Cesium.Cartesian3.fromDegrees(w.lng, w.lat, 10000),
                    label: {
                        text: `${w.city}\n${w.temp} ${w.unit}`,
                        font: 'bold 14pt "Share Tech Mono"',
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        fillColor: Cesium.Color.fromCssColorString('#a4b0be'),
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -10),
                        showBackground: true,
                        backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7)
                    },
                    point: {
                        pixelSize: 8,
                        color: Cesium.Color.fromCssColorString('#a4b0be'),
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2
                    }
                });
            });
            // Remove any tile-based layer if we switched to temperature
            if (_weatherImageryLayer) {
                viewer.imageryLayers.remove(_weatherImageryLayer, true);
                _weatherImageryLayer = null;
                _weatherLastType = null;
            }
        } else {
            // Apply a real tile-based radar/cloud layer via RainViewer
            if (_weatherLastType !== weatherType) {
                applyWeatherLayer(weatherType);
            }
        }
    } else {
        // Layer toggled off — remove weather imagery if present
        if (_weatherImageryLayer) {
            viewer.imageryLayers.remove(_weatherImageryLayer, true);
            _weatherImageryLayer = null;
            _weatherLastType = null;
        }
    }
}

// ----- WEATHER IMAGERY (RainViewer) -----
async function applyWeatherLayer(type) {
    // Remove any previously applied weather imagery
    if (_weatherImageryLayer) {
        viewer.imageryLayers.remove(_weatherImageryLayer, true);
        _weatherImageryLayer = null;
    }
    _weatherLastType = type;

    try {
        if (type === 'clouds') {
            // Use RainViewer satellite infrared tiles (free, no API key needed)
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await res.json();
            const host = data.host;
            // Prefer infrared satellite (true cloud coverage)
            const cloudFrames = data.satellite && data.satellite.infrared;
            if (cloudFrames && cloudFrames.length > 0) {
                const latestCloud = cloudFrames[cloudFrames.length - 1];
                const tileUrl = `${host}${latestCloud.path}/256/{z}/{x}/{y}/0/0_0.png`;
                _weatherImageryLayer = viewer.imageryLayers.addImageryProvider(
                    new Cesium.UrlTemplateImageryProvider({
                        url: tileUrl,
                        minimumLevel: 0,
                        maximumLevel: 7,
                        credit: 'RainViewer Satellite'
                    })
                );
                _weatherImageryLayer.alpha = 0.72;
                console.log('[Weather] Applied cloud (infrared satellite) layer:', tileUrl);
            } else {
                // Infrared satellite not available — fall back to latest radar with a
                // more transparent blue-green color scheme (scheme 6 = dark sky blue)
                const frames = data.radar && data.radar.past;
                if (frames && frames.length > 0) {
                    const latest = frames[frames.length - 1];
                    const tileUrl = `${host}${latest.path}/256/{z}/{x}/{y}/6/0_0.png`;
                    _weatherImageryLayer = viewer.imageryLayers.addImageryProvider(
                        new Cesium.UrlTemplateImageryProvider({
                            url: tileUrl,
                            minimumLevel: 0,
                            maximumLevel: 7,
                            credit: 'RainViewer'
                        })
                    );
                    _weatherImageryLayer.alpha = 0.5;
                    console.log('[Weather] Applied cloud (radar fallback) layer:', tileUrl);
                }
            }
            return;
        }

        // Rain and Snow: use RainViewer radar tiles
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        const host = data.host;

        const frames = data.radar && data.radar.past;
        if (!frames || frames.length === 0) {
            console.warn('[Weather] RainViewer returned no radar frames');
            return;
        }

        // Use the most recent frame
        const latest = frames[frames.length - 1];

        // Color scheme: 2 = classic radar (greens/yellows/reds)
        // Options: smooth=1, snow=1 for snow layer / snow=0 for rain
        const snowFlag = type === 'snow' ? 1 : 0;
        const tileUrl = `${host}${latest.path}/256/{z}/{x}/{y}/2/1_${snowFlag}.png`;

        _weatherImageryLayer = viewer.imageryLayers.addImageryProvider(
            new Cesium.UrlTemplateImageryProvider({
                url: tileUrl,
                minimumLevel: 0,
                maximumLevel: 7,
                credit: 'RainViewer'
            })
        );
        _weatherImageryLayer.alpha = 0.75;

        console.log(`[Weather] Applied ${type} radar layer: ${tileUrl}`);
    } catch (e) {
        console.error('[Weather] Failed to apply weather layer:', e);
    }
}


// ----- HUD UPDATER -----
// Update target HUD panel continuously if active
viewer.scene.preUpdate.addEventListener(function (scene, time) {
    if (state.target && document.getElementById('target-panel').style.display !== 'none') {
        // ONLY update the HUD constantly for moving targets like flights to prevent destroying 
        // static elements like `<video>` or `<img>` tags 60 times a second.
        if (state.target.type === 'flight') {
            renderTargetDetails();
        }
    }
});


// ----- TARGETING LOGIC -----
const majorAirports = ['JFK', 'LHR', 'CDG', 'HND', 'SYD', 'PEK', 'DXB', 'SIN', 'FRA', 'AMS', 'LAX', 'ORD', 'ATL', 'HKG', 'MAD', 'IST', 'SVO', 'PER', 'AKL', 'JNB', 'GIG', 'MEX', 'YYZ', 'GRU'];

function getMockRoute(callsign) {
    let hash = 0;
    const str = callsign ? callsign : String(Math.random());
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const idx1 = Math.abs(hash) % majorAirports.length;
    let idx2 = Math.abs(hash * 31) % majorAirports.length;
    if (idx1 === idx2) idx2 = (idx2 + 1) % majorAirports.length;
    return { origin: majorAirports[idx1], destination: majorAirports[idx2] };
}

async function fetchFlightRoute(target) {
    target.origin = "CALCULATING...";
    target.destination = "CALCULATING...";

    // Use our own server-side proxy to avoid CORS restrictions on the OpenSky browser API
    if (!target.isMilitary && target.callsign && !target.callsign.includes('UNKNOWN') && target.callsign.trim() !== '') {
        try {
            const res = await fetch(`https://sherpa-solutions-api-production.up.railway.app/api/flight-route?callsign=${encodeURIComponent(target.callsign.trim())}`);
            if (res.ok) {
                const data = await res.json();
                if (data.origin && data.destination) {
                    target.origin = data.origin;
                    target.destination = data.destination;
                    return;
                }
            }
        } catch (e) { console.warn("Route proxy failed, falling back to algorithmic mock."); }
    }

    // Fallback to procedural consistent mock
    setTimeout(() => {
        const route = getMockRoute(target.callsign);
        target.origin = route.origin;
        target.destination = route.destination;
    }, 400);
}

function lockTarget(obj) {
    state.target = obj;
    if (obj.type === 'flight' && !obj.origin) fetchFlightRoute(obj);

    const panel = document.getElementById('target-panel');
    panel.style.display = 'flex';
    setTimeout(() => panel.style.transform = 'translateX(0)', 10);
    renderTargetDetails();

    // Zoom Cesium camera
    const entity = viewer.entities.getById(obj.id);
    if (entity) {
        let zoomRange = 500000;
        if (obj.type === 'cctv') zoomRange = 5000;
        else if (obj.type === 'traffic') zoomRange = 10000;
        else if (obj.alt > 0) zoomRange = obj.alt * 2 + 50000;

        viewer.flyTo(entity, {
            duration: 1.5,
            offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, zoomRange)
        });
    }
}

document.getElementById('close-target').addEventListener('click', () => {
    state.target = null;
    const panel = document.getElementById('target-panel');
    panel.style.transform = 'translateX(120%)';
    setTimeout(() => panel.style.display = 'none', 300);

    // Clean up camera feeds
    clearInterval(_camRefreshInterval);
    _camRefreshInterval = null;
    if (window._hlsInstance) { window._hlsInstance.destroy(); window._hlsInstance = null; }
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-98.5, 39.8, 10000000),
        duration: 1.5
    });
});

// Global cam refresh interval — cleared when panel closes or a new target is selected
let _camRefreshInterval = null;

function renderTargetDetails() {
    // Clean up any previous camera feed
    clearInterval(_camRefreshInterval);
    _camRefreshInterval = null;
    if (window._hlsInstance) { window._hlsInstance.destroy(); window._hlsInstance = null; }

    const t = state.target;
    if (!t) return;

    const isFlight = t.type === 'flight';
    const isTraffic = t.type === 'traffic';

    const html = `
        <div style="margin-bottom: 20px; text-align: center;">
            <div style="font-size: 2rem; color: ${t.isMilitary ? 'var(--hud-pink)' : (t.type === 'cctv' ? '#7bed9f' : (isTraffic ? '#ff6b81' : 'var(--hud-cyan)'))};">
                <i class="fa-solid ${t.isMilitary ? 'fa-fighter-jet' : (t.type === 'cctv' ? 'fa-video' : (isTraffic ? 'fa-car-burst' : (isFlight ? 'fa-plane' : 'fa-satellite')))}"></i>
            </div>
            <h3 style="font-family: 'Share Tech Mono'; font-size: 1.5rem; letter-spacing: 2px;">${t.callsign || t.title || (t.id ? t.id.toString().split('_')[0] : 'UNKNOWN')}</h3>
            <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px; text-transform: uppercase;">
                ${t.country || t.subtype || (isTraffic ? 'ROAD INCIDENT' : 'UNKNOWN ORIGIN')}
            </div>
        </div>
        
        <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
            ${t.type === 'cctv' ? (() => {
            const streamType = t.stream_type || (t.stream ? 'url' : 'none');
            const camId = `live-cam-${t.id.replace(/[^a-z0-9]/gi,'_')}`;

            if (t.video || t.hls_url) {
                const liveLink = t.link || '#';
                // UK TfL videos are hosted on AWS S3 which natively allows CORS & Byte-Ranges!
                const videoDirect = t.video ? (t.video + '?_t=' + Date.now()) : '';
                return `
            <tr>
                <td colspan="2" style="padding: 10px 0 4px; text-align: center;">
                    <div style="position:relative; border-radius:6px; overflow:hidden; border:1px solid rgba(123,237,159,0.5); background:#0a1018; min-height:190px;">
                        <video id="${camId}"
                             ${videoDirect ? `src="${videoDirect}"` : ''}
                             autoplay loop muted playsinline
                             style="width:100%; height:190px; display:block; object-fit:cover;"
                             onerror="this.style.opacity='0.3'; document.getElementById('${camId}-err').style.display='flex';"
                             onloadeddata="this.style.opacity='1'; document.getElementById('${camId}-err').style.display='none';">
                        </video>
                        <div id="${camId}-err" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:0.75rem;font-family:'Share Tech Mono',monospace;color:#ff6b6b;background:rgba(0,0,0,0.7); pointer-events:none;">
                            📷 OFFLINE / NO ACCESS
                        </div>
                        <div style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.7); padding:2px 7px; border-radius:3px; font-size:0.65rem; font-family:'Share Tech Mono',monospace;">
                            <span style="color:#ff4757;">●</span> <span style="color:#7bed9f;">LIVE</span>
                        </div>
                    </div>
                </td>
            </tr>`;
            } else if (t.snapshot) {
                const liveLink = t.link || '#';
                const proxyUrl = t.country === 'UK' 
                    ? t.snapshot + '&_t=' + Date.now()
                    : '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                return `
            <tr>
                <td colspan="2" style="padding: 10px 0 4px; text-align: center;">
                    <div style="position:relative; border-radius:6px; overflow:hidden; border:1px solid rgba(123,237,159,0.5); background:#0a1018; min-height:190px;">
                        <img id="${camId}"
                             src="${proxyUrl}"
                             style="width:100%; height:190px; display:block; object-fit:cover;"
                             onerror="this.style.opacity='0.3'; document.getElementById('${camId}-err').style.display='flex';"
                             onload="this.style.opacity='1'; document.getElementById('${camId}-err').style.display='none';"
                        />
                        <div id="${camId}-err" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:0.75rem;font-family:'Share Tech Mono',monospace;color:#ff6b6b;background:rgba(0,0,0,0.7); pointer-events:none;">
                            📷 OFFLINE / NO ACCESS
                        </div>
                        <div style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.7); padding:2px 7px; border-radius:3px; font-size:0.65rem; font-family:'Share Tech Mono',monospace;">
                            <span style="color:#ff4757;">●</span> <span style="color:#7bed9f;">LIVE</span>
                        </div>
                    </div>
                    <a href="${liveLink}" target="_blank"
                       style="color:#00d2ff; font-size:0.72rem; display:block; margin-top:5px; text-decoration:none;">
                        ▶ Local Traffic Cameras ↗
                    </a>
                </td>
            </tr>`;

            } else if (streamType === 'mjpeg' || (t.stream && /\.mjpg|\.cgi|\.jpg(\?|$)|snapshot/i.test(t.stream))) {
                return `
            <tr>
                <td colspan="2" style="padding: 10px 0; text-align: center;">
                    <img src="${t.stream}" style="width:100%; height:180px; object-fit:cover; border-radius:4px; border:1px solid rgba(123,237,159,0.5); background:#000;"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                    <div style="display:none; color:#7bed9f; text-align:center; padding:10px; font-size:0.8rem;">⚠ Stream unreachable</div>
                    <a href="${t.stream}" target="_blank" style="color:#7bed9f; font-size:0.75rem; display:block; margin-top:4px;">↗ Open stream in new tab</a>
                </td>
            </tr>`;

            } else if (t.stream) {
                return `
            <tr>
                <td colspan="2" style="padding: 10px 0; text-align: center;">
                    <iframe width="100%" height="190"
                        src="${t.stream}"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        style="border-radius:4px; border:1px solid rgba(123,237,159,0.5); background:#000;"
                    ></iframe>
                    <a href="${t.stream}" target="_blank" style="color:#7bed9f; font-size:0.75rem; display:block; margin-top:4px;">↗ Open in new tab if blocked</a>
                </td>
            </tr>`;
            }
            return '';
        })() : ''}
            ${t.type !== 'cctv' && !isTraffic ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">IDENTIFIER</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${isFlight ? (t.id || 'N/A') : (t.id ? t.id.toString().split('_')[1] : 'N/A')}</td>
            </tr>
            ` : ''}
            ${isTraffic ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">SEVERITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem; color: ${t.severity === 'HIGH' ? '#ff4757' : (t.severity === 'MODERATE' ? '#ffa502' : '#2ed573')};">
                    ${t.severity}
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VEHICLES INVOLVED</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${t.size}</td>
            </tr>
            ` : ''}
            ${isFlight ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ORIGIN</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #fff; letter-spacing: 2px;">${t.origin || 'UNKNOWN'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">DESTINATION</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #fff; letter-spacing: 2px;">${t.destination || 'UNKNOWN'}</td>
            </tr>
            ` : ''}
            ${(isFlight || t.type === 'satellite') && t.velocityKmH !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VELOCITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>
            ` : ''}
            ${(isFlight || t.type === 'satellite') && t.alt !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ALTITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.alt).toLocaleString()} <span style="font-size: 0.7rem;">m</span></td>
            </tr>
            ` : ''}
            ${isFlight && t.heading !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">HEADING</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.heading)}°</td>
            </tr>
            ` : ''}
            ${t.lat !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">LATITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${t.lat.toFixed(4)}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">LONGITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${t.lng.toFixed(4)}</td>
            </tr>
            ` : ''}
        </table>
    `;

    document.getElementById('target-details').innerHTML = html;

    // ── Post-render: Add HLS Video processing or Snapshot loop ──────
    if (t.type === 'cctv') {
        const camId = `live-cam-${t.id.replace(/[^a-z0-9]/gi,'_')}`;
        
        // If it has natively supported video, the html video tag handles it via src (like UK MP4 S3 URL).
        // If it's an HLS stream (m3u8), we must attach hls.js to it!
        if (t.hls_url) {
            const videoElem = document.getElementById(camId);
            if (videoElem && typeof Hls !== 'undefined' && Hls.isSupported()) {
                if (window._hlsCCTVSession) {
                    window._hlsCCTVSession.destroy();
                }
                const hls = new Hls({
                    maxBufferLength: 5,
                    maxMaxBufferLength: 10
                });
                window._hlsCCTVSession = hls;
                hls.loadSource(t.hls_url);
                hls.attachMedia(videoElem);
                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.warn("HLS Stream Failed. Falling back to proxy snapshots...", data);
                        hls.destroy();
                        
                        if (t.snapshot) {
                            // Seamless graceful degradation to image snapshot loop
                            const parent = videoElem.parentElement;
                            const proxyUrl = '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                            
                            const imgElem = document.createElement('img');
                            imgElem.id = videoElem.id;
                            imgElem.src = proxyUrl;
                            imgElem.style.cssText = videoElem.style.cssText;
                            imgElem.onerror = function() {
                                this.style.opacity = '0.3';
                                const err = document.getElementById(`${camId}-err`);
                                if (err) err.style.display = 'flex';
                            };
                            parent.replaceChild(imgElem, videoElem);
                            
                            // Ignite the 5-second image loop
                            _camRefreshInterval = setInterval(() => {
                                if (_camRefreshInterval === null) return;
                                const currentImg = document.getElementById(camId);
                                if (!currentImg || currentImg.tagName.toLowerCase() === 'video') {
                                    clearInterval(_camRefreshInterval);
                                    _camRefreshInterval = null;
                                    return;
                                }
                                currentImg.src = '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                            }, 5000);
                            
                        } else {
                            videoElem.style.opacity = '0.3';
                            const errOverlay = document.getElementById(`${camId}-err`);
                            if (errOverlay) errOverlay.style.display = 'flex';
                        }
                    }
                });
            }
        }
        // Fallback: Auto-refresh the camera snapshot img every 5 seconds if no video tag
        else if (t.snapshot && !t.video) {
            _camRefreshInterval = setInterval(() => {
                // Stop if a different camera was selected or if the panel was closed
                if (_camRefreshInterval === null) return;
                const img = document.getElementById(camId);
                if (!img || img.tagName.toLowerCase() === 'video') { 
                    clearInterval(_camRefreshInterval); 
                    _camRefreshInterval = null; 
                    return; 
                }
                // Swap src to force-reload the JPEG 
                img.src = t.country === 'UK'
                    ? t.snapshot + '&_t=' + Date.now()
                    : '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
            }, 5000);
        }
        // UK MP4 Loop Auto-Refresh: TfL provides 10s MP4s that infinitely loop. 
        // We force load the absolute newest version from AWS every 60 seconds so it remains "live".
        else if (t.video && !t.hls_url) {
            _camRefreshInterval = setInterval(() => {
                if (_camRefreshInterval === null) return;
                const vid = document.getElementById(camId);
                if (!vid || vid.tagName.toLowerCase() !== 'video') {
                    clearInterval(_camRefreshInterval);
                    _camRefreshInterval = null;
                    return;
                }
                // Refresh the src cleanly
                vid.src = t.video + '?_t=' + Date.now();
                vid.play().catch(e => console.log('Auto-play prevented (background):', e));
            }, 60000);
        }
    }
}


// Search Logic
document.getElementById('target-search').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const query = this.value.toUpperCase();
        const found = state.flights.find(f => f.callsign && f.callsign.includes(query) || f.id === query);
        if (found) {
            lockTarget(found);
            if (found.isMilitary && !state.layers.military) toggleLayer('military');
            if (!found.isMilitary && !state.layers.flights) toggleLayer('flights');
            this.value = '';
        } else {
            alert('Target not found active in airspace.');
        }
    }
});

// Boot Sequence
setTimeout(() => {

    fetchFlights();
    fetchEarthquakes();
    fetchSatellites();
    fetchWeather();
    fetchTraffic();
    fetchCCTVs();

    setInterval(fetchFlights, 15000);
    setInterval(fetchEarthquakes, 60000);
    setInterval(fetchWeather, 300000);

    document.querySelectorAll('.hud-select').forEach(select => {
        select.addEventListener('change', () => {
            if (select.id === 'quake-duration') fetchEarthquakes();
            updateGlobeData();
        });
    });

    // Re-cull visible flights whenever the camera stops moving (pan, zoom, tilt).
    // This ensures the viewport filter stays accurate without running every animation frame.
    viewer.camera.moveEnd.addEventListener(() => {
        if (state.layers.flights || state.layers.military) {
            updateGlobeData();
        }
    });

}, 800);
