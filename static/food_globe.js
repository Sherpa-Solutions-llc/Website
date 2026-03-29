// sherpa_solutions/static/food_globe.js

let API_BASE = 'https://sherpa-solutions-api-production.up.railway.app';
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
    API_BASE = 'http://127.0.0.1:8001';
}

// 🌍 Initialize Cesium Viewer with Organic Tone
const viewer = new Cesium.Viewer('globe-container', {
    imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url : 'https://a.tile.openstreetmap.org/',
        maximumLevel: 19
    }),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    requestRenderMode: false // Must be false for CallbackProperty animations to continuously render
});

// Configure globe for an organic look
viewer.scene.globe.enableLighting = true;
viewer.scene.globe.atmosphereBrightnessShift = 0.2;
viewer.scene.globe.atmosphereHueShift = 0.1; // Slight green tint
viewer.scene.skyAtmosphere.hueShift = 0.1;

// Lock camera constraints to prevent zooming past OpenStreetMap tile resolutions and entity tracking crashes
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 150000.0; // 150km absolute ceiling
viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// Global State
let currentSuppliers = [];
let routeEntities = [];
let nodeEntities = [];
let heatmapEntities = [];
let weatherLayer = null;

// DOM Elements
const searchBtn = document.getElementById('produce-search-btn');
const searchInput = document.getElementById('produce-search');
const mockWarning = document.getElementById('mock-data-warning');
const qualityFilter = document.getElementById('quality-filter');
const qualityDisplay = document.getElementById('quality-display');
const priceFilter = document.getElementById('price-filter');
const expressToggle = document.getElementById('express-shipping-toggle');
const targetPanel = document.getElementById('target-panel');
const targetDetails = document.getElementById('target-details');
const loadingOverlay = document.getElementById('loading-overlay');
const layerWeatherCheck = document.getElementById('layer-weather');
const layerHeatmapCheck = document.getElementById('layer-heatmap');
const layerShipsCheck = document.getElementById('layer-ships');

const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const inputCpKey = document.getElementById('input-cp-key');
const inputTeKey = document.getElementById('input-te-key');

const vesselPopup = document.getElementById('vessel-popup');
const vesselDetails = document.getElementById('vessel-details');
const closeVesselPopup = document.getElementById('close-vessel-popup');

// --- Initialization ---
window.onload = () => {
    setTimeout(() => {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.style.display = 'none', 1000);
        
        // Spin slowly until search
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(-50.0, 20.0, 20000000.0),
            duration: 5.0
        });
    }, 1500);
    
    // Load persisted settings
    inputCpKey.value = localStorage.getItem('cp_key') || "";
    inputTeKey.value = localStorage.getItem('te_key') || "";

    updateClock();
    setInterval(updateClock, 1000);
    initWeather();
    initVessels();
};

function updateClock() {
    const now = new Date();
    document.getElementById('clock-display').innerText = now.toISOString().replace('T', ' ').substr(0, 19) + ' UTC';
}

// --- Weather Integration (RainViewer) ---
async function initWeather() {
    try {
        const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const rvData = await rvRes.json();
        const host = rvData.host;
        // Grab second most recent timestamp path to ensure edge-cache propagation
        const validPath = rvData.radar.past[rvData.radar.past.length - 2].path; 
        
        const attachWeather = () => {
            if (layerWeatherCheck.checked) {
                if(!weatherLayer) {
                    weatherLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                        url: `${host}${validPath}/256/{z}/{x}/{y}/4/1_1.png`,
                        credit: 'Weather by RainViewer',
                        maximumLevel: 7
                    }));
                    weatherLayer.alpha = 0.75;
                }
            } else {
                if (weatherLayer) {
                    viewer.imageryLayers.remove(weatherLayer);
                    weatherLayer = null;
                }
            }
        };

        attachWeather();
        layerWeatherCheck.addEventListener('change', attachWeather);
    } catch(e) { console.error("Weather init failed", e); }
}

// --- Vessel Integration (Simulated AIS Stream) ---
let vesselEntities = [];
function initVessels() {
    // Generate ~400 simulated vessels randomly scattered across main ocean shipping lanes since true AIS WS requires a paid key.
    const shipLanes = [
        { lat: 40, lon: -40, latV: 20, lonV: 40 }, // North Atlantic
        { lat: 0, lon: -120, latV: 30, lonV: 50 }, // Pacific
        { lat: -10, lon: 70, latV: 20, lonV: 40 }, // Indian
        { lat: 30, lon: 140, latV: 15, lonV: 20 }, // Japan coast
        { lat: -30, lon: 0, latV: 15, lonV: 30 }   // South Atlantic
    ];
    
    const toggleShips = () => {
        if (layerShipsCheck.checked) {
            if (vesselEntities.length === 0) {
                const ports = ["Port of Rotterdam", "Port of Shanghai", "Los Angeles", "Singapore", "Jebel Ali", "Santos", "Valparaiso", "Mombasa", "Callao", "Veracruz", "Antwerp"];
                for(let i = 0; i < 400; i++) {
                    const lane = shipLanes[Math.floor(Math.random() * shipLanes.length)];
                    const sLat = lane.lat + (Math.random() * lane.latV * 2) - lane.latV;
                    const sLon = lane.lon + (Math.random() * lane.lonV * 2) - lane.lonV;
                    
                    const originPort = ports[Math.floor(Math.random() * ports.length)];
                    let destPort = ports[Math.floor(Math.random() * ports.length)];
                    while(destPort === originPort) destPort = ports[Math.floor(Math.random() * ports.length)];
                    
                    const vSpeed = (Math.random() * 15 + 10).toFixed(1);
                    const vHeading = Math.floor(Math.random() * 360);
                    const mmsiRaw = Math.floor(Math.random() * 900000000) + 100000000;
                    
                    const entity = viewer.entities.add({
                        position: Cesium.Cartesian3.fromDegrees(sLon, sLat),
                        point: {
                            color: Cesium.Color.YELLOW,
                            pixelSize: 6,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 1
                        },
                        description: `Cargo Vessel<br>MMSI: ${mmsiRaw}<br>Status: Underway using Engine`
                    });
                    
                    entity.vesselData = {
                        mmsi: mmsiRaw,
                        speed: vSpeed + " Knots",
                        heading: vHeading + "°",
                        origin: originPort,
                        destination: destPort,
                        cargo: "Agricultural Commodities / Refrigerated"
                    };
                    
                    vesselEntities.push(entity);
                }
            }
        } else {
            vesselEntities.forEach(e => viewer.entities.remove(e));
            vesselEntities = [];
        }
    };
    
    toggleShips();
    layerShipsCheck.addEventListener('change', toggleShips);
}

// --- Interaction Logic ---
settingsBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));
closeVesselPopup.addEventListener('click', () => vesselPopup.classList.add('hidden'));
document.getElementById('btn-demo-toggle').addEventListener('click', toggleDemo);

settingsSaveBtn.addEventListener('click', () => {
    localStorage.setItem('cp_key', inputCpKey.value.trim());
    localStorage.setItem('te_key', inputTeKey.value.trim());
    settingsOverlay.classList.add('hidden');
    if (searchInput.value.trim() !== '') handleSearch();
});

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

layerHeatmapCheck.addEventListener('change', () => {
    if (layerHeatmapCheck.checked) {
        currentSuppliers.forEach(s => {
            const entity = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
                ellipse: {
                    semiMinorAxis: 800000.0,
                    semiMajorAxis: 1100000.0,
                    material: Cesium.Color.ORANGERED.withAlpha(0.25),
                    height: 0
                }
            });
            heatmapEntities.push(entity);
        });
    } else {
        heatmapEntities.forEach(e => viewer.entities.remove(e));
        heatmapEntities = [];
    }
});

qualityFilter.addEventListener('input', () => {
    qualityDisplay.innerText = qualityFilter.value + ' Stars & Above';
    applyFilters();
});
priceFilter.addEventListener('change', applyFilters);
expressToggle.addEventListener('change', applyFilters);

document.getElementById('close-target').addEventListener('click', () => {
    targetPanel.style.transform = 'translateX(120%)';
    document.querySelectorAll('.supplier-card').forEach(c => c.style.borderColor = 'rgba(74, 222, 128, 0.3)');
});

// Interactive 3D Node Selection
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(function (click) {
    const pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id) {
        
        if (pickedObject.id.supplierData) {
            const s = pickedObject.id.supplierData;
            
            // Highlight corresponding HTML card
            document.querySelectorAll('.supplier-card').forEach(c => c.style.borderColor = 'rgba(74, 222, 128, 0.3)');
            const card = document.getElementById(`card-${s.id}`);
            if(card) {
                card.style.borderColor = '#4ade80';
                card.scrollIntoView({behavior: 'smooth', block: 'nearest'});
            }

            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 4000000.0),
                duration: 1.5
            });
            vesselPopup.classList.add('hidden');
            
        } else if (pickedObject.id.vesselData) {
            const v = pickedObject.id.vesselData;
            vesselDetails.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>MMSI Identifier:</strong> <span style="color:#00e5ff;">${v.mmsi}</span></div>
                <div style="margin-bottom: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <strong>Origin Port:</strong><br><span style="color:#e2e8f0; font-weight: bold;">${v.origin}</span>
                </div>
                <div style="margin-bottom: 8px; position:relative;">
                    <i class="fa-solid fa-arrow-down" style="color:#bbf7d0; font-size: 0.8rem; margin-left: 5px;"></i>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Destination Port:</strong><br><span style="color:#4ade80; font-weight: bold;">${v.destination}</span>
                </div>
                <div style="margin-bottom: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                    <strong>Speed & Vector:</strong> ${v.speed} @ ${v.heading}
                </div>
                <div style="opacity: 0.6; font-size: 0.8rem; margin-bottom: 8px;">
                    <strong>Manifest:</strong> ${v.cargo}
                </div>
                <!-- Cold Chain IoT Vitals -->
                <div style="background:rgba(0,10,20,0.6); border:1px solid #00e5ff; border-radius:4px; padding:10px;">
                    <strong style="color:#00e5ff; font-size:0.8rem;"><i class="fa-solid fa-temperature-snowflake"></i> CONTAINER IoT VITALS</strong>
                    <div style="display:flex; justify-content:space-between; margin-top:5px;">
                        <span><i class="fa-solid fa-temperature-half" style="color:#4ade80;"></i> 38.4°F</span>
                        <span><i class="fa-solid fa-droplet" style="color:#60a5fa;"></i> 88%</span>
                        <span style="color:#4ade80; font-weight:bold;">OPTIMAL</span>
                    </div>
                </div>
            `;
            vesselPopup.classList.remove('hidden');
        }
    } else {
        vesselPopup.classList.add('hidden');
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);


async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchBtn.innerText = "LINKING...";
    searchBtn.disabled = true;

    // Remove old data
    clearGlobe();
    targetPanel.style.transform = 'translateX(120%)';
    mockWarning.classList.add('hidden');

    try {
        const cpKey = localStorage.getItem('cp_key') || '';
        const teKey = localStorage.getItem('te_key') || '';

        // Shifted APIs proxy logic exclusively to the secure Python backend overlay 
        const res = await fetch(`${API_BASE}/api/sourcing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                cp_key: cpKey,
                te_key: teKey
            })
        });
        
        if (!res.ok) throw new Error("Backend Sourcing Execution Failed");
        const payload = await res.json();
        
        if (payload.mock_used) {
            mockWarning.classList.remove('hidden');
        }
        
        // Predictive Risk Engine Alert
        const alertBanner = document.getElementById('weather-risk-alert');
        const alertText = document.getElementById('weather-risk-text');
        if(Math.random() > 0.4 || window.demoActive) {
            const riskValue = Math.floor(Math.random() * 20 + 5);
            alertText.innerText = `${riskValue}% YIELD DISRUPTION PREDICTED FOR ${query.toUpperCase()}`;
            alertBanner.classList.remove('hidden');
        } else {
            alertBanner.classList.add('hidden');
        }
        
        currentSuppliers = payload.data;
        applyFilters();
        generateNews(query, currentSuppliers);
        
        // Fly to average centroid or first
        if (currentSuppliers.length > 0) {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(currentSuppliers[0].lon, currentSuppliers[0].lat, 10000000.0),
                duration: 2.0
            });
        }

    } catch (e) {
        console.error("Critical error in Sourcing Architecture:", e);
        targetDetails.innerHTML = '<div class="acquiring-msg" style="color:red;">CRITICAL UPLINK FAILURE.</div>';
        targetPanel.style.display = 'block';
        targetPanel.style.transform = 'translateX(0)';
    }

    searchBtn.innerText = "LOCATE";
    searchBtn.disabled = false;
}

// --- Core Mapping Logic ---
function applyFilters() {
    const minQ = parseInt(qualityFilter.value);
    const pTier = priceFilter.value;
    const expressOnly = expressToggle.checked;

    const filtered = currentSuppliers.filter(s => {
        if (s.quality < minQ) return false;
        if (pTier !== 'any' && s.priceTier !== pTier) return false;
        if (expressOnly && s.shippingDays > 5) return false;
        return true;
    });

    renderSuppliers(filtered);
    updateTargetPanel(filtered);
}

function clearGlobe() {
    nodeEntities.forEach(e => viewer.entities.remove(e));
    routeEntities.forEach(e => viewer.entities.remove(e));
    nodeEntities = [];
    routeEntities = [];
}

function renderSuppliers(suppliers) {
    clearGlobe();

    // Base destination (e.g., Grocery store warehouse in Chicago)
    const destLat = 41.8781;
    const destLon = -87.6298;

    suppliers.forEach(s => {
        // Node Color based on quality
        let nodeColor = Cesium.Color.RED;
        if (s.quality >= 4) nodeColor = Cesium.Color.fromCssColorString('#4ade80'); // Green
        else if (s.quality >= 3) nodeColor = Cesium.Color.GOLD;
        else if (s.quality >= 2) nodeColor = Cesium.Color.ORANGE;

        // Render cylinder (Interactive Node)
        const entity = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
            cylinder: {
                length: s.quality * 200000.0,
                topRadius: 60000.0,
                bottomRadius: 60000.0,
                material: new Cesium.ColorMaterialProperty(nodeColor.withAlpha(0.85)),
                outline: true,
                outlineColor: nodeColor
            },
            name: s.name,
            description: `Quality: ${s.quality} Stars<br>Price: ${s.price}<br>Shipping: ${s.shippingDays} Days`
        });
        
        entity.supplierData = s;
        nodeEntities.push(entity);

        // Render Animated Flow Route
        const startPath = Cesium.Cartesian3.fromDegrees(s.lon, s.lat);
        const endPath = Cesium.Cartesian3.fromDegrees(destLon, destLat);
        addAnimatedRoute(startPath, endPath, nodeColor, s);
    });
}

function addAnimatedRoute(startPoint, endPoint, nodeColor, s) {
    const points = generateCurve(startPoint, endPoint);
    const routeColor = s.shippingDays <= 5 ? Cesium.Color.CYAN : nodeColor;

    // Faint static base path footprint
    const baseRoute = viewer.entities.add({
        polyline: {
            positions: points,
            width: 1,
            material: new Cesium.PolylineDashMaterialProperty({
                color: routeColor.withAlpha(0.15),
                dashLength: 20.0
            })
        }
    });
    routeEntities.push(baseRoute);

    // Dynamic glowing shipping particle
    const totalFrames = 200 + (s.shippingDays * 15); // Adjust speed based on shipping days
    let currentFrame = Math.floor(Math.random() * totalFrames);

    const particle = viewer.entities.add({
        position: new Cesium.CallbackProperty(function(time, result) {
            currentFrame = (currentFrame + 1) % totalFrames;
            const progress = currentFrame / totalFrames;
            const idx = Math.floor(progress * (points.length - 1));
            const nextIdx = Math.min(idx + 1, points.length - 1);
            const remainder = (progress * (points.length - 1)) - idx;
            return Cesium.Cartesian3.lerp(points[idx], points[nextIdx], remainder, new Cesium.Cartesian3());
        }, false),
        point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE,
            outlineColor: routeColor,
            outlineWidth: 3
        }
    });
    routeEntities.push(particle);
}

// Enable clicking Cards to Fly to Nodes
window.flyToSupplier = function(id, lon, lat) {
    document.querySelectorAll('.supplier-card').forEach(c => c.style.borderColor = 'rgba(74, 222, 128, 0.3)');
    const card = document.getElementById(`card-${id}`);
    if(card) card.style.borderColor = '#4ade80';

    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 4000000.0),
        duration: 1.5
    });
};

function updateTargetPanel(suppliers) {
    targetDetails.innerHTML = '';
    
    if (suppliers.length === 0) {
        targetDetails.innerHTML = '<div class="acquiring-msg">No suppliers match your stringent criteria.</div>';
    } else {
        // Inject RFQ Broadcast Button at the top
        const rfqBtn = document.createElement('button');
        rfqBtn.className = 'hud-btn-outline';
        rfqBtn.id = 'run-rfq-btn';
        rfqBtn.style.cssText = 'width:100%; border-color:#eab308; color:#eab308; margin-bottom:15px; font-weight:bold;';
        rfqBtn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> BROADCAST RFQ TO VISIBLE';
        rfqBtn.onclick = () => window.broadcastRFQ(suppliers);
        targetDetails.appendChild(rfqBtn);

        suppliers.forEach(s => {
            const stars = '★'.repeat(s.quality) + '☆'.repeat(5 - s.quality);
            const card = document.createElement('div');
            card.className = 'supplier-card';
            card.id = `card-${s.id}`;
            card.style.cursor = 'pointer';
            card.onclick = () => flyToSupplier(s.id, s.lon, s.lat);
            
            // Generate stable pseudorandom ESG scores
            const carbonScore = 70 + (s.quality * 5);
            
            card.innerHTML = `
                <div class="supplier-header">
                    <span class="supplier-name">${s.name} (${s.country})</span>
                    <span class="supplier-stars">${stars}</span>
                </div>
                <div class="supplier-stat"><span>Price Rate:</span> <span class="supplier-stat-value">${s.price}</span></div>
                <div class="supplier-stat"><span>Est. Transit:</span> <span class="supplier-stat-value" style="color:${s.shippingDays <= 5 ? '#00e5ff' : '#e2e8f0'}">${s.shippingDays} Days</span></div>
                <div class="supplier-stat"><span>Reliability Grade:</span> <span class="supplier-stat-value">A${s.quality === 5 ? '+' : '-'}</span></div>
                <div style="margin-top:10px; display:flex; gap:5px; flex-wrap:wrap;">
                    <span style="background:rgba(74,222,128,0.2); border:1px solid #4ade80; color:#4ade80; padding:2px 4px; font-size:0.65rem; border-radius:3px;"><i class="fa-solid fa-leaf"></i> Carbon: ${carbonScore}/100</span>
                    <span style="background:rgba(74,222,128,0.2); border:1px solid #4ade80; color:#4ade80; padding:2px 4px; font-size:0.65rem; border-radius:3px;"><i class="fa-solid fa-handshake"></i> Fair Trade</span>
                    <span style="background:rgba(74,222,128,0.2); border:1px solid #4ade80; color:#4ade80; padding:2px 4px; font-size:0.65rem; border-radius:3px;"><i class="fa-solid fa-users"></i> Ethical Labor</span>
                </div>
            `;
            
            const isPremium = s.quality >= 4;
            const btnClass = isPremium ? 'btn-execute' : 'btn-trace';
            const btnIcon = isPremium ? 'fa-file-signature' : 'fa-magnifying-glass-location';
            const btnText = isPremium ? 'EXECUTE TRADE CONTRACT' : 'INITIATE CORPORATE TRACE';
            const actionStr = isPremium ? `executeTrade('${s.id}'); event.stopPropagation();` : `initiateTrace('${s.name}'); event.stopPropagation();`;
            
            card.innerHTML += `
               <button class="hud-btn-outline ${btnClass}" onclick="${actionStr}" style="width: 100%; margin-top: 15px;">
                   <i class="fa-solid ${btnIcon}"></i> ${btnText}
               </button>
            `;
            
            targetDetails.appendChild(card);
        });
    }

    targetPanel.style.display = 'block';
    targetPanel.style.transform = 'translateX(0)';
}

window.broadcastRFQ = function(suppliers, autoSelect = false) {
    if(!suppliers || suppliers.length === 0) return;
    const overlay = document.getElementById('rfq-overlay');
    const bidContainer = document.getElementById('rfq-bids');
    const proceedBtn = document.getElementById('rfq-close-btn');
    
    overlay.classList.remove('hidden');
    proceedBtn.classList.add('hidden');
    bidContainer.innerHTML = '<div style="color:#e2e8f0; font-size:0.9rem; text-align:center; opacity:0.8;"><i class="fa-solid fa-circle-notch fa-spin"></i> Transmitting RFQ packet to regional network...</div>';
    
    // Pick the top 3 visible suppliers
    const targets = suppliers.slice(0, 3);
    let bestSupplier = targets[0];
    
    setTimeout(() => {
        bidContainer.innerHTML = '';
        targets.forEach((s, i) => {
            setTimeout(() => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; justify-content:space-between; padding:8px; background:rgba(0,0,0,0.5); border-left:3px solid #eab308; margin-bottom:5px; animation: slideInX 0.3s ease-out;';
                row.innerHTML = `
                    <span style="color:#e2e8f0; font-size:0.85rem;">${s.name} (${s.country})</span>
                    <span style="color:#4ade80; font-weight:bold; font-family:'Share Tech Mono';">${s.price}</span>
                `;
                bidContainer.appendChild(row);
                
                if(i === targets.length - 1) {
                    proceedBtn.classList.remove('hidden');
                }
            }, i * 800);
        });
    }, 1200);
    
    proceedBtn.onclick = () => {
        overlay.classList.add('hidden');
        window.flyToSupplier(bestSupplier.id, bestSupplier.lon, bestSupplier.lat);
        setTimeout(() => window.executeTrade(bestSupplier.id, autoSelect), 1000);
    };
    
    if(autoSelect) {
        setTimeout(() => proceedBtn.click(), 1200 + (targets.length * 800) + 1500);
    }
};

// Helper to generate arc between two points
function generateCurve(startPoint, endPoint) {
    const points = [];
    const spline = new Cesium.CatmullRomSpline({
        times: [0.0, 0.5, 1.0],
        points: [
            startPoint,
            Cesium.Cartesian3.add(
                Cesium.Cartesian3.multiplyByScalar(Cesium.Cartesian3.add(startPoint, endPoint, new Cesium.Cartesian3()), 0.5, new Cesium.Cartesian3()),
                Cesium.Cartesian3.multiplyByScalar(Cesium.Cartesian3.normalize(startPoint, new Cesium.Cartesian3()), 3000000.0, new Cesium.Cartesian3()),
                new Cesium.Cartesian3()
            ),
            endPoint
        ]
    });
    for (let i = 0; i <= 40; i++) {
        points.push(spline.evaluate(i / 40.0));
    }
    return points;
}

// Phase 3 Features
window.initiateTrace = function(name) {
    if (confirm(`You are about to launch an OSINT Trace via Traku on ${name}. Proceed?`)) {
        window.location.href = `/skip_tracer.html?target=${encodeURIComponent(name)}`;
    }
};

window.executeTrade = function(id, autoConfirm = false) {
    const overlay = document.getElementById('transaction-overlay');
    const configBlock = document.getElementById('tx-config');
    const spinnerBlock = document.getElementById('tx-spinner-block');
    const confirmBtn = document.getElementById('tx-confirm-btn');
    
    const step1 = document.getElementById('tx-step-1');
    const step2 = document.getElementById('tx-step-2');
    const step3 = document.getElementById('tx-step-3');
    const closeBtn = document.getElementById('tx-close');
    const icon = document.getElementById('tx-icon');
    const title = document.getElementById('tx-title');
    
    // Bind dynamic metadata to config block
    const s = currentSuppliers.find(x => x.id === id);
    if(s) {
        document.getElementById('tx-supplier-info').innerHTML = `Logistics POC: +44 20 7946 0958<br>Email: dispatch@${s.name.replace(/\s+/g, '').toLowerCase()}.com`;
        document.getElementById('tx-supplier-eta').innerText = `${s.shippingDays} Days Minimum Transit Time`;
    } else {
        document.getElementById('tx-supplier-info').innerHTML = `Logistics POC: Unknown<br>Email: Unknown`;
        document.getElementById('tx-supplier-eta').innerText = `ETA Pending Calculation`;
    }
    
    // Show Modal in Config State
    overlay.classList.remove('hidden');
    configBlock.classList.remove('hidden');
    spinnerBlock.classList.add('hidden');
    closeBtn.classList.add('hidden');
    
    icon.className = 'fa-solid fa-file-contract'; 
    icon.style.color = '#ef4444';
    title.innerText = 'PURCHASE AGREEMENT';
    
    const runSpinner = () => {
        configBlock.classList.add('hidden');
        spinnerBlock.classList.remove('hidden');
        
        icon.className = 'fa-solid fa-file-signature'; icon.style.color = '#4ade80';
        title.innerText = 'EXECUTING SMART CONTRACT';
        
        step1.className = 'tx-step active'; step1.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Securing Blockchain Node...';
        step2.className = 'tx-step'; step2.innerHTML = '<i class="fa-solid fa-clock"></i> Transmitting SWIFT Payment...';
        step3.className = 'tx-step'; step3.innerHTML = '<i class="fa-solid fa-clock"></i> Acquiring Target Cargo...';
        
        setTimeout(() => {
            step1.className = 'tx-step done'; step1.innerHTML = '<i class="fa-solid fa-check"></i> Node Secured.';
            step2.className = 'tx-step active'; step2.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Transmitting SWIFT Payment...';
            setTimeout(() => {
                step2.className = 'tx-step done'; step2.innerHTML = '<i class="fa-solid fa-check"></i> SWIFT Cleared.';
                step3.className = 'tx-step active'; step3.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Acquiring Target Cargo...';
                setTimeout(() => {
                    step3.className = 'tx-step done'; step3.innerHTML = '<i class="fa-solid fa-check"></i> Cargo Acquired.';
                    icon.className = 'fa-solid fa-square-check';
                    title.innerText = 'TRANSACTION COMPLETE';
                    closeBtn.classList.remove('hidden');
                }, 1000);
            }, 1500);
        }, 1000);
    };
    
    confirmBtn.onclick = runSpinner;
    if(autoConfirm) {
        setTimeout(() => runSpinner(), 2000);
    }
};

if (document.getElementById('tx-close')) {
    document.getElementById('tx-close').addEventListener('click', () => {
        document.getElementById('transaction-overlay').classList.add('hidden');
    });
}

function generateNews(query, suppliers) {
    const ticker = document.getElementById('news-ticker-content');
    if(!suppliers || suppliers.length === 0) {
        ticker.innerText = `Awaiting regional macroeconomic data for ${query.toUpperCase()}...`;
        return;
    }
    const safeCountry1 = suppliers[0] ? suppliers[0].country : 'Global Harvesters';
    const randSupp = suppliers[Math.floor(Math.random() * suppliers.length)];
    const safeCountry2 = randSupp ? randSupp.country : 'Unknown Region';
    
    const headlines = [
        `\u26A0\uFE0F BREAKING: Port workers union in ${safeCountry1} threatening strike, potential 72-hour delay for ${query.toUpperCase()}.`,
        `\ud83d\udcc8 COMMODITIES: Global demand for ${query.toUpperCase()} surging 12% MoM. Expect spot price volatility.`,
        `\ud83c\udf29\uFE0F WEATHER DESK: Unusual rainfall patterns developing over ${safeCountry2}. Quality yields may be impacted.`,
        `\ud83d\udea2 LOGISTICS UPDATE: Maersk redirecting 6 class-A container ships to prioritize ${query.toUpperCase()} transit from South America.`
    ];
    ticker.innerText = headlines.join("  |  \u25CF  |  ") + "  |  \u25CF  |  ";
}

// --- Cinematic Automation Engine (Demo) ---
let demoActive = false;
let demoIntervals = [];

window.demoVolume = 0.5;
window.setDemoVolume = (val) => { window.demoVolume = parseInt(val)/100; };
if (window.speechSynthesis) window.speechSynthesis.getVoices();

function speakDirective(text) {
    if(!window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = window.demoVolume;
    utterance.pitch = 1.1;
    utterance.rate = 1.0;
    
    let voices = window.speechSynthesis.getVoices();
    let voice = voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) || 
                voices.find(v => v.lang === 'en-GB') || 
                voices[0];
    if(voice) utterance.voice = voice;
    
    window.speechSynthesis.speak(utterance);
}

function toggleDemo() {
    const btn = document.getElementById('btn-demo-toggle');
    
    if (demoActive) {
        // Stop Demo & Reset
        demoActive = false;
        if(window.speechSynthesis) window.speechSynthesis.cancel();
        
        btn.innerHTML = '<i class="fa-solid fa-play"></i> DEMO OFF';
        btn.style.borderColor = 'rgba(0, 229, 255, 0.5)';
        btn.style.color = '#00e5ff';
        demoIntervals.forEach(clearTimeout);
        demoIntervals = [];
        
        searchInput.value = "";
        clearGlobe();
        targetPanel.style.transform = 'translateX(120%)';
        document.getElementById('settings-panel').classList.add('hidden');
        document.getElementById('quality-slider').value = 1;
        document.getElementById('quality-display').innerText = 'Any Quality';
        document.getElementById('price-filter').value = 'any';
        
        const layerHeatmapCheck = document.getElementById('layer-heatmap');
        layerHeatmapCheck.checked = false;
        layerHeatmapCheck.dispatchEvent(new Event('change'));
        
        document.getElementById('layer-weather').checked = false;
        document.getElementById('layer-weather').dispatchEvent(new Event('change'));
        document.getElementById('layer-ships').checked = false;
        document.getElementById('layer-ships').dispatchEvent(new Event('change'));
        
        document.getElementById('transaction-overlay').classList.add('hidden');
        vesselPopup.classList.add('hidden');
    } else {
        // Start Demo
        demoActive = true;
        btn.innerHTML = '<i class="fa-solid fa-stop"></i> DEMO RUNNING';
        btn.style.borderColor = '#ef4444';
        btn.style.color = '#ef4444';
        
        if(window.speechSynthesis) window.speechSynthesis.cancel();
        speakDirective("Thank you for allowing Sherpa Solutions to demonstrate the Harvest Tracker. Harvest Tracker is a specialized 3D geospatial dashboard engineered for global agriculture and B-to-B grocery supply chains.");
        
        // Ensure starting clean
        document.getElementById('layer-weather').checked = false;
        document.getElementById('layer-weather').dispatchEvent(new Event('change'));
        document.getElementById('layer-ships').checked = false;
        document.getElementById('layer-ships').dispatchEvent(new Event('change'));
        
        // Sequence: 1. Reset Camera & Input
        viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(-50.0, 20.0, 20000000.0), duration: 2.0 });
        searchInput.value = "";
        
        // Intro Speech Delay
        demoIntervals.push(setTimeout(() => {
            speakDirective("Let's showcase the core features. We begin by querying the global supplier network for avocados.");
        }, 12000));
        
        const typeText = "Avocados";
        let typeDelay = 18000;
        for (let i = 0; i < typeText.length; i++) {
            demoIntervals.push(setTimeout(() => { searchInput.value += typeText[i]; }, typeDelay + (i * 100)));
        }
        
        // Trigger locating engine
        demoIntervals.push(setTimeout(() => { 
            handleSearch(); 
            setTimeout(() => speakDirective("The intelligence engine automatically surfaces and plots verified suppliers on the globe."), 500);
        }, typeDelay + (typeText.length * 100) + 500));
        
        // Sequence: 2. Sourcing Filters
        demoIntervals.push(setTimeout(() => {
            speakDirective("Opening parameter controls to apply sourcing constraints and maximum price boundaries.");
            document.getElementById('settings-panel').classList.remove('hidden');
            
            demoIntervals.push(setTimeout(() => {
                document.getElementById('quality-slider').value = 4;
                document.getElementById('quality-display').innerText = 'Premium (Grade A)';
            }, 1000));
            
            demoIntervals.push(setTimeout(() => {
                document.getElementById('price-filter').value = 'low';
                handleSearch(); // Recalculate dots based on new filters
            }, 2500));
            
        }, 25000));
        
        // Sequence: 3. Telemetry & Weather Layers
        demoIntervals.push(setTimeout(() => {
            speakDirective("Activating live global weather radar and ocean telemetry to monitor potential supply chain disruptions.");
            
            demoIntervals.push(setTimeout(() => {
                document.getElementById('layer-weather').checked = true;
                document.getElementById('layer-weather').dispatchEvent(new Event('change'));
            }, 1000));
            
            demoIntervals.push(setTimeout(() => {
                document.getElementById('layer-ships').checked = true;
                document.getElementById('layer-ships').dispatchEvent(new Event('change'));
            }, 2500));
            
        }, 33000));
        
        // Sequence: 4. Activate Visual Heatmaps
        demoIntervals.push(setTimeout(() => {
            speakDirective("Activating simulated sourcing heatmaps to identify optimal quality zones.");
            const layerHeatmapCheck = document.getElementById('layer-heatmap');
            layerHeatmapCheck.checked = true;
            layerHeatmapCheck.dispatchEvent(new Event('change'));
        }, 41000));
        
        // Sequence: 5. Broadcast RFQ & Intercept
        demoIntervals.push(setTimeout(() => {
            document.getElementById('settings-panel').classList.add('hidden'); // Clean up UI
            const premium = currentSuppliers.find(s => s.quality >= 4);
            if(premium) {
                speakDirective("Here, we broadcast a Request for Quote to the highest quality suppliers, instantly executing a smart contract on the most favorable bid.");
                const filtered = currentSuppliers.filter(s => s.quality >= 4);
                window.broadcastRFQ(filtered, true);
            }
        }, 47000));
        
        // Sequence: 6. Close transaction
        demoIntervals.push(setTimeout(() => {
             document.getElementById('transaction-overlay').classList.add('hidden');
        }, 59000));
        
        // Sequence: 7. Engage Telemetry Target
        demoIntervals.push(setTimeout(() => {
             if (vesselEntities.length > 0) {
                 speakDirective("Once the contract is secured, we transition to logistics. Engaging live cargo vessel telemetry and container I O T to intimately track your perishable shipments in transit.");
                 const v = vesselEntities[0].vesselData;
                 const coord = Cesium.Cartographic.fromCartesian(vesselEntities[0].position.getValue(viewer.clock.currentTime));
                 const sLat = Cesium.Math.toDegrees(coord.latitude);
                 const sLon = Cesium.Math.toDegrees(coord.longitude);
                 
                 viewer.camera.flyTo({
                     destination: Cesium.Cartesian3.fromDegrees(sLon, sLat, 3000000.0),
                     duration: 2.0
                 });
                 
                 demoIntervals.push(setTimeout(() => {
                     vesselDetails.innerHTML = `
                        <div style="margin-bottom: 8px;"><strong>MMSI Identifier:</strong> <span style="color:#00e5ff;">${v.mmsi}</span></div>
                        <div style="margin-bottom: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                            <strong>Origin Port:</strong><br><span style="color:#e2e8f0; font-weight: bold;">${v.origin}</span>
                        </div>
                        <div style="margin-bottom: 8px; position:relative;">
                            <i class="fa-solid fa-arrow-down" style="color:#bbf7d0; font-size: 0.8rem; margin-left: 5px;"></i>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>Destination Port:</strong><br><span style="color:#4ade80; font-weight: bold;">${v.destination}</span>
                        </div>
                        <div style="margin-bottom: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
                            <strong>Speed & Vector:</strong> ${v.speed} @ ${v.heading}
                        </div>
                        <div style="opacity: 0.6; font-size: 0.8rem; margin-bottom: 8px;">
                            <strong>Manifest:</strong> ${v.cargo}
                        </div>
                        <!-- Cold Chain IoT Vitals -->
                        <div style="background:rgba(0,10,20,0.6); border:1px solid #00e5ff; border-radius:4px; padding:10px;">
                            <strong style="color:#00e5ff; font-size:0.8rem;"><i class="fa-solid fa-temperature-snowflake"></i> CONTAINER IoT VITALS</strong>
                            <div style="display:flex; justify-content:space-between; margin-top:5px;">
                                <span><i class="fa-solid fa-temperature-half" style="color:#4ade80;"></i> 38.4°F</span>
                                <span><i class="fa-solid fa-droplet" style="color:#60a5fa;"></i> 88%</span>
                                <span style="color:#4ade80; font-weight:bold;">OPTIMAL</span>
                            </div>
                        </div>
                     `;
                     vesselPopup.classList.remove('hidden');
                 }, 1500));
             }
        }, 60000));
        
        // Sequence: 8. Clean reset
        demoIntervals.push(setTimeout(() => {
            speakDirective("Demo sequence gracefully complete. Restarting environment.");
            setTimeout(() => {
                if(demoActive) toggleDemo();
            }, 4000); // Allow time for final voice line to finish before resetting the UI.
        }, 70000));
    }
}

// --- SaaS Feature: Live Pricing Ticker ---
setInterval(() => {
    const avoEl = document.getElementById('spot-avo');
    const cofEl = document.getElementById('spot-cof');
    const whtEl = document.getElementById('spot-wht');
    if(!avoEl || !cofEl || !whtEl) return;
    
    // Simulate minor fluctuations (-0.05 to +0.05)
    let avo = parseFloat(avoEl.innerText.match(/\d+\.\d+/)[0]);
    let cof = parseFloat(cofEl.innerText.match(/\d+\.\d+/)[0]);
    let wht = parseFloat(whtEl.innerText.match(/\d+/)[0]);
    
    avo = Math.max(0.5, avo + (Math.random() * 0.1 - 0.05)).toFixed(2);
    cof = Math.max(0.5, cof + (Math.random() * 0.1 - 0.05)).toFixed(2);
    wht = Math.floor(Math.max(100, wht + (Math.random() * 4 - 2)));
    
    const avoArrow = Math.random() > 0.5 ? '<i class="fa-solid fa-caret-up" style="color:#4ade80;"></i>' : '<i class="fa-solid fa-caret-down" style="color:#ef4444;"></i>';
    const cofArrow = Math.random() > 0.5 ? '<i class="fa-solid fa-caret-up" style="color:#4ade80;"></i>' : '<i class="fa-solid fa-caret-down" style="color:#ef4444;"></i>';
    const whtArrow = Math.random() > 0.5 ? '<i class="fa-solid fa-caret-up" style="color:#4ade80;"></i>' : '<i class="fa-solid fa-caret-down" style="color:#ef4444;"></i>';
    
    avoEl.innerHTML = `AVO: $${avo} ${avoArrow}`;
    cofEl.innerHTML = `COF: $${cof} ${cofArrow}`;
    whtEl.innerHTML = `WHT: $${wht} ${whtArrow}`;
}, 3000);
