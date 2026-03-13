// ----- UI & STATE MANAGEMENT -----
const isMobile = window.innerWidth <= 768;

// Define your Railway backend URL here for production!
// Example: "https://your-custom-app.up.railway.app"
let API_BASE = 'https://sherpa-solutions-api-production.up.railway.app';
// ALL local requests are funneled through the live Railway backend to bypass local IP rate limits.

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
        cctv: false
    },
    dataSources: {
        flights: 'opensky',
        military: 'adsblol',
        earthquakes: 'usgs',
        satellites: 'celestrak',
        traffic: 'aisstream',
        weather: 'rainviewer',
        cctv: 'public'
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

let _fetchingSatellites = false;
let _fetchingEarthquakes = false;

// Global DataSources for efficient entity tracking
const flightsDataSource = new Cesium.CustomDataSource('flights');
const militaryDataSource = new Cesium.CustomDataSource('military');
const satellitesDataSource = new Cesium.CustomDataSource('satellites');
const earthquakesDataSource = new Cesium.CustomDataSource('earthquakes');
const cctvDataSource = new Cesium.CustomDataSource('cctvs');
const shippingDataSource = new Cesium.CustomDataSource('shipping');
const weatherDataSource = new Cesium.CustomDataSource('weather');

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
    if (!el) return;
    const toggleIcon = el.querySelector('.layer-toggle i');

    if (state.layers[layerName]) {
        el.classList.add('active');
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-toggle-on';
        
        // Trigger fetch if we have no data yet
        if (layerName === 'satellites' && state.satellites.length === 0) fetchSatellites();
        if (layerName === 'earthquakes' && state.earthquakes.length === 0) fetchEarthquakes();
        if (layerName === 'weather' && state.weatherData.length === 0) fetchWeather();
        if (layerName === 'traffic' && state.traffic.length === 0) fetchTraffic();
        if (layerName === 'cctv' && state.cctv_cameras.length === 0) fetchCCTVs();
    } else {
        el.classList.remove('active');
        if (toggleIcon) toggleIcon.className = 'fa-solid fa-toggle-off';
    }

    if (layerName === 'flights' || layerName === 'military') updateFlightsLayer();
    else if (layerName === 'satellites') updateSatellitesLayer();
    else if (layerName === 'earthquakes') updateEarthquakesLayer();
    else if (layerName === 'weather') updateWeatherLayer();
    else if (layerName === 'traffic') updateShippingLayer();
    else if (layerName === 'cctv') updateCCTVLayer();
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
        modal.style.display = 'block';
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

        // Setup Shipping Cluster Features
        shippingDataSource.clustering.enabled = true;
        shippingDataSource.clustering.pixelRange = 40;
        shippingDataSource.clustering.minimumClusterSize = 2;
        shippingDataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
            const count = clusteredEntities.length;
            const extraScale = Math.log10(count) * 0.075;
            const baseScale = isMobile ? 0.20 : 0.26; // Dialed back: ~1/3rd smaller than the 0.40 size
            // Proportionally shrink font bounds to smoothly fill the dialed-back hull
            const fontSize = count > 99 ? 16 : (count > 9 ? 18 : 21);

            cluster.label.show = true;
            cluster.label.text = count.toLocaleString();
            cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
            cluster.label.fillColor = Cesium.Color.BLACK;
            cluster.label.outlineColor = Cesium.Color.WHITE;
            cluster.label.outlineWidth = 2;
            cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
            cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            // Drop gracefully downwards to land cleanly inside the widest part of the ship's dialed back hull
            cluster.label.pixelOffset = new Cesium.Cartesian2(0, 5); 
            // Pull the text heavily towards the camera to defeat Z-fighting against the SVG projection
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
                const fontSize = Math.floor(12 + (Math.log10(count) * 2));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px monospace`;
                
                if (color === Cesium.Color.ORANGE) {
                    cluster.label.fillColor = Cesium.Color.BLACK;
                    cluster.label.outlineColor = Cesium.Color.WHITE;
                    cluster.label.outlineWidth = 3;
                } else {
                    cluster.label.fillColor = Cesium.Color.ORANGE;
                    cluster.label.outlineColor = Cesium.Color.BLACK;
                    cluster.label.outlineWidth = 4;
                }
                
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                
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
                const fontSize = Math.floor(12 + (Math.log10(count) * 2));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                cluster.label.fillColor = Cesium.Color.WHITE;
                cluster.label.outlineColor = Cesium.Color.BLACK;
                cluster.label.outlineWidth = 3;
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                
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

        // Setup Earthquake Clustering
        const setupEarthquakeClustering = (dataSource) => {
            dataSource.clustering.enabled = true;
            dataSource.clustering.pixelRange = 40;
            dataSource.clustering.minimumClusterSize = 2;
            dataSource.clustering.clusterEvent.addEventListener(function(clusteredEntities, cluster) {
                const count = clusteredEntities.length;
                const extraScale = Math.log10(count) * 0.2;
                const baseScale = isMobile ? 0.35 : 0.45;
                const fontSize = Math.floor(12 + (Math.log10(count) * 2));

                cluster.label.show = true;
                cluster.label.text = count.toLocaleString();
                cluster.label.font = `bold ${fontSize}px "Share Tech Mono"`;
                cluster.label.fillColor = Cesium.Color.WHITE;
                cluster.label.outlineColor = Cesium.Color.BLACK;
                cluster.label.outlineWidth = 3;
                cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
                cluster.label.pixelOffset = new Cesium.Cartesian2(0, 0);
                
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
                
                let targetIdToLoad = null;

                // If pickedObject.id is an Array, this is a Cesium Cluster!
                if (Array.isArray(pickedObject.id)) {
                    const clusteredEntities = pickedObject.id;
                    if (clusteredEntities.length > 0) {
                        // Pick a random entity directly from the native Cesium cluster payload
                        const randEntity = clusteredEntities[Math.floor(Math.random() * clusteredEntities.length)];
                        targetIdToLoad = randEntity.id || randEntity;
                    }
                } else {
                    // It's a single entity pick
                    if (pickedObject.id.customData) {
                        lockTarget(pickedObject.id.customData);
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
                        lockTarget(match);
                    } else {
                        console.warn("Could not resolve backing data for target:", targetIdToLoad);
                    }
                }
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

        // Initial data sync
        updateFlightsLayer();
        if (state.layers.satellites) updateSatellitesLayer();
        if (state.layers.earthquakes) updateEarthquakesLayer();
        if (state.layers.cctv) updateCCTVLayer();
        if (state.layers.traffic) updateShippingLayer();
        if (state.layers.weather) updateWeatherLayer();
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



// ----- DATA FETCHING -----

async function fetchFlights() {
    try {
        let activeStates = [];
        let timestamp = Math.floor(Date.now() / 1000);

        if (state.dataSources.flights === 'opensky') {
            const res = await fetch(`${API_BASE}/api/flights`);
            if (!res.ok) throw new Error('OpenSky API Error');
            const data = await res.json();
            timestamp = data.time || timestamp;
            activeStates = data.states || [];
            console.log(`[Flights] Fetched ${activeStates.length} raw states from OpenSky API`);
        } else if (state.dataSources.flights === 'adsblol') {
            const res = await fetch('https://api.adsb.lol/v2/ladd');
            if (!res.ok) throw new Error('ADSB.lol API Error');
            const data = await res.json();
            timestamp = Math.floor(data.now / 1000) || timestamp;
            
            // Map ADSB.lol `.ac` array into OpenSky tuple format for uniform pipeline execution
            const ac = data.ac || [];
            activeStates = ac.filter(a => a.lat !== undefined && a.lon !== undefined).map(a => [
                a.hex || 'UNKNOWN',     // [0] icao24
                a.flight || '',         // [1] callsign
                'Unknown',              // [2] origin_country
                null,                   // [3] time_position
                null,                   // [4] last_contact
                a.lon,                  // [5] longitude
                a.lat,                  // [6] latitude
                a.alt_baro || 10000,    // [7] baro_altitude
                false,                  // [8] on_ground
                (a.mach || 0.8) * 340,  // [9] velocity (m/s fallback approximation if mach is provided, else rough guess)
                a.track || 0,           // [10] true_track
                0,                      // [11] vertical_rate
                null,                   // [12] sensors
                a.alt_geom || null,     // [13] geo_altitude
                null,                   // [14] squawk
                false,                  // [15] spi
                0                       // [16] position_source
            ]);
            // Attempt to resolve real velocity if available in knots (1 kt = 0.51444 m/s)
            activeStates.forEach((s, i) => {
                if (ac[i].gs) s[9] = ac[i].gs * 0.51444; 
                else if (ac[i].tas) s[9] = ac[i].tas * 0.51444;
            });
            console.log(`[Flights] Fetched ${activeStates.length} raw states from ADSB.lol API`);
        }

        // Always hide the loading overlay as soon as we get any valid response
        document.getElementById('loading-overlay').style.display = 'none';

        const oldFlightsMap = new Map(state.flights.map(f => [f.id, f]));

        state.flights = activeStates
            .filter(s => s[5] !== null && s[6] !== null && s[8] === false)
            .map(s => {
                try {
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
                        oldFlight.alt = s[7] || 10000;
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
                        alt: s[7] || 10000,
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
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        const earthRadiusMeter = 6371000;
                        const distMeters = earthRadiusMeter * c;

                        // Target polling interval for vessels is ~10s
                        let computedVelocity = distMeters / 10; 
                        
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

// ------------------------------------------
// DECOUPLED LAYER RENDERING ENGINES
// ------------------------------------------

function updateHUDCounts() {
    const flightsSpeed = document.getElementById('flight-speed')?.value || 'all';
    const militarySpeed = document.getElementById('military-speed')?.value || 'all';
    const visibleFlights = (state.flights || []).filter(f => !f.isMilitary && filterBySpeed(f, flightsSpeed));
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

    const counts = {
        flights: visibleFlights.length,
        military: visibleMilitary.length,
        satellites: visibleSatellites.length,
        earthquakes: (state.earthquakes || []).length,
        cctvs: (state.cctv_cameras || []).length,
        traffic: (state.traffic || []).length,
        weather: (state.weatherData || []).length
    };

    try {
        const hudMap = {
            'count-flights': counts.flights,
            'layer-military': counts.military,
            'layer-satellites': counts.satellites,
            'layer-earthquakes': counts.earthquakes,
            'layer-cctv': counts.cctvs,
            'layer-traffic': counts.traffic,
            'layer-weather': counts.weather
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
        const militarySpeed = document.getElementById('military-speed')?.value || 'all';
        const visibleFlights = (state.flights || []).filter(f => !f.isMilitary && filterBySpeed(f, flightsSpeed));
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
                        position: new Cesium.CallbackProperty(() => {
                            const now = performance.now();
                            const dt = (now - (f.fetchTime || now)) / 1000;
                            const dist = (f.velocity || 0) * dt;
                            const bearing = f.heading || 0;
                            const R = 6371000;
                            const lat1 = Cesium.Math.toRadians(f.lat);
                            const lon1 = Cesium.Math.toRadians(f.lng);
                            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dist / R) + Math.cos(lat1) * Math.sin(dist / R) * Math.cos(Cesium.Math.toRadians(bearing)));
                            const lon2 = lon1 + Math.atan2(Math.sin(Cesium.Math.toRadians(bearing)) * Math.sin(dist / R) * Math.cos(lat1), Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2));
                            return Cesium.Cartesian3.fromRadians(lon2, lat2, f.alt || 10000);
                        }, false),
                        billboard: {
                            image: f.isMilitary ? militaryAirplaneSvg : airplaneSvg,
                            color: Cesium.Color.WHITE,
                            scale: isMobile ? 0.35 : 0.45,
                            rotation: 0,
                            alignedAxis: new Cesium.CallbackProperty(() => f.alignedAxis || Cesium.Cartesian3.ZERO, false),
                            disableDepthTestDistance: 0
                        },
                        label: {
                            text: f.callsign || 'N/A',
                            font: '12px monospace',
                            fillColor: Cesium.Color.CYAN,
                            pixelOffset: new Cesium.Cartesian2(0, -25),
                            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
                            show: !isMobile
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

            visibleSatellites.forEach(s => {
                currentSatIds.add(s.id);
                if (!satellitesDataSource.entities.getById(s.id)) {
                    satellitesDataSource.entities.add({
                        id: s.id,
                        position: new Cesium.CallbackProperty(() => {
                            try {
                                const now = new Date();
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
                            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND
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
                const mag = q.properties.mag || 1;
                // Calculate varying lightness of yellow based on magnitude (range mostly 1.0 to 8.0)
                // HSL for yellow is ~60 degrees (1/6 = ~0.16)
                // Lightness: lower magnitude = lighter yellow (closer to white/pale), higher magnitude = pure bright yellow
                // We'll vary the Lightness from 0.8 (pale) down to 0.5 (bright/saturated)
                const clampedMag = Math.max(1, Math.min(8, mag));
                const lightness = 0.8 - ((clampedMag - 1) / 7) * 0.3; 
                const quakeColor = Cesium.Color.fromHsl(0.16, 1.0, lightness, 0.9);

                earthquakesDataSource.entities.add({
                    id: q.id,
                    position: Cesium.Cartesian3.fromDegrees(q.geometry.coordinates[0], q.geometry.coordinates[1], q.geometry.coordinates[2] * 1000),
                    point: { 
                        pixelSize: mag * 4, 
                        color: quakeColor,
                        outlineColor: Cesium.Color.fromHsl(0.16, 1.0, lightness * 0.8, 1.0), // slightly darker yellow outline
                        outlineWidth: 1.5
                    },
                    customData: { type: 'earthquake', id: q.id, title: q.properties?.title || 'Earthquake', lat: q.geometry.coordinates[1], lng: q.geometry.coordinates[0], depth: q.geometry.coordinates[2], mag: mag, time: q.properties?.time, felt: q.properties?.felt, tsunami: q.properties?.tsunami, place: q.properties?.place || q.properties?.flynn_region }
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
            shippingDataSource.entities.suspendEvents();
            const currentVesselIds = new Set((state.traffic || []).map(t => 'vessel_' + t.id));
            const toRemove = [];
            shippingDataSource.entities.values.forEach(e => { if (!currentVesselIds.has(e.id)) toRemove.push(e.id); });
            toRemove.forEach(id => shippingDataSource.entities.removeById(id));

            const earthRadius = 6371000;
            (state.traffic || []).forEach(t => {
                const existing = shippingDataSource.entities.getById('vessel_' + t.id);

                if (!existing) {
                    shippingDataSource.entities.add({
                        id: 'vessel_' + t.id,
                        position: new Cesium.CallbackProperty((time, result) => {
                            try {
                                const now = performance.now();
                                const dt = t.fetchTime ? (now - t.fetchTime) / 1000 : 0;
                                const dist = (t.computedVelocity || 0) * dt;
                                const angularDist = dist / earthRadius;
                                const sLat = Cesium.Math.toRadians(t.startLat || t.lat);
                                const sLng = Cesium.Math.toRadians(t.startLng || t.lng);
                                const head = t.computedHeading || 0;
                                const nLat = Math.asin(Math.sin(sLat) * Math.cos(angularDist) + Math.cos(sLat) * Math.sin(angularDist) * Math.cos(head));
                                const nLng = sLng + Math.atan2(Math.sin(head) * Math.sin(angularDist) * Math.cos(sLat), Math.cos(angularDist) - Math.sin(sLat) * Math.sin(nLat));
                                t.lat = Cesium.Math.toDegrees(nLat);
                                t.lng = Cesium.Math.toDegrees(nLng);
                                return Cesium.Cartesian3.fromRadians(nLng, nLat, 0, viewer.scene.globe.ellipsoid, result);
                            } catch (cpErr) {
                                return undefined;
                            }
                        }, false),
                        billboard: {
                            image: shipSvg,
                            scale: isMobile ? 0.15 : 0.20,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                            disableDepthTestDistance: 0
                        },
                        customData: t
                    });
                }
            });
        } catch (e) {
            console.error('[Globe] Traffic fail:', e.name || 'Error', e.message || e, e.stack);
        } finally {
            shippingDataSource.entities.resumeEvents();
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

function lockTarget(obj) {
    state.target = obj;
    if (obj.type === 'flight' && !obj.origin) fetchFlightRoute(obj);

    const panel = document.getElementById('target-panel');
    panel.style.display = 'flex';
    setTimeout(() => panel.style.transform = 'translateX(0)', 10);
    renderTargetDetails();

    // Zoom Cesium camera
    let zoomRange = 500000;
    if (obj.type === 'cctv') zoomRange = 5000;
    else if (obj.type === 'vessel') zoomRange = 5000;
    else if (obj.type === 'traffic') zoomRange = 10000;
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

    // Offset the camera's actual destination slightly East (+Longitude) 
    // This physically shifts the target leftward on the viewport, perfectly centering it between the HUD menus.
    const lngOffset = (zoomRange / 100000) * 0.2; 
    const viewLng = targetLng + lngOffset;

    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(viewLng, targetLat, zoomRange),
        duration: 1.5,
        orientation: {
            heading: 0.0,
            pitch: -Cesium.Math.PI_OVER_TWO, // Look straight down
            roll: 0.0
        }
    });

    // Provide a neat little offset to track the object
    viewer.scene.preRender.addEventListener(function trackTarget() {
        if (!state.target || state.target.id !== obj.id) {
            viewer.scene.preRender.removeEventListener(trackTarget);
            return;
        }
        // If it's a moving object or we are close, you could optionally keep nudging the camera here,
        // but for now, just initially flying to it is safer than viewer.flyTo() which bugs out.
    });
}

document.getElementById('close-target').addEventListener('click', () => {
    const prevTarget = state.target;
    state.target = null;
    const panel = document.getElementById('target-panel');
    panel.style.transform = 'translateX(120%)';
    setTimeout(() => panel.style.display = 'none', 300);

    // Clean up camera feeds
    clearInterval(_camRefreshInterval);
    _camRefreshInterval = null;
    if (window._hlsInstance) { window._hlsInstance.destroy(); window._hlsInstance = null; }

    // Execute Contextual Zoom Out based on previous target type
    if (prevTarget) {
        let zoomRange = 250000; // default 250km
        if (prevTarget.type === 'vessel') zoomRange = 30000;         // 30km exposing the local fleet
        else if (prevTarget.type === 'cctv') zoomRange = 15000;      // 15km exposing the city
        else if (prevTarget.type === 'satellite') zoomRange = 3000000; // 3000km exposing the orbital constellation
        else if (prevTarget.type === 'earthquake') zoomRange = 5000000; // 5000km exposing the regional faultline and globe
        else if (prevTarget.type === 'flight') zoomRange = 150000;   // 150km exposing area traffic

        let lat = prevTarget.lat || 0;
        let lng = prevTarget.lng || 0;

        // Re-apply the optical HUD offset proportionally to the new back-off altitude
        // This ensures the target stays perfectly locked in the visual center while pulling back
        const lngOffset = (zoomRange / 100000) * 0.2; 
        const viewLng = lng + lngOffset;

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(viewLng, lat, zoomRange),
            duration: 1.5,
            orientation: { heading: 0.0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0.0 }
        });
    } else {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-98.5, 39.8, 10000000),
            duration: 1.5
        });
    }
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
            <div style="font-size: 2rem; color: ${t.isMilitary ? 'var(--hud-pink)' : (t.type === 'cctv' ? '#7bed9f' : (t.type === 'vessel' ? '#ff6b81' : (t.type === 'earthquake' ? '#ffd32a' : 'var(--hud-cyan)')))};">
                <i class="fa-solid ${t.isMilitary ? 'fa-fighter-jet' : (t.type === 'cctv' ? 'fa-video' : (t.type === 'vessel' ? 'fa-ship' : (t.type === 'earthquake' ? 'fa-house-crack' : (isFlight ? 'fa-plane' : 'fa-satellite'))))}"></i>
            </div>
            <h3 style="font-family: 'Share Tech Mono'; font-size: 1.5rem; letter-spacing: 2px;">${t.type === 'earthquake' ? 'SEISMIC EVENT' : (t.callsign || t.title || (t.id ? t.id.toString().split('_')[0] : 'UNKNOWN'))}</h3>
            <div style="font-size: 0.8rem; opacity: 0.8; margin-top: 5px; text-transform: uppercase;">
                ${t.country || t.subtype || (t.type === 'vessel' ? 'MARINE VESSEL' : (t.type === 'earthquake' ? (t.place || t.title || 'UNKNOWN REGION') : 'UNKNOWN ORIGIN'))}
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
            ${t.type !== 'cctv' && t.type !== 'vessel' && t.type !== 'earthquake' && !isTraffic ? `
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
            ${(isFlight || t.type === 'satellite' || t.type === 'vessel') && t.velocityKmH !== undefined ? `
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
            ${(isFlight || t.type === 'vessel') && t.heading !== undefined ? `
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
setInterval(fetchTraffic, 10000); // Poll AIS vessels every 10 seconds
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
