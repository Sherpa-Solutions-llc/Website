// map_engine.js
// Handles the 3D Geospatial Map Projection for Open Vote

let mapInitialized = false;
let isMapView = false;
let myGlobe = null;



async function initMap() {
    mapInitialized = true;
    
    const container = document.getElementById('map-view');
    // Clean up old D3 svg if it exists
    const svg = document.getElementById('interactive-map');
    if (svg) svg.remove();
    
    const loadingEl = document.getElementById('map-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    
    const width = container.getBoundingClientRect().width || 600;
    const height = container.getBoundingClientRect().height || 350;

    if (!myGlobe) {
        // Build realistic glowing globe
        myGlobe = Globe()(container)
            .width(width)
            .height(height)
            .backgroundColor('rgba(0,0,0,0)')
            .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
            .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
            .showAtmosphere(true)
            .atmosphereColor('lightskyblue')
            .atmosphereAltitude(0.15)
            .pointOfView({ lat: 39.8, lng: -98.5, altitude: 2 }) // default view
            
        // Setup arcs state (telemetry paths)
        myGlobe.arcsData([])
               .arcColor('color')
               .arcDashLength(0.4)
               .arcDashGap(0.2)
               .arcDashInitialGap(() => Math.random())
               .arcDashAnimateTime(1500)
               .arcAltitudeAutoScale(0.5);
               
        // Setup rings state (ping origins)
        myGlobe.ringsData([])
               .ringColor('color')
               .ringMaxRadius(5)
               .ringPropagationSpeed(3)
               .ringRepeatPeriod(700);
               
        // Auto-rotate configuration
        myGlobe.controls().autoRotate = true;
        myGlobe.controls().autoRotateSpeed = 0.5;
        myGlobe.controls().enableZoom = false; // Cinematic fixed frame
    }
    
    updateMapForPoll();
}

function updateMapForPoll() {
    if (!myGlobe) return;
    const poll = polls.find(p => p.id === currentPollId);
    if (!poll) return;

    if (poll.region === "Global") {
        myGlobe.pointOfView({ altitude: 2.5 }, 1000);
    } else if (poll.region === "US") {
        myGlobe.pointOfView({ lat: 39.8, lng: -98.5, altitude: 1.2 }, 1000);
    } else if (poll.region === "UK") {
        myGlobe.pointOfView({ lat: 54.5, lng: -2.5, altitude: 0.8 }, 1000);
    } else if (poll.region === "France") {
        myGlobe.pointOfView({ lat: 46.5, lng: 2.5, altitude: 0.8 }, 1000);
    } else {
        // Fallback zoom
        myGlobe.pointOfView({ altitude: 2.0 }, 1000);
    }
    
    // Clear geometry
    myGlobe.ringsData([]);
    myGlobe.arcsData([]);
}

function triggerGlobalPulse() {
    // Only pulse if we are looking at the map
    if(!isMapView || !myGlobe) return;
    const poll = polls.find(p => p.id === currentPollId);
    if(!poll || !poll.options || poll.options.length === 0) return;
    
    // Random option color to represent the vote
    const color = poll.options[Math.floor(Math.random() * poll.options.length)].color;
    
    // Generate origin coordinates mapped to region bounding boxes
    let lat = (Math.random() - 0.5) * 160;
    let lng = (Math.random() - 0.5) * 360;
    
    if (poll.region === "US") {
        lat = 25 + Math.random() * 25;
        lng = -125 + Math.random() * 55;
    } else if (poll.region === "UK") {
        lat = 50 + Math.random() * 8;
        lng = -8 + Math.random() * 10;
    } else if (poll.region === "France") {
        lat = 42 + Math.random() * 8;
        lng = -4 + Math.random() * 12;
    }
    
    const ring = { lat, lng, color };
    
    let currentRings = myGlobe.ringsData();
    currentRings.push(ring);
    // Prune rings array to maintain FPS
    if(currentRings.length > 20) currentRings.shift();
    myGlobe.ringsData(currentRings);
    
    // Generate network arcs pointing toward Central Server (Simulated as Geneva, Switzerland or NYC)
    if (Math.random() > 0.4) {
        let currentArcs = myGlobe.arcsData();
        
        let targetLat = 46.2; // Geneva UN
        let targetLng = 6.1;
        
        if (poll.region === "US") {
            targetLat = 38.9; // Wash DC
            targetLng = -77.0;
        }

        currentArcs.push({
            startLat: lat, startLng: lng,
            endLat: targetLat, endLng: targetLng,
            color: [color, "rgba(255,255,255,0)"]
        });
        
        if(currentArcs.length > 15) currentArcs.shift();
        myGlobe.arcsData(currentArcs);
    }
}
