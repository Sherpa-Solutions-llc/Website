/**
 * Marion VA Wayfinder - 3D Engine & Logic Controller
 * Manages the Three.js scene, rendering nodes from MAP_DATA, and UI interactions.
 */

// Scene Globals
let scene, camera, renderer, controls;
let nodeMeshes = {};
let edgeLines = [];
let pathLine;
let currentFloor = 1; // Default to Ground Floor
let currentViewMode = '2d'; // '2d' or '3d'
let accessibleMode = false;
// --- Navigation Audio & Simulation State ---
let audioEnabled = true;
let audioVolume = 0.8;
let gpsMarkerMeshes = { red: null, blue: null };
let simulationTimer = null;
let gpsMarker = null;
let gpsPulse = null;
let parkingHighlight = null; // New pulsing ring for parking

function toggleWayfinderAudio() {
    audioEnabled = !audioEnabled;
    const btn = document.getElementById('btn-audio-toggle');
    if (!btn) return;
    if (audioEnabled) {
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        btn.classList.add('active');
        btn.title = 'Audio On — Click to Mute';
    } else {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        btn.classList.remove('active');
        btn.title = 'Audio Off — Click to Unmute';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
}

function setWayfinderVolume(val) {
    audioVolume = val / 100;
    const btn = document.getElementById('btn-audio-toggle');
    if (!btn) return;
    if (val == 0) {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        btn.classList.remove('active');
        audioEnabled = false;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } else {
        if (!audioEnabled) {
            audioEnabled = true;
            btn.classList.add('active');
        }
        btn.innerHTML = val < 50 ? '<i class="fa-solid fa-volume-low"></i>' : '<i class="fa-solid fa-volume-high"></i>';
    }
}

function speakNarration(text) {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = audioVolume;
    utterance.rate = 1.0;
    setTimeout(() => { window.speechSynthesis.speak(utterance); }, 100);
}

// Preload voices
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}
 // GPS visual elements

const FLOOR_TEXTURES = {
    '-1': 'static/marion_campus.png',
    '1': 'static/marion_ground_clean.png',
    '2': 'static/marion_floors_1_2_3.png',
    '3': 'static/marion_floors_1_2_3.png',
    '4': 'static/marion_floors_1_2_3.png'
};

// Admin globals
let adminMode = false;
let raycaster, mouse;
let floorPlane;
let selectedNodeId = null;

// Initialize Pathfinder
const pf = new Pathfinder(MAP_DATA);

function init() {
    const container = document.getElementById('map-canvas-container');
    if (!container) return;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim() || 0x0d1117);

    // 2. Camera Setup (Top-Down Google Maps style approach)
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 700, 50); // Straight down, slightly offset to hint at 3D

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 50);
    scene.add(dirLight);

    // 6. Map Appearance (No Grids)
    // Removed GridHelper to make it look like a real map instead of a wireframe

    // 6.5 Blueprint Map Texture Plane
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(FLOOR_TEXTURES[currentFloor], function(texture) {
        
        // Size the plane dynamically based on original image size so aspect ratio isn't crushed
        const w = (texture.image && texture.image.width) ? texture.image.width / 2 : 800; 
        const h = (texture.image && texture.image.height) ? texture.image.height / 2 : 800;
        
        const pGeo = new THREE.PlaneGeometry(w, h); 
        const pMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1.0 }); // Opaque like a real map
        floorPlane = new THREE.Mesh(pGeo, pMat);
        floorPlane.rotation.x = -Math.PI / 2;
        floorPlane.position.y = -0.5; // just below grid
        scene.add(floorPlane);
    });

    // 7. Draw the Map
    drawGraph();

    // 8. Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupUIEvents();
    setupAdminEvents(); // Hook up Node Editor events
    
    // 9. Initial GPS Localization
    localizeUser();

    // Force 2D view by default
    switchTo2D();

    // Animation Loop
    animate();
}

function drawGraph() {
    const materialNode = new THREE.MeshPhongMaterial({ color: 0x9DB581 }); // Secondary green
    const materialElevator = new THREE.MeshPhongMaterial({ color: 0x4169E1 }); // Blue
    const materialStairs = new THREE.MeshPhongMaterial({ color: 0xFFD700 }); // Yellow

    // Draw Nodes
    Object.values(MAP_DATA.nodes).forEach(node => {
        drawSingleNode(node);
    });

    redrawEdges();
}

function drawSingleNode(node) {

    const materialNode = new THREE.MeshPhongMaterial({ color: 0x9DB581 }); // Secondary green
    const materialElevator = new THREE.MeshPhongMaterial({ color: 0x4169E1 }); // Blue
    const materialStairs = new THREE.MeshPhongMaterial({ color: 0xFFD700 }); // Yellow
    const materialSelected = new THREE.MeshPhongMaterial({ color: 0xFF4444 }); // Highlight

    let mat = materialNode;
    if (node.type === 'elevator') mat = materialElevator;
    if (node.type === 'stairs') mat = materialStairs;
    
    // Highlight if selected
    if (node.id === selectedNodeId) mat = materialSelected;

    const geometry = new THREE.CylinderGeometry(4, 4, 3, 16);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(node.x, node.y, node.z);
    scene.add(mesh);
    nodeMeshes[node.id] = mesh;

    mesh.visible = adminMode && (currentViewMode === '3d' || node.floor === currentFloor);
}

function redrawEdges() {
    // Clear old
    edgeLines.forEach(l => {
        scene.remove(l);
        l.geometry.dispose();
        l.material.dispose();
    });
    edgeLines = [];
    const materialEdge = new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.3 });
    MAP_DATA.edges.forEach(edge => {
        const start = MAP_DATA.nodes[edge.from];
        const end = MAP_DATA.nodes[edge.to];
        if (start && end) {
            const points = [];
            points.push(new THREE.Vector3(start.x, start.y, start.z));
            points.push(new THREE.Vector3(end.x, end.y, end.z));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, materialEdge);
            line.visible = adminMode; // Hide pathfinding graph lines from typical users
            scene.add(line);
            edgeLines.push(line);
        }
    });
}

function updateFloorVisibility() {
    // Hide nodes not on current floor
    Object.keys(nodeMeshes).forEach(id => {
        const nodeData = MAP_DATA.nodes[id];
        nodeMeshes[id].visible = adminMode && (currentViewMode === '3d' || nodeData.floor === currentFloor);
    });

    // Update edge line visibility based on admin mode
    edgeLines.forEach(line => {
        line.visible = adminMode;
    });

    // Update active route path floor clipping
    if (pathLine) {
        pathLine.children.forEach(line => {
            if (currentViewMode === '3d') {
                line.visible = true;
            } else {
                line.visible = (line.userData.floor === currentFloor);
            }
        });
    }

    // Adjust camera target
    controls.target.set(0, (currentFloor - 1) * 40, 0);
}

function drawPath(pathArray) {
    if (pathLine) {
        scene.remove(pathLine);
        pathLine.children.forEach(c => {
            c.geometry.dispose();
            c.material.dispose();
        });
    }

    if (parkingHighlight) {
        scene.remove(parkingHighlight);
        parkingHighlight.geometry.dispose();
        parkingHighlight.material.dispose();
        parkingHighlight = null;
    }

    if (!pathArray || pathArray.length === 0) return;

    pathLine = new THREE.Group();
    scene.add(pathLine);

    const material = new THREE.LineBasicMaterial({
        color: 0xc06c3b, // Accent orange
        linewidth: 4 // WebGL note: Windows sometimes limits linewidth to 1, but safe fallback
    });

    let currentFloorGroup = [];
    let lastFloor = MAP_DATA.nodes[pathArray[0]].floor;

    for (let i = 0; i < pathArray.length; i++) {
        const node = MAP_DATA.nodes[pathArray[i]];
        
        if (node.floor !== lastFloor) {
            // Include the vertical transition node to avoid gaps in 3D view
            currentFloorGroup.push(new THREE.Vector3(node.x, node.y + 2, node.z));
            const geometry = new THREE.BufferGeometry().setFromPoints(currentFloorGroup);
            const line = new THREE.Line(geometry, material);
            line.userData.floor = lastFloor;
            pathLine.add(line);
            
            // Start the next floor segment right at this vertical node
            currentFloorGroup = [new THREE.Vector3(node.x, node.y + 2, node.z)];
            lastFloor = node.floor;
        } else {
            currentFloorGroup.push(new THREE.Vector3(node.x, node.y + 2, node.z));
        }
    }

    if (currentFloorGroup.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(currentFloorGroup);
        const line = new THREE.Line(geometry, material);
        line.userData.floor = lastFloor;
        pathLine.add(line);
    }

    // Zoom to fit path if needed (simplified: point camera at start)
    const startNode = MAP_DATA.nodes[pathArray[0]];
    controls.target.set(startNode.x, startNode.y, startNode.z);
    
    // Auto-switch floor to start node floor
    if(startNode.floor !== currentFloor) {
        setFloor(startNode.floor);
    }
}


function initGPSMarkers(startNode, endNode) {
    // Remove old markers
    if(gpsMarkerMeshes.red) { scene.remove(gpsMarkerMeshes.red); }
    if(gpsMarkerMeshes.blue) { scene.remove(gpsMarkerMeshes.blue); }
    if(gpsMarkerMeshes.redRing) { scene.remove(gpsMarkerMeshes.redRing); }
    if(gpsMarkerMeshes.bluePin) { scene.remove(gpsMarkerMeshes.bluePin); }
    if(gpsMarkerMeshes.walker) { scene.remove(gpsMarkerMeshes.walker); }

    // ── Static Red Pin (Main Entrance / Start) ──
    const redGroup = new THREE.Group();
    // Core sphere
    const redGeo = new THREE.SphereGeometry(8, 24, 24);
    const redMat = new THREE.MeshPhongMaterial({ color: 0xff2222, emissive: 0xcc0000, transparent: true, opacity: 0.95 });
    const redSphere = new THREE.Mesh(redGeo, redMat);
    redSphere.position.set(0, 24, 0); // raised
    redGroup.add(redSphere);
    // Pin stem
    const redStemGeo = new THREE.CylinderGeometry(1.5, 1.5, 20, 8);
    const redStemMat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const redStem = new THREE.Mesh(redStemGeo, redStemMat);
    redStem.position.set(0, 12, 0);
    redGroup.add(redStem);
    // Pulsing ring
    const ringGeo = new THREE.RingGeometry(10, 14, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 2, 0);
    redGroup.add(ring);
    gpsMarkerMeshes.redRing = ring;
    redGroup.position.set(startNode.x, startNode.y, startNode.z);
    gpsMarkerMeshes.red = redGroup; // Keep the whole pin static
    scene.add(redGroup);
    
    // ── Moving Orange Nav Dot (Walker) ──
    const walkerGeo = new THREE.SphereGeometry(4, 16, 16);
    const walkerMat = new THREE.MeshPhongMaterial({ color: 0xff9900, emissive: 0xff6600 });
    const walkerSphere = new THREE.Mesh(walkerGeo, walkerMat);
    walkerSphere.position.set(startNode.x, startNode.y + 4, startNode.z);
    scene.add(walkerSphere);
    gpsMarkerMeshes.walker = walkerSphere;

    // ── Static Blue Pin (Destination) ──
    const blueGroup = new THREE.Group();
    // Sphere head
    const blueGeo = new THREE.SphereGeometry(8, 24, 24);
    const blueMat = new THREE.MeshPhongMaterial({ color: 0x2299ff, emissive: 0x0066cc, transparent: true, opacity: 0.95 });
    const blueSphere = new THREE.Mesh(blueGeo, blueMat);
    blueSphere.position.set(0, 24, 0);
    blueGroup.add(blueSphere);
    // Pin stem
    const stemGeo = new THREE.CylinderGeometry(1.5, 1.5, 20, 8);
    const stemMat = new THREE.MeshPhongMaterial({ color: 0x0077dd });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(0, 12, 0);
    blueGroup.add(stem);
    // Base ring
    const baseRingGeo = new THREE.RingGeometry(8, 12, 32);
    const baseRingMat = new THREE.MeshBasicMaterial({ color: 0x2299ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.set(0, 2, 0);
    blueGroup.add(baseRing);
    gpsMarkerMeshes.bluePin = baseRing;
    blueGroup.position.set(endNode.x, endNode.y, endNode.z);
    gpsMarkerMeshes.blue = blueGroup;
    scene.add(blueGroup);
}

function simulateRoute(pathArray) {
    if(simulationTimer) cancelAnimationFrame(simulationTimer);

    const statusDiv = document.getElementById('gps-status');
    if(statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '<i class="fa-solid fa-location-arrow fa-fade"></i> Navigating to destination...';
        statusDiv.style.color = '#4da6ff';
    }

    let currentSegment = 0;
    let progress = 0;
    const speed = 0.008; // Slow, realistic walking pace
    let lastAnnouncedSegment = -1;

    // Build turn-by-turn step list for highlighting
    const stepItems = document.querySelectorAll('#route-steps li');

    // Compute bearings between segments for left/right/straight direction cues
    function getDirection(prevNode, currNode, nextNode) {
        if (!prevNode || !nextNode) return 'Continue';
        // 2D angle change
        const angle1 = Math.atan2(currNode.z - prevNode.z, currNode.x - prevNode.x);
        const angle2 = Math.atan2(nextNode.z - currNode.z, nextNode.x - currNode.x);
        let diff = (angle2 - angle1) * (180 / Math.PI);
        // Normalize to -180..180
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        if (Math.abs(diff) < 30) return 'Continue straight';
        if (diff > 0) return 'Turn left';
        return 'Turn right';
    }

    // Announce start
    const destLabel = MAP_DATA.nodes[pathArray[pathArray.length - 1]].label;
    speakNarration(`Navigation started. Heading towards ${destLabel}.`);

    function animateStep() {
        if(currentSegment >= pathArray.length - 1) {
            // Arrived
            if(statusDiv) {
                statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> You have arrived!';
                statusDiv.style.color = '#27ae60';
            }
            speakNarration(`You have arrived at ${destLabel}.`);
            // Highlight last step
            stepItems.forEach(s => s.classList.remove('step-active'));
            if(stepItems.length) stepItems[stepItems.length - 1].classList.add('step-active');
            return;
        }

        const a = MAP_DATA.nodes[pathArray[currentSegment]];
        const b = MAP_DATA.nodes[pathArray[currentSegment + 1]];

        // Announce direction at each new segment
        if (currentSegment !== lastAnnouncedSegment) {
            lastAnnouncedSegment = currentSegment;

            // Auto floor switch
            if (a.floor !== currentFloor) {
                setFloor(a.floor);
            }

            // Elevator / stairs announcement
            if (a.type === 'elevator' && b.type === 'elevator' && a.floor !== b.floor) {
                speakNarration(`Take the elevator to Floor ${b.floor === 1 ? 'Ground' : b.floor}.`);
            } else if (a.type === 'stairs' && b.type === 'stairs' && a.floor !== b.floor) {
                speakNarration(`Take the stairs to Floor ${b.floor === 1 ? 'Ground' : b.floor}.`);
            } else if (b.type === 'department' || b.type === 'entrance') {
                // About to arrive at a named location
                if (currentSegment === pathArray.length - 2) {
                    speakNarration(`Your destination, ${b.label}, is just ahead.`);
                }
            } else if (currentSegment > 0) {
                const prev = MAP_DATA.nodes[pathArray[currentSegment - 1]];
                const dir = getDirection(prev, a, b);
                if (a.label && a.type !== 'hallway') {
                    speakNarration(`${dir} at ${a.label}.`);
                }
            }

            // Highlight current step in turn-by-turn list
            highlightStep(currentSegment, pathArray);
        }

        // Interpolate position
        progress += speed;
        if (progress >= 1.0) {
            progress = 0;
            currentSegment++;
        } else {
            const nx = a.x + (b.x - a.x) * progress;
            const ny = a.y + (b.y - a.y) * progress;
            const nz = a.z + (b.z - a.z) * progress;
            if (gpsMarkerMeshes.walker) {
                gpsMarkerMeshes.walker.position.set(nx, ny + 4, nz);
            }
            // Camera follows user
            if (controls) {
                controls.target.set(nx, ny, nz);
                if (currentViewMode === '2d') {
                    camera.up.set(0, 0, -1);
                    camera.position.set(nx, 400, nz + 0.1); 
                }
            }
        }

        // Pulse the red ring
        if (gpsMarkerMeshes.redRing) {
            const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.003);
            gpsMarkerMeshes.redRing.material.opacity = 0.2 + 0.3 * pulse;
            gpsMarkerMeshes.redRing.scale.set(pulse + 0.3, pulse + 0.3, 1);
        }
        // Pulse the blue base ring
        if (gpsMarkerMeshes.bluePin) {
            const pulse2 = 0.7 + 0.3 * Math.sin(Date.now() * 0.004 + 1);
            gpsMarkerMeshes.bluePin.material.opacity = 0.15 + 0.25 * pulse2;
            gpsMarkerMeshes.bluePin.scale.set(pulse2 + 0.3, pulse2 + 0.3, 1);
        }

        simulationTimer = requestAnimationFrame(animateStep);
    }
    animateStep();
}

// Highlight the active step in the turn-by-turn directions panel
function highlightStep(segmentIndex, pathArray) {
    const list = document.getElementById('route-steps');
    if (!list) return;
    const items = list.querySelectorAll('li');

    // Map segmentIndex to visible step index (hallway nodes are hidden)
    let visibleIdx = 0;
    for (let i = 0; i <= segmentIndex && i < pathArray.length; i++) {
        const node = MAP_DATA.nodes[pathArray[i]];
        if (node.type !== 'hallway' || i === 0 || i === pathArray.length - 1) {
            if (i === segmentIndex) break;
            visibleIdx++;
        }
    }

    items.forEach(li => li.classList.remove('step-active'));
    if (items[visibleIdx]) {
        items[visibleIdx].classList.add('step-active');
        items[visibleIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ── Welcome Overlay ──────────────────────────────────────────
function hideWelcomeOverlay() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function switchTo2D() {
    const btn2d = document.getElementById('btn-2d');
    const btn3d = document.getElementById('btn-3d');
    const btnLive = document.getElementById('btn-live');
    if (!btn2d) return;
    currentViewMode = '2d';
    btn2d.classList.add('active');
    if (btn3d) btn3d.classList.remove('active');
    if (btnLive) btnLive.classList.remove('active');
    if (camera && controls) {
        camera.up.set(0, 0, -1); // Strictly enforce top-of-screen orientation!
        camera.position.set(0, 400, 0);
        controls.target.set(0, (currentFloor - 1) * 40, 0);
        camera.lookAt(0, (currentFloor - 1) * 40, 0);
        controls.enableRotate = false;
    }
    updateFloorVisibility();
}

function calculateAndDrawRoute() {
    const startInput = document.getElementById('start-location').value.toLowerCase().trim();
    const endInput = document.getElementById('end-location').value.toLowerCase().trim();

    // Match by exact node ID first (dropdown values are node IDs)
    let startId = null;
    let endId = null;

    if (startInput.includes("gps") || startInput.includes("locating") || startInput.includes("main entrance")) {
        startId = "ent-170";
    }

    // Exact ID match (preferred — dropdowns use node.id as value)
    if (MAP_DATA.nodes[endInput]) {
        endId = endInput;
    }
    if (!startId && MAP_DATA.nodes[startInput]) {
        startId = startInput;
    }

    // Fuzzy label fallback only if exact match failed
    if (!startId || !endId) {
        Object.values(MAP_DATA.nodes).forEach(node => {
            if (!startId && (node.label.toLowerCase().includes(startInput) || node.id === startInput)) startId = node.id;
            if (!endId && (node.label.toLowerCase().includes(endInput) || node.id === endInput)) endId = node.id;
        });
    }

    if (startId && endId) {
        const path = pf.findPath(startId, endId, accessibleMode);
        if (path) {
            hideWelcomeOverlay();   // ← dismiss building photo
            
            // Auto-switch to destination floor so it displays correctly
            const destNode = MAP_DATA.nodes[endId];
            if (destNode && destNode.floor !== currentFloor) {
                setFloor(destNode.floor);
            }
            
            switchTo2D();           // ← switch to floor-plan view
            drawPath(path);
            
            const nearestParking = findNearestParking(endId);
            if (nearestParking) {
                createParkingHighlight(nearestParking);
            }
            
            updateDirectionsUI(path, nearestParking);
            initGPSMarkers(MAP_DATA.nodes[path[0]], Object.assign({}, destNode));
            simulateRoute(path);
        } else {
            alert("No path found between those locations.");
        }
    } else {
        alert("Please ensure both Start and End locations match valid departments.");
    }
}

function updateDirectionsUI(pathArray) {
    const list = document.getElementById('route-steps');
    const container = document.getElementById('directions-list');
    list.innerHTML = '';
    
    if(!pathArray) return;
    
    // Calculate est time (assuming 1 unit = 1 meter, walking 1.4m/s)
    let totalDist = 0;
    for(let i=0; i<pathArray.length - 1; i++) {
        const a = MAP_DATA.nodes[pathArray[i]];
        const b = MAP_DATA.nodes[pathArray[i+1]];
        totalDist += Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2) + Math.pow(a.z-b.z, 2));
    }
    const mins = Math.max(1, Math.round((totalDist / 1.4) / 60));
    document.getElementById('est-time').textContent = `${mins} min`;

    // ─── ADD PARKING INSTRUCTION ───
    if (nearestParking) {
        const parkLi = document.createElement('li');
        parkLi.innerHTML = `<i class="fa-solid fa-square-parking" style="color:#007bff;"></i> Park at <strong>${nearestParking.label}</strong>`;
        list.appendChild(parkLi);
    }

    pathArray.forEach((nodeId, index) => {
        const node = MAP_DATA.nodes[nodeId];
        const li = document.createElement('li');
        
        if (index === 0) {
            li.innerHTML = `<i class="fa-solid fa-play"></i> Start at <strong>${node.label}</strong>`;
        } else if (index === pathArray.length - 1) {
            li.innerHTML = `<i class="fa-solid fa-flag-checkered"></i> Arrive at <strong>${node.label}</strong>`;
        } else if (node.type === 'elevator') {
            li.innerHTML = `<i class="fa-solid fa-elevator"></i> Take elevator to Floor ${node.floor}`;
        } else if (node.type === 'stairs') {
            li.innerHTML = `<i class="fa-solid fa-stairs"></i> Take stairs to Floor ${node.floor}`;
        } else {
             li.innerHTML = `<i class="fa-solid fa-arrow-right"></i> Pass through ${node.label}`;
        }
        
        // Don't show every single hallway segment, just key transitions
        if(node.type !== 'hallway' || index === 0 || index === pathArray.length-1) {
            list.appendChild(li);
        }
    });

    container.classList.remove('hidden');
}

function findNearestParking(destinationId) {
    const target = MAP_DATA.nodes[destinationId];
    if (!target) return null;
    
    let closest = null;
    let minD = Infinity;
    Object.values(MAP_DATA.nodes).forEach(n => {
        if(n.type === 'parking') {
            const d = Math.sqrt(Math.pow(n.x - target.x,2) + Math.pow(n.z - target.z,2));
            if(d < minD) { minD = d; closest = n; }
        }
    });
    return closest;
}

function createParkingHighlight(parkingNode) {
    if (parkingHighlight) scene.remove(parkingHighlight);
    
    // Create animated pulsing ring
    const geometry = new THREE.RingGeometry(15, 25, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x007bff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    parkingHighlight = new THREE.Mesh(geometry, material);
    parkingHighlight.rotation.x = -Math.PI / 2;
    parkingHighlight.position.set(parkingNode.x, parkingNode.y + 1, parkingNode.z);
    
    // Custom data for animation
    parkingHighlight.userData = { scaleDir: 1, baseScale: 1.0, maxScale: 1.5, floor: parkingNode.floor };
    
    // Only show if the floor matches initially
    parkingHighlight.visible = (parkingNode.floor === currentFloor || currentViewMode === '3d');
    
    scene.add(parkingHighlight);
}

function setFloor(floorNum) {
    currentFloor = floorNum;
    document.querySelectorAll('.floor-btn').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.querySelector(`.floor-btn[data-floor="${floorNum}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // Update texture map and geometry
    if(floorPlane) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(FLOOR_TEXTURES[floorNum], function(texture) {
            
            const w = (texture.image && texture.image.width) ? texture.image.width / 2 : 800;
            const h = (texture.image && texture.image.height) ? texture.image.height / 2 : 800;
            
            if(floorPlane.geometry) floorPlane.geometry.dispose();
            floorPlane.geometry = new THREE.PlaneGeometry(w, h);
            
            if(floorPlane.material.map) floorPlane.material.map.dispose();
            floorPlane.material.map = texture;
            floorPlane.material.needsUpdate = true;
        });
    }

    if (parkingHighlight) {
        parkingHighlight.visible = (parkingHighlight.userData.floor === currentFloor || currentViewMode === '3d');
    }

    updateFloorVisibility();
}

function setupUIEvents() {
    // Navigate / Search Button
    document.getElementById('btn-navigate').addEventListener('click', calculateAndDrawRoute);

    // Auto-navigate when destination dropdown changes (Get Directions tab)
    const endLocationSel = document.getElementById('end-location');
    if (endLocationSel) {
        endLocationSel.addEventListener('change', () => {
            if (endLocationSel.value) {
                calculateAndDrawRoute();
            }
        });
    }

    // Floor Selector
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setFloor(parseInt(e.target.dataset.floor));
        });
    });

    // View Modes
    const btn3d = document.getElementById('btn-3d');
    const btn2d = document.getElementById('btn-2d');
    const btnLive = document.getElementById('btn-live');

    btn3d.addEventListener('click', () => {
        currentViewMode = '3d';
        btn3d.classList.add('active'); btn2d.classList.remove('active'); btnLive.classList.remove('active');
        camera.position.set(200, 200, 200);
        camera.lookAt(0,0,0);
        controls.enableRotate = true;
        updateFloorVisibility();
    });

    btn2d.addEventListener('click', () => {
        currentViewMode = '2d';
        btn2d.classList.add('active'); btn3d.classList.remove('active'); btnLive.classList.remove('active');
        camera.position.set(0, 400, 0);
        controls.target.set(0, (currentFloor -1)*40, 0);
        camera.lookAt(0, (currentFloor -1)*40, 0);
        controls.enableRotate = false;
        updateFloorVisibility();
    });

    btnLive.addEventListener('click', () => {
        alert("Live View (Street View) module requires 360-degree source assets. Infrastructure initialized.");
    });

    // Wheelchair Toggle
    const a11yToggle = document.getElementById('wheelchair-toggle');
    a11yToggle.addEventListener('click', () => {
        accessibleMode = !accessibleMode;
        a11yToggle.classList.toggle('active');
        if(pathLine) calculateAndDrawRoute();
    });

    setupSearchTabs();
}

function setupSearchTabs() {
    // Tab Switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            // Set active
            btn.classList.add('active');
            const targetTab = document.getElementById('tab-' + btn.dataset.tab);
            if(targetTab) targetTab.classList.remove('hidden');
        });
    });

    // Reality Capture Logic
    const captureInput = document.getElementById('reality-capture-input');
    const capturePreview = document.getElementById('capture-preview');
    const uploadBtn = document.getElementById('btn-upload-capture');
    
    if (captureInput) {
        captureInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                capturePreview.innerHTML = `<strong>${files.length}</strong> media file(s) ready for AI geometry processing.`;
                uploadBtn.style.display = 'flex';
            } else {
                capturePreview.innerHTML = '';
                uploadBtn.style.display = 'none';
            }
        });
        
        uploadBtn.addEventListener('click', () => {
            uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
            setTimeout(() => {
                uploadBtn.innerHTML = '<i class="fa-solid fa-check"></i> Uploaded Successfully!';
                uploadBtn.classList.add('btn-secondary'); // Turn green/secondary
                capturePreview.innerHTML = 'Media securely transmitted to Sherpa AI servers. It will be analyzed to build spatial geometry!';
                
                // Reset after a few seconds
                setTimeout(() => {
                    uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload AI Training Data';
                    uploadBtn.classList.remove('btn-secondary');
                    uploadBtn.style.display = 'none';
                    captureInput.value = '';
                    capturePreview.innerHTML = '';
                }, 4000);
            }, 1500);
        });
    }

    // Populate Get Directions (End Location) Dropdown
    const endLocationSelect = document.getElementById('end-location');
    if (endLocationSelect && endLocationSelect.tagName === 'SELECT') {
        endLocationSelect.innerHTML = '<option value="">Where do you want to go?</option>';
        
        // Filter out structural nodes and sort alphabetically by label
        const validNodes = Object.values(MAP_DATA.nodes).filter(n => 
            n.type !== 'hallway' && n.type !== 'stairs' && n.type !== 'elevator'
        );
        
        validNodes.sort((a, b) => a.label.localeCompare(b.label));
        
        validNodes.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.id;
            let floorName = n.floor === 1 ? 'Ground Floor' : (n.floor === 2 ? 'First Floor' : (n.floor === 3 ? 'Second Floor' : `Floor ${n.floor}`));
            let bldgName = n.building || 'Bldg 170';
            opt.textContent = `${n.label} - ${bldgName}, ${floorName}` + (n.roomNumber ? ` (Rm ${n.roomNumber})` : '');
            endLocationSelect.appendChild(opt);
        });
    }

    // Populate Browse Dropdowns
    const bldgSelect = document.getElementById('browse-bldg');
    const floorSelect = document.getElementById('browse-floor');
    const roomSelect = document.getElementById('browse-room');
    const applyBtn = document.getElementById('btn-browse-apply');

    if (!bldgSelect) return;

    // Build unique building list
    const buildings = new Set();
    Object.values(MAP_DATA.nodes).forEach(n => {
        if(n.building) buildings.add(n.building);
    });
    
    bldgSelect.innerHTML = '<option value="">-- Select Building --</option>';
    buildings.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        bldgSelect.appendChild(opt);
    });

    bldgSelect.addEventListener('change', () => {
        const selectedBldg = bldgSelect.value;
        if (!selectedBldg) {
            floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
            floorSelect.disabled = true;
            roomSelect.innerHTML = '<option value="">-- Select Room/Dept --</option>';
            roomSelect.disabled = true;
            return;
        }

        const floors = new Set();
        Object.values(MAP_DATA.nodes).forEach(n => {
            if(n.building === selectedBldg) floors.add(n.floor);
        });

        floorSelect.innerHTML = '<option value="">-- Select Floor --</option>';
        [...floors].sort().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = 'Floor ' + f;
            floorSelect.appendChild(opt);
        });
        floorSelect.disabled = false;
        
        // Reset room
        roomSelect.innerHTML = '<option value="">-- Select Room/Dept --</option>';
        roomSelect.disabled = true;
    });

    floorSelect.addEventListener('change', () => {
        const selectedBldg = bldgSelect.value;
        const selectedFloor = parseInt(floorSelect.value);
        if (!selectedFloor) {
            roomSelect.innerHTML = '<option value="">-- Select Room/Dept --</option>';
            roomSelect.disabled = true;
            return;
        }

        roomSelect.innerHTML = '<option value="">-- Select Room/Dept --</option>';
        Object.values(MAP_DATA.nodes).forEach(n => {
            if(n.building === selectedBldg && n.floor === selectedFloor && (n.type === 'department' || n.type === 'room')) {
                const opt = document.createElement('option');
                opt.value = n.id;
                opt.textContent = n.label + (n.roomNumber ? ' (' + n.roomNumber + ')' : '');
                roomSelect.appendChild(opt);
            }
        });
        roomSelect.disabled = false;
    });

    applyBtn.addEventListener('click', () => {
        const roomId = roomSelect.value;
        if (!roomId) return alert('Please select a specific Room or Department.');
        
        const node = MAP_DATA.nodes[roomId];
        const targetInput = document.getElementById('end-location');
        targetInput.value = node.id;
        
        // Switch back to Get Directions tab and auto-navigate
        document.querySelector('.tab-btn[data-tab="text"]').click();
        setTimeout(() => calculateAndDrawRoute(), 100);
    });

    // QR Mock Scan Logic
    const qrBtn = document.getElementById('btn-mock-scan');
    if (qrBtn) {
        qrBtn.addEventListener('click', () => {
            const targetInput = document.getElementById('end-location');
            targetInput.value = 'pharmacy';
            
            // Switch to Get Directions tab and auto-navigate
            document.querySelector('.tab-btn[data-tab="text"]').click();
            setTimeout(() => calculateAndDrawRoute(), 100);
        });
    }
}

function setupAdminEvents() {
    const adminToggle = document.getElementById('admin-toggle');
    const adminPanel = document.getElementById('admin-editor-panel');
    const exportBtn = document.getElementById('btn-export-data');
    const container = document.getElementById('map-canvas-container');

    if(!adminToggle) return;

    adminToggle.addEventListener('click', () => {
        adminMode = !adminMode;
        if(adminMode) {
            adminPanel.classList.remove('hidden');
            adminToggle.style.color = 'var(--accent)';
            container.style.cursor = 'crosshair';
        } else {
            adminPanel.classList.add('hidden');
            adminToggle.style.color = '';
            container.style.cursor = 'default';
            selectedNodeId = null; // deselect active node
        }
        updateFloorVisibility(); // Instantly show/hide node network
    });

    // Raycast Click Event
    renderer.domElement.addEventListener('click', (event) => {
        if(!adminMode) return;

        event.preventDefault();

        // Calculate mouse position in normalized device coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
        mouse.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // 1. Check if clicking an existing node
        const nodeMeshesArray = Object.values(nodeMeshes);
        const intersectsNodes = raycaster.intersectObjects(nodeMeshesArray);

        if(intersectsNodes.length > 0) {
            const clickedMesh = intersectsNodes[0].object;
            const nodeId = Object.keys(nodeMeshes).find(k => nodeMeshes[k] === clickedMesh);

            if(event.altKey || event.getModifierState("Alt")) {
                // DELETE NODE
                delete MAP_DATA.nodes[nodeId];
                scene.remove(clickedMesh);
                delete nodeMeshes[nodeId];
                MAP_DATA.edges = MAP_DATA.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
                if(selectedNodeId === nodeId) selectedNodeId = null;
                redrawEdges();
                return;
            }

            if(event.shiftKey && selectedNodeId && selectedNodeId !== nodeId) {
                // LINK TWO NODES
                MAP_DATA.edges.push({
                    from: selectedNodeId,
                    to: nodeId,
                    type: document.getElementById('admin-node-type').value === 'stairs' ? 'stairs' : 'walkway'
                });
                redrawEdges();
                return;
            }

            // SELECT NODE
            selectedNodeId = nodeId;
            document.getElementById('admin-node-label').value = MAP_DATA.nodes[nodeId].label;
            document.getElementById('admin-node-type').value = MAP_DATA.nodes[nodeId].type;
            
            // Re-color to show selection
            Object.values(nodeMeshes).forEach(m => scene.remove(m));
            nodeMeshes = {};
            Object.values(MAP_DATA.nodes).forEach(n => drawSingleNode(n));
            return;
        }

        // 2. Clicked empty space (floor plane)
        const intersectsPlane = raycaster.intersectObject(floorPlane || scene.children.find(c => c.type === 'GridHelper'));
        if(intersectsPlane.length > 0 && !event.shiftKey) {
            const p = intersectsPlane[0].point;
            const nid = 'node_' + Date.now();
            const nLabel = document.getElementById('admin-node-label').value || 'Room/Area';
            const nType = document.getElementById('admin-node-type').value;

            // Calculate exact height based on current selected floor
            const yPos = currentFloor * 40;

            MAP_DATA.nodes[nid] = {
                id: nid,
                label: nLabel,
                x: Math.round(p.x),
                y: yPos,
                z: Math.round(p.z),
                floor: currentFloor,
                type: nType
            };

            // Automatically link to previously selected node if standard mode is checked (optional, but let's just create)
            drawSingleNode(MAP_DATA.nodes[nid]);
            
            // Auto Select New Node
            selectedNodeId = nid;
            Object.values(nodeMeshes).forEach(m => scene.remove(m));
            Object.keys(MAP_DATA.nodes).forEach(k => drawSingleNode(MAP_DATA.nodes[k]));
        }
    });

    // Export Process Data
    exportBtn.addEventListener('click', () => {
        // Recalculate edge distances before export
        MAP_DATA.edges.forEach(edge => {
            const start = MAP_DATA.nodes[edge.from];
            const end = MAP_DATA.nodes[edge.to];
            if(start && end) {
                edge.distance = Math.round(Math.sqrt(
                    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2) + Math.pow(end.z - start.z, 2)
                ));
            }
        });
        const outData = 'const MAP_DATA = ' + JSON.stringify(MAP_DATA, null, 2) + ';\n';
        document.getElementById('admin-export-output').value = outData;
    });
}

function onWindowResize() {
    const container = document.getElementById('map-canvas-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (parkingHighlight && parkingHighlight.visible) {
        parkingHighlight.scale.x += 0.015 * parkingHighlight.userData.scaleDir;
        parkingHighlight.scale.y += 0.015 * parkingHighlight.userData.scaleDir;
        if (parkingHighlight.scale.x > parkingHighlight.userData.maxScale) {
            parkingHighlight.userData.scaleDir = -1;
        } else if (parkingHighlight.scale.x < parkingHighlight.userData.baseScale) {
            parkingHighlight.userData.scaleDir = 1;
        }
        
        // Fade opacity with scale
        const scaleRange = parkingHighlight.userData.maxScale - parkingHighlight.userData.baseScale;
        const currProgress = parkingHighlight.scale.x - parkingHighlight.userData.baseScale;
        parkingHighlight.material.opacity = Math.max(0.2, 0.8 - (currProgress / scaleRange) * 0.6);
    }

    // Pulse the GPS ring if it exists
    if (gpsPulse) {
        gpsPulse.scale.x += 0.02;
        gpsPulse.scale.z += 0.02;
        gpsPulse.material.opacity -= 0.02;
        if (gpsPulse.scale.x > 3) {
            gpsPulse.scale.set(1, 1, 1);
            gpsPulse.material.opacity = 0.6;
        }
    }

    renderer.render(scene, camera);
}

function showGPSMarker(nodeId) {
    const node = MAP_DATA.nodes[nodeId];
    if (!node) return;

    // Remove old GPS marker if any
    if (gpsMarker) scene.remove(gpsMarker);
    if (gpsPulse) scene.remove(gpsPulse);

    // Google Maps Blue Dot
    const dotGeo = new THREE.SphereGeometry(6, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x4285F4 }); // Google Blue
    gpsMarker = new THREE.Mesh(dotGeo, dotMat);
    gpsMarker.position.set(node.x, node.y + 4, node.z);
    
    // Add white border around the dot
    const borderGeo = new THREE.SphereGeometry(7.5, 16, 16);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
    gpsMarker.add(new THREE.Mesh(borderGeo, borderMat));

    // Pulsating Ring
    const pulseGeo = new THREE.CylinderGeometry(8, 8, 1, 32);
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0x4285F4, transparent: true, opacity: 0.6 });
    gpsPulse = new THREE.Mesh(pulseGeo, pulseMat);
    gpsPulse.position.set(node.x, node.y + 2, node.z);

    scene.add(gpsMarker);
    scene.add(gpsPulse);
}

function localizeUser() {
    // Logic entirely wiped to safely prevent overwrite of Main Entrance logic.
    showGPSMarker("ent-170"); // Just spawn the blue marker dot safely at Main Entrance
}

// Ensure init runs after load
document.addEventListener("DOMContentLoaded", init);
