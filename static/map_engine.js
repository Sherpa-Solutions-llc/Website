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
            .htmlElementsData([])
            .htmlElement(d => {
                const wrapper = document.createElement('div');
                
                const el = document.createElement('div');
                el.className = 'globe-scoreboard';
                
                let title = d.poll.title || "Live Results";
                let totalVotes = d.poll.options.reduce((sum, opt) => sum + (opt.weightedVotes || opt.votes || 0), 0);
                if (totalVotes === 0) totalVotes = 1;

                let optionsHtml = '';
                // Sort by top 2 options
                let sortedOptions = [...d.poll.options].sort((a,b) => (b.weightedVotes||b.votes||0) - (a.weightedVotes||a.votes||0)).slice(0,2);
                
                sortedOptions.forEach(opt => {
                    let v = opt.weightedVotes || opt.votes || 0;
                    let pct = ((v / totalVotes) * 100).toFixed(1);
                    optionsHtml += `
                        <div class="score-row">
                            <span style="color: ${opt.color}; font-weight: 600;">${opt.label}</span>
                            <span>${pct}% (${v.toLocaleString()})</span>
                        </div>
                        <div class="score-bar-bg">
                            <div class="score-bar-fill" style="width: ${pct}%; background: ${opt.color};"></div>
                        </div>
                    `;
                });

                el.innerHTML = `
                    <h4>${title}</h4>
                    ${optionsHtml}
                `;
                wrapper.appendChild(el);
                return wrapper;
            });
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
    if (!window.viralTelemetryStarted) {
        window.viralTelemetryStarted = true;
        startViralTelemetery();
    }
}

function updateMapForPoll() {
    if (!myGlobe) return;
    const poll = polls.find(p => p.id === currentPollId);
    if (!poll) return;

    let markerLat = 39.8;
    let markerLng = -98.5;

    if (poll.region === "Global") {
        myGlobe.pointOfView({ altitude: 2.5 }, 1000);
    } else if (poll.region === "US") {
        // If it's a specific localized state race, try to fly the 3D earth directly down on top of it
        const coords = {
            "Alaska": { lat: 61.3, lng: -152.4 }, "Hawaii": { lat: 21.0, lng: -157.5 },
            "Washington": { lat: 47.4, lng: -121.1 }, "Oregon": { lat: 44.5, lng: -122.0 },
            "California": { lat: 36.1, lng: -119.6 }, "Nevada": { lat: 38.3, lng: -117.1 },
            "Idaho": { lat: 44.2, lng: -114.4 }, "Montana": { lat: 46.9, lng: -110.3 },
            "Wyoming": { lat: 42.7, lng: -107.3 }, "Utah": { lat: 40.1, lng: -111.8 },
            "Arizona": { lat: 33.7, lng: -111.4 }, "New Mexico": { lat: 34.8, lng: -106.2 },
            "Colorado": { lat: 39.0, lng: -105.3 }, "North Dakota": { lat: 47.5, lng: -99.9 },
            "South Dakota": { lat: 44.2, lng: -99.9 }, "Nebraska": { lat: 41.1, lng: -98.2 },
            "Kansas": { lat: 38.5, lng: -96.7 }, "Oklahoma": { lat: 35.5, lng: -96.9 },
            "Texas": { lat: 31.0, lng: -97.5 }, "Minnesota": { lat: 45.6, lng: -93.9 },
            "Iowa": { lat: 42.0, lng: -93.2 }, "Missouri": { lat: 38.5, lng: -92.2 },
            "Arkansas": { lat: 34.9, lng: -92.3 }, "Louisiana": { lat: 31.1, lng: -91.8 },
            "Wisconsin": { lat: 44.2, lng: -89.6 }, "Illinois": { lat: 40.3, lng: -88.9 },
            "Michigan": { lat: 43.3, lng: -84.5 }, "Indiana": { lat: 39.8, lng: -86.2 },
            "Kentucky": { lat: 37.6, lng: -84.6 }, "Tennessee": { lat: 35.7, lng: -86.6 },
            "Mississippi": { lat: 32.7, lng: -89.6 }, "Alabama": { lat: 32.8, lng: -86.8 },
            "Ohio": { lat: 40.3, lng: -82.7 }, "Georgia": { lat: 33.0, lng: -83.6 },
            "Florida": { lat: 27.7, lng: -81.6 }, "South Carolina": { lat: 33.8, lng: -80.9 },
            "North Carolina": { lat: 35.6, lng: -79.8 }, "Virginia": { lat: 37.7, lng: -78.1 },
            "West Virginia": { lat: 38.4, lng: -80.9 }, "Maryland": { lat: 39.0, lng: -76.8 },
            "Delaware": { lat: 39.3, lng: -75.5 }, "Pennsylvania": { lat: 40.5, lng: -77.2 },
            "New Jersey": { lat: 40.2, lng: -74.5 }, "New York": { lat: 42.1, lng: -74.9 },
            "Connecticut": { lat: 41.5, lng: -72.7 }, "Rhode Island": { lat: 41.7, lng: -71.5 },
            "Massachusetts": { lat: 42.2, lng: -71.5 }, "Vermont": { lat: 44.0, lng: -72.6 },
            "New Hampshire": { lat: 43.4, lng: -71.5 }, "Maine": { lat: 44.6, lng: -69.3 }
        };
        
        let foundState = false;
        if(poll.title) {
            for (const [st, cd] of Object.entries(coords)) {
                if (poll.title.includes(st)) {
                    myGlobe.pointOfView({ lat: cd.lat, lng: cd.lng, altitude: 2.0 }, 1500); // swoop but keep globe visible
                    markerLat = cd.lat;
                    markerLng = cd.lng;
                    foundState = true;
                    break;
                }
            }
        }
        
        // Default flat US viewport
        if(!foundState) {
            myGlobe.pointOfView({ lat: 39.8, lng: -98.5, altitude: 2.0 }, 1000);
        }
    } else if (poll.region === "UK") {
        myGlobe.pointOfView({ lat: 54.5, lng: -2.5, altitude: 2.0 }, 1000);
    } else if (poll.region === "France") {
        myGlobe.pointOfView({ lat: 46.5, lng: 2.5, altitude: 2.0 }, 1000);
    } else {
        // Fallback zoom
        myGlobe.pointOfView({ altitude: 2.0 }, 1000);
    }
    
    // Clear geometry
    myGlobe.ringsData([]);
    myGlobe.arcsData([]);
    
    if (poll.region === "UK") {
        markerLat = 54.5; markerLng = -2.5;
    } else if (poll.region === "France") {
        markerLat = 46.5; markerLng = 2.5;
    }
    
    myGlobe.htmlElementsData([{
        lat: markerLat,
        lng: markerLng,
        poll: poll
    }]);
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

// Viral Demographics/Features Engine

let heartbeatInterval;
let threatInterval;

function startViralTelemetery() {
    // 5. Citizen Node Status - Persistent Green Dots
    const numNodes = 1200;
    const nodeData = [];
    for(let i=0; i<numNodes; i++) {
        nodeData.push({
            lat: (Math.random() - 0.5) * 140, // Concentrate away from poles
            lng: (Math.random() - 0.5) * 360,
            size: Math.random() * 0.1 + 0.02,
            color: 'rgba(0, 255, 0, 0.4)'
        });
    }
    if (myGlobe && myGlobe.pointsData) {
        myGlobe.pointsData(nodeData)
               .pointColor('color')
               .pointAltitude(0.01)
               .pointRadius('size')
               .onPointClick((point) => {
                   // Drill down to node
                   myGlobe.pointOfView({ lat: point.lat, lng: point.lng, altitude: 0.8 }, 1000);
                   
                   const modal = document.getElementById('node-drilldown-modal');
                   if(modal) {
                       const idDisplay = document.getElementById('node-id-display');
                       const blocksDisplay = document.getElementById('node-blocks-display');
                       const hrDisplay = document.getElementById('node-hashrate-display');
                       
                       // Generate faux id based on lat lng
                       idDisplay.innerText = '0x' + Math.abs(Math.floor(point.lat * point.lng * 10000)).toString(16).padEnd(8, '0').toUpperCase();
                       blocksDisplay.innerText = Math.floor(Math.random() * 500) + 120;
                       hrDisplay.innerText = (10 + Math.random() * 15).toFixed(1) + ' TH/s';
                       
                       modal.style.opacity = '1';
                       if(window.nodeModalTimeout) clearTimeout(window.nodeModalTimeout);
                       window.nodeModalTimeout = setTimeout(() => { modal.style.opacity = '0'; }, 5000);
                   }
               });
    }

    // 3. Heartbeat of Democracy
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        triggerGlobalPulse();
    }, 1200);

    // 2. Threat Block Interceptor
    if (threatInterval) clearInterval(threatInterval);
    threatInterval = setInterval(() => {
        // 10% chance every 2 seconds = occasional threats
        if (Math.random() < 0.10) {
            triggerThreatIntercept();
        }
    }, 2000);
}

function triggerThreatIntercept() {
    if(!isMapView || !myGlobe) return;
    const lat = (Math.random() - 0.5) * 160;
    const lng = (Math.random() - 0.5) * 360;
    
    // Flash aggressive red ring
    let currentRings = myGlobe.ringsData();
    currentRings.push({ lat, lng, color: 'rgba(255, 0, 0, 1)' });
    if(currentRings.length > 20) currentRings.shift();
    myGlobe.ringsData(currentRings);
    
    // Add threat to arc to nowhere (dropped)
    let currentArcs = myGlobe.arcsData();
    currentArcs.push({
        startLat: lat, startLng: lng,
        endLat: lat + (Math.random()-0.5)*20, endLng: lng + (Math.random()-0.5)*20,
        color: ['rgba(255, 0, 0, 1)', "rgba(255,0,0,0)"]
    });
    if(currentArcs.length > 15) currentArcs.shift();
    myGlobe.arcsData(currentArcs);

    // Push Toast
    showThreatToast(lat, lng);
}

function showThreatToast(lat, lng) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '20px';
    toast.style.background = 'rgba(20, 0, 0, 0.9)';
    toast.style.border = '1px solid #ff0000';
    toast.style.boxShadow = '0 0 15px rgba(255,0,0,0.5)';
    toast.style.color = '#ff0000';
    toast.style.padding = '15px';
    toast.style.borderRadius = '4px';
    toast.style.fontFamily = "'Share Tech Mono', monospace";
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> THREAT INTERCEPTED</div>
        <div style="font-size: 0.8rem; color: #fff;">Deepfake Identity Blocked</div>
        <div style="font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-top: 5px;">Origin: Lat ${lat.toFixed(1)}, Lng ${lng.toFixed(1)}</div>
        <div style="font-size: 0.75rem; color: rgba(255,0,0,0.8); margin-top: 2px;">IMEI Permanently Blacklisted & Reported</div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 4500);
}

// Feature 3: Cyber Radar / Censorship Overlays
let cyberRadarInterval;
window.toggleCyberRadar = function() {
    const btn = document.getElementById('btn-cyber-radar');
    const isOff = btn.style.color === 'rgb(255, 68, 68)' || btn.style.color === '#ff4444';
    
    if (isOff) {
        btn.style.color = 'var(--accent-glow)';
        btn.style.background = 'rgba(0, 210, 255, 0.1)';
        btn.style.borderColor = 'var(--accent-glow)';
        btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> CYBER RADAR: ACTIVE';
        
        // Push massive transparent red rings to simulate localized censorship/firewalls
        cyberRadarInterval = setInterval(() => {
            if(!myGlobe) return;
            const darkZones = [
                { lat: 35.86, lng: 104.19 }, // Zone A
                { lat: 61.52, lng: 105.31 }, // Zone B
                { lat: 32.42, lng: 53.68 }   // Zone C
            ];
            
            const target = darkZones[Math.floor(Math.random() * darkZones.length)];
            let rings = myGlobe.ringsData();
            rings.push({
                lat: target.lat, 
                lng: target.lng, 
                color: 'rgba(255, 0, 0, 0.4)',
                maxR: 35
            });
            if(rings.length > 25) rings.shift();
            myGlobe.ringsData(rings);
            
            // Adjust ring propagation specifically for radar mode
            myGlobe.ringMaxRadius(d => d.maxR || 5)
                   .ringColor('color');
        }, 1500);
        
    } else {
        btn.style.color = '#ff4444';
        btn.style.background = 'rgba(255, 0, 0, 0.1)';
        btn.style.borderColor = 'rgba(255, 0, 0, 0.5)';
        btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> CYBER RADAR';
        
        clearInterval(cyberRadarInterval);
        myGlobe.ringMaxRadius(5);
    }
};

// Feature 5: Historical Replay Timeline Scrubber
document.addEventListener("DOMContentLoaded", () => {
    const scrubber = document.getElementById('historical-scrubber');
    if (!scrubber) return;
    
    scrubber.addEventListener('input', (e) => {
        const val = e.target.value;
        const display = document.getElementById('historical-time-display');
        
        if (val == 100) {
            display.innerText = 'LIVE';
            display.style.color = 'var(--accent-glow)';
        } else {
            // Calculate a retro time
            const hoursBack = Math.floor((100 - val) * 0.24); 
            display.innerText = "T-" + hoursBack + "h 00m";
            display.style.color = 'var(--accent-gold)';
            
            // Spawn a massive burst of historical arcs to visualize the "replay"
            if(myGlobe && Math.random() > 0.5) {
                for(let i=0; i<3; i++) triggerGlobalPulse();
            }
        }
    });
});
