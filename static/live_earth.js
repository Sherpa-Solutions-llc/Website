// ----- UI & STATE MANAGEMENT -----
let isMobile = window.innerWidth <= 768;
window.addEventListener('resize', () => { isMobile = window.innerWidth <= 768; });

// Define your Railway backend URL here for production!
// Example: "https://your-custom-app.up.railway.app"
let API_BASE = 'https://sherpa-solutions-api-production.up.railway.app';
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    API_BASE = 'http://127.0.0.1:8001';
}
// The Python Uvicorn backend caches telemetry natively (weather.db, satellites_data.db),
// preventing Localhost IP rate-limit blocks securely without requiring Edge tunneling.

// Performance caps — satellite entities have per-frame CallbackProperty callbacks too;
// keep this reasonable. Flights use viewport culling instead (no hard cap).
const SAT_DISPLAY_CAP = isMobile ? 200 : 1500;

let viewer;
let viewerInitPromise;

const state = {
    layers: {
        flights: true,
        military: false,
        satellites: false,
        earthquakes: false,
        traffic: false,
        weather: false,
        cctv: false,
        police: false,
        scanners: false
    },
    dataSources: {
        flights: 'opensky',
        military: 'adsblol',
        earthquakes: 'usgs',
        satellites: 'celestrak',
        traffic: 'aisstream',
        weather: 'rainviewer',
        cctv: 'public',
        police: 'arcgis',
        scanners: 'broadcastify'
    },
    flights: [],
    satellites: [],
    earthquakes: [],
    weatherData: [],
    traffic: [],
    cctv_cameras: [],
    police_data: [],
    scanners: [],
    target: null,
    lastFetchTime: 0
};

let _fetchingSatellites = false;
let _fetchingEarthquakes = false;
let _fetchingPolice = false;
let _fetchingScanners = false;

// Global DataSources for efficient entity tracking
const flightsDataSource = new Cesium.CustomDataSource('flights');
const militaryDataSource = new Cesium.CustomDataSource('military');
const satellitesDataSource = new Cesium.CustomDataSource('satellites');
const earthquakesDataSource = new Cesium.CustomDataSource('earthquakes');
const cctvDataSource = new Cesium.CustomDataSource('cctvs');
const shippingDataSource = new Cesium.CustomDataSource('shipping');
const weatherDataSource = new Cesium.CustomDataSource('weather');
const policeDataSource = new Cesium.CustomDataSource('police');
const scannersDataSource = new Cesium.CustomDataSource('scanners');

// Active weather imagery layer (RainViewer) — stored outside entities so
// it persists across entity refresh calls
let _weatherImageryLayer = null;
let _weatherLastType = null; // track which layer type is currently applied

// Clock Update
setInterval(() => {
    const now = new Date();
    document.getElementById('clock-display').innerHTML = now.toISOString().replace('T', '<br>').replace('Z', ' UTC');
}, 1000);

// Unify Layout: Move toggle buttons inside layer headers so they are embedded directly in the card panel for all devices
document.querySelectorAll('.layer-row').forEach(row => {
    const toggleBtn = row.querySelector('.layer-toggle-btn');
    const header = row.querySelector('.layer-header');
    if (toggleBtn && header) {
        // Move the toggle button into the header (before the chevron)
        toggleBtn.style.cssText = 'flex-shrink:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:rgba(0,20,30,0.8); border:1px solid rgba(0,210,255,0.3); border-radius:6px; cursor:pointer; margin-left:auto;';
        const chevron = header.querySelector('.layer-chevron');
        if (chevron) {
            header.insertBefore(toggleBtn, chevron);
        } else {
            header.appendChild(toggleBtn);
        }
        // Prevent toggle click from also expanding the layer options
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
});

// Layer Toggles
window.toggleLayerOptions = function(layerName) {
    const el = document.getElementById(`layer-${layerName}`);
    if (el) {
        el.classList.toggle('expanded');
    }
};

window.toggleLayer = function (layerName) {
    state.layers[layerName] = !state.layers[layerName];
    
    const el = document.getElementById(`layer-${layerName}`);
    const toggleBtn = document.getElementById(`toggle-${layerName}`);
    
    let toggleIcon = null;
    if (toggleBtn) {
        toggleIcon = toggleBtn.querySelector('i');
    } else if (el) {
        toggleIcon = el.querySelector('.layer-toggle i');
    }

    if (state.layers[layerName]) {
        if (el) el.classList.add('active');
        if (toggleBtn) toggleBtn.classList.add('active');
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-toggle-on';
        
        // Trigger fetch if we have no data yet
        if (layerName === 'satellites' && state.satellites.length === 0) fetchSatellites();
        if (layerName === 'earthquakes' && state.earthquakes.length === 0) fetchEarthquakes();
        if (layerName === 'weather' && state.weatherData.length === 0) fetchWeather();
        if (layerName === 'traffic' && state.traffic.length === 0) fetchTraffic();
        if (layerName === 'cctv' && state.cctv_cameras.length === 0) fetchCCTVs();
        if (layerName === 'police' && state.police_data.length === 0) fetchPolice();
        if (layerName === 'scanners' && state.scanners.length === 0) fetchScanners();
    } else {
        if (el) el.classList.remove('active');
        if (toggleBtn) toggleBtn.classList.remove('active');
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-toggle-off';
    }

    if (layerName === 'flights' || layerName === 'military') updateFlightsLayer();
    else if (layerName === 'satellites') updateSatellitesLayer();
    else if (layerName === 'earthquakes') updateEarthquakesLayer();
    else if (layerName === 'weather') updateWeatherLayer();
    else if (layerName === 'traffic') updateShippingLayer();
    else if (layerName === 'cctv') updateCCTVLayer();
    else if (layerName === 'police') updatePoliceLayer();
    else if (layerName === 'scanners') updateScannersLayer();
    updateHUDCounts();
};

// Panel Collapse Toggle
window.toggleLayersPanel = function () {
    const panel = document.getElementById('layers-panel');
    const icon = document.getElementById('layers-toggle-icon');
    
    if (panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        icon.className = 'fa-solid fa-chevron-down';
    } else {
        panel.classList.add('collapsed');
        icon.className = 'fa-solid fa-chevron-up';
    }
};

window.toggleSettingsPanel = function() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
    } else {
        modal.style.display = 'none';
    }
};

// Bind settings toggles
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('settings-toggle-btn');
    const closeBtn = document.getElementById('close-settings-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', window.toggleSettingsPanel);
    if (closeBtn) closeBtn.addEventListener('click', window.toggleSettingsPanel);

    // Bind Data Source Checkers
    const bindSource = (layerName, fetchFunc) => {
        const el = document.getElementById(`setting-source-${layerName}`);
        if(el) {
            el.addEventListener('change', (e) => {
                state.dataSources[layerName] = e.target.value;
                console.log(`[Settings] Changed ${layerName} source to:`, e.target.value);
                
                // --- Dynamic Speed Filter Adjustments ---
                if (layerName === 'flights') {
                    const speedSelect = document.getElementById('flight-speed');
                    if (speedSelect) {
                        if (e.target.value === 'opensky') {
                            speedSelect.value = 'all';
                        } else if (e.target.value === 'adsblol') {
                            speedSelect.value = 'all';
                        }
                        // Fire the layer redraw immediately so the speed syncs
                        if (typeof updateFlightsLayer === 'function') updateFlightsLayer();
                    }
                }

                // Wipe local cache array
                state[layerName] = [];
                // Force engine to re-draw and re-fetch if active
                if (state.layers[layerName]) {
                    fetchFunc();
                }
            });
        }
    };

    bindSource('flights', window.fetchFlights);
    bindSource('military', window.updateFlightsLayer); // Shares fetch with civilian usually
    bindSource('earthquakes', window.fetchEarthquakes);
    bindSource('satellites', window.fetchSatellites);
    bindSource('traffic', window.fetchTraffic);
    bindSource('weather', window.fetchWeather);
    bindSource('cctv', window.fetchCCTVs);
});

window.setSystemOffline = function() {
    const indicator = document.getElementById('system-status-indicator');
    const text = document.getElementById('system-status-text');
    if (indicator) indicator.classList.add('offline');
    if (text) text.innerText = 'SYSTEM OFFLINE';
};

window.updateLastFetchTime = function(layerName) {
    const el = document.getElementById(`last-update-${layerName}`);
    if (el) {
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const time = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        el.innerText = `${mm}/${dd}/${yy} ${time}`;
    }
};

// ----- CESIUM INITIALIZATION -----
// Safety fallback: ensure overlay is dismissed after 10s even if initial fetches hang
setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay && overlay.style.display !== 'none') {
        console.warn('[Safety] Forcing overlay dismissal after 10s timeout.');
        overlay.style.display = 'none';
    }
}, 10000);

// --- CESIUM INITIALIZATION ---

async function initCesium() {
    if (typeof Cesium === 'undefined') {
        console.error("Cesium library failed to load.");
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.innerHTML = '<div style="color:red; font-size:2rem; font-family:sans-serif;">FATAL: CESIUM LIBRARY NOT LOADED</div>';
        return;
    }

    try {
        console.log('[Cesium] Initializing Viewer (Async)...');
        
        // Use the modern static factory to ensure compatibility with Cesium 1.107+
        const imageryProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
            { enablePickFeatures: false }
        );

        viewer = new Cesium.Viewer('globe-container', {
            imageryProvider: imageryProvider,
            shouldAnimate: true, // Forces JulianDate to tick forward even if animation UI is hidden
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
            scene3DOnly: true,
            requestRenderMode: false // Disable to ensure smooth initial rendering
        });

        // Setup DataSources
        await viewer.dataSources.add(flightsDataSource);
        await viewer.dataSources.add(militaryDataSource);
        await viewer.dataSources.add(satellitesDataSource);
        await viewer.dataSources.add(earthquakesDataSource);
        await viewer.dataSources.add(cctvDataSource);
        await viewer.dataSources.add(shippingDataSource);
        await viewer.dataSources.add(weatherDataSource);
        await viewer.dataSources.add(policeDataSource);
        await viewer.dataSources.add(scannersDataSource);

        // Setup Police Cluster Features
        policeDataSource.clustering.enabled = true;
        policeDataSource.clustering.pixelRange = 130; // Increased massively so 4x scaled shields absorb each other rather than drawing on top of each other!
        policeDataSource.clustering.minimumClusterSize = 2;
        policeDataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
            const count = clusteredEntities.length;
            const extraScale = Math.log10(count) * 0.075;
            const baseScale = isMobile ? 0.80 : 1.04; // 2x larger again per user request (clusters only)
            const fontSize = count > 99 ? 18 : (count > 9 ? 20 : 22);

            cluster.label.show = true;
            cluster.label.text = count.toLocaleString();
            cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
            cluster.label.fillColor = Cesium.Color.BLACK; // Black text for contrast against blue shield
            cluster.label.outlineColor = Cesium.Color.WHITE;
            cluster.label.outlineWidth = 2; // Thinner outline for better legibility when small
            cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
            cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            
            // Adjust offset to sit right in the center of the shield body
            // Shield is a 0.25 scaled SVG, usually about ~40-50px tall. The origin is CENTER.
            cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0); 
            cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -100.0);
            cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;

            cluster.billboard.show = true;
            cluster.billboard.image = policeSvg;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
            cluster.billboard.disableDepthTestDistance = 0;
            cluster.billboard.scale = baseScale + extraScale;

            cluster.billboard.id = clusteredEntities;
            cluster.label.id = clusteredEntities;
        });

        // Setup Shipping Cluster Features
        shippingDataSource.clustering.enabled = true;
        shippingDataSource.clustering.pixelRange = 40;
        shippingDataSource.clustering.minimumClusterSize = 2;
        shippingDataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
            const count = clusteredEntities.length;
            const extraScale = Math.log10(count) * 0.075;
            const baseScale = isMobile ? 0.20 : 0.26; // Dialed back: ~1/3rd smaller than the 0.40 size
            // Proportionally shrink font bounds to smoothly fill the dialed-back hull
            const fontSize = count > 99 ? 18 : (count > 9 ? 20 : 22);

            cluster.label.show = true;
            cluster.label.text = count.toLocaleString();
            cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
            cluster.label.fillColor = Cesium.Color.BLACK;
            cluster.label.outlineColor = Cesium.Color.WHITE;
            cluster.label.outlineWidth = 3;
            cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
            cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            cluster.label.pixelOffset = new Cesium.Cartesian2(0, 5); 
            cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -100.0);
            cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            
            cluster.billboard.show = true;
            cluster.billboard.image = shipSvg;
            cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.billboard.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
            // Provide occlusion instead of letting clusters bleed through earth
            cluster.billboard.disableDepthTestDistance = 0;
            cluster.billboard.scale = baseScale + extraScale;
            
            
            cluster.billboard.id = clusteredEntities;
            cluster.label.id = clusteredEntities;
        });

        // Setup Flights Cluster Features
        const setupFlightClustering = (dataSource, color) => {
            dataSource.clustering.enabled = true;
            dataSource.clustering.pixelRange = 40;
            dataSource.clustering.minimumClusterSize = 2;

            dataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
                const count = clusteredEntities.length;
                const extraScale = Math.log10(count) * 0.4;
                const baseScale = isMobile ? 0.70 : 0.90;
                const fontSize = Math.floor(14 + (Math.log10(count) * 4));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                
                cluster.label.fillColor = Cesium.Color.BLACK;
                cluster.label.outlineColor = Cesium.Color.WHITE;
                cluster.label.outlineWidth = 4;
                
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -50.0);
                cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                
                cluster.billboard.show = true;
                cluster.billboard.image = airplaneSvg;
                cluster.billboard.color = color;
                cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                cluster.billboard.disableDepthTestDistance = 0;
                cluster.billboard.scale = baseScale + extraScale;
                // Keep clusters flat/unrotated since they represent many different headings
                cluster.billboard.alignedAxis = new Cesium.Cartesian3(0, 0, -1);
                
                cluster.billboard.id = clusteredEntities;
                cluster.label.id = clusteredEntities;
            });
        };

        setupFlightClustering(flightsDataSource, Cesium.Color.WHITE);
        setupFlightClustering(militaryDataSource, Cesium.Color.ORANGE);

        // Setup CCTV Clustering
        const setupCCTVClustering = (dataSource) => {
            dataSource.clustering.enabled = true;
            dataSource.clustering.pixelRange = 40;
            dataSource.clustering.minimumClusterSize = 2;
            dataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
                const count = clusteredEntities.length;
                const extraScale = Math.log10(count) * 0.4;
                const baseScale = isMobile ? 0.7 : 0.9;
                const fontSize = Math.floor(14 + (Math.log10(count) * 4));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                cluster.label.fillColor = Cesium.Color.WHITE;
                cluster.label.outlineColor = Cesium.Color.BLACK;
                cluster.label.outlineWidth = 5;
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -50.0);
                cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                
                cluster.billboard.show = true;
                cluster.billboard.image = cctvSvg;
                cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                cluster.billboard.disableDepthTestDistance = 0;
                cluster.billboard.scale = baseScale + extraScale;
                
                cluster.billboard.id = clusteredEntities;
                cluster.label.id = clusteredEntities;
            });
        };
        setupCCTVClustering(cctvDataSource);

        // Setup Scanners Clustering
        const setupScannersClustering = (dataSource) => {
            dataSource.clustering.enabled = true;
            dataSource.clustering.pixelRange = 40;
            dataSource.clustering.minimumClusterSize = 2;
            dataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
                const count = clusteredEntities.length;
                const extraScale = Math.log10(count) * 0.4;
                const baseScale = isMobile ? 0.35 : 0.45;
                const fontSize = Math.floor(14 + (Math.log10(count) * 4));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                cluster.label.fillColor = Cesium.Color.BLACK;
                cluster.label.outlineColor = Cesium.Color.WHITE;
                cluster.label.outlineWidth = 3;
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0); // Center in the scanner icon
                cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -50.0);
                cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                
                cluster.billboard.show = true;
                cluster.billboard.image = scannerSvg;
                cluster.billboard.color = Cesium.Color.RED;
                cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.billboard.heightReference = Cesium.HeightReference.RELATIVE_TO_GROUND;
                cluster.billboard.disableDepthTestDistance = 0;
                cluster.billboard.scale = baseScale + extraScale;
                
                cluster.billboard.id = clusteredEntities;
                cluster.label.id = clusteredEntities;
            });
        };
        setupScannersClustering(scannersDataSource);

        // Setup Earthquake Clustering
        const setupEarthquakeClustering = (dataSource) => {
            dataSource.clustering.enabled = true;
            dataSource.clustering.pixelRange = 40;
            dataSource.clustering.minimumClusterSize = 2;
            dataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
                const count = clusteredEntities.length;
                const extraScale = Math.log10(count) * 0.2;
                const baseScale = isMobile ? 0.35 : 0.45;
                const fontSize = Math.floor(14 + (Math.log10(count) * 4));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                cluster.label.fillColor = Cesium.Color.BLACK;
                cluster.label.outlineColor = Cesium.Color.WHITE;
                cluster.label.outlineWidth = 4;
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                cluster.label.eyeOffset = new Cesium.Cartesian3(0.0, 0.0, -50.0);
                cluster.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
                
                const pixelBase = isMobile ? 30 : 40;
                cluster.point.show = true;
                cluster.point.color = Cesium.Color.fromHsl(0.16, 1.0, 0.5, 0.9);
                cluster.point.pixelSize = pixelBase + (Math.log10(count) * 20);
                cluster.point.outlineColor = Cesium.Color.YELLOW;
                cluster.point.outlineWidth = 2;
                cluster.point.disableDepthTestDistance = 0;
                
                cluster.point.id = clusteredEntities;
                cluster.label.id = clusteredEntities;
            });
        };
        setupEarthquakeClustering(earthquakesDataSource);

        viewer.targetFrameRate = 30;
        if (isMobile) viewer.resolutionScale = 0.75;
        viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        // Setup Handlers
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        if (!isMobile) {
            handler.setInputAction(function (movement) {
                const pickedObject = viewer.scene.pick(movement.position);
                document.body.style.cursor = (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.customData) ? 'pointer' : 'default';
            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        }
        handler.setInputAction(function (movement) {
            const pickedObject = viewer.scene.pick(movement.position);
            if (Cesium.defined(pickedObject) && pickedObject.id) {

                // --- GEOMETRIC LABEL DETECTION (for mobile flights) ---
                // The callsign label is rendered 22px ABOVE the aircraft billboard.
                // If the user clicked above the entity's screen center, they clicked the label.
                // If at or below, they clicked the aircraft icon.
                let isLabelClick = false;
                if (isMobile && !Array.isArray(pickedObject.id) && pickedObject.id.position) {
                    const entity = pickedObject.id;
                    const entityPos3D = entity.position.getValue(viewer.clock.currentTime);
                    if (entityPos3D) {
                        const entityScreenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, entityPos3D);
                        if (entityScreenPos) {
                            // Label is at pixelOffset (0, -22) above the billboard center
                            // If click Y is above the entity's screen Y, it's a label click
                            isLabelClick = movement.position.y < entityScreenPos.y;
                        }
                    }
                }
                
                let targetIdToLoad = null;

                // If pickedObject.id is an Array, this is a Cesium Cluster!
                if (Array.isArray(pickedObject.id)) {
                    const clusteredEntities = pickedObject.id;
                    if (clusteredEntities.length > 0) {
                        // Pick a random entity directly from the native Cesium cluster payload
                        const randEntity = clusteredEntities[Math.floor(Math.random() * clusteredEntities.length)];
                        if (randEntity.customData) {
                            lockTarget(randEntity.customData, false);
                            return;
                        }
                        targetIdToLoad = randEntity.id || randEntity;
                    }
                } else {
                    // It's a single entity pick
                    if (pickedObject.id.customData) {
                        lockTarget(pickedObject.id.customData, isLabelClick);
                        return; // Fast exit if customData survived
                    } else {
                        targetIdToLoad = pickedObject.id.id || pickedObject.id;
                    }
                }

                if (targetIdToLoad) {
                    // Safe Fallback: Assemble all candidates and lock via ID
                    let allCandidates = [];
                    if (state.layers.traffic) allCandidates = allCandidates.concat((state.traffic || []).map(t => ({...t, type: 'vessel'})));
                    if (state.layers.flights) allCandidates = allCandidates.concat((state.flights || []).map(f => ({...f, type: 'flight'})));
                    if (state.layers.military) allCandidates = allCandidates.concat((state.military || []).map(f => ({...f, type: 'flight', isMilitary: true})));
                    if (state.layers.cctv) allCandidates = allCandidates.concat((state.cctv_cameras || []).map(c => ({...c, type: 'cctv'})));
                    if (state.layers.earthquakes) allCandidates = allCandidates.concat(
                        (state.earthquakes || []).map(q => ({
                            type: 'earthquake', id: q.id, title: q.properties?.title || 'Earthquake', 
                            lat: q.geometry.coordinates[1], lng: q.geometry.coordinates[0], depth: q.geometry.coordinates[2],
                            mag: q.properties?.mag || 1, time: q.properties?.time, 
                            felt: q.properties?.felt, tsunami: q.properties?.tsunami, place: q.properties?.place || q.properties?.flynn_region
                        }))
                    );
                    
                    const match = allCandidates.find(c => c.id === targetIdToLoad || ('vessel_' + c.id) === targetIdToLoad);
                    if (match) {
                        lockTarget(match, isLabelClick);
                    } else {
                        console.warn("Could not resolve backing data for target:", targetIdToLoad);
                    }
                }
                
                // CRITICAL FIX: Even with `selectionIndicator: false`, Cesium natively tries to render 
                // a "selected state" duplicate of the billboard over the original entity when clicked.
                // We must forcibly clear the native selection state immediately to prevent visual ghosting/doubling.
                setTimeout(() => { viewer.selectedEntity = undefined; }, 10);
            }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        
        console.log('[Cesium] Viewer Ready.');
        
        // ----- HUD UPDATER -----
        // Update target HUD panel continuously if active
        viewer.scene.preUpdate.addEventListener(function (scene, time) {
            if (state.target && document.getElementById('target-panel').style.display !== 'none') {
                // ONLY update the HUD constantly for moving targets like flights
                if (state.target.type === 'flight') {
                    renderTargetDetails();
                }
            }
        });

        // Initial data sync - Force background fetches unconditionally so HUD metrics parse correctly
        fetchFlights();
        fetchSatellites();
        fetchEarthquakes();
        fetchCCTVs();
        fetchTraffic();
        fetchPolice();
        fetchScanners();
        if (state.layers.weather) updateWeatherLayer();
        if (state.layers.flights || state.layers.military) updateFlightsLayer();
        
        // Ensure UI displays current empty counts immediately while waiting for fetches
        updateHUDCounts();
        
    } catch (initErr) {
        console.error("CRITICAL FATAL CESIUM INIT ERROR:", initErr);
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }
}

// Start initialization immediately
viewerInitPromise = initCesium();


// ----- AIRPLANE ICON GENERATOR -----
// Base64 encoded SVG to avoid Cesium "Error loading image" bug
const airplaneSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik00NDggMzM2di00MEwyODggMTkyVjc5LjJjMC0xNy43LTE0LjgtMzEuMi0zMi0zMS4ycy0zMiAxMy41LTMyIDMxLjJWMTkyTDY0IDI5NnY0MGwxNjAtNDh2MTEzLjZsLTQ4IDMxLjJWNDY0bDgwLTE2IDgwIDE2di0zMS4ybC00OC0zMS4yVjI4OGwxNjAgNDh6Ii8+PC9zdmc+`;
const militaryAirplaneSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9Im9yYW5nZSIgZD0iTTQ0OCAzMzZ2LTQwTDI4OCAxOTJWNzkuMmMwLTE3LjctMTQuOC0zMS4yLTMyLTMxLjJzLTMyIDEzLjUtMzIgMzEuMlYxOTJMNjQgMjk2djQwbDE2MC00OHYxMTMuNmwtNDggMzEuMlY0NjRsODAtMTYgODAgMTZ2LTMxLjJsLTQ4LTMxLjJWMjg4bDE2MCA0OHoiLz48L3N2Zz4=`;
const satelliteSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjxwYXRoIGZpbGw9IiMyZWQ1NzMiIGQ9Ik05OCA2MmwtODggODhDLTIuNSAxNjIuNS0zLjMgMTgyLjggNS44IDE5NC4ybDU2LjUgNzAuNkwxOCAzMTAuNmMtNy45IDcuOS03LjkgMjAuNiAwIDI4LjVsNzAuOSA3MC45YzcuOSA3LjkgMjAuNiA3LjkgMjguNSAwbDQ1LjgtNDUuOCA3MC42IDU2LjVjMTEuNCA5LjEgMzEuOCA4LjMgNDQuMy00LjJsODgtODhjMTIuNS0xMi41IDEyLjUtMzIuOCAwLTQ1LjNMMTQzLjMgNjJjLTEyLjUtMTIuNS0zMi44LTEyLjUtNDUuMyAwek0xMjggMTYwYy0xNy43IDAtMzItMTQuMy0zMi0zMnMxNC4zLTMyIDMyLTMyIDMyIDE0LjMgMzIgMzItMTQuMyAzMi0zMiAzMnptMzQ0LTk2Yy0xMy4zIDAtMjQgMTAuNy0yNCAyNHMxMC43IDI0IDI0IDI0IDI0LTEwLjcgMjQtMjQtMTAuNy0yNC0yNC0yNHptMCA5NmMtMTMuMyAwLTI0IDEwLjctMjQgMjRzMTAuNyAyNCAyNCAyNCAyNC0xMC43IDI0LTI0LTEwLjctMjQtMjQtMjR6bTAgOTZjLTEzLjMgMC0yNCAxMC43LTI0IDI0czEwLjcgMjQgMjQgMjQgMjQtMTAuNyAyNC0yNC0xMC43LTI0LTI0LTI0eiIvPjwvc3ZnPg==`;
const rawShipSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="#ff6b81" d="M192 32c0-17.7 14.3-32 32-32L352 0c17.7 0 32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 128 44.4 14.8c23.1 7.7 29.5 37.5 11.5 53.9l-101 92.6c-16.2 9.4-34.7 15.1-50.9 15.1c-19.6 0-40.8-7.7-59.2-20.3c-22.1-15.5-51.6-15.5-73.7 0c-17.1 11.8-38 20.3-59.2 20.3c-16.2 0-34.7-5.7-50.9-15.1l-101-92.6c-18-16.5-11.6-46.2 11.5-53.9L96 240l0-128c0-26.5 21.5-48 48-48l48 0 0-32zM160 218.7l107.8-35.9c13.1-4.4 27.3-4.4 40.5 0L416 218.7l0-90.7-256 0 0 90.7zM306.5 421.9C329 437.4 356.5 448 384 448c26.9 0 55.4-10.8 77.4-26.1c0 0 0 0 0 0c11.9-8.5 28.1-7.8 39.2 1.7c14.4 11.9 32.5 21 50.6 25.2c17.2 4 27.9 21.2 23.9 38.4s-21.2 27.9-38.4 23.9c-24.5-5.7-44.9-16.5-58.2-25C449.5 501.7 417 512 384 512c-31.9 0-60.6-9.9-80.4-18.9c-5.8-2.7-11.1-5.3-15.6-7.7c-4.5 2.4-9.7 5.1-15.6 7.7c-19.8 9-48.5 18.9-80.4 18.9c-33 0-65.5-10.3-94.5-25.8c-13.4 8.4-33.7 19.3-58.2 25c-17.2 4-34.4-6.7-38.4-23.9s6.7-34.4 23.9-38.4c18.1-4.2 36.2-13.3 50.6-25.2c11.1-9.4 27.3-10.1 39.2-1.7c0 0 0 0 0 0C136.7 437.2 165.1 448 192 448c27.5 0 55-10.6 77.5-26.1c11.1-7.9 25.9-7.9 37 0z"/></svg>`;
const shipSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(rawShipSvg);
const cctvSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiPjxwYXRoIGZpbGw9IiMwMGQyZmYiIGQ9Ik0wIDEyOEMwIDkyLjcgMjguNyA2NCA2NCA2NEgzMjBjMzUuMyAwIDY0IDI4LjcgNjQgNjRWMzg0YzAgMzUuMy0yOC43IDY0LTY0IDY0SDY0Yy0zNS4zIDAtNjQtMjguNy02NC02NFYxMjh6TTU1OS4xIDk5LjhjMTAuNCA1LjYgMTYuOSAxNi40IDE2LjkgMjguMlYzODRjMCAxMS44LTYuNSAyMi42LTE2LjkgMjguMnMtMjMgNS0zMi45LTEuNmwtOTYtNjRMNDE2IDMzNy4xVjMyMCAxOTIgMTc0LjlsMTQuMi05LjUgOTYtNjRjOS44LTYuNSAyMi41LTcuMiAzMi45LTEuNnoiLz48L3N2Zz4=`;
const policeSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiMwZDQ3YTEiIGQ9Ik0yNTYgMGM0LjYgMCA5LjIgMSAxMy40IDIuOUw0NTcuNyA4Mi44YzIyIDkuMyAzOC40IDMxIDM4LjMgNTcuMmMtLjUgOTkuMi00MS4zIDI4MC43LTIxMy42IDM2My4yYy0xNi43IDgtMzYuMSA4LTUyLjggMEM1Ny4zIDQyMC43IDE2LjUgMjM5LjIgMTYgMTQwYy0uMS0yNi4yIDE2LjMtNDcuOSAzOC4zLTU3LjJMMjQyLjcgMi45QzI0Ni44IDEgMjUxLjQgMCAyNTYgMHoiLz48L3N2Zz4=`;
const scannerSvg = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODQgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiNkMzJmMmYiIGQ9Ik0xMTIgMjRjMC0xMy4zLTEwLjctMjQtMjQtMjRTNjQgMTAuNyA2NCAyNGwwIDcyTDQ4IDk2QzIxLjUgOTYgMCAxMTcuNSAwIDE0NEwwIDMwMC4xYzAgMTIuNyA1LjEgMjQuOSAxNC4xIDMzLjlsMy45IDMuOWM5IDkgMTQuMSAyMS4yIDE0LjEgMzMuOUwzMiA0NjRjMCAyNi41IDIxLjUgNDggNDggNDhsMjI0IDBjMjYuNSAwIDQ4LTIxLjUgNDgtNDhsMC05Mi4xYzAtMTIuNyA1LjEtMjQuOSAxNC4xLTMzLjlsMy45LTMuOWM5LTkgMTQuMS0yMS4yIDE0LjEtMzMuOUwzODQgMTQ0YzAtMjYuNS0yMS41LTQ4LTQ4LTQ4bC0xNiAwYzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMybC0zMiAwYzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMybC00OCAwIDAtNzJ6bTAgMTM2bDE2MCAwYzguOCAwIDE2IDcuMiAxNiAxNnMtNy4yIDE2LTE2IDE2bC0xNjAgMGMtOC44IDAtMTYtNy4yLTE2LTE2czcuMi0xNiAxNi0xNnptMCA2NGwxNjAgMGM4LjggMCAxNiA3LjIgMTYgMTZzLTcuMiAxNi0xNiAxNmwtMTYwIDBjLTguOCAwLTE2LTcuMi0xNi0xNnM3LjItMTYgMTYtMTZ6bTAgNjRsMTYwIDBjOC44IDAgMTYgNy4yIDE2IDE2cy03LjIgMTYtMTYgMTZsLTE2MCAwYy04LjggMC0xNi03LjItMTYtMTZzNy4yLTE2IDE2LTE2em0wIDY0bDE2MCAwYzguOCAwIDE2IDcuMiAxNiAxNnMtNy4yIDE2LTE2IDE2bC0xNjAgMGMtOC44IDAtMTYtNy4yLTE2LTE2czcuMi0xNiAxNi0xNnoiLz48L3N2Zz4=`;

// ----- NEW DATA FETCHING (Police & Scanners) -----
async function fetchPolice() {
    if (_fetchingPolice) return;
    _fetchingPolice = true;
    try {
        const res = await fetch(`${API_BASE}/api/police-data`);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        state.police_data = []; // Explicit clear
        state.police_data = data || [];
        window.updateLastFetchTime('police');
        updateHUDCounts();
        populatePoliceDropdowns();
        if (state.layers.police) updatePoliceLayer();
    } catch (e) { console.error('Police fetch failed', e); }
    finally { _fetchingPolice = false; }
}

// --- Cascading Police Dropdown Filters ---
function populatePoliceDropdowns() {
    const data = state.police_data || [];
    const sourceEl = document.getElementById('setting-source-police');
    const countryEl = document.getElementById('police-country-filter');
    const stateEl = document.getElementById('police-state-filter');
    const cityEl = document.getElementById('police-city-filter');
    const stationEl = document.getElementById('police-station-filter');
    if (!countryEl) return;

    const countries = [...new Set(data.map(s => s.country).filter(Boolean))].sort();
    countryEl.innerHTML = '<option value="all">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
    stateEl.innerHTML = '<option value="all">All States</option>';
    cityEl.innerHTML = '<option value="all">All Cities</option>';
    stationEl.innerHTML = '<option value="all">All Stations</option>';
}

window.filterPoliceDropdowns = function(level) {
    const data = state.police_data || [];
    const sourceEl = document.getElementById('setting-source-police');
    const countryEl = document.getElementById('police-country-filter');
    const stateEl = document.getElementById('police-state-filter');
    const cityEl = document.getElementById('police-city-filter');
    const stationEl = document.getElementById('police-station-filter');
    if (!countryEl) return;

    const selSource = sourceEl ? sourceEl.value : 'all';
    const selCountry = countryEl.value;
    const selState = stateEl.value;
    const selCity = cityEl.value;

    let filtered = data;
    if (selSource !== 'all') filtered = filtered.filter(s => (s.source || 'arcgis') === selSource);

    if (level === 'source') {
        const countries = [...new Set(filtered.map(s => s.country).filter(Boolean))].sort();
        countryEl.innerHTML = '<option value="all">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
        stateEl.innerHTML = '<option value="all">All States</option>';
        cityEl.innerHTML = '<option value="all">All Cities</option>';
        stationEl.innerHTML = '<option value="all">All Stations</option>';
    }

    if (selCountry !== 'all') filtered = filtered.filter(s => s.country === selCountry);

    if (level === 'country') {
        const states = [...new Set(filtered.map(s => s.state).filter(Boolean))].sort();
        stateEl.innerHTML = '<option value="all">All States</option>' + states.map(s => `<option value="${s}">${s}</option>`).join('');
        cityEl.innerHTML = '<option value="all">All Cities</option>';
        stationEl.innerHTML = '<option value="all">All Stations</option>';
    }

    if (level === 'country' || level === 'state') {
        if (selState !== 'all') filtered = filtered.filter(s => s.state === selState);
        if (level === 'state') {
            const cities = [...new Set(filtered.map(s => s.city).filter(Boolean))].sort();
            cityEl.innerHTML = '<option value="all">All Cities</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
            stationEl.innerHTML = '<option value="all">All Stations</option>';
        }
    }

    if (level === 'city' || level === 'station') {
        if (selState !== 'all') filtered = filtered.filter(s => s.state === selState);
        if (selCity !== 'all') filtered = filtered.filter(s => s.city === selCity);
        if (level === 'city') {
            stationEl.innerHTML = '<option value="all">All Stations</option>' + filtered.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    }

    // Re-render map markers with the current filter selection
    if (state.layers.police) updatePoliceLayer();
};

function getFilteredPolice() {
    let filtered = state.police_data || [];
    const sourceEl = document.getElementById('setting-source-police');
    const countryEl = document.getElementById('police-country-filter');
    const stateEl = document.getElementById('police-state-filter');
    const cityEl = document.getElementById('police-city-filter');
    const stationEl = document.getElementById('police-station-filter');

    if (sourceEl && sourceEl.value !== 'all') filtered = filtered.filter(s => (s.source || 'arcgis') === sourceEl.value);
    if (countryEl && countryEl.value !== 'all') filtered = filtered.filter(s => s.country === countryEl.value);
    if (stateEl && stateEl.value !== 'all') filtered = filtered.filter(s => s.state === stateEl.value);
    if (cityEl && cityEl.value !== 'all') filtered = filtered.filter(s => s.city === cityEl.value);
    if (stationEl && stationEl.value !== 'all') filtered = filtered.filter(s => s.id === stationEl.value);
    return filtered;
}

function updatePoliceLayer() {
    if (!viewer) return;
    if (state.layers.police) {
        const filtered = getFilteredPolice();
        policeDataSource.entities.removeAll(); // Ensure Cluster manager sees this event clearly before suspending!
        policeDataSource.entities.suspendEvents();
        filtered.forEach(p => {
            policeDataSource.entities.add({
                id: 'police_' + p.id,
                position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, 0),
                billboard: {
                    image: policeSvg,
                    scale: isMobile ? 0.70 : 0.90, // Doubled from 0.35 : 0.45 per user request
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                customData: {
                    type: 'police', id: p.id, title: p.name || 'Police Station',
                    lat: p.lat, lng: p.lng,
                    address: p.address || '', phone: p.phone || '',
                    country: p.country, state: p.state, city: p.city
                }
            });
        });
        policeDataSource.entities.resumeEvents();
    } else {
        policeDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

async function fetchScanners() {
    if (_fetchingScanners) return;
    _fetchingScanners = true;
    try {
        const res = await fetch(`${API_BASE}/api/scanners`);
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        state.scanners = data || [];
        window.updateLastFetchTime('scanners');
        updateHUDCounts();
        populateScannerDropdowns();
        if (state.layers.scanners) updateScannersLayer();
    } catch (e) { console.error('Scanners fetch failed', e); }
    finally { _fetchingScanners = false; }
}

// --- Cascading Scanner Dropdown Filters ---
function populateScannerDropdowns() {
    const data = state.scanners || [];
    const sourceEl = document.getElementById('setting-source-scanners');
    const countryEl = document.getElementById('scanner-country-filter');
    const stateEl = document.getElementById('scanner-state-filter');
    const cityEl = document.getElementById('scanner-city-filter');
    const feedEl = document.getElementById('scanner-feed-filter');
    if (!countryEl) return;

    const countries = [...new Set(data.map(s => s.country).filter(Boolean))].sort();
    countryEl.innerHTML = '<option value="all">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
    stateEl.innerHTML = '<option value="all">All States</option>';
    cityEl.innerHTML = '<option value="all">All Locations</option>';
    feedEl.innerHTML = '<option value="all">All Feeds</option>';
}

window.filterScannerDropdowns = function(level) {
    const data = state.scanners || [];
    const sourceEl = document.getElementById('setting-source-scanners');
    const countryEl = document.getElementById('scanner-country-filter');
    const stateEl = document.getElementById('scanner-state-filter');
    const cityEl = document.getElementById('scanner-city-filter');
    const feedEl = document.getElementById('scanner-feed-filter');
    if (!countryEl) return;

    const selSource = sourceEl ? sourceEl.value : 'all';
    const selCountry = countryEl.value;
    const selState = stateEl.value;
    const selCity = cityEl.value;

    let filtered = data;
    if (selSource !== 'all') filtered = filtered.filter(s => (s.source || 'broadcastify') === selSource);

    if (level === 'source') {
        // Reset all downstream
        const countries = [...new Set(filtered.map(s => s.country).filter(Boolean))].sort();
        countryEl.innerHTML = '<option value="all">All Countries</option>' + countries.map(c => `<option value="${c}">${c}</option>`).join('');
        stateEl.innerHTML = '<option value="all">All States</option>';
        cityEl.innerHTML = '<option value="all">All Locations</option>';
        feedEl.innerHTML = '<option value="all">All Feeds</option>';
    }

    if (selCountry !== 'all') filtered = filtered.filter(s => s.country === selCountry);

    if (level === 'country') {
        const states = [...new Set(filtered.map(s => s.state).filter(Boolean))].sort();
        stateEl.innerHTML = '<option value="all">All States</option>' + states.map(s => `<option value="${s}">${s}</option>`).join('');
        cityEl.innerHTML = '<option value="all">All Locations</option>';
        feedEl.innerHTML = '<option value="all">All Feeds</option>';
    }

    if (level === 'country' || level === 'state') {
        if (selState !== 'all') filtered = filtered.filter(s => s.state === selState);
        if (level === 'state') {
            const cities = [...new Set(filtered.map(s => s.city).filter(Boolean))].sort();
            cityEl.innerHTML = '<option value="all">All Locations</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
            feedEl.innerHTML = '<option value="all">All Feeds</option>';
        }
    }

    if (level === 'city' || level === 'feed') {
        if (selState !== 'all') filtered = filtered.filter(s => s.state === selState);
        if (selCity !== 'all') filtered = filtered.filter(s => s.city === selCity);
        if (level === 'city') {
            feedEl.innerHTML = '<option value="all">All Feeds</option>' + filtered.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
    }

    // Re-render map markers with the current filter selection
    if (state.layers.scanners) updateScannersLayer();
};

function getFilteredScanners() {
    let filtered = state.scanners || [];
    const sourceEl = document.getElementById('setting-source-scanners');
    const countryEl = document.getElementById('scanner-country-filter');
    const stateEl = document.getElementById('scanner-state-filter');
    const cityEl = document.getElementById('scanner-city-filter');
    const feedEl = document.getElementById('scanner-feed-filter');

    if (sourceEl && sourceEl.value !== 'all') filtered = filtered.filter(s => (s.source || 'broadcastify') === sourceEl.value);
    if (countryEl && countryEl.value !== 'all') filtered = filtered.filter(s => s.country === countryEl.value);
    if (stateEl && stateEl.value !== 'all') filtered = filtered.filter(s => s.state === stateEl.value);
    if (cityEl && cityEl.value !== 'all') filtered = filtered.filter(s => s.city === cityEl.value);
    if (feedEl && feedEl.value !== 'all') filtered = filtered.filter(s => s.id === feedEl.value);
    return filtered;
}

function updateScannersLayer() {
    if (!viewer) return;
    if (state.layers.scanners) {
        const filtered = getFilteredScanners();
        scannersDataSource.entities.removeAll(); // Ensure cluster manager cleans up visuals first
        scannersDataSource.entities.suspendEvents();
        filtered.forEach(s => {
            scannersDataSource.entities.add({
                id: 'scanner_' + s.id,
                position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, 0),
                billboard: {
                    image: scannerSvg,
                    color: Cesium.Color.RED,
                    scale: isMobile ? 0.42 : 0.54,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                customData: {
                    type: 'scanner', id: s.id, title: s.name || 'Scanner',
                    lat: s.lat, lng: s.lng,
                    audio_url: s.audio_url, feed_id: s.feed_id || '',
                    listeners: s.listeners || 0, status: s.status || 'online',
                    country: s.country, state: s.state, city: s.city
                }
            });
        });
        scannersDataSource.entities.resumeEvents();
    } else {
        scannersDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

// ----- DATA FETCHING -----

async function fetchFlights() {
    try {
        let activeStates = [];
        let militaryStates = [];
        let timestamp = Math.floor(Date.now() / 1000);

        if (state.dataSources.flights === 'opensky') {
            const res = await fetch(`${API_BASE}/api/flights`);
            if (!res.ok) throw new Error('OpenSky API Error');
            const data = await res.json();
            timestamp = data.time || timestamp;
            activeStates = data.states || [];
            console.log(`[Flights] Fetched ${activeStates.length} raw states from OpenSky API`);
            
            try {
                const milRes = await fetch(`${API_BASE}/api/military-flights`);
                if (milRes.ok) {
                    const milData = await milRes.json();
                    militaryStates = milData.states || [];
                    console.log(`[Flights] Fetched ${militaryStates.length} military states from backend`);
                }
            } catch (e) {
                console.warn("[Flights] Failed to fetch military states:", e);
            }
        } else if (state.dataSources.flights === 'adsblol') {
            const res = await fetch(`${API_BASE}/api/proxy/adsblol/ladd`);
            if (!res.ok) throw new Error('ADSB.lol Proxy API Error');
            const data = await res.json();
            timestamp = Math.floor(data.now / 1000) || timestamp;
            
            const ac = data.ac || [];
            activeStates = ac.filter(a => a.lat !== undefined && a.lon !== undefined).map(a => {
                let trueVel = (a.mach || 0.8) * 340;
                if (typeof a.gs === 'number') trueVel = a.gs * 0.51444; 
                else if (typeof a.tas === 'number') trueVel = a.tas * 0.51444;
                
                return [
                    a.hex || 'UNKNOWN',     // [0] icao24
                    (a.flight || '').trim() || 'UNKNOWN', // [1] callsign
                    'Unknown',              // [2] origin_country
                    null,                   // [3] time_position
                    null,                   // [4] last_contact
                    a.lon,                  // [5] longitude
                    a.lat,                  // [6] latitude
                    (typeof a.alt_baro === 'number' ? a.alt_baro : 10000), // [7] baro_altitude
                    false,                  // [8] on_ground
                    trueVel,                // [9] velocity (m/s)
                    a.track || 0,           // [10] true_track
                    0,                      // [11] vertical_rate
                    null,                   // [12] sensors
                    a.alt_geom || null,     // [13] geo_altitude
                    null,                   // [14] squawk
                    false,                  // [15] spi
                    0                       // [16] position_source
                ];
            });
            console.log(`[Flights] Fetched ${activeStates.length} raw states from ADSB proxy`);
            
            // Parallel military fetch for direct mode
            try {
                const milRes = await fetch(`${API_BASE}/api/proxy/adsblol/mil`);
                if (milRes.ok) {
                    const milData = await milRes.json();
                    const milAc = milData.ac || [];
                    militaryStates = milAc.filter(a => a.lat !== undefined && a.lon !== undefined).map(a => {
                        let vel = (a.mach || 0.8) * 340;
                        if (a.gs) vel = a.gs * 0.51444;
                        else if (a.tas) vel = a.tas * 0.51444;
                        return [
                            a.hex || 'UNKNOWN', 
                            (a.flight || '').trim() || 'UNKNOWN', 
                            'Unknown', 
                            null, null,
                            a.lon, a.lat, (typeof a.alt_baro === 'number' ? a.alt_baro : 10000), false, vel, a.track || 0
                        ];
                    });
                    console.log(`[Flights] Fetched ${militaryStates.length} military states from ADSB.lol`);
                }
            } catch (e) {
                console.warn("[Flights] Failed to fetch direct military states:", e);
            }
        }

        // Always hide the loading overlay as soon as we get any valid response
        document.getElementById('loading-overlay').style.display = 'none';

        const oldFlightsMap = new Map(state.flights.map(f => [f.id, f]));
        
        // Tag and merge arrays
        activeStates.forEach(s => s.is_mil_source = false);
        militaryStates.forEach(s => s.is_mil_source = true);
        const allStates = activeStates.concat(militaryStates);

        state.flights = allStates
            .filter(s => s[5] !== null && s[6] !== null)
            .map(s => {
                try {
                    const velocityKmH = (s[9] || 0) * 3.6;
                    // Trust the backend/API endpoint explicitly rather than guessing callsigns
                    const isMilitary = s.is_mil_source === true;

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

                    const oldFlight = oldFlightsMap.get(s[0]);
                    if (oldFlight) {
                        // True API target (Destination)
                        const targetLat = s[6];
                        const targetLng = s[5];
                        
                        // Current visual location (Origination)
                        const startLat = typeof oldFlight.lat === 'number' ? oldFlight.lat : targetLat;
                        const startLng = typeof oldFlight.lng === 'number' ? oldFlight.lng : targetLng;

                        // Calculate path from Origination -> Destination
                        const lat1 = Cesium.Math.toRadians(startLat);
                        const lon1 = Cesium.Math.toRadians(startLng);
                        const lat2 = Cesium.Math.toRadians(targetLat);
                        const lon2 = Cesium.Math.toRadians(targetLng);

                        const dLon = lon2 - lon1;
                        const dLat = lat2 - lat1;

                        // Haversine distance
                        const a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
                        const c = 2 * Math.asin(Math.sqrt(a));
                        const distanceMeters = c * 6371000;

                        // Bearing
                        const y = Math.sin(dLon) * Math.cos(lat2);
                        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
                        let brng = Math.atan2(y, x);

                        // If the distance is too small (e.g. stationary or extremely slow), fallback to API heading
                        if (distanceMeters < 1) {
                            brng = Cesium.Math.toRadians(s[10] || 0); 
                        }

                        // Plot course: 10 second travel time to destination
                        oldFlight.startLat = startLat;
                        oldFlight.startLng = startLng;
                        
                        // The mathematically perfect speed to reach destination exactly when next data arrives
                        oldFlight.computedVelocity = distanceMeters / 10.0; 
                        oldFlight.computedHeading = Cesium.Math.toDegrees(brng); 
                        
                        // Retain true API properties for UI filtering and visual nose rotation
                        oldFlight.trueVelocity = s[9] || 0;
                        oldFlight.trueVelocityKmH = oldFlight.trueVelocity * 3.6; 
                        oldFlight.trueHeading = s[10] || 0;

                        // Update alignedAxis based on true airplane nose heading (crosswind/crab angle support)
                        const trueHeadingRad = Cesium.Math.toRadians(oldFlight.trueHeading);
                        const cH = Math.cos(trueHeadingRad), sH = Math.sin(trueHeadingRad);
                        const eastX_true = -Math.sin(lon2), eastY_true = Math.cos(lon2), eastZ_true = 0;
                        const northX_true = -Math.sin(lat2) * Math.cos(lon2), northY_true = -Math.sin(lat2) * Math.sin(lon2), northZ_true = Math.cos(lat2);
                        oldFlight.alignedAxis = new Cesium.Cartesian3(
                            northX_true * cH + eastX_true * sH,
                            northY_true * cH + eastY_true * sH,
                            northZ_true * cH + eastZ_true * sH
                        );

                        // Reset fetch time to reboot the integration engine
                        oldFlight.fetchTime = performance.now();
                        oldFlight.alt = s[8] ? (s[7] || 0) : (s[7] || 10000);
                        oldFlight.lastUpdate = timestamp;
                        oldFlight.isMilitary = isMilitary;
                        
                        // For UI filtering
                        oldFlight.velocityKmH = oldFlight.trueVelocityKmH;
                        
                        return oldFlight;
                    }

                    return {
                        id: s[0],
                        callsign: s[1] ? s[1].trim() : 'UNKNOWN',
                        country: s[2],
                        startLng: s[5], 
                        startLat: s[6],
                        lng: s[5], 
                        lat: s[6],
                        alt: s[8] ? (s[7] || 0) : (s[7] || 10000),
                        velocity: s[9] || 0,
                        computedVelocity: s[9] || 0, // Fallback for first frame
                        velocityKmH: velocityKmH,
                        heading: s[10] || 0,
                        computedHeading: s[10] || 0, // Fallback for first frame
                        trueHeading: s[10] || 0,
                        alignedAxis: alignedAxis,
                        lastUpdate: timestamp,
                        fetchTime: performance.now(),
                        isMilitary: isMilitary,
                        type: 'flight'
                    };
                } catch(err) {
                    console.error("Failed to map flight:", s, err);
                    return null;
                }
            })
            .filter(f => f !== null);

        document.getElementById('loading-overlay').style.display = 'none';
        window.updateLastFetchTime('flights');
        window.updateLastFetchTime('military');
        updateFlightsLayer();
        updateHUDCounts();
    } catch (e) {
        console.error("Flight fetch failed:", e);
        window.setSystemOffline();
        document.getElementById('loading-overlay').style.display = 'none';
        setTimeout(fetchFlights, 10000);
    }
}

async function fetchEarthquakes() {
    if (_fetchingEarthquakes) return;
    _fetchingEarthquakes = true;
    try {
        const duration = document.getElementById('quake-duration')?.value || 'day';
        // Use our local proxy to avoid CORS issues and ensure reliable fetching
        let url = `${API_BASE}/api/earthquakes?duration=${duration == 'days' ? 'day' : (duration == 'weeks' ? 'week' : 'month')}`;

        if (state.dataSources.earthquakes === 'emsc') {
            const limit = duration === 'weeks' ? 2000 : (duration === 'months' ? 5000 : 500);
            url = `https://www.seismicportal.eu/fdsnws/event/1/query?limit=${limit}&format=json`;
        }

        const res = await fetch(url);
        const data = await res.json();
        if (!data || !data.features) {
            console.warn('[Earthquakes] Invalid data received:', data);
            return;
        }
        // Store as features to match updateGlobeData's expectation
        state.earthquakes = data.features;
        console.log(`[Earthquakes] Loaded ${state.earthquakes.length} events.`);
        window.updateLastFetchTime('earthquakes');
        updateEarthquakesLayer();
        updateHUDCounts();
    } catch (e) {
        console.error("Earthquake fetch failed:", e);
        window.setSystemOffline();
    } finally {
        _fetchingEarthquakes = false;
    }
}

async function fetchSatellites() {
    if (_fetchingSatellites) return;
    _fetchingSatellites = true;
    console.log('[Satellites] Fetching cached satellite definitions from local database...');
    try {
        const res = await fetch(`${API_BASE}/api/satellites`);
        if (!res.ok) throw new Error('Proxy API Error');
        const data = await res.json();

        if (!data || data.length === 0) throw new Error('Empty satellite response');

        state.satellites = [];
        let parseErrors = 0;

        for (let i = 0; i < data.length; i++) {
            const sat = data[i];
            const name = sat.name.trim();
            const tleLine1 = sat.line1.trim();
            const tleLine2 = sat.line2.trim();
            const subtype = sat.type; // explicitly provided by the backend now
            const country = sat.country;
            const status = sat.status;

            // Validate TLE format
            if (!tleLine1.startsWith('1 ') || !tleLine2.startsWith('2 ')) {
                parseErrors++;
                continue;
            }

            try {
                // Initialize satellite record using satellite.js
                const satRec = satellite.twoline2satrec(tleLine1, tleLine2);
                if (!satRec || satRec.error !== 0) continue; // skip invalid records

                const catalogNum = tleLine1.substring(2, 7).trim();
                const satId = name + '_' + catalogNum;

                state.satellites.push({
                    id: satId,
                    type: 'satellite',
                    subtype: subtype,
                    country: country,
                    status: status,
                    satRec: satRec
                });
            } catch (parseErr) {
                parseErrors++; // skip malformed entries silently
            }
        }
        console.log(`[Satellites] Parsed ${state.satellites.length} satellites (${parseErrors} skipped).`);
        window.updateLastFetchTime('satellites');
        updateSatellitesLayer();
        updateHUDCounts();
    } catch (e) {
        console.error("Satellite fetch failed:", e);
        window.setSystemOffline();
    } finally {
        _fetchingSatellites = false;
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
        window.updateLastFetchTime('cctv');
        if (state.layers.cctv) {
            updateCCTVLayer();
            updateHUDCounts();
        }
    } catch (e) {
        console.warn('[CCTV] /api/cameras failed, falling back to static file:', e);
        try {
            const res2 = await fetch('/static/insecam_data.json');
            if (!res2.ok) throw new Error('static file also missing');
            const data = await res2.json();
            state.cctv_cameras = data;
            if (state.layers.cctv) {
                updateCCTVLayer();
                updateHUDCounts();
            }
        } catch (e2) {
            console.error('[CCTV] All camera sources failed:', e2);
            window.setSystemOffline();
        }
    }
}

async function fetchWeather() {
    try {
        // Fetch temperatures directly from our persistent SQLite backend cache
        const url = `${API_BASE}/api/weather-proxy?_t=` + Date.now();
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const dataArr = await res.json();

        state.weatherData = dataArr.map(d => ({
            city: d.city,
            lat: d.lat,
            lng: d.lng,
            temp: d.temp,
            unit: d.unit
        })).filter(w => w.temp !== null && w.temp !== undefined);

        console.log(`[Weather] Temperature data loaded for ${state.weatherData.length} cities`);
        window.updateLastFetchTime('weather');
        if (state.layers.weather) {
            updateWeatherLayer();
            updateHUDCounts();
        }
    } catch (e) {
        console.error("Weather fetch failed:", e);
        window.setSystemOffline();
    }
}

function fetchTraffic() {
    try {
        fetch(`${API_BASE}/api/vessels?_t=` + Date.now())
            .then(res => res.json())
            .then(data => {
                // Ensure data is an array
                if (!Array.isArray(data)) return;
                
                // If the array is empty, clear the traffic state
                if (data.length === 0) {
                    state.traffic = [];
                    updateShippingLayer();
                    updateHUDCounts();
                    return;
                }
                
                const oldTrafficMap = new Map(state.traffic.map(t => [t.id, t]));

                // Update traffic state with new data
                state.traffic = data.map(v => {
                    const oldVessel = oldTrafficMap.get(v.id);
                    if (oldVessel) {
                        // True API target (Destination)
                        const targetLat = v.lat;
                        const targetLng = v.lng;
                        
                        // Current visual location (Origination)
                        const startLat = typeof oldVessel.lat === 'number' ? oldVessel.lat : targetLat;
                        const startLng = typeof oldVessel.lng === 'number' ? oldVessel.lng : targetLng;
                        
                        // Calculate path from Origination -> Destination
                        const lat1 = Cesium.Math.toRadians(startLat);
                        const lon1 = Cesium.Math.toRadians(startLng);
                        const lat2 = Cesium.Math.toRadians(targetLat);
                        const lon2 = Cesium.Math.toRadians(targetLng);

                        const dLon = lon2 - lon1;
                        const dLat = lat2 - lat1;

                        const a = Math.pow(Math.sin(dLat / 2), 2) +
                                  Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
                        const aClamped = Math.min(1, Math.max(0, a));
                        const c = 2 * Math.atan2(Math.sqrt(aClamped), Math.sqrt(1 - aClamped));
                        const earthRadiusMeter = 6371000;
                        const distMeters = earthRadiusMeter * c;

                        // Target polling interval for vessels is ~30s
                        let computedVelocity = distMeters / 30; 
                        
                        const y = Math.sin(dLon) * Math.cos(lat2);
                        const x = Math.cos(lat1) * Math.sin(lat2) -
                                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
                        let computedHeading = Math.atan2(y, x);

                        // If no distance traveled, hold position gracefully
                        if (distMeters < 1) {
                            computedVelocity = 0;
                            computedHeading = Cesium.Math.toRadians(oldVessel.heading || v.heading || 0);
                        }

                        oldVessel.startLat = startLat;
                        oldVessel.startLng = startLng;
                        oldVessel.fetchTime = performance.now();
                        
                        oldVessel.trueHeading = v.heading || 0;
                        oldVessel.computedHeading = computedHeading;
                        oldVessel.computedVelocity = computedVelocity;
                        
                        oldVessel.velocityKmH = v.velocityKmH || 0;
                        oldVessel.lastUpdate = v.lastUpdate;
                        return oldVessel;
                    }
                    
                    v.fetchTime = performance.now();
                    v.startLat = v.lat;
                    v.startLng = v.lng;
                    v.computedVelocity = 0;
                    v.computedHeading = Cesium.Math.toRadians(v.heading || 0);
                    v.trueHeading = v.heading || 0;
                    return v;
                });
            window.updateLastFetchTime('traffic');
            if (state.layers.traffic) {
                updateShippingLayer();
                updateHUDCounts();
            }
            })
            .catch(err => { console.error("AIS proxy fetch error:", err); window.setSystemOffline(); });
    } catch (e) {
        console.error("Traffic update failed:", e);
        window.setSystemOffline();
    }
}

function filterBySpeed(f, speedRange) {
    if (speedRange === 'all') return true;
    const hSpeed = f.trueVelocityKmH || f.velocityKmH || 0;
    if (speedRange === '0-500' && hSpeed <= 500) return true;
    if (speedRange === '500-1000' && hSpeed > 500 && hSpeed <= 1000) return true;
    if (speedRange === '1000+' && hSpeed > 1000) return true;
    return false;
}

function filterByType(f, type) {
    if (type === 'all') return true;
    
    // Heuristic: Commercial flights typically have a 3-letter ICAO airline code followed by numbers
    // Private (General Aviation) in US usually starts with 'N' followed by numbers, etc.
    // For simplicity, we assume anything that looks like a 3-letter prefix is commercial, 
    // and explicitly 'N' numbers or empty callsigns are private.
    const callsign = typeof f.callsign === 'string' ? f.callsign.trim() : '';
    
    // If callsign is missing, assume private to keep things manageable
    if (!callsign || callsign === 'UNKNOWN') return type === 'private';
    
    const isUSPrivate = callsign.match(/^N\d+[A-Z]*$/i);
    const isCommercialPattern = callsign.match(/^[A-Z]{3}\d+[A-Z]*$/i);
    
    const isCommercial = isCommercialPattern && !isUSPrivate;

    if (type === 'commercial') return !!isCommercial;
    if (type === 'private') return !isCommercial;
    
    return true;
}

// ------------------------------------------
// DECOUPLED LAYER RENDERING ENGINES
// ------------------------------------------

function updateHUDCounts() {
    const flightsSpeed = document.getElementById('flight-speed')?.value || 'all';
    const flightsType = document.getElementById('flight-type')?.value || 'all';
    const militarySpeed = document.getElementById('military-speed')?.value || 'all';
    const visibleFlights = (state.flights || []).filter(f => !f.isMilitary && filterBySpeed(f, flightsSpeed) && filterByType(f, flightsType));
    const visibleMilitary = (state.flights || []).filter(f => f.isMilitary && filterBySpeed(f, militarySpeed));

    const satType = document.getElementById('satellite-type')?.value || 'all';
    const satCountry = document.getElementById('satellite-country')?.value || 'all';
    const satStatus = document.getElementById('satellite-status')?.value || 'all';
    const visibleSatellites = (state.satellites || []).filter(s => {
        if (satType !== 'all' && s.subtype !== satType) return false;
        if (satCountry !== 'all' && s.country !== satCountry) return false;
        if (satStatus !== 'all' && s.status !== satStatus) return false;
        return true;
    });

    const trafficType = document.getElementById('traffic-type')?.value || 'all';
    const visibleTraffic = (state.traffic || []).filter(t => {
        if (trafficType === 'all') return true;
        return (t.vesselType || 'other') === trafficType;
    });

    const counts = {
        flights: visibleFlights.length,
        military: visibleMilitary.length,
        satellites: visibleSatellites.length,
        earthquakes: (state.earthquakes || []).length,
        cctvs: (state.cctv_cameras || []).length,
        traffic: visibleTraffic.length,
        weather: (state.weatherData || []).length,
        police: (state.police_data || []).length,
        scanners: (state.scanners || []).length
    };

    try {
        const hudMap = {
            'count-flights': counts.flights,
            'layer-military': counts.military,
            'layer-satellites': counts.satellites,
            'layer-earthquakes': counts.earthquakes,
            'layer-cctv': counts.cctvs,
            'layer-traffic': counts.traffic,
            'layer-weather': counts.weather,
            'layer-police': counts.police,
            'layer-scanners': counts.scanners
        };
        for (const [id, count] of Object.entries(hudMap)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const countEl = (id === 'count-flights') ? el : el.querySelector('.layer-count');
            if (countEl) countEl.innerText = count;
        }
    } catch (e) { console.error('[HUD] Update fail:', e); }
}

function updateFlightsLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;
    
    if (state.layers.flights || state.layers.military) {
        const flightsSpeed = document.getElementById('flight-speed')?.value || 'all';
        const flightsType = document.getElementById('flight-type')?.value || 'all';
        const militarySpeed = document.getElementById('military-speed')?.value || 'all';
        const visibleFlights = (state.flights || []).filter(f => !f.isMilitary && filterBySpeed(f, flightsSpeed) && filterByType(f, flightsType));
        const visibleMilitary = (state.flights || []).filter(f => f.isMilitary && filterBySpeed(f, militarySpeed));

        try {
            flightsDataSource.entities.suspendEvents();
            militaryDataSource.entities.suspendEvents();
            const currentIds = new Set();
            
            const processFlight = (f) => {
                currentIds.add(f.id);
                let ds = f.isMilitary ? militaryDataSource : flightsDataSource;
                if (!ds.entities.getById(f.id)) {
                    ds.entities.add({
                        id: f.id,
                        position: new Cesium.CallbackProperty((time) => {
                            try {
                                if (typeof f.lat !== 'number' || typeof f.lng !== 'number' || isNaN(f.lat) || isNaN(f.lng)) return Cesium.Cartesian3.fromDegrees(0, 0, 10000);
                                const frameTimeMs = Cesium.JulianDate.toDate(time).getTime();
                                // Sync external data-fetch updates (performance.now) to the Cesium rendering clock 
                                if (!f.fetchDateMs || f.lastFetchTime !== f.fetchTime) {
                                    f.fetchDateMs = frameTimeMs;
                                    f.lastFetchTime = f.fetchTime;
                                }
                                const dt = (frameTimeMs - f.fetchDateMs) / 1000;
                                const dist = (f.velocity || 0) * dt;
                                const bearing = f.heading || 0;
                                const R = 6371000;
                                const lat1 = Cesium.Math.toRadians(f.lat);
                                const lon1 = Cesium.Math.toRadians(f.lng);
                                const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) + Math.cos(lat1) * Math.sin(dist / R) * Math.cos(Cesium.Math.toRadians(bearing)));
                                const lon2 = lon1 + Math.atan2(Math.sin(Cesium.Math.toRadians(bearing)) * Math.sin(dist / R) * Math.cos(lat1), Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2));
                                if (isNaN(lat2) || isNaN(lon2)) return Cesium.Cartesian3.fromDegrees(f.lng, f.lat, f.alt || 10000);
                                return Cesium.Cartesian3.fromRadians(lon2, lat2, f.alt || 10000);
                            } catch(e) { return Cesium.Cartesian3.fromDegrees(0, 0, 10000); }
                        }, false),
                        billboard: {
                            image: f.isMilitary ? militaryAirplaneSvg : airplaneSvg,
                            color: Cesium.Color.WHITE,
                            scale: new Cesium.CallbackProperty(() => {
                                let baseScale = isMobile ? 0.70 : 0.70;
                                return baseScale;
                            }, false),
                            rotation: 0,
                            alignedAxis: new Cesium.CallbackProperty(() => f.alignedAxis || Cesium.Cartesian3.ZERO, false),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY // Prevents disappearing when camera zooms closely
                        },
                        label: {
                            text: f.callsign || '',
                            font: 'bold 14px "Share Tech Mono", monospace',
                            fillColor: Cesium.Color.CYAN,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 3,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            pixelOffset: new Cesium.Cartesian2(0, -22),
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                            showBackground: true,
                            backgroundColor: new Cesium.Color(0.0, 0.05, 0.1, 0.7),
                            backgroundPadding: new Cesium.Cartesian2(6, 3),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
                            disableDepthTestDistance: Number.POSITIVE_INFINITY,
                            eyeOffset: new Cesium.Cartesian3(0, 0, -10),
                            show: true
                        },
                        customData: f
                    });
                }
            };

            if (state.layers.flights) visibleFlights.forEach(processFlight);
            if (state.layers.military) visibleMilitary.forEach(processFlight);

            [flightsDataSource, militaryDataSource].forEach(ds => {
                const toRemove = [];
                ds.entities.values.forEach(e => { if (!currentIds.has(e.id)) toRemove.push(e.id); });
                toRemove.forEach(id => ds.entities.removeById(id));
            });
        } catch (e) { console.error('[Globe] Flights fail:', e); }
        finally {
            try { flightsDataSource.entities.resumeEvents(); } catch(e){}
            try { militaryDataSource.entities.resumeEvents(); } catch(e){}
        }
    } else {
        flightsDataSource.entities.removeAll();
        militaryDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

function updateSatellitesLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;

    if (state.layers.satellites) {
        try {
            satellitesDataSource.entities.suspendEvents();
            const currentSatIds = new Set();
            
            const satType = document.getElementById('satellite-type')?.value || 'all';
            const satCountry = document.getElementById('satellite-country')?.value || 'all';
            const satStatus = document.getElementById('satellite-status')?.value || 'all';
            const visibleSatellites = (state.satellites || []).filter(s => {
                if (satType !== 'all' && s.subtype !== satType) return false;
                if (satCountry !== 'all' && s.country !== satCountry) return false;
                if (satStatus !== 'all' && s.status !== satStatus) return false;
                return true;
            });

            // Prevent WebGL catastrophic exhaustion
            const renderingSlice = visibleSatellites.slice(0, SAT_DISPLAY_CAP);

            renderingSlice.forEach(s => {
                currentSatIds.add(s.id);
                if (!satellitesDataSource.entities.getById(s.id)) {
                    satellitesDataSource.entities.add({
                        id: s.id,
                        position: new Cesium.CallbackProperty((time) => {
                            try {
                                const now = Cesium.JulianDate.toDate(time);
                                const pv = satellite.propagate(s.satRec, now);
                                if (!pv.position) return undefined;
                                const gmst = satellite.gstime(now);
                                const gd = satellite.eciToGeodetic(pv.position, gmst);
                                return Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000);
                            } catch(e) { return undefined; }
                        }, false),
                        billboard: {
                            image: satelliteSvg,
                            scale: isMobile ? 0.35 : 0.45,
                            disableDepthTestDistance: 0
                        },
                        customData: s
                    });
                }
            });
            const existingSats = satellitesDataSource.entities.values;
            const toRemoveSats = [];
            for (let i = 0; i < existingSats.length; i++) {
                if (!currentSatIds.has(existingSats[i].id)) toRemoveSats.push(existingSats[i].id);
            }
            toRemoveSats.forEach(id => satellitesDataSource.entities.removeById(id));
        } catch(e) { console.error('[Globe] Satellites fail:', e); }
        finally { try { satellitesDataSource.entities.resumeEvents(); } catch(e){} }
    } else {
        satellitesDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

function updateEarthquakesLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;

    if (state.layers.earthquakes) {
        try {
            earthquakesDataSource.entities.suspendEvents();
            earthquakesDataSource.entities.removeAll();
            (state.earthquakes || []).forEach(q => {
                if (!q.geometry || !q.geometry.coordinates) return;
                const coords = q.geometry.coordinates;
                if (typeof coords[0] !== 'number' || typeof coords[1] !== 'number' || isNaN(coords[0]) || isNaN(coords[1])) return;
                const mag = q.properties.mag || 1;
                const clampedMag = Math.max(1, Math.min(8, mag));
                const lightness = 0.8 - ((clampedMag - 1) / 7) * 0.3;
                const quakeColor = Cesium.Color.fromHsl(0.16, 1.0, lightness, 0.9);

                earthquakesDataSource.entities.add({
                    id: q.id,
                    position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1], (coords[2] || 0) * 1000),
                    point: {
                        pixelSize: mag * 4,
                        color: quakeColor,
                        outlineColor: Cesium.Color.fromHsl(0.16, 1.0, lightness * 0.8, 1.0),
                        outlineWidth: 1.5
                    },
                    customData: { type: 'earthquake', id: q.id, title: q.properties?.title || 'Earthquake', lat: coords[1], lng: coords[0], depth: coords[2], mag: mag, time: q.properties?.time, felt: q.properties?.felt, tsunami: q.properties?.tsunami, place: q.properties?.place || q.properties?.flynn_region }
                });
            });
        } catch(e) { console.error('[Globe] Earthquakes fail:', e); }
        finally { try { earthquakesDataSource.entities.resumeEvents(); } catch(e){} }
    } else {
        earthquakesDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

function updateCCTVLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;

    if (state.layers.cctv) {
        try {
            cctvDataSource.entities.suspendEvents();
            cctvDataSource.entities.removeAll();
            (state.cctv_cameras || []).forEach(cam => {
                cctvDataSource.entities.add({
                    id: cam.id,
                    position: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat),
                    billboard: {
                        image: cctvSvg,
                        scale: isMobile ? 0.6 : 0.8,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                        disableDepthTestDistance: 0
                    },
                    customData: { ...cam, type: 'cctv' }
                });
            });
        } catch(e) { console.error('[Globe] CCTV fail:', e); }
        finally { try { cctvDataSource.entities.resumeEvents(); } catch(e){} }
    } else {
        cctvDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

function updateShippingLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;

    if (state.layers.traffic) {
        try {
            // Apply vessel type filter from dropdown
            const typeFilter = document.getElementById('traffic-type');
            const selectedType = typeFilter ? typeFilter.value : 'all';
            const filteredTraffic = (state.traffic || []).filter(t => {
                if (selectedType === 'all') return true;
                return (t.vesselType || 'other') === selectedType;
            });

            // Clean slate: remove all and re-add filtered entities
            // This forces CesiumJS to recalculate cluster counts
            shippingDataSource.entities.removeAll();

            const earthRadius = 6371000;
            filteredTraffic.forEach(t => {
                shippingDataSource.entities.add({
                    id: 'vessel_' + t.id,
                    position: new Cesium.CallbackProperty((time, result) => {
                        try {
                            const tLat = t.startLat != null ? t.startLat : t.lat;
                            const tLng = t.startLng != null ? t.startLng : t.lng;
                            if (typeof tLat !== 'number' || typeof tLng !== 'number' || isNaN(tLat) || isNaN(tLng)) return Cesium.Cartesian3.fromDegrees(0, 0, 0);
                            const frameTimeMs = Cesium.JulianDate.toDate(time).getTime();
                            if (!t.fetchDateMs || t.lastFetchTime !== t.fetchTime) {
                                t.fetchDateMs = frameTimeMs;
                                t.lastFetchTime = t.fetchTime;
                            }
                            const dt = (frameTimeMs - t.fetchDateMs) / 1000;
                            const dist = (t.computedVelocity || 0) * dt;
                            const angularDist = dist / earthRadius;
                            const sLat = Cesium.Math.toRadians(tLat);
                            const sLng = Cesium.Math.toRadians(tLng);
                            const head = t.computedHeading || 0;
                            const nLat = Math.asin(Math.sin(sLat) * Math.cos(angularDist) + Math.cos(sLat) * Math.sin(angularDist) * Math.cos(head));
                            const nLng = sLng + Math.atan2(Math.sin(head) * Math.sin(angularDist) * Math.cos(sLat), Math.cos(angularDist) - Math.sin(sLat) * Math.sin(nLat));
                            if (isNaN(nLat) || isNaN(nLng)) return Cesium.Cartesian3.fromDegrees(tLng, tLat, 0);
                            t.lat = Cesium.Math.toDegrees(nLat);
                            t.lng = Cesium.Math.toDegrees(nLng);
                            return Cesium.Cartesian3.fromRadians(nLng, nLat, 0, viewer.scene.globe.ellipsoid, result);
                        } catch (cpErr) {
                            return Cesium.Cartesian3.fromDegrees(0, 0, 0);
                        }
                    }, false),
                    billboard: {
                        image: shipSvg,
                        scale: isMobile ? 0.15 : 0.20,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: 0
                    },
                    label: {
                        text: t.title || '',
                        font: 'bold 13px "Share Tech Mono", monospace',
                        fillColor: new Cesium.Color(1.0, 0.42, 0.51, 1.0), // #ff6b81
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        pixelOffset: new Cesium.Cartesian2(0, -20),
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                        showBackground: true,
                        backgroundColor: new Cesium.Color(0.0, 0.05, 0.1, 0.7),
                        backgroundPadding: new Cesium.Cartesian2(6, 3),
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 500000),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        show: true
                    },
                    customData: t
                });
            });
        } catch (e) {
            console.error('[Globe] Traffic fail:', e.name || 'Error', e.message || e, e.stack);
        }
    } else {
        shippingDataSource.entities.removeAll();
    }
    viewer.scene.requestRender();
}

function updateWeatherLayer() {
    if (typeof viewer === 'undefined' || !viewer) return;

    if (state.layers.weather) {
        try {
            weatherDataSource.entities.suspendEvents();
            weatherDataSource.entities.removeAll();
            const weatherType = document.getElementById('weather-layer')?.value || 'rain';
            const weatherP = document.getElementById('layer-weather')?.querySelector('p');
            if (weatherP) weatherP.innerText = `Active: ${weatherType}`;

            if (weatherType === 'temperature' && state.weatherData) {
                state.weatherData.forEach(w => {
                    let farDist = Number.MAX_VALUE;
                    if (w.tier === 2) farDist = 8000000.0;
                    if (w.tier === 3) farDist = 3500000.0;
                    
                    weatherDataSource.entities.add({
                        id: 'weather_' + w.city,
                        position: Cesium.Cartesian3.fromDegrees(w.lng || 0, w.lat || 0, 10000),
                        label: {
                            text: `${w.city}\n${w.temp} ${w.unit}`,
                            font: 'bold 14pt "Share Tech Mono"',
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                            fillColor: Cesium.Color.fromCssColorString('#a4b0be'),
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 3,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            pixelOffset: new Cesium.Cartesian2(0, -10),
                            showBackground: false,
                            backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, farDist)
                        },
                        point: { 
                            pixelSize: 8, 
                            color: Cesium.Color.fromCssColorString('#a4b0be'), 
                            outlineColor: Cesium.Color.BLACK, 
                            outlineWidth: 2,
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, farDist)
                        }
                    });
                });
                if (_weatherImageryLayer) { viewer.imageryLayers.remove(_weatherImageryLayer, true); _weatherImageryLayer = null; _weatherLastType = null; }
            } else {
                if (_weatherLastType !== weatherType) applyWeatherLayer(weatherType);
            }
        } catch (e) {
            console.error('[Globe] Weather fail:', e.name || 'Error', e.message || e, e.stack);
        } finally {
            weatherDataSource.entities.resumeEvents();
        }
    } else {
        weatherDataSource.entities.removeAll();
        if (_weatherImageryLayer) { viewer.imageryLayers.remove(_weatherImageryLayer, true); _weatherImageryLayer = null; _weatherLastType = null; }
    }
    viewer.scene.requestRender();
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
            window.updateLastFetchTime('weather');
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
        window.updateLastFetchTime('weather');
    } catch (e) {
        console.error('[Weather] Failed to apply weather layer:', e);
    }
}


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

function lockTarget(obj, forceShowPanel) {
    state.target = obj;
    if (obj.type === 'flight' && !obj.origin) fetchFlightRoute(obj);

    // --- LIVE FLIGHT TRACKING ---
    // The background server only polls flights globally every 1 hour to save API limits.
    // If we select a specific target, tightly poll ADSB.lol every 5s for *only* this plane
    // to achieve perfectly smooth, real-time extrapolate-motion on the map.
    if (window.liveFlightInterval) {
        clearInterval(window.liveFlightInterval);
        window.liveFlightInterval = null;
    }

    if (obj.type === 'flight' || obj.type === 'military') {
        let liveFlightFailCount = 0;
        const MAX_LIVE_FAILURES = 3;
        obj.signalLost = false;

        window.liveFlightInterval = setInterval(async () => {
            // Stop polling if user closed panel or clicked something else
            if (!state.target || state.target.id !== obj.id) {
                clearInterval(window.liveFlightInterval);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/proxy/live-flight/${obj.id}`);
                if (res.ok) {
                    const data = await res.json();
                    // Server returns { status: "unavailable" } when ADSB.lol has no data
                    if (data.status === 'unavailable' || !data.lat || !data.lng) {
                        liveFlightFailCount++;
                        if (liveFlightFailCount >= MAX_LIVE_FAILURES) {
                            console.warn(`[Live Tracker] Signal lost for ${obj.id} after ${MAX_LIVE_FAILURES} attempts. Stopping poll.`);
                            obj.signalLost = true;
                            clearInterval(window.liveFlightInterval);
                            window.liveFlightInterval = null;
                            renderTargetDetails(); // Re-render HUD to show SIGNAL LOST
                        }
                        return;
                    }
                    // Success — reset failure counter
                    liveFlightFailCount = 0;
                    if (obj.signalLost) { obj.signalLost = false; renderTargetDetails(); }

                    obj.lat = data.lat;
                    obj.lng = data.lng;
                    obj.alt = data.alt;
                    obj.velocity = data.velocity;
                    obj.heading = data.heading;
                    obj.velocityKmH = data.velocity * 3.6;
                    
                    // SNAP! Reset the extrapolation clock. Cesium's CallbackProperty will effortlessly
                    // sweep from this exact coordinate forwarding using the new live velocity!
                    obj.fetchTime = performance.now();
                    
                    // Recalculate 3D Nose Coordinate Alignment
                    const lngRad = Cesium.Math.toRadians(obj.lng);
                    const latRad = Cesium.Math.toRadians(obj.lat);
                    const headingRad = Cesium.Math.toRadians(obj.heading);
                    const cosLat = Math.cos(latRad), sinLat = Math.sin(latRad);
                    const cosLng = Math.cos(lngRad), sinLng = Math.sin(lngRad);
                    const eastX = -sinLng, eastY = cosLng, eastZ = 0;
                    const northX = -sinLat * cosLng, northY = -sinLat * sinLng, northZ = cosLat;
                    const cosH = Math.cos(headingRad), sinH = Math.sin(headingRad);
                    obj.alignedAxis = new Cesium.Cartesian3(
                        northX * cosH + eastX * sinH,
                        northY * cosH + eastY * sinH,
                        northZ * cosH + eastZ * sinH
                    );
                } else {
                    liveFlightFailCount++;
                    if (liveFlightFailCount >= MAX_LIVE_FAILURES) {
                        console.warn(`[Live Tracker] Signal lost for ${obj.id} after ${MAX_LIVE_FAILURES} attempts. Stopping poll.`);
                        obj.signalLost = true;
                        clearInterval(window.liveFlightInterval);
                        window.liveFlightInterval = null;
                        renderTargetDetails();
                    }
                }
            } catch (e) {
                console.warn("[Live Tracker] Proxy failed for specific flight:", e);
                liveFlightFailCount++;
                if (liveFlightFailCount >= MAX_LIVE_FAILURES) {
                    obj.signalLost = true;
                    clearInterval(window.liveFlightInterval);
                    window.liveFlightInterval = null;
                    renderTargetDetails();
                }
            }
        }, 5000); // Check speed & trajectory every 5 seconds
    }

    const panel = document.getElementById('target-panel');
    // On mobile: skip popup for flights UNLESS the user tapped the callsign label
    // Desktop: always show. Non-flight types (CCTV, vessels, etc.): always show.
    const isFlight = obj.type === 'flight' || obj.type === 'military';
    const skipPanel = isMobile && isFlight && !forceShowPanel;
    if (!skipPanel) {
        panel.style.display = 'flex';
        setTimeout(() => panel.style.transform = 'translateX(0)', 10);
        renderTargetDetails();
    }

    // On mobile label click: popup is shown above, but skip camera fly — just show the popup
    if (isMobile && isFlight && forceShowPanel) {
        return;
    }
    // Zoom Cesium camera
    let zoomRange = 500000;
    if (obj.type === 'cctv') zoomRange = 5000;
    else if (obj.type === 'vessel') zoomRange = 5000;
    else if (obj.type === 'traffic') zoomRange = 10000;
    else if (obj.type === 'scanner') zoomRange = 8000;
    else if (obj.type === 'police') zoomRange = 2500;
    else if (obj.alt > 0) zoomRange = obj.alt * 2 + 50000;

    let targetLat = obj.lat || 0;
    let targetLng = obj.lng || 0;

    if (obj.type === 'satellite' && obj.satRec) {
        try {
            const now = new Date();
            const pv = satellite.propagate(obj.satRec, now);
            if (pv.position) {
                const gmst = satellite.gstime(now);
                const gd = satellite.eciToGeodetic(pv.position, gmst);
                targetLat = satellite.degreesLat(gd.latitude);
                targetLng = satellite.degreesLong(gd.longitude);
                obj.lat = targetLat; // populate for target details table
                obj.lng = targetLng;
                obj.alt = gd.height; // in km
                zoomRange = gd.height * 1000 + 500000; // Zoom slightly above the satellite orbit
            }
        } catch(e) { console.warn("Could not calculate satellite target focus."); }
    }

    // Offset math is no longer needed because native tracking permanently centers the active entity beautifully.
    let entityId = obj.mmsi || obj.id;
    let liveEntity = null;
    for (let i = 0; i < viewer.dataSources.length; i++) {
        liveEntity = viewer.dataSources.get(i).entities.getById(entityId);
        if (liveEntity) break;
    }

    if (liveEntity) {
        // Fly camera to the entity's current position
        const entityPos = liveEntity.position.getValue(viewer.clock.currentTime);
        if (entityPos) {
            const carto = Cesium.Cartographic.fromCartesian(entityPos);
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, zoomRange),
                duration: 2.0,
                orientation: {
                    heading: 0.0,
                    pitch: -Cesium.Math.PI_OVER_TWO,
                    roll: 0.0
                },
                complete: () => {
                    // Start a lightweight camera follow (no trackedEntity)
                    if (window._followListener) {
                        viewer.scene.preRender.removeEventListener(window._followListener);
                    }
                    let lastEntityPos = liveEntity.position.getValue(viewer.clock.currentTime);
                    window._followEntity = liveEntity;
                    window._followListener = function() {
                        if (!state.target || !window._followEntity) {
                            viewer.scene.preRender.removeEventListener(window._followListener);
                            window._followListener = null;
                            window._followEntity = null;
                            return;
                        }
                        const currentPos = window._followEntity.position.getValue(viewer.clock.currentTime);
                        if (currentPos && lastEntityPos) {
                            // Move camera by the same delta the entity moved
                            const delta = Cesium.Cartesian3.subtract(currentPos, lastEntityPos, new Cesium.Cartesian3());
                            const camPos = viewer.camera.positionWC;
                            viewer.camera.setView({
                                destination: Cesium.Cartesian3.add(camPos, delta, new Cesium.Cartesian3()),
                                orientation: {
                                    heading: viewer.camera.heading,
                                    pitch: viewer.camera.pitch,
                                    roll: 0.0
                                }
                            });
                        }
                        lastEntityPos = currentPos;
                    };
                    viewer.scene.preRender.addEventListener(window._followListener);
                }
            });
        }
    } else {
        // Fallback for statically declared locations (e.g., CCTV with no live moving DataSource object)
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(targetLng, targetLat, zoomRange),
            duration: 2.0,
            orientation: {
                heading: 0.0,
                pitch: -Cesium.Math.PI_OVER_TWO,
                roll: 0.0
            }
        });
    }
}

document.getElementById('close-target').textContent = 'Close';
document.getElementById('close-target').addEventListener('click', () => {
    state.target = null;
    const panel = document.getElementById('target-panel');
    panel.style.transform = 'translateX(120%)';
    setTimeout(() => panel.style.display = 'none', 300);

    // Stop live flight polling
    if (window.liveFlightInterval) {
        clearInterval(window.liveFlightInterval);
        window.liveFlightInterval = null;
    }

    // Stop camera follow — just remove listener, zero camera movement
    if (window._followListener) {
        viewer.scene.preRender.removeEventListener(window._followListener);
        window._followListener = null;
        window._followEntity = null;
    }

    // Clean up camera feeds
    clearInterval(_camRefreshInterval);
    _camRefreshInterval = null;
    if (window._hlsInstance) { window._hlsInstance.destroy(); window._hlsInstance = null; }
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

    // Force button text (CMS overwrites HTML on page load)
    const closeBtn = document.getElementById('close-target');
    if (closeBtn) closeBtn.textContent = 'Close';

    const isFlight = t.type === 'flight';
    const isTraffic = t.type === 'traffic';

    const html = `
        <div style="margin-bottom: 20px; text-align: center;">
            <div style="font-size: 2rem; color: ${t.isMilitary ? 'var(--hud-pink)' : (t.type === 'cctv' ? '#7bed9f' : (t.type === 'vessel' ? '#ff6b81' : (t.type === 'earthquake' ? '#ffd32a' : (t.type === 'scanner' ? '#d32f2f' : 'var(--hud-cyan)'))))};">
                <i class="fa-solid ${t.isMilitary ? 'fa-fighter-jet' : (t.type === 'cctv' ? 'fa-video' : (t.type === 'vessel' ? 'fa-ship' : (t.type === 'earthquake' ? 'fa-house-crack' : (t.type === 'scanner' ? 'fa-walkie-talkie' : (isFlight ? 'fa-plane' : 'fa-satellite')))))}"></i>
            </div>
            <h3 style="font-family: 'Share Tech Mono'; font-size: 1.5rem; letter-spacing: 2px;">${t.type === 'earthquake' ? 'SEISMIC EVENT' : (t.callsign || t.title || (t.id ? t.id.toString().split('_')[0] : 'UNKNOWN'))}</h3>
            <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px; text-transform: uppercase;">
                ${t.country || t.subtype || (t.type === 'vessel' ? 'MARINE VESSEL' : (t.type === 'earthquake' ? (t.place || t.title || 'UNKNOWN REGION') : (t.type === 'scanner' ? 'LIVE AUDIO FEED' : 'UNKNOWN ORIGIN')))}
            </div>
            ${t.signalLost ? `
            <div style="margin-top: 8px; padding: 4px 12px; display: inline-block; border-radius: 4px;
                        background: rgba(255,71,87,0.15); border: 1px solid rgba(255,71,87,0.6);
                        font-family: 'Share Tech Mono', monospace; font-size: 0.75rem; color: #ff4757;
                        font-weight: bold; letter-spacing: 1px; animation: signalLostPulse 1.5s ease-in-out infinite;">
                ⚠ SIGNAL LOST
            </div>
            <style>
                @keyframes signalLostPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
            </style>` : ''}
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
            ${t.type === 'earthquake' ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">MAGNITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: ${t.mag >= 6 ? '#ff4757' : (t.mag >= 4 ? '#ffa502' : '#7bed9f')}; font-family: 'Share Tech Mono', monospace; font-size: 1.2rem; font-weight: bold;">${Number(t.mag).toFixed(1)}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">DEPTH</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${(t.depth || 0).toFixed(1)} <span style="font-size: 0.7rem;">km</span></td>
            </tr>
            ${t.time ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">TIME (UTC)</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${new Date(t.time).toLocaleString('en-US', {timeZone:'UTC', dateStyle:'short', timeStyle:'short'})}</td>
            </tr>
            ` : ''}
            ${t.felt !== undefined && t.felt !== null ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">REPORTS FELT</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #ffa502;">${Number(t.felt).toLocaleString()}</td>
            </tr>
            ` : ''}
            ${t.tsunami ? `
            <tr>
                <td colspan="2" style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: center; color: #ff4757; font-family: 'Share Tech Mono', monospace; font-weight: bold; background: rgba(255,71,87,0.1);">TSUNAMI WARNING ISSUED</td>
            </tr>
            ` : ''}
            ` : ''}
            ${t.type === 'scanner' ? `
            ${state.dataSources.scanners === 'broadcastify' ? `
            <tr>
                <td colspan="2" style="padding: 6px 0; text-align: center;">
                    <a href="https://www.broadcastify.com" target="_blank" rel="noopener"
                       style="color: #ff4757; font-size: 0.82rem; font-weight: bold; font-family: 'Share Tech Mono', monospace;
                              text-decoration: none; letter-spacing: 0.5px;
                              animation: bcastFlash 1.2s ease-in-out infinite;">
                        🔴 Create a FREE Broadcastify account to listen
                    </a>
                    <style>
                        @keyframes bcastFlash {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.3; }
                        }
                    </style>
                </td>
            </tr>
            ` : ''}
            <tr>
                <td colspan="2" style="padding: 10px 0 5px; text-align: center;">
                    <iframe src="https://www.broadcastify.com/listen/feed/${t.feed_id || ''}" 
                        style="width:100%; height:230px; border:1px solid rgba(211,47,47,0.4); border-radius:6px; background:#0a1018;"
                        allow="autoplay; encrypted-media" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
                </td>
            </tr>
            <tr>
                <td colspan="2" style="padding:4px 0; text-align:center;">
                    <a href="https://www.broadcastify.com/listen/feed/${t.feed_id || ''}" target="_blank" 
                       style="color:#d32f2f; font-size:0.72rem; text-decoration:none;">
                        ▶ Open in Broadcastify ↗
                    </a>
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">STATUS</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right;">
                    <span style="padding:2px 8px; border-radius:4px; font-size:0.75rem; font-family:'Share Tech Mono',monospace; font-weight:bold;
                        ${(t.status || 'online') === 'online' ? 'background:rgba(123,237,159,0.15); color:#7bed9f; border:1px solid rgba(123,237,159,0.5);' 
                        : 'background:rgba(255,71,87,0.15); color:#ff4757; border:1px solid rgba(255,71,87,0.5);'}">
                        ${(t.status || 'online') === 'online' ? '● ONLINE' : '● OFFLINE'}
                    </span>
                </td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ACTIVE LISTENERS</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: #7bed9f; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem; font-weight: bold;">${t.listeners || 0}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">LOCATION</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 0.85rem;">${t.city || ''}, ${t.state || ''}<br/><span style="opacity:0.6; font-size:0.75rem;">${t.country || ''}</span></td>
            </tr>
            ` : ''}
            ${t.type !== 'cctv' && t.type !== 'vessel' && t.type !== 'earthquake' && t.type !== 'scanner' && !isTraffic ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">IDENTIFIER</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${isFlight ? (t.id || 'N/A') : (t.id ? t.id.toString().split('_')[1] : 'N/A')}</td>
            </tr>
            ` : ''}
            ${t.type === 'satellite' && t.status ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">OPERATIONAL STATUS</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-weight: bold; color: ${t.status === 'active' ? '#7bed9f' : '#ff4757'};">${t.status.toUpperCase()}</td>
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
            ${isFlight && (t.velocityKmH !== undefined && t.velocityKmH !== null) ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VELOCITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>
            ` : ''}
            ${(isFlight || t.type === 'satellite') && (t.alt !== undefined && t.alt !== null) ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ALTITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.alt).toLocaleString()} <span style="font-size: 0.7rem;">m</span></td>
            </tr>
            ` : ''}
            ${t.type === 'vessel' && (t.velocityKmH !== undefined && t.velocityKmH !== null) ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">SPEED</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>
            ` : ''}
            ${t.type === 'vessel' && t.vesselType ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VESSEL TYPE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; text-transform: uppercase; letter-spacing: 1px;">${t.vesselType}</td>
            </tr>
            ` : ''}
            ${(isFlight || t.type === 'vessel') && (t.heading !== undefined && t.heading !== null) ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">HEADING</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.heading)}°</td>
            </tr>
            ` : ''}
            ${(t.lat !== undefined && t.lat !== null) ? `
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
                            const proxyUrl = `${API_BASE}/api/cam-proxy?url=` + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                            
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
                                currentImg.src = API_BASE + '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
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
async function executeSearch() {
    const searchInput = document.getElementById('target-search');
    const query = searchInput.value.trim().toUpperCase();
    if (!query) return;

    // 1. Check Flights
    const foundFlight = state.flights.find(f => (f.callsign && String(f.callsign).toUpperCase().includes(query)) || String(f.id).toUpperCase() === query);
    if (foundFlight) {
        lockTarget(foundFlight);
        if (foundFlight.isMilitary && !state.layers.military) toggleLayer('military');
        if (!foundFlight.isMilitary && !state.layers.flights) toggleLayer('flights');
        searchInput.value = '';
        return;
    }
    
    // 2. Check CCTV
    const foundCCTV = state.cctv_cameras.find(c => String(c.id).toUpperCase().includes(query) || (c.origin && String(c.origin).toUpperCase().includes(query)));
    if (foundCCTV) {
        lockTarget(foundCCTV);
        if (!state.layers.cctv) toggleLayer('cctv');
        searchInput.value = '';
        return;
    }

    // 3. Fallback to OpenStreetMap Geocoding (Locations)
    try {
        searchInput.placeholder = "Searching global map...";
        searchInput.value = '';
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const data = await res.json();
        
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);
            
            // Clear any active target locks to allow free-fly
            const closeBtn = document.getElementById('close-target');
            if (closeBtn) closeBtn.click();
            
            // Command Cesium to smoothly glide to the new coordinate
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(lon, lat, 200000), // Fly to 200km altitude
                duration: 2.0
            });
            
            searchInput.placeholder = `Found: ${data[0].display_name.split(',')[0]}`;
            setTimeout(() => { searchInput.placeholder = "Search callsign, CCTV, or location..."; }, 4000);
        } else {
            alert('Target not found as an active flight, CCTV camera, or physical location.');
            searchInput.placeholder = "Search callsign, CCTV, or location...";
        }
    } catch (e) {
        console.error("Geocoding failed:", e);
        alert("Location search failed due to a network error.");
        searchInput.placeholder = "Search callsign, CCTV, or location...";
    }
}

document.getElementById('target-search').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        executeSearch();
    }
});

document.getElementById('target-search-btn').addEventListener('click', function () {
    executeSearch();
});

// Boot Sequence
// Set up intervals independent of layers so data is fresh when toggled
setInterval(fetchFlights, 900000); // Poll flights every 15 minutes to allow native extrapolation
setInterval(fetchSatellites, 30000);
setInterval(fetchTraffic, 30000); // Poll AIS vessels every 30 seconds
setInterval(fetchEarthquakes, 60000);
setInterval(fetchWeather, 300000);
setInterval(fetchCCTVs, 120000); // Refresh cameras every 2 minutes

// Kick off initial fetches immediately to populate the map faster
async function initialBoot() {
    await viewerInitPromise; // Wait for Cesium to be ready
    fetchFlights();
    fetchTraffic();
    fetchCCTVs(); 
    fetchSatellites();
    fetchEarthquakes();
    fetchWeather();
}
initialBoot();

// Safety fallback: if the loading overlay is still visible after 5 seconds, force-dismiss it.
// This prevents the globe from being permanently blocked by a slow/failed initial flight fetch.
setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
    }
}, 5000);

document.querySelectorAll('.hud-select').forEach(select => {
    select.addEventListener('change', () => {
        if (select.id === 'quake-duration') {
            fetchEarthquakes();
        } else if (select.id === 'flight-speed' || select.id === 'military-speed') {
            updateFlightsLayer();
        } else if (select.id === 'satellite-type' || select.id === 'satellite-country' || select.id === 'satellite-status') {
            updateSatellitesLayer();
        } else if (select.id === 'weather-layer') {
            updateWeatherLayer();
        }
        updateHUDCounts();
    });
});

// Re-cull visible flights whenever the camera stops moving (pan, zoom, tilt).
// This ensures the viewport filter stays accurate without running every animation frame.
if (viewer && viewer.camera) {
    viewer.camera.moveEnd.addEventListener(() => {
        if (state.layers.flights || state.layers.military) {
            updateFlightsLayer();
            updateHUDCounts();
        }
    });
}

// ==========================================
// DEMO MODE AUTOPILOT LOGIC
// ==========================================

let isDemoModeActive = false;

const demoBtn = document.getElementById('demo-mode-btn');
if (demoBtn) {
    demoBtn.addEventListener('click', () => {
        isDemoModeActive = !isDemoModeActive;
        if (isDemoModeActive) {
            demoBtn.classList.add('active');
            demoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> DEMO ON';
            const volSlider = document.getElementById('demo-volume-slider');
            if (volSlider) volSlider.style.display = 'block';
            runDemoCycle();
        } else {
            demoBtn.classList.remove('active');
            demoBtn.innerHTML = '<i class="fa-solid fa-play"></i> DEMO OFF';
            const volSlider = document.getElementById('demo-volume-slider');
            if (volSlider) volSlider.style.display = 'none';
            
            // Stop audio immediately when demo is turned off
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            
            // Re-open layers panel if it was closed
            const panel = document.getElementById('layers-panel');
            if (panel && panel.classList.contains('collapsed')) {
                toggleLayersPanel();
            }
            
            // Only completely wipe the map clean if they explicitly pressed "DEMO OFF", 
            // rather than clicking a specific datapoint to interrupt the demo and take over.
            if (!window.isDemoInterruption) {
                // Turn off all layers
                for (const l of Object.keys(state.layers)) {
                    if (state.layers[l]) toggleLayer(l);
                }
                
                // Close target lock
                const closeBtn = document.getElementById('close-target');
                if (closeBtn) closeBtn.click();
                
                // Reset all dropdowns 
                ['flight-speed', 'military-speed', 'quake-duration', 'satellite-country', 'traffic-type', 'weather-layer', 'cctv-mode', 'police-country-filter', 'scanner-country-filter'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                         el.selectedIndex = 0;
                         el.dispatchEvent(new Event('change'));
                    }
                });
                
                // Fly camera back to default earth view
                if (viewer && viewer.camera) {
                    viewer.camera.flyTo({
                        destination: Cesium.Cartesian3.fromDegrees(-95, 38, 15000000),
                        duration: 1.5
                    });
                }
            }
            window.isDemoInterruption = false; // reset flag
        }
    });
}

// Utilities for async sleep & Text-to-Speech
const delay = ms => new Promise(res => setTimeout(res, ms));

const demoVoice = window.speechSynthesis;
let currentDemoUtterance = null;

let resolveCurrentSpeech = null;
let isIntentionalCancel = false;
let volUpdateTimer;

const volSliderEl = document.getElementById('demo-volume-slider');
if (volSliderEl) {
    volSliderEl.addEventListener('input', (e) => {
        const newVol = parseFloat(e.target.value);
        if (currentDemoUtterance) {
            currentDemoUtterance.volume = newVol;
        }
        
        // If pulled to zero, cancel the current audio and let script advance
        if (newVol === 0 && demoVoice && demoVoice.speaking) {
            demoVoice.cancel();
            return;
        }

        // Web Speech API ignores mid-utterance volume updates.
        // We must re-spool the utterance to apply volume immediately.
        clearTimeout(volUpdateTimer);
        volUpdateTimer = setTimeout(() => {
            if (demoVoice && demoVoice.speaking && currentDemoUtterance && newVol > 0) {
                isIntentionalCancel = true;
                demoVoice.cancel();
                isIntentionalCancel = false;
                
                const fullText = currentDemoUtterance.fullText || currentDemoUtterance.text;
                const newUtterance = new SpeechSynthesisUtterance(fullText);
                newUtterance.voice = currentDemoUtterance.voice;
                newUtterance.rate = currentDemoUtterance.rate;
                newUtterance.pitch = currentDemoUtterance.pitch;
                newUtterance.volume = newVol;
                newUtterance.fullText = fullText;
                
                const fallbackTimer = setTimeout(() => {
                    if (resolveCurrentSpeech) {
                        resolveCurrentSpeech();
                        resolveCurrentSpeech = null;
                    }
                }, fullText.length * 100 + 2000);

                newUtterance.onend = () => {
                    if (!isIntentionalCancel && resolveCurrentSpeech) {
                        clearTimeout(fallbackTimer);
                        resolveCurrentSpeech();
                        resolveCurrentSpeech = null;
                    }
                };
                newUtterance.onerror = () => {
                    if (!isIntentionalCancel && resolveCurrentSpeech) {
                        clearTimeout(fallbackTimer);
                        resolveCurrentSpeech();
                        resolveCurrentSpeech = null;
                    }
                };
                
                currentDemoUtterance = newUtterance;
                demoVoice.speak(newUtterance);
            }
        }, 150);
    });
}

function speakDemoText(text) {
    if (!isDemoModeActive || !demoVoice) return Promise.resolve();
    isIntentionalCancel = true;
    demoVoice.cancel(); // Stop talking if already talking
    isIntentionalCancel = false;
    
    return new Promise(resolve => {
        resolveCurrentSpeech = resolve;
        
        currentDemoUtterance = new SpeechSynthesisUtterance(text);
        currentDemoUtterance.fullText = text;
        
        // Attempt to find a clean, professional English voice
        const voices = demoVoice.getVoices();
        // Prioritize British Female (Google UK English Female / Microsoft Hazel)
        let preferredVoice = voices.find(v => v.lang.includes('en-GB') && (v.name.includes('Female') || v.name.includes('Hazel') || v.name.includes('Google')));
        
        // Fallback to en-US standard professional voices
        if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female')));
        }
        if (preferredVoice) currentDemoUtterance.voice = preferredVoice;
        
        currentDemoUtterance.rate = 1.15; // Increased to match Brand Monitor's energetic style
        currentDemoUtterance.pitch = 1.0;
        
        if (volSliderEl) {
            currentDemoUtterance.volume = parseFloat(volSliderEl.value);
        }
        
        // Safety timeout in case speech synthesis engine gets stuck (calc duration approx)
        const fallbackTimer = setTimeout(() => {
            if (resolveCurrentSpeech) {
                resolveCurrentSpeech();
                resolveCurrentSpeech = null;
            }
        }, text.length * 100 + 2000);
        
        currentDemoUtterance.onend = () => {
            if (!isIntentionalCancel && resolveCurrentSpeech) {
                clearTimeout(fallbackTimer);
                resolveCurrentSpeech();
                resolveCurrentSpeech = null;
            }
        };
        currentDemoUtterance.onerror = () => {
            if (!isIntentionalCancel && resolveCurrentSpeech) {
                clearTimeout(fallbackTimer);
                resolveCurrentSpeech();
                resolveCurrentSpeech = null;
            }
        };
        
        demoVoice.speak(currentDemoUtterance);
    });
}

// Interruption Handler: Fight user friction by turning off demo mode if they click anywhere else manually
window.isDemoInterruption = false;
document.addEventListener('mousedown', (e) => {
    const isSlider = e.target.id === 'demo-volume-slider';
    if (isDemoModeActive && e.target.id !== 'demo-mode-btn' && !e.target.closest('#demo-mode-btn') && !isSlider) {
        console.log("[Demo Mode] Manual interaction detected. Halting autopilot without wiping map.");
        if (demoVoice) demoVoice.cancel();
        window.isDemoInterruption = true;
        if (demoBtn) demoBtn.click();
    }
}, true);

function getFilterIdForLayer(layer) {
    const filters = {
        'flights': 'flight-speed',
        'military': 'military-speed',
        'earthquakes': 'quake-duration',
        'satellites': 'satellite-country', // Shows off military constraints
        'traffic': 'traffic-type',
        'weather': 'weather-layer',
        'cctv': 'cctv-mode',
        'police': 'police-country-filter',
        'scanners': 'scanner-country-filter'
    };
    return filters[layer];
}

function getRandomDemoEntity(layer) {
    let list = [];
    if (layer === 'flights') list = (state.flights || []).map(f => ({...f, type: 'flight'}));
    if (layer === 'military') list = (state.military || []).map(f => ({...f, type: 'flight', isMilitary: true}));
    if (layer === 'earthquakes') list = (state.earthquakes || []).map(q => ({
        type: 'earthquake', id: q.id, title: q.properties?.title || 'Earthquake', 
        lat: q.geometry.coordinates[1], lng: q.geometry.coordinates[0], depth: q.geometry.coordinates[2],
        mag: q.properties?.mag || 1, time: q.properties?.time, 
        felt: q.properties?.felt, tsunami: q.properties?.tsunami, place: q.properties?.place || q.properties?.flynn_region
    }));
    if (layer === 'satellites') list = state.satellites || [];
    if (layer === 'traffic') list = (state.traffic || []).map(t => ({...t, type: 'vessel'}));
    if (layer === 'weather') return null; // Weather isn't targetable
    if (layer === 'cctv') list = (state.cctv_cameras || []).map(c => ({...c, type: 'cctv'}));
    if (layer === 'police') list = (typeof getFilteredPolice === 'function') ? getFilteredPolice() : state.police_data;
    if (layer === 'scanners') list = (typeof getFilteredScanners === 'function') ? getFilteredScanners() : state.scanners;

    if (!list || list.length === 0) return null;
    
    // Pick a random target
    const target = list[Math.floor(Math.random() * list.length)];
    
    // Format appropriately for TargetLock
    if (layer === 'police' && !target.customData) {
        return {
            type: 'police', id: target.id, title: target.name || 'Police Station',
            lat: target.lat, lng: target.lng, address: target.address || '', phone: target.phone || '',
            country: target.country, state: target.state, city: target.city
        };
    }
    if (layer === 'scanners' && !target.customData) {
        return {
            type: 'scanner', id: target.id, title: target.title || 'Scanner Feed',
            lat: target.lat, lng: target.lng, listeners: target.listeners || 0,
            genre: target.genre || '', bitrate: target.bitrate || 0,
            url: target.url || ''
        };
    }
    if (layer === 'satellites') {
        return {
            type: 'satellite', id: target.id, name: target.name,
            satrec: target.satrec, 
            lat: 0, lng: 0, alt: 0 
        }; // Math interpolator will compute lat/lng in renderTargetDetails natively.
    }
    return target;
}

/**
 * ============================================================
 * VIRTUAL MOUSE & GUIDED DEMO HELPERS
 * ============================================================
 */
let virtualCursor = null;

function initVirtualCursor() {
    if (virtualCursor) return;
    virtualCursor = document.createElement('div');
    virtualCursor.id = 'virtual-cursor';
    document.body.appendChild(virtualCursor);
}

function removeVirtualCursor() {
    if (virtualCursor) {
        virtualCursor.remove();
        virtualCursor = null;
    }
}

async function moveVirtualMouse(targetX, targetY, duration = 1000, click = false) {
    if (!virtualCursor || !isDemoModeActive) return;
    
    virtualCursor.style.display = 'block';
    
    return new Promise(resolve => {
        const startX = parseFloat(virtualCursor.style.left) || window.innerWidth / 2;
        const startY = parseFloat(virtualCursor.style.top) || window.innerHeight / 2;
        const startTime = performance.now();
        
        function animate(now) {
            if (!isDemoModeActive) {
                virtualCursor.style.display = 'none';
                return resolve();
            }
            
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Cubic easing
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            const curX = startX + (targetX - startX) * ease;
            const curY = startY + (targetY - startY) * ease;
            
            virtualCursor.style.left = `${curX}px`;
            virtualCursor.style.top = `${curY}px`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                if (click) {
                    virtualCursor.classList.add('clicking');
                    setTimeout(() => {
                        virtualCursor.classList.remove('clicking');
                        resolve();
                    }, 200);
                } else {
                    resolve();
                }
            }
        }
        requestAnimationFrame(animate);
    });
}

function getEntityScreenCoords(entity) {
    if (!viewer || !entity) return null;
    
    let position;
    if (entity.lat !== undefined && entity.lng !== undefined) {
        position = Cesium.Cartesian3.fromDegrees(entity.lng, entity.lat, entity.alt || 0);
    } else if (entity.satrec) {
        // For satellites, we need to compute their current position since they move
        const now = Cesium.JulianDate.now();
        const pos = entity.satrec ? getSatellitePosition(entity.satrec, now) : null;
        if (pos) position = pos;
    }
    
    if (!position) return null;
    
    const canvasCoords = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, position);
    if (!canvasCoords) return null;
    
    return { x: canvasCoords.x, y: canvasCoords.y };
}

function getNarrationForLayer(layer) {
    const scripts = {
        'flights': "We analyze global commercial aviation utilizing crowdsourced ADS-B receivers. We track thousands of transponders simultaneously.",
        'military': "Military flight data is filtered to identify tactical aviation assets worldwide.",
        'earthquakes': "Geological sensors stream real-time earthquake data from the USGS API, mapped immediately onto the globe.",
        'satellites': "We track orbiting infrastructure. Our database plots thousands of active satellites using NORAD tracking telemetry.",
        'traffic': "Global maritime shipping traffic is ingested via AIS transceivers to identify cargo routes and vessel metadata.",
        'weather': "Near real-time precipation mapping gives situational awareness for global weather events.",
        'cctv': "We tap into an aggregated network of thousands of localized IP cameras to provide street-level operational visuals.",
        'police': "Public safety and emergency services infrastructure is mapped for rapid intelligence gathering.",
        'scanners': "Lyve police and emergency radio scanner feeds give you ears on the ground during critical incidents."
    };
    return scripts[layer] || `Displaying the ${layer} data layer.`;
}

async function runDemoCycle() {
    const demoLayers = ['flights', 'military', 'satellites', 'earthquakes', 'cctv', 'traffic', 'weather', 'police', 'scanners'];
    let layerIndex = 0;

    initVirtualCursor();

    // Ensure camera is pointing at Earth from a good starting height
    if (viewer && viewer.camera) {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-95, 38, 15000000), // US centric view
            duration: 2.0
        });
    }

    // UI Management: Mobile devices get a collapsed panel to save space.
    const panel = document.getElementById('layers-panel');
    if (panel) {
        if (isMobile && !panel.classList.contains('collapsed')) {
            toggleLayersPanel();
        } else if (!isMobile && panel.classList.contains('collapsed')) {
            toggleLayersPanel();
        }
    }

    await delay(1000);
    if (!isDemoModeActive) return;

    await speakDemoText("Welcome to Lyve Earth by Sherpa Solutions. This platform aggregates real-time, global O S INT data feeds into a unified 3D geospatial dashboard. Let's take a look at the capabilities.");
    await delay(1000); 

    while (isDemoModeActive) {
        // 1. Wipe all layers clean
        for (const l of Object.keys(state.layers)) {
            if (state.layers[l]) toggleLayer(l);
        }
        
        // --- NEW: Force Zoom Out to Whole Earth for each layer ---
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-95, 38, 18000000), 
            duration: 2.5
        });
        
        await delay(1500); 
        if (!isDemoModeActive) break;

        // 2. Turn on current layer & Speak
        const currentLayer = demoLayers[layerIndex];
        console.log(`[Demo] Activating layer: ${currentLayer}`);
        
        toggleLayer(currentLayer); 
        await speakDemoText(getNarrationForLayer(currentLayer));
        
        await delay(1000); 
        if (!isDemoModeActive) break;

        // 3. Find Entity & Select with Virtual Mouse
        const entity = getRandomDemoEntity(currentLayer);
        if (entity) {
            console.log(`[Demo] Targeting entity:`, entity.id || entity.name);
            
            // Move mouse to entity while still zoomed out
            const coords = getEntityScreenCoords(entity);
            if (coords) {
                await moveVirtualMouse(coords.x, coords.y, 1500, true);
            }
            
            if (!isDemoModeActive) break;

            // Zoom in medium speed via lockTarget
            lockTarget(entity);
            
            // Wait for flyTo duration (2.0s in lockTarget + buffer)
            await delay(3000); 
            if (!isDemoModeActive) break;

            // 4. Move Mouse to Identifier in the HUD
            const targetHudTitle = document.querySelector('#target-panel h3');
            if (targetHudTitle) {
                const rect = targetHudTitle.getBoundingClientRect();
                await moveVirtualMouse(rect.left + rect.width / 2, rect.top + rect.height / 2, 1000);
            }
            
            // Hold for 4 seconds as requested
            await delay(4000);
            if (!isDemoModeActive) break;

            // 5. Move Mouse to Close button and click
            const closeBtn = document.getElementById('close-target');
            if (closeBtn) {
                const rect = closeBtn.getBoundingClientRect();
                await moveVirtualMouse(rect.left + rect.width / 2, rect.top + rect.height / 2, 800, true);
                closeBtn.click();
            }
            
            await delay(1000);
        } else {
            console.log(`[Demo] No entities found for ${currentLayer}. Skipping...`);
            await delay(3000);
        }

        if (!isDemoModeActive) break;

        layerIndex++;
        if (layerIndex >= demoLayers.length) {
            await speakDemoText("This concludes the Lyve Earth demonstration. You now have the conn.");
            await delay(4000); 
            removeVirtualCursor();
            if (demoBtn) demoBtn.click(); 
            break;
        }
    }
}
