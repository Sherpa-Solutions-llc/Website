// Mock Employee Data
const mockEmployees = [
    {
        id: 'EMP-001',
        firstName: 'Jane',
        lastName: 'Doe',
        department: 'Counterintelligence',
        dutyStation: 'Quantico, VA',
        lat: 38.5222,
        lng: -77.2997,
        schedule: '0800 - 1700 EST',
        nationality: 'United States',
        manager: 'Dir. Smith',
        clearance: 'TS/SCI',
        status: 'ACTIVE - ON STATION',
        email: 'jane.doe@dcsa.mil.example',
        phone: '+1-555-0192',
        avatar: 'static/gov_headshot_2.png'
    },
    {
        id: 'EMP-002',
        firstName: 'Marcus',
        lastName: 'Chen',
        department: 'Industrial Security',
        dutyStation: 'San Francisco, CA',
        lat: 37.7749,
        lng: -122.4194,
        schedule: '0900 - 1800 PST',
        nationality: 'United States',
        manager: 'Reg. Dir. Vance',
        clearance: 'Secret',
        status: 'REMOTE WORK',
        email: 'marcus.chen@dcsa.mil.example',
        phone: '+1-555-0284',
        avatar: 'static/gov_headshot_1.png'
    },
    {
        id: 'EMP-003',
        firstName: 'Elena',
        lastName: 'Rostova',
        department: 'Personnel Vetting',
        dutyStation: 'London, UK (Embassy)',
        lat: 51.5074,
        lng: -0.1278,
        schedule: '0800 - 1600 GMT',
        nationality: 'United States',
        manager: 'Attache Brown',
        clearance: 'TS',
        status: 'TDY',
        email: 'elena.rostova@dcsa.mil.example',
        phone: '+44-20-7946-0111',
        avatar: 'static/gov_headshot_2.png'
    },
    {
        id: 'EMP-004',
        firstName: 'David',
        lastName: 'Miller',
        department: 'Security Training',
        dutyStation: 'Fort Meade, MD',
        lat: 39.1084,
        lng: -76.7441,
        schedule: '0700 - 1500 EST',
        nationality: 'United States',
        manager: 'Cmdr. Jenkins',
        clearance: 'TS/SCI',
        status: 'ACTIVE - ON STATION',
        email: 'david.miller@dcsa.mil.example',
        phone: '+1-555-0842',
        avatar: 'static/gov_headshot_3.png'
    },
    {
        id: 'EMP-005',
        firstName: 'Sarah',
        lastName: 'Oconnor',
        department: 'Cyber Threat Analysis',
        dutyStation: 'Tokyo, Japan (USFJ)',
        lat: 35.6762,
        lng: 139.6503,
        schedule: '0900 - 1800 JST',
        nationality: 'United States',
        manager: 'Lt Col. Davis',
        clearance: 'TS/SCI',
        status: 'PCS - IN TRANSIT',
        email: 'sarah.oconnor@dcsa.mil.example',
        phone: '+81-3-1234-5678',
        avatar: 'static/gov_headshot_2.png'
    }
];

let viewer = null;
let leafletMap = null;
let employeeDataSource = null;
let is3DMode = false;
let hasLoaded3D = false; // Track if 3D has been initialized this session
let employeeEntities = {};

// DCSA has approximately 15,000 employees
const totalTarget = 15000;
const firstNames = ['John', 'Jane', 'Michael', 'Emily', 'Robert', 'Sarah', 'David', 'Jessica', 'William', 'Ashley', 'James', 'Amanda', 'Christopher', 'Melissa', 'Thomas', 'Jennifer', 'Richard', 'Nicole', 'Charles', 'Elizabeth', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Paul', 'Steven', 'Andrew', 'Kenneth', 'Joshua', 'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy', 'Jason'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres'];
const depts = ['Counterintelligence', 'Industrial Security', 'Personnel Vetting', 'Security Training', 'Cyber Threat Analysis', 'Background Investigations', 'Adjudications'];
const stations = ['Quantico, VA', 'San Francisco, CA', 'London, UK (Embassy)', 'Fort Meade, MD', 'Tokyo, Japan (USFJ)', 'Washington, D.C.', 'Frankfurt, Germany', 'Seoul, South Korea', 'Boyers, PA', 'Huntsville, AL'];
const clearances = ['Secret', 'Top Secret', 'TS/SCI', 'Unclassified'];
const statuses = ['ACTIVE - ON STATION', 'ACTIVE - ON STATION', 'ACTIVE - ON STATION', 'REMOTE WORK', 'TDY', 'PCS - IN TRANSIT', 'OOO'];

// Safe Storage Helper
const safeStorage = {
    get: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { console.warn("Storage Get Failed:", e); return null; }
    },
    set: (key, val) => {
        try { localStorage.setItem(key, val); }
        catch (e) { console.warn("Storage Set Failed:", e); }
    }
};

const cities = [
    { name: 'DC Metro', lat: 38.9, lng: -77.0, weight: 15, spread: 0.5 },
    { name: 'Quantico', lat: 38.5, lng: -77.3, weight: 10, spread: 0.2 },
    { name: 'Fort Meade', lat: 39.1, lng: -76.8, weight: 8, spread: 0.2 },
    { name: 'New York', lat: 40.7, lng: -74.0, weight: 5, spread: 0.3 },
    { name: 'San Francisco', lat: 37.7, lng: -122.4, weight: 5, spread: 0.4 },
    { name: 'Los Angeles', lat: 34.0, lng: -118.2, weight: 5, spread: 0.4 },
    { name: 'Chicago', lat: 41.8, lng: -87.6, weight: 4, spread: 0.3 },
    { name: 'Houston', lat: 29.7, lng: -95.3, weight: 3, spread: 0.4 },
    { name: 'Atlanta', lat: 33.7, lng: -84.3, weight: 3, spread: 0.3 },
    { name: 'London', lat: 51.5, lng: -0.1, weight: 2, spread: 0.2 },
    { name: 'Frankfurt', lat: 50.1, lng: 8.6, weight: 2, spread: 0.2 },
    { name: 'Tokyo', lat: 35.6, lng: 139.6, weight: 2, spread: 0.2 },
    { name: 'Seoul', lat: 37.5, lng: 126.9, weight: 2, spread: 0.2 },
    { name: 'Hawaii', lat: 21.3, lng: -157.8, weight: 1, spread: 0.1 },
    { name: 'Alaska', lat: 61.2, lng: -149.9, weight: 1, spread: 0.3 }
];

let totalWeight = cities.reduce((sum, city) => sum + city.weight, 0);

function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

for (let i = mockEmployees.length + 1; i <= totalTarget; i++) {
    // Pick city based on weight
    let r = Math.random() * totalWeight;
    let selectedCity = cities[0];
    for (let c of cities) {
        if (r < c.weight) {
            selectedCity = c;
            break;
        }
        r -= c.weight;
    }

    let lat = selectedCity.lat + gaussianRandom() * selectedCity.spread;
    let lng = selectedCity.lng + gaussianRandom() * selectedCity.spread;

    mockEmployees.push({
        id: `EMP-${i.toString().padStart(5, '0')}`,
        firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
        lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
        department: depts[Math.floor(Math.random() * depts.length)],
        dutyStation: stations[Math.floor(Math.random() * stations.length)],
        lat: lat,
        lng: lng,
        schedule: '0800 - 1700 Local',
        nationality: 'United States',
        manager: 'Assigned Supervisor',
        clearance: clearances[Math.floor(Math.random() * clearances.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        email: `emp${i}@dcsa.mil.example`,
        phone: '+1-555-' + Math.floor(1000 + Math.random() * 9000),
        avatar: `static/gov_headshot_${Math.floor(Math.random() * 3) + 1}.png`
    });
}

// Initialize Cesium Viewer
function initCesium() {
    document.getElementById('cesiumContainer').style.display = 'block';
    if (viewer) return; // already initialized

    Cesium.Ion.defaultAccessToken = Cesium.Ion.defaultAccessToken; // Use default for demo

    // Set default view to North America (USA focus)
    Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(-125.0, 20.0, -65.0, 55.0);
    Cesium.Camera.DEFAULT_VIEW_FACTOR = 0.5;

    viewer = new Cesium.Viewer('cesiumContainer', {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: true,
        shadows: true,
        sceneMode: Cesium.SceneMode.SCENE3D,
        baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
            url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            maximumLevel: 19
        }))
    });

    // Add 3D Buildings for urban detail
    try {
        viewer.scene.primitives.add(Cesium.createOsmBuildings());
    } catch (e) {
        console.warn("Could not load 3D Buildings.", e);
    }

    // Cinematic Post Processing (Disabled for lifelike realism)
    viewer.scene.highDynamicRange = true;
    const bloom = viewer.scene.postProcessStages.bloom;
    bloom.enabled = false;

    // Remove credits for cleaner UI (Demo purposes)
    viewer.cesiumWidget.creditContainer.style.display = 'none';

    // Plot Employees on Globe with Clustering
    employeeDataSource = new Cesium.CustomDataSource('employees');
    viewer.dataSources.add(employeeDataSource);

    // Enable clustering
    employeeDataSource.clustering.enabled = true;
    employeeDataSource.clustering.pixelRange = 50;
    employeeDataSource.clustering.minimumClusterSize = 2;

    // Setup Cluster Styling
    const pinBuilder = new Cesium.PinBuilder();
    const pinColor = Cesium.Color.fromCssColorString('#ff7a00');
    const singleDigitPins = new Array(8);
    for (let i = 0; i < singleDigitPins.length; ++i) {
        singleDigitPins[i] = pinBuilder.fromText('' + (i + 2), pinColor, 48).toDataURL();
    }
    const pin10 = pinBuilder.fromText('10+', pinColor, 48).toDataURL();

    employeeDataSource.clustering.clusterEvent.addEventListener(function (clusteredEntities, cluster) {
        cluster.label.show = false;
        cluster.billboard.show = true;
        cluster.billboard.id = cluster.label.id;
        cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;

        // Store references to the entities in this cluster for drill-down clicks
        cluster.billboard.clusteredEntities = clusteredEntities;

        if (clusteredEntities.length >= 10) {
            cluster.billboard.image = pin10;
        } else {
            cluster.billboard.image = singleDigitPins[clusteredEntities.length - 2];
        }
    });

    // Suspend events while adding thousands of entities to prevent browser freeze
    employeeDataSource.entities.suspendEvents();

    mockEmployees.forEach(emp => {
        // Determine color based on status
        let color = Cesium.Color.fromCssColorString('#ff7a00'); // Active
        if (emp.status.includes('REMOTE')) color = Cesium.Color.fromCssColorString('#8892b0'); // Remote/Grey
        if (emp.status.includes('TDY') || emp.status.includes('PCS')) color = Cesium.Color.fromCssColorString('#ffb86c'); // Orange/Warning
        if (emp.status.includes('OOO')) color = Cesium.Color.fromCssColorString('#ff5555'); // Red/Out

        const entity = employeeDataSource.entities.add({
            id: emp.id,
            position: Cesium.Cartesian3.fromDegrees(emp.lng, emp.lat),
            point: {
                pixelSize: 20,
                color: color,
                outlineColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.4)'),
                outlineWidth: 6,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            label: {
                text: `${emp.firstName} ${emp.lastName}`,
                font: '10pt monospace',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                outlineWidth: 2,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -12),
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                // Only show labels when close to the ground (within 200km)
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 200000.0),
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            properties: emp
        });

        employeeEntities[emp.id] = { entity, data: emp };
    });

    employeeDataSource.entities.resumeEvents();

    // Fly to initial global view
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-40.0, 30.0, 20000000.0),
        duration: 3
    });




    // Add click handler inside init
    viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
        const pickedObject = viewer.scene.pick(movement.position);
        if (Cesium.defined(pickedObject)) {
            // Case 1: Clicked a cluster (drill-down)
            if (pickedObject.primitive && pickedObject.primitive.clusteredEntities) {
                const entities = pickedObject.primitive.clusteredEntities;
                if (entities.length > 0) {
                    const randomEntity = entities[Math.floor(Math.random() * entities.length)];
                    const empData = randomEntity.properties.getValue(Cesium.JulianDate.now());
                    if (empData) selectEmployee(empData);
                }
                return;
            }

            // Case 2: Clicked a single entity
            if (Cesium.defined(pickedObject.id) && pickedObject.id.properties) {
                const empData = pickedObject.id.properties.getValue(Cesium.JulianDate.now());
                if (empData) selectEmployee(empData);
            }
        } else {
            popup.style.display = 'none';
        }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function initLeaflet() {
    console.log("DCSA Engine: Initializing Tactical Overlay...");
    document.getElementById('leafletContainer').style.display = 'block';
    if (leafletMap) return;

    if (typeof L === 'undefined') {
        console.error("DCSA Engine Error: Leaflet library not found.");
        return;
    }

    leafletMap = L.map('leafletContainer', { zoomControl: false }).setView([39.0, -95.0], 3);

    // Esri World Imagery (High-Res Color Map - Live Compatible)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
    }).addTo(leafletMap);

    const canvasRenderer = L.canvas({ padding: 0.5 });

    mockEmployees.forEach(emp => {
        let color = '#ff7a00';
        if (emp.status.includes('REMOTE')) color = '#8892b0';
        if (emp.status.includes('TDY') || emp.status.includes('PCS')) color = '#ffb86c';
        if (emp.status.includes('OOO')) color = '#ff5555';

        const marker = L.circleMarker([emp.lat, emp.lng], {
            renderer: canvasRenderer,
            color: 'rgba(0,0,0,0.4)',
            weight: 3,
            fillColor: color,
            fillOpacity: 1,
            radius: 10
        }).addTo(leafletMap);

        marker.on('click', () => selectEmployee(emp));
        employeeEntities[emp.id] = { leafletMarker: marker, data: emp };
    });

    // Fix scrambled tiles by invalidating size after layout
    setTimeout(() => {
        leafletMap.invalidateSize();
    }, 100);
    setTimeout(() => {
        leafletMap.invalidateSize();
    }, 500);
    setTimeout(() => {
        leafletMap.invalidateSize();
    }, 1500);
}
window.addEventListener('load', () => {
    initLeaflet();
    renderResults();
});

// UI Logic: Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        // Add active class to clicked tab and corresponding pane
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
});

// UI Logic: Search
const locateSearchFirst = document.getElementById('locateSearchFirst');
const locateSearchLast = document.getElementById('locateSearchLast');
const executeLocateSearchBtn = document.getElementById('executeLocateSearchBtn');
const resultsList = document.getElementById('resultsList');

function renderResults() {
    resultsList.innerHTML = '';
    const fq = locateSearchFirst.value.toLowerCase().trim();
    const lq = locateSearchLast.value.toLowerCase().trim();

    // If search is empty, show history
    if (!fq && !lq) {
        let history = null;
        const stored = safeStorage.get('dcsaSearchHistory');
        if (stored) {
            try { history = JSON.parse(stored); }
            catch (e) { history = null; }
        }

        // Seed default mock searches to make the dashboard look lived-in
        if (!history || history.length < 10) {
            history = [
                { f: 'Jane', l: 'Doe' },
                { f: 'Marcus', l: 'Chen' },
                { f: 'Elena', l: 'Rostova' },
                { f: 'David', l: 'Miller' },
                { f: 'Sarah', l: 'Oconnor' },
                { f: 'John', l: 'Smith' },
                { f: 'Michael', l: 'Johnson' },
                { f: 'Emily', l: 'Williams' },
                { f: 'Robert', l: 'Brown' },
                { f: 'Jessica', l: 'Garcia' }
            ];
            safeStorage.set('dcsaSearchHistory', JSON.stringify(history));
        }

        const title = document.createElement('div');
        title.style.cssText = "color: #ff7a00; font-size: 0.85rem; font-weight: bold; margin-bottom: 0.8rem; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid rgba(255, 122, 0, 0.3); padding-bottom: 0.5rem;";
        title.innerText = "Recent Searches";
        resultsList.appendChild(title);

        history.forEach(h => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `<div class="res-name"><i class="fa-solid fa-clock-rotate-left" style="margin-right: 8px; color: #8892b0;"></i> ${h.f} ${h.l}</div>`;
            div.addEventListener('click', () => {
                locateSearchFirst.value = h.f;
                locateSearchLast.value = h.l;
                renderResults();
                executeLocateSearchBtn.click();
            });
            resultsList.appendChild(div);
        });

        return;
    }

    let count = 0;
    const maxResults = 50; // Performance optimization

    for (let i = 0; i < mockEmployees.length; i++) {
        const emp = mockEmployees[i];
        const matchesFirst = !fq || emp.firstName.toLowerCase().includes(fq);
        const matchesLast = !lq || emp.lastName.toLowerCase().includes(lq);

        if (matchesFirst && matchesLast) {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <div class="res-name">${emp.lastName}, ${emp.firstName}</div>
                <div class="res-dept">${emp.department} // ${emp.dutyStation}</div>
            `;
            div.addEventListener('click', () => selectEmployee(emp));
            resultsList.appendChild(div);
            count++;
            if (count >= maxResults) break;
        }
    }

    if (count === 0) {
        resultsList.innerHTML = `<div style="color: #8892b0; padding: 1rem; text-align: center; font-family: 'Share Tech Mono', monospace;">NO ASSETS FOUND</div>`;
    }
}

// Initial render
renderResults();

locateSearchFirst.addEventListener('input', renderResults);
locateSearchLast.addEventListener('input', renderResults);

executeLocateSearchBtn.addEventListener('click', () => {
    const fq = locateSearchFirst.value.trim();
    const lq = locateSearchLast.value.trim();
    const fqLow = fq.toLowerCase();
    const lqLow = lq.toLowerCase();

    if (fq || lq) {
        let history = [];
        const stored = safeStorage.get('dcsaSearchHistory');
        if (stored) {
            try { history = JSON.parse(stored); }
            catch (e) { history = []; }
        }

        // Don't add duplicates consecutively
        if (history.length === 0 || history[0].f !== fq || history[0].l !== lq) {
            history.unshift({ f: fq, l: lq });
            history = history.slice(0, 10); // Keep last 10 searches
            safeStorage.set('dcsaSearchHistory', JSON.stringify(history));
        }
    }

    const emp = mockEmployees.find(e => {
        const matchesFirst = !fqLow || e.firstName.toLowerCase().includes(fqLow);
        const matchesLast = !lqLow || e.lastName.toLowerCase().includes(lqLow);
        return matchesFirst && matchesLast;
    });

    if (emp) {
        selectEmployee(emp);
    } else {
        resultsList.innerHTML = `<div style="color: #ff5555; padding: 1rem; text-align: center; font-family: 'Share Tech Mono', monospace;">NO ASSETS FOUND</div>`;
    }
});

// Employee Selection Logic
const popup = document.getElementById('employee-popup');
const closePopupBtn = document.getElementById('closePopup');

function selectEmployee(emp, preventSync = false, preventFly = false) {
    // Update Popup UI
    document.getElementById('popName').innerText = `${emp.firstName} ${emp.lastName}`;
    document.getElementById('popStatus').innerText = emp.status;

    // Set Profile Photo
    const profilePicContainer = document.querySelector('.profile-pic');
    if (emp.avatar) {
        profilePicContainer.innerHTML = `<img src="${emp.avatar}" alt="Employee Photo" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
        profilePicContainer.innerHTML = `<i class="fa-solid fa-user"></i>`;
    }

    // Status color
    let statusColor = '#ff7a00';
    if (emp.status.includes('REMOTE')) statusColor = '#8892b0';
    if (emp.status.includes('TDY') || emp.status.includes('PCS')) statusColor = '#ffb86c';
    if (emp.status.includes('OOO')) statusColor = '#ff5555';
    document.getElementById('popStatus').style.color = statusColor;
    document.getElementById('popStatus').style.borderColor = statusColor;

    document.getElementById('popDept').innerText = emp.department;
    document.getElementById('popStation').innerText = emp.dutyStation;
    document.getElementById('popHours').innerText = emp.schedule;
    document.getElementById('popNat').innerText = emp.nationality;
    document.getElementById('popManager').innerText = emp.manager;
    document.getElementById('popClearance').innerText = emp.clearance;
    document.getElementById('popPhoneDetails').innerText = emp.phone || 'N/A';

    document.getElementById('popEmail').onclick = () => window.location.href = `mailto:${emp.email}`;
    document.getElementById('popMessage').onclick = () => window.location.href = `sms:${emp.phone}`;

    // Fly camera precisely to the entity
    if (!preventFly) {
        if (is3DMode && viewer) {
            const entityData = employeeEntities[emp.id];
            if (entityData && entityData.entity) {
                viewer.flyTo(entityData.entity, {
                    offset: new Cesium.HeadingPitchRange(0.0, -0.78, 25000.0),
                    duration: 2.5
                });
            } else {
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(emp.lng, emp.lat, 50000.0),
                    duration: 2.5
                });
            }
        } else if (leafletMap) {
            leafletMap.flyTo([emp.lat, emp.lng], 14, { duration: 1.5 });
        }
    }

    setTimeout(() => {
        popup.style.display = 'block';
    }, 2000);

    if (!preventSync) {
        // Also auto-select them in the Manage Assets tab for easy editing
        assetSelector.value = emp.id;
        handleAssetSelection(true);
    }
}

closePopupBtn.addEventListener('click', () => {
    popup.style.display = 'none';
});


// UI Logic: Manage Form (CRUD Operations)
const manageSearchFirst = document.getElementById('manageSearchFirst');
const manageSearchLast = document.getElementById('manageSearchLast');
const assetSelector = document.getElementById('assetSelector');
const fNameInput = document.getElementById('fName');
const lNameInput = document.getElementById('lName');
const deptInput = document.getElementById('dept');
const stationInput = document.getElementById('station');
const customLocationInput = document.getElementById('customLocation');
const clearanceInput = document.getElementById('clearance');
const dutyStatusSelect = document.getElementById('dutyStatus');
const scheduleInput = document.getElementById('schedule');
const managerInput = document.getElementById('manager');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const nationalityInput = document.getElementById('nationality');

const addAssetBtn = document.getElementById('addAssetBtn');
const updateAssetBtn = document.getElementById('updateAssetBtn');
const deleteAssetBtn = document.getElementById('deleteAssetBtn');
const saveMsg = document.getElementById('saveMsg');

// Populate Asset Selector
function refreshAssetSelector(firstQuery = '', lastQuery = '') {
    // Keep the "NEW" option, remove the rest
    while (assetSelector.options.length > 1) {
        assetSelector.remove(1);
    }

    const fq = firstQuery.toLowerCase();
    const lq = lastQuery.toLowerCase();

    const filteredEmployees = mockEmployees.filter(emp => {
        const matchesFirst = !fq || emp.firstName.toLowerCase().includes(fq);
        const matchesLast = !lq || emp.lastName.toLowerCase().includes(lq);
        return matchesFirst && matchesLast;
    });

    filteredEmployees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.innerText = `${emp.id} - ${emp.firstName} ${emp.lastName}`;
        assetSelector.appendChild(opt);
    });
}
refreshAssetSelector();

function handleManageFilter() {
    refreshAssetSelector(manageSearchFirst.value, manageSearchLast.value);
    // After filtering, reset the form if the currently selected value is no longer visible
    const val = assetSelector.value;
    if (val !== 'NEW') {
        const emp = mockEmployees.find(emp => emp.id === val);
        const fq = manageSearchFirst.value.toLowerCase();
        const lq = manageSearchLast.value.toLowerCase();
        const matchesFirst = !fq || emp.firstName.toLowerCase().includes(fq);
        const matchesLast = !lq || emp.lastName.toLowerCase().includes(lq);

        if (!emp || !(matchesFirst && matchesLast)) {
            assetSelector.value = 'NEW';
            clearForm();
        }
    }
}

const executeSearchBtn = document.getElementById('executeSearchBtn');

manageSearchFirst.addEventListener('input', handleManageFilter);
manageSearchLast.addEventListener('input', handleManageFilter);

executeSearchBtn.addEventListener('click', () => {
    // Attempt to select the first valid match in the dropdown
    if (assetSelector.options.length > 1) {
        // Select the first actual employee (index 1)
        assetSelector.selectedIndex = 1;
        handleAssetSelection();
        showSuccessMsg('ASSET LOCATED.');
    } else {
        showSuccessMsg('NO ASSETS FOUND.');
    }
});

function clearForm() {
    fNameInput.value = '';
    lNameInput.value = '';
    deptInput.selectedIndex = 0;
    stationInput.selectedIndex = 0;
    customLocationInput.value = '';
    clearanceInput.selectedIndex = 0;
    dutyStatusSelect.value = "ACTIVE - ON STATION";
    scheduleInput.selectedIndex = 0;
    managerInput.value = '';
    emailInput.value = '';
    phoneInput.value = '';

    addAssetBtn.style.display = 'block';
    updateAssetBtn.style.display = 'none';
    deleteAssetBtn.style.display = 'none';
}

function populateForm(emp) {
    if (!emp) return;
    fNameInput.value = emp.firstName || '';
    lNameInput.value = emp.lastName || '';
    deptInput.value = emp.department || '';
    stationInput.value = emp.dutyStation || '';
    customLocationInput.value = `${emp.lat}, ${emp.lng}`;
    clearanceInput.value = emp.clearance || '';

    // Find matching status option
    for (let i = 0; i < dutyStatusSelect.options.length; i++) {
        if (dutyStatusSelect.options[i].text === emp.status || dutyStatusSelect.options[i].value === emp.status) {
            dutyStatusSelect.selectedIndex = i;
            break;
        }
    }

    scheduleInput.value = emp.schedule || '';
    managerInput.value = emp.manager || '';
    emailInput.value = emp.email || '';
    phoneInput.value = emp.phone || '';

    addAssetBtn.style.display = 'none';
    updateAssetBtn.style.display = 'block';
    deleteAssetBtn.style.display = 'block';
}

function handleAssetSelection(preventFly = false) {
    // If called via event listener, preventFly will be an Event object (truthy)
    // We only want to prevent flying if preventFly is explicitly true
    const actuallyPreventFly = preventFly === true;

    const val = assetSelector.value;
    if (val === 'NEW' || !val) {
        clearForm();
    } else {
        const emp = mockEmployees.find(e => e.id === val);
        if (emp) {
            populateForm(emp);
            selectEmployee(emp, true, actuallyPreventFly);
        }
    }
}

assetSelector.addEventListener('change', handleAssetSelection);

// Also trigger on load in case the browser preserves the dropdown state
setTimeout(handleAssetSelection, 100);

function getColorForStatus(status) {
    if (status.includes('REMOTE')) return Cesium.Color.fromCssColorString('#8892b0');
    if (status.includes('TDY') || status.includes('PCS')) return Cesium.Color.fromCssColorString('#ffb86c');
    if (status.includes('OUT OF OFFICE') || status.includes('OOO')) return Cesium.Color.fromCssColorString('#ff5555');
    return Cesium.Color.fromCssColorString('#ff7a00'); // Active Default
}

function parseLocation() {
    const loc = customLocationInput.value.trim();
    let lat = 0, lng = 0;
    if (loc) {
        const parts = loc.split(',');
        if (parts.length === 2) {
            lat = parseFloat(parts[0].trim());
            lng = parseFloat(parts[1].trim());
        }
    }
    return { lat, lng };
}

function showSuccessMsg(msg) {
    saveMsg.innerText = msg;
    saveMsg.style.display = 'block';
    setTimeout(() => saveMsg.style.display = 'none', 3000);
}

// CREATE
addAssetBtn.addEventListener('click', () => {
    const { lat, lng } = parseLocation();

    const newEmp = {
        id: `EMP-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        firstName: fNameInput.value || 'Unknown',
        lastName: lNameInput.value || 'Asset',
        department: deptInput.value || 'Unassigned',
        dutyStation: stationInput.value || 'Unknown',
        lat: isNaN(lat) ? 0 : lat,
        lng: isNaN(lng) ? 0 : lng,
        schedule: scheduleInput.value || '0800 - 1700 EST',
        nationality: nationalityInput.value || 'United States',
        manager: managerInput.value || 'Unknown',
        clearance: clearanceInput.value || 'Secret',
        status: dutyStatusSelect.options[dutyStatusSelect.selectedIndex].text,
        email: emailInput.value || 'unknown@dcsa.mil',
        phone: phoneInput.value || 'N/A'
    };

    mockEmployees.push(newEmp);

    // Add to map
    const color = getColorForStatus(newEmp.status);
    const entity = employeeDataSource.entities.add({
        id: newEmp.id,
        position: Cesium.Cartesian3.fromDegrees(newEmp.lng, newEmp.lat),
        point: {
            pixelSize: 20,
            color: color,
            outlineColor: Cesium.Color.fromCssColorString('rgba(0, 0, 0, 0.4)'),
            outlineWidth: 6,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        label: {
            text: `${newEmp.lastName}, ${newEmp.firstName.charAt(0)}.\n[${newEmp.department}]`,
            font: '12pt "Share Tech Mono", monospace',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
    employeeEntities[newEmp.id] = { entity, data: newEmp };

    refreshAssetSelector();
    renderResults(); // refresh search
    clearForm();
    assetSelector.value = 'NEW';
    showSuccessMsg('ASSET ADDED TO GLOBAL DATABASE.');
});

// UPDATE
updateAssetBtn.addEventListener('click', () => {
    const empId = assetSelector.value;
    if (empId === 'NEW') return;

    const emp = mockEmployees.find(e => e.id === empId);
    if (!emp) return;

    const { lat, lng } = parseLocation();

    emp.firstName = fNameInput.value;
    emp.lastName = lNameInput.value;
    emp.department = deptInput.value;
    emp.dutyStation = stationInput.value;
    emp.lat = isNaN(lat) ? emp.lat : lat;
    emp.lng = isNaN(lng) ? emp.lng : lng;
    emp.clearance = clearanceInput.value;
    emp.status = dutyStatusSelect.options[dutyStatusSelect.selectedIndex].text;
    emp.schedule = scheduleInput.value;
    emp.manager = managerInput.value;
    emp.email = emailInput.value;
    emp.phone = phoneInput.value;

    // Update map entity
    const entityData = employeeEntities[empId];
    if (entityData && entityData.entity) {
        const color = getColorForStatus(emp.status);
        entityData.entity.position = Cesium.Cartesian3.fromDegrees(emp.lng, emp.lat);
        entityData.entity.point.color = color;
        entityData.entity.label.fillColor = color;
        entityData.entity.label.text = `${emp.lastName}, ${emp.firstName.charAt(0)}.\n[${emp.department}]`;
    }

    refreshAssetSelector();
    assetSelector.value = empId; // re-select
    renderResults();
    showSuccessMsg('ASSET RECORD UPDATED.');

    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(emp.lng, emp.lat, 50000.0),
        duration: 2.0
    });
});

// DELETE
deleteAssetBtn.addEventListener('click', () => {
    const empId = assetSelector.value;
    if (empId === 'NEW') return;

    const index = mockEmployees.findIndex(e => e.id === empId);
    if (index > -1) {
        mockEmployees.splice(index, 1);
    }

    // Remove from map
    const entityData = employeeEntities[empId];
    if (entityData && entityData.entity) {
        employeeDataSource.entities.remove(entityData.entity);
        delete employeeEntities[empId];
    }

    refreshAssetSelector();
    renderResults();
    clearForm();
    assetSelector.value = 'NEW';
    showSuccessMsg('ASSET PURGED FROM DATABASE.');
});

// Handle search query parameter from dashboard
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('search');
    const fname = urlParams.get('first_name');
    const lname = urlParams.get('last_name');

    if (fname || lname) {
        if (fname) locateSearchFirst.value = fname;
        if (lname) locateSearchLast.value = lname;
        renderResults();
        executeLocateSearchBtn.click();
    } else if (query) {
        const parts = query.split(' ');
        if (parts.length > 0) locateSearchFirst.value = parts[0];
        if (parts.length > 1) locateSearchLast.value = parts.slice(1).join(' ');
        renderResults();
        executeLocateSearchBtn.click();
    }
});

// 2D/3D Toggle Logic
const toggleViewBtn = document.getElementById('toggleViewBtn');
if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
        if (!is3DMode) {
            // Switch to 3D
            if (!viewer) {
                // First time loading 3D - Show progress meter
                const overlay = document.getElementById('progressOverlay');
                const bar = document.getElementById('progressBarFill');
                const percent = document.getElementById('progressPercent');
                const step = document.getElementById('progressStep');

                overlay.style.display = 'flex';
                toggleViewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem;"></i> LOADING 3D...';

                let progress = 0;
                const interval = setInterval(() => {
                    progress += Math.random() * 5;
                    if (progress > 95) progress = 95; // Wait at 95% until actually ready

                    bar.style.width = progress + '%';
                    percent.innerText = Math.floor(progress) + '%';

                    if (progress < 30) step.innerText = 'INITIALIZING ENGINE...';
                    else if (progress < 60) step.innerText = 'FETCHING GEOSPATIAL DATA...';
                    else step.innerText = 'PLOTTING GLOBAL ASSETS...';
                }, 100);

                const finishLoading = () => {
                    clearInterval(interval);
                    bar.style.width = '100%';
                    percent.innerText = '100%';
                    step.innerText = 'SYNCHRONIZATION COMPLETE';

                    setTimeout(() => {
                        overlay.style.display = 'none';
                        document.getElementById('leafletContainer').style.display = 'none';
                        document.getElementById('cesiumContainer').style.display = 'block';
                        is3DMode = true;
                        hasLoaded3D = true;
                        toggleViewBtn.innerHTML = '<i class="fa-solid fa-map" style="margin-right: 0.5rem;"></i> SWITCH TO 2D';
                    }, 500);
                };

                if (typeof Cesium === 'undefined') {
                    const link = document.createElement('link');
                    link.href = 'https://cdn.jsdelivr.net/npm/cesium@1.116.0/Build/Cesium/Widgets/widgets.css';
                    link.rel = 'stylesheet';
                    document.head.appendChild(link);

                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/cesium@1.116.0/Build/Cesium/Cesium.js';
                    script.onload = () => {
                        initCesium();
                        finishLoading();
                    };
                    document.head.appendChild(script);
                } else {
                    initCesium();
                    finishLoading();
                }
            } else {
                // Already loaded 3D
                document.getElementById('leafletContainer').style.display = 'none';
                document.getElementById('cesiumContainer').style.display = 'block';
                is3DMode = true;
                toggleViewBtn.innerHTML = '<i class="fa-solid fa-map" style="margin-right: 0.5rem;"></i> SWITCH TO 2D';
            }
        } else {
            // Switch to 2D
            is3DMode = false;
            document.getElementById('cesiumContainer').style.display = 'none';
            document.getElementById('leafletContainer').style.display = 'block';
            if (leafletMap) leafletMap.invalidateSize();
            toggleViewBtn.innerHTML = '<i class="fa-solid fa-cube" style="margin-right: 0.5rem;"></i> SWITCH TO 3D';
        }
    });
}
