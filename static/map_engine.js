// map_engine.js
// Handles the D3.js Map Projection for Open Vote Geospatial Data

let mapInitialized = false;
let usTopology = null;
let currentZoomState = null;
let isMapView = false;

// Global Hooks for Live Pulsing
let mapSvgGroup = null;
let mapProjection = null;
let globeTimer = null;

// Shared Color Scales (dynamically updated)
let dynamicColorScale = null;

function toggleMapView() {
    const chartView = document.getElementById('chart-view');
    const mapView = document.getElementById('map-view');
    
    if (isMapView) {
        chartView.classList.remove('hidden');
        mapView.classList.add('hidden');
        isMapView = false;
        document.getElementById('btn-toggle-view').innerHTML = '<i class="fa-solid fa-earth-americas"></i> Map View';
    } else {
        chartView.classList.add('hidden');
        mapView.classList.remove('hidden');
        isMapView = true;
        document.getElementById('btn-toggle-view').innerHTML = '<i class="fa-solid fa-chart-column"></i> Bar View';
        
        if (!mapInitialized) {
            initMap();
        } else {
            updateMapForPoll();
        }
    }
}

let currentRegionLoaded = null;

async function initMap() {
    const poll = polls.find(p => p.id === currentPollId);
    if (!poll) return;
    const targetRegion = poll.region;

    mapInitialized = true;
    currentRegionLoaded = targetRegion;
    
    const svg = d3.select("#interactive-map");
    const loading = document.getElementById('map-loading');
    
    // Clear canvas and any active global timers for re-projection
    svg.selectAll("*").remove();
    if(globeTimer) {
        globeTimer.stop();
        globeTimer = null;
    }
    
    loading.style.display = 'block';
    
    const width = svg.node().getBoundingClientRect().width || 600;
    const height = svg.node().getBoundingClientRect().height || 350;
    
    let projection;
    let topoUrl = "";
    
    if (targetRegion === "US") {
        const scaleFactor = Math.min(width * 1.1, height * 2.0);
        projection = d3.geoAlbersUsa()
            .scale(scaleFactor)
            .translate([width / 2, height / 2.1]);
        topoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
    } else if (targetRegion === "UK" || targetRegion === "United Kingdom") {
        const scaleFactor = Math.min(width * 3.5, height * 4.0);
        projection = d3.geoMercator()
            .center([-2.5, 54.5])
            .scale(scaleFactor)
            .translate([width / 2, height / 2]);
        topoUrl = "https://raw.githubusercontent.com/martinjc/UK-GeoJSON/master/json/administrative/gb/topo_lad.json";
    } else if (targetRegion === "France") {
        const scaleFactor = Math.min(width * 2.5, height * 2.5);
        projection = d3.geoMercator()
            .center([2.5, 46.5])
            .scale(scaleFactor)
            .translate([width / 2, height / 2]);
        topoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
    } else {
        // Global / Fallback (Orthographic 3D Globe)
        const scaleFactor = Math.min(width, height) / 2 - 10;
        projection = d3.geoOrthographic()
            .scale(scaleFactor)
            .translate([width / 2, height / 2])
            .clipAngle(90); // hide back of the globe
        topoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
        
        // Render Ocean Drop shadow background for 3D effect
        svg.append("circle")
            .attr("cx", width / 2)
            .attr("cy", height / 2)
            .attr("r", scaleFactor)
            .style("fill", "#040608")
            .style("stroke", "rgba(88, 166, 255, 0.1)")
            .style("stroke-width", "2px")
            .style("filter", "drop-shadow(0 0 20px rgba(88, 166, 255, 0.2))");
        
        // Spin the globe continuously
        let rotation = [0, 0];
        globeTimer = d3.timer((elapsed) => {
            rotation[0] = elapsed * 0.01; // Speed of spin
            projection.rotate(rotation);
            svg.selectAll("path").attr("d", path);
        });
    }

    const path = d3.geoPath().projection(projection);
    const g = svg.append("g");
    
    // Bind globals
    mapSvgGroup = g;
    mapProjection = projection;

    try {
        const topologyData = await d3.json(topoUrl);
        usTopology = topologyData;
        loading.style.display = 'none';

        // Dynamically find geometry objects (avoids hardcoding 'states' or 'counties')
        const objKeys = Object.keys(topologyData.objects);
        if(objKeys.length === 0) throw new Error("No topology objects found");
        
        // Intelligently map the base (states) and sub (counties) layers
        let stateKey = objKeys.find(k => k.toLowerCase().includes('state') || k.toLowerCase().includes('lad') || k.toLowerCase().includes('countr')) || objKeys[0];
        let countyKey = objKeys.find(k => k.toLowerCase().includes('counti') || k.toLowerCase().includes('borough')) || objKeys[objKeys.length - 1];
        
        if (stateKey === countyKey && objKeys.length > 1) {
            countyKey = objKeys.find(k => k !== stateKey);
        }
        
        let baseGeometries = topojson.feature(topologyData, topologyData.objects[stateKey]).features;
        let subGeometries = stateKey !== countyKey ? topojson.feature(topologyData, topologyData.objects[countyKey]).features : [];

        // Draw deep layers (counties or similar)
        const renderData = subGeometries.length > 0 ? subGeometries : baseGeometries;
        
        const countyPaths = g.append("g")
            .attr("id", "counties")
            .selectAll("path")
            .data(renderData)
            .join("path")
            .attr("class", "county-path")
            .attr("d", path)
            .attr("fill", d => getMockCountyColor(d.id || Math.random() * 1000));

        // Tooltip logic
        countyPaths.on("mouseover", function(event, d) {
            const tooltip = document.getElementById('map-tooltip');
            const pollCtx = polls.find(p => p.id === currentPollId);
            if (!pollCtx) return;
            
            // Generate mock data for this geometry node
            const geoName = d.properties.name || d.properties.NAME_2 || d.properties.NAME_1 || "Region";
            const data = getMockCountyData(d.id || Math.random() * 1000, geoName, pollCtx);
            
            document.getElementById('tt-title').innerText = geoName;
            let formattedHtml = '';
            
            pollCtx.options.forEach((opt, index) => {
                const marginStyle = index < pollCtx.options.length - 1 ? 'margin-bottom: 0.2rem;' : '';
                const voteCount = data.options[index] || 0;
                formattedHtml += `<div style="display:flex; justify-content:space-between; color: ${opt.color}; font-family: 'Share Tech Mono'; ${marginStyle}"><span>${opt.label}</span><span style="margin-left: 15px;">${voteCount.toLocaleString()}</span></div>`;
            });
            
            document.getElementById('tt-data').innerHTML = formattedHtml;
            tooltip.style.opacity = 1;
        })
        .on("mousemove", function(event) {
            const tooltip = document.getElementById('map-tooltip');
            let rect = document.getElementById('interactive-map').getBoundingClientRect();
            let x = event.clientX - rect.left + 15;
            let y = event.clientY - rect.top + 15;
            if (x > rect.width - 200) x -= 220; 
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        })
        .on("mouseout", function() {
            document.getElementById('map-tooltip').style.opacity = 0;
        });

        // Overlay boundaries (e.g. states over counties, or just borders of base features)
        g.append("path")
            .datum(topojson.mesh(topologyData, topologyData.objects[stateKey], (a, b) => a !== b))
            .attr("class", "state-boundary")
            .attr("d", path)
            .attr("stroke", "#000") // Force black borders
            .attr("stroke-width", "1.5px");

        // state-path is interactive overlay layer
        g.append("g")
            .attr("id", "states")
            .selectAll("path")
            .data(baseGeometries)
            .join("path")
            .attr("class", "state-path")
            .attr("d", path)
            .attr("fill", d => getMockStateColor(d.id || Math.random() * 1000))
            .attr("stroke", "#000") // Force initial border color via D3
            .attr("stroke-width", "1.5px")
            .on("click", clicked);

        function clicked(event, d) {
            event.stopPropagation();
            const [[x0, y0], [x1, y1]] = path.bounds(d);
            const dx = x1 - x0;
            const dy = y1 - y0;
            const x = (x0 + x1) / 2;
            const y = (y0 + y1) / 2;
            const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
            const translate = [width / 2 - scale * x, height / 2 - scale * y];

            if (currentZoomState === d.id) {
                // Zoom out if clicking same state
                reset();
                return;
            }
            
            currentZoomState = d.id;

            g.transition()
                .duration(750)
                .call(
                    zoom.transform, 
                    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                );
                
            // When zoomed in, make state paths pointer-events none so counties catch hover
            d3.selectAll('.state-path').style("pointer-events", "none").style("fill-opacity", 0.1); // dim all
            d3.select(event.currentTarget).style("fill-opacity", 0); // Hide the clicked state to reveal counties completely
        }

        if (targetRegion === "Global") {
            const drag = d3.drag()
                .on("start", () => {
                    // Halt automatic continuous spin so user takes control
                    if(globeTimer) {
                        globeTimer.stop();
                        globeTimer = null;
                    }
                })
                .on("drag", (event) => {
                    const rotate = projection.rotate();
                    // Sensitivity scaling
                    const k = 90 / projection.scale();
                    projection.rotate([
                        rotate[0] + event.dx * k,
                        rotate[1] - event.dy * k
                    ]);
                    // Re-render D3 geometry paths bound to the new projection angles
                    svg.selectAll("path").attr("d", path);
                });
            svg.call(drag);
            
        } else {
            const zoom = d3.zoom()
                .scaleExtent([1, 8])
                .on("zoom", (event) => {
                    // Standard 2D pan/zoom applies translation matrix directly to the DOM group
                    g.attr("transform", event.transform);
                    // Dynamically adjust stroke width so boundaries don't become massive
                    g.selectAll(".state-boundary").attr("stroke-width", 1.5 / event.transform.k).attr("stroke", "#000");
                    g.selectAll(".state-path").attr("stroke-width", 1.5 / event.transform.k).attr("stroke", "#000");
                    g.selectAll(".county-path").attr("stroke-width", 0.5 / event.transform.k).attr("stroke", "rgba(0,0,0,0.5)");
                });
            svg.call(zoom);
        }

        function reset() {
            currentZoomState = null;
            g.transition().duration(750).call(
                zoom.transform, 
                d3.zoomIdentity
            );
            d3.selectAll('.state-path').style("pointer-events", "all").style("fill-opacity", 1);
        }

        // Clicking ocean resets map
        svg.on("click", reset);

    } catch (e) {
        console.error("Map initialization failed", e);
        loading.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error loading Topography Data';
        loading.style.color = "var(--accent-red)";
    }
}

function hashStringToInt(str) {
    if (typeof str !== 'string') str = String(str);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) || 1234;
}

// Map color/data generators uses the county FIPS ID to seed deterministic "mock" results
function getMockCountyData(id, name, poll) {
    if(!poll) poll = polls.find(p => p.id === currentPollId);
    
    const seed = hashStringToInt(id);
    // Pseudo-random but deterministic based on county and poll
    const mathSeed = Math.sin(seed + poll.id) * 10000;
    const rnd = mathSeed - Math.floor(mathSeed);
    
    // Simulate geographic acreage vs population density leaning
    let isOptALeaning = rnd > 0.65; // ~35% counties favor A, ~65% B
    
    // Feature 4: Demographic Slice Modifiers shift the map drastically
    if (typeof currentDemographicFilter !== 'undefined') {
        if (currentDemographicFilter === 'verified') {
            isOptALeaning = rnd > 0.55; 
        } else if (currentDemographicFilter === 'genz') {
            isOptALeaning = rnd > 0.35; // heavily shifts to option A
        } else if (currentDemographicFilter === 'boomer') {
            isOptALeaning = rnd > 0.85; // heavily shifts to option B
        }
    }
    
    let baseVotes = Math.floor(200 + (rnd * 48000));
    // High-pop favor A
    if (isOptALeaning && rnd > 0.9) baseVotes *= 5; 
    
    const margin = 0.05 + (rnd * 0.4); // 5% to 45% margin
    
    // We dynamically distribute the votes across ALL available poll options
    let optionCounts = new Array(poll.options.length).fill(0);
    
    if (isOptALeaning) {
        optionCounts[0] = Math.floor(baseVotes * (0.5 + margin/2));
        let remaining = baseVotes - optionCounts[0];
        // Split remaining among other options
        for(let i=1; i < optionCounts.length; i++) {
            if(i === optionCounts.length - 1) {
                optionCounts[i] = remaining; // give the rest to the last item
            } else {
                let share = Math.floor(remaining * 0.6); // heavily weight the 2nd place
                optionCounts[i] = share;
                remaining -= share;
            }
        }
    } else {
        optionCounts[1] = Math.floor(baseVotes * (0.5 + margin/2));
        let remaining = baseVotes - optionCounts[1];
        // Distribute remaining giving preference to Opt A
        optionCounts[0] = Math.floor(remaining * 0.7);
        remaining -= optionCounts[0];
        
        for(let i=2; i < optionCounts.length; i++) {
            if(i === optionCounts.length - 1) {
                optionCounts[i] = remaining;
            } else {
                let share = Math.floor(remaining * 0.5);
                optionCounts[i] = share;
                remaining -= share;
            }
        }
    }
    
    // Calculate diff specifically between top 2 for the geographic map color coding
    const diff = ((optionCounts[0] || 0) - (optionCounts[1] || 0)) / baseVotes * 100;
    
    return { name, options: optionCounts, diff: diff };
}

function getMockCountyColor(id) {
    const poll = polls.find(p => p.id === currentPollId);
    if(!poll) return "#111";
    const data = getMockCountyData(id, "mock", poll);
    
    // Disable gradients - definitively select the solid color of the winning parameter
    let maxIndex = 0;
    let maxVotes = -1;
    data.options.forEach((v, i) => {
        if(v > maxVotes) { maxVotes = v; maxIndex = i; }
    });
    return poll.options[maxIndex].color;
}

function getMockStateColor(id) {
    const poll = polls.find(p => p.id === currentPollId);
    if(!poll) return "#111";
    
    // Extract a unique winning permutation for the overarching State container
    const data = getMockCountyData(hashStringToInt(id) + 8000, "State", poll);
    
    let maxIndex = 0;
    let maxVotes = -1;
    data.options.forEach((v, i) => {
        if(v > maxVotes) { maxVotes = v; maxIndex = i; }
    });
    return poll.options[maxIndex].color;
}

function triggerGlobalPulse() {
    if(!mapSvgGroup || !mapProjection || !isMapView || !usTopology) return;
    
    // Pick a random geometry bounding box
    const countyNodes = d3.selectAll(".county-path").nodes();
    if(countyNodes && countyNodes.length > 0) {
        const randomNode = countyNodes[Math.floor(Math.random() * countyNodes.length)];
        const d = d3.select(randomNode).datum();
        
        if(!d) return;
        
        // Calculate center of the randomly selected area
        let bounds;
        try {
            bounds = d3.geoPath().projection(mapProjection).bounds(d);
        } catch(e) { return; }
        
        if(!bounds || !bounds[0] || isNaN(bounds[0][0]) || !isFinite(bounds[0][0])) return;
        
        const cx = (bounds[0][0] + bounds[1][0]) / 2;
        const cy = (bounds[0][1] + bounds[1][1]) / 2;
        
        // Pick random active poll color for effect
        const poll = polls.find(p => p.id === currentPollId);
        const color = poll ? poll.options[Math.floor(Math.random() * poll.options.length)].color : "var(--accent-glow)";
        
        const circle = mapSvgGroup.append("circle")
            .attr("cx", cx)
            .attr("cy", cy)
            .attr("r", 0)
            .style("fill", color)
            .style("opacity", 0.8)
            .style("filter", "blur(2px)")
            .style("pointer-events", "none");
            
        circle.transition()
            .duration(1500 + Math.random() * 1500)
            .ease(d3.easeCubicOut)
            .attr("r", 20 + Math.random() * 50)
            .style("opacity", 0)
            .remove();
    }
}

function updateMapForPoll() {
    if (!mapInitialized || !usTopology) return;

    const poll = polls.find(p => p.id === currentPollId);
    if (!poll || poll.options.length < 2) return;

    // Trigger full region rebuild if necessary
    if (poll.region && currentRegionLoaded !== poll.region) {
        initMap();
        return;
    }

    // Transition existing elements to their newly mapped massive solid colors
    d3.selectAll('.state-path')
        .transition()
        .duration(800)
        .attr("fill", d => getMockStateColor(d.id));

    d3.selectAll('.county-path')
        .transition()
        .duration(800)
        .attr("fill", d => getMockCountyColor(d.id));
}
