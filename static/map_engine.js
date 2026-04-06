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

        // Setup HTML labels for vote tallies
        myGlobe.htmlElementsData([])
               .htmlElement(d => {
                   const el = document.createElement('div');
                   el.innerHTML = `
                       <div style="
                           color: ${d.color};
                           background: rgba(13, 17, 23, 0.85);
                           border: 1px solid ${d.color};
                           border-radius: 4px;
                           padding: 2px 6px;
                           font-family: 'Share Tech Mono', monospace;
                           font-size: 0.75rem;
                           box-shadow: 0 0 8px ${d.color};
                           pointer-events: none;
                           transform: translate(-50%, -50%);
                           text-shadow: 0 0 5px ${d.color};
                           text-align: center;
                       ">${d.label}<br><span style="font-weight:bold;font-size:0.9rem;">${d.votes.toLocaleString()}</span></div>
                   `;
                   return el;
               });
               
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
                    myGlobe.pointOfView({ lat: cd.lat, lng: cd.lng, altitude: 0.35 }, 1500); // 1.5sec swoop
                    foundState = true;
                    break;
                }
            }
        }
        
        // Default flat US viewport
        if(!foundState) {
            myGlobe.pointOfView({ lat: 39.8, lng: -98.5, altitude: 1.2 }, 1000);
        }
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
    
    // Update HTML points for vote tallies
    let htmlPoints = [];

    const regionCenters = {
        "Global": [{ lat: 46.2, lng: 6.1 }, { lat: 38.9, lng: -77.0 }], 
        "UK":     [{ lat: 51.5, lng: -0.1 }, { lat: 53.4, lng: -2.2 }],
        "France": [{ lat: 48.8, lng: 2.3 },  { lat: 45.7, lng: 4.8 }]
    };

    if (poll.region === "US") {
        poll.options.forEach(opt => {
            if (opt.state_tallies && opt.state_tallies.length > 0) {
                opt.state_tallies.forEach(st => {
                    const cd = coords[st.state];
                    if (cd && st.votes > 0) {
                        htmlPoints.push({
                            lat: cd.lat, lng: cd.lng,
                            color: opt.color,
                            label: st.state.substring(0,3).toUpperCase(),
                            votes: st.votes
                        });
                    }
                });
            } else {
                // Simulation payload
                htmlPoints.push({
                    lat: 39 + Math.random()*4 - 2, 
                    lng: -95 + Math.random()*10 - 5,
                    color: opt.color,
                    label: opt.label.substring(0,3).toUpperCase(),
                    votes: opt.votes || 0
                });
            }
        });
    } else {
        let idx = 0;
        poll.options.forEach(opt => {
            const rc = regionCenters[poll.region] ? regionCenters[poll.region][idx % regionCenters[poll.region].length] : {lat:Math.random()*20, lng:Math.random()*20};
            htmlPoints.push({
                lat: rc.lat + (Math.random()*2 - 1),
                lng: rc.lng + (Math.random()*2 - 1),
                color: opt.color,
                label: opt.label.substring(0,12),
                votes: opt.votes || 0
            });
            idx++;
        });
    }

    myGlobe.htmlElementsData(htmlPoints);
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
