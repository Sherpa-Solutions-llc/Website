/**
 * FLIGHTS LAYER (Civilian & Military)
 * Handles polling, processing, rendering, and targeting for live flight tracking.
 */

window.FlightsLayer = {
    id: 'flights',
    
    // Core Data Sources
    flightsDataSource: null,
    militaryDataSource: null,
    
    // Isolated State
    data: [], // Used for caching both Civilian and Military states

    // Graphics
    airplaneSvg: `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik00NDggMzM2di00MEwyODggMTkyVjc5LjJjMC0xNy43LTE0LjgtMzEuMi0zMi0zMS4ycy0zMiAxMy41LTMyIDMxLjJWMTkyTDY0IDI5NnY0MGwxNjAtNDh2MTEzLjZsLTQ4IDMxLjJWNDY0bDgwLTE2IDgwIDE2di0zMS4ybC00OC0zMS4yVjI4OGwxNjAgNDh6Ii8+PC9zdmc+`,
    militaryAirplaneSvg: `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9Im9yYW5nZSIgZD0iTTQ0OCAzMzZ2LTQwTDI4OCAxOTJWNzkuMmMwLTE3LjctMTQuOC0zMS4yLTMyLTMxLjJzLTMyIDEzLjUtMzIgMzEuMlYxOTJMNjQgMjk2djQwbDE2MC00OHYxMTMuNmwtNDggMzEuMlY0NjRsODAtMTYgODAgMTZ2LTMxLjJsLTQ4LTMxLjJWMjg4bDE2MCA0OHoiLz48L3N2Zz4=`,
    majorAirports: ['JFK', 'LHR', 'CDG', 'HND', 'SYD', 'PEK', 'DXB', 'SIN', 'FRA', 'AMS', 'LAX', 'ORD', 'ATL', 'HKG', 'MAD', 'IST', 'SVO', 'PER', 'AKL', 'JNB', 'GIG', 'MEX', 'YYZ', 'GRU'],

    init: function(viewer) {
        this.flightsDataSource = window.flightsDataSource;
        this.militaryDataSource = window.militaryDataSource;
        window.airplaneSvg = this.airplaneSvg;
        window.militaryAirplaneSvg = this.militaryAirplaneSvg;
        console.log('[Module] Flights Layer Initialized with global clustered dataSource');
    },

    clear: function() {
        this.flightsDataSource.entities.removeAll();
        this.militaryDataSource.entities.removeAll();
    },

    filterBySpeed: function(f, speedRange) {
        if (speedRange === 'all') return true;
        const hSpeed = f.trueVelocityKmH || f.velocityKmH || 0;
        if (speedRange === '0-500' && hSpeed <= 500) return true;
        if (speedRange === '500-1000' && hSpeed > 500 && hSpeed <= 1000) return true;
        if (speedRange === '1000+' && hSpeed > 1000) return true;
        return false;
    },

    getMockRoute: function(callsign) {
        let hash = 0;
        const str = callsign ? callsign : String(Math.random());
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const idx1 = Math.abs(hash) % this.majorAirports.length;
        let idx2 = Math.abs(hash * 31) % this.majorAirports.length;
        if (idx1 === idx2) idx2 = (idx2 + 1) % this.majorAirports.length;
        return { origin: this.majorAirports[idx1], destination: this.majorAirports[idx2] };
    },

    fetchFlightRoute: async function(target) {
        target.origin = "CALCULATING...";
        target.destination = "CALCULATING...";
    
        if (!target.isMilitary && target.callsign && !target.callsign.includes('UNKNOWN') && target.callsign.trim() !== '') {
            try {
                const res = await fetch(`/api/flight-route?callsign=${encodeURIComponent(target.callsign.trim())}`);
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
    
        setTimeout(() => {
            const route = this.getMockRoute(target.callsign);
            target.origin = route.origin;
            target.destination = route.destination;
            // Force HUD redraw if target is still matching
            if (state.target && state.target.id === target.id) {
                renderTargetDetails();
            }
        }, 400);
    },

    fetch: async function() {
        try {
            let activeStates = [];
            let timestamp = Math.floor(Date.now() / 1000);
    
            if (state.dataSources.flights === 'opensky') {
                const res = await fetch(`${window.API_BASE || ''}/api/flights`);
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
                activeStates.forEach((s, i) => {
                    if (ac[i].gs) s[9] = ac[i].gs * 0.51444; 
                    else if (ac[i].tas) s[9] = ac[i].tas * 0.51444;
                });
                console.log(`[Flights] Fetched ${activeStates.length} raw states from ADSB.lol API`);
            }
    
            // Early dismissal of initial loading overlay for better UX
            const loadingOverlay = document.getElementById('loading-overlay');
            if(loadingOverlay) loadingOverlay.style.display = 'none';
    
            const oldFlightsMap = new Map(this.data.map(f => [f.id, f]));
    
            this.data = activeStates
                .filter(s => s[5] !== null && s[6] !== null && s[8] === false)
                .map(s => {
                    try {
                        const velocityKmH = (s[9] || 0) * 3.6;
                        const isMilitary = s[1] ? s[1].trim().startsWith("RCH") || s[1].trim().startsWith("AF") || s[1].trim().startsWith("RRR") || s[1].trim().startsWith("CNV") : false;
    
                        const lngRad = Cesium.Math.toRadians(s[5]);
                        const latRad = Cesium.Math.toRadians(s[6]);
                        const headingRad = Cesium.Math.toRadians(s[10] || 0);
    
                        const cosLat = Math.cos(latRad);
                        const sinLat = Math.sin(latRad);
                        const cosLng = Math.cos(lngRad);
                        const sinLng = Math.sin(lngRad);
    
                        const eastX = -sinLng, eastY = cosLng, eastZ = 0;
                        const northX = -sinLat * cosLng, northY = -sinLat * sinLng, northZ = cosLat;
                        const cosH = Math.cos(headingRad), sinH = Math.sin(headingRad);
    
                        const alignedAxis = new Cesium.Cartesian3(
                            northX * cosH + eastX * sinH,
                            northY * cosH + eastY * sinH,
                            northZ * cosH + eastZ * sinH
                        );
    
                        const oldFlight = oldFlightsMap.get(s[0]);
                        if (oldFlight) {
                            const targetLat = s[6], targetLng = s[5];
                            const startLat = typeof oldFlight.lat === 'number' ? oldFlight.lat : targetLat;
                            const startLng = typeof oldFlight.lng === 'number' ? oldFlight.lng : targetLng;
    
                            const lat1 = Cesium.Math.toRadians(startLat), lon1 = Cesium.Math.toRadians(startLng);
                            const lat2 = Cesium.Math.toRadians(targetLat), lon2 = Cesium.Math.toRadians(targetLng);
                            const dLon = lon2 - lon1, dLat = lat2 - lat1;
    
                            const a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
                            const c = 2 * Math.asin(Math.sqrt(a));
                            const distanceMeters = c * 6371000;
    
                            const y = Math.sin(dLon) * Math.cos(lat2);
                            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
                            let brng = Math.atan2(y, x);
    
                            if (distanceMeters < 1) brng = Cesium.Math.toRadians(s[10] || 0); 
    
                            oldFlight.startLat = startLat;
                            oldFlight.startLng = startLng;
                            oldFlight.computedVelocity = distanceMeters / 10.0; 
                            oldFlight.computedHeading = Cesium.Math.toDegrees(brng); 
                            oldFlight.trueVelocity = s[9] || 0;
                            oldFlight.trueVelocityKmH = oldFlight.trueVelocity * 3.6; 
                            oldFlight.trueHeading = s[10] || 0;
    
                            const trueHeadingRad = Cesium.Math.toRadians(oldFlight.trueHeading);
                            const cH = Math.cos(trueHeadingRad), sH = Math.sin(trueHeadingRad);
                            const eastX_true = -Math.sin(lon2), eastY_true = Math.cos(lon2), eastZ_true = 0;
                            const northX_true = -Math.sin(lat2) * Math.cos(lon2), northY_true = -Math.sin(lat2) * Math.sin(lon2), northZ_true = Math.cos(lat2);
                            oldFlight.alignedAxis = new Cesium.Cartesian3(
                                northX_true * cH + eastX_true * sH,
                                northY_true * cH + eastY_true * sH,
                                northZ_true * cH + eastZ_true * sH
                            );
    
                            oldFlight.fetchTime = performance.now();
                            oldFlight.alt = s[7] || 10000;
                            oldFlight.lastUpdate = timestamp;
                            oldFlight.isMilitary = isMilitary;
                            oldFlight.velocityKmH = oldFlight.trueVelocityKmH;
                            return oldFlight;
                        }
    
                        return {
                            id: s[0], callsign: s[1] ? s[1].trim() : 'UNKNOWN',
                            country: s[2], startLng: s[5], startLat: s[6],
                            lng: s[5], lat: s[6], alt: s[7] || 10000,
                            velocity: s[9] || 0, computedVelocity: s[9] || 0,
                            velocityKmH: velocityKmH,
                            heading: s[10] || 0, computedHeading: s[10] || 0,
                            trueHeading: s[10] || 0, alignedAxis: alignedAxis,
                            lastUpdate: timestamp, fetchTime: performance.now(),
                            isMilitary: isMilitary, type: 'flight'
                        };
                    } catch(err) { return null; }
                })
                .filter(f => f !== null);

            window.state.flights = this.data;
    
            window.updateLastFetchTime('flights');
            window.updateLastFetchTime('military');
            this.render();
            if(typeof updateHUDCounts === 'function') updateHUDCounts();
        } catch (e) {
            console.error("Flight fetch failed:", e);
            if(window.setSystemOffline) window.setSystemOffline();
            const overlay = document.getElementById('loading-overlay');
            if(overlay) overlay.style.display = 'none';
        }
    },

    render: function() {
        if (typeof viewer === 'undefined' || !viewer) return;
        
        if (window.state.layers.flights || window.state.layers.military) {
            const flightsSpeed = document.getElementById('flight-speed')?.value || 'all';
            const militarySpeed = document.getElementById('military-speed')?.value || 'all';
            const visibleFlights = this.data.filter(f => !f.isMilitary && this.filterBySpeed(f, flightsSpeed));
            const visibleMilitary = this.data.filter(f => f.isMilitary && this.filterBySpeed(f, militarySpeed));
    
            try {
                this.flightsDataSource.entities.suspendEvents();
                this.militaryDataSource.entities.suspendEvents();
                const currentIds = new Set();
                
                const processFlight = (f) => {
                    currentIds.add(f.id);
                    let ds = f.isMilitary ? this.militaryDataSource : this.flightsDataSource;
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
                                image: f.isMilitary ? this.militaryAirplaneSvg : this.airplaneSvg,
                                color: Cesium.Color.WHITE,
                                scale: isMobile ? 0.35 : 0.45,
                                rotation: 0,
                                alignedAxis: new Cesium.CallbackProperty(() => f.alignedAxis || Cesium.Cartesian3.ZERO, false),
                                disableDepthTestDistance: Number.POSITIVE_INFINITY
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
    
                [this.flightsDataSource, this.militaryDataSource].forEach(ds => {
                    const toRemove = [];
                    ds.entities.values.forEach(e => { if (!currentIds.has(e.id)) toRemove.push(e.id); });
                    toRemove.forEach(id => ds.entities.removeById(id));
                });
            } catch (e) { console.error('[Globe] Flights fail:', e); }
            finally {
                try { this.flightsDataSource.entities.resumeEvents(); } catch(e){}
                try { this.militaryDataSource.entities.resumeEvents(); } catch(e){}
            }
        } else {
            this.clear();
        }
        viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        return `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">IDENTIFIER</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${t.id || 'N/A'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ORIGIN</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #fff; letter-spacing: 2px;">${t.origin || 'UNKNOWN'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">DESTINATION</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #fff; letter-spacing: 2px;">${t.destination || 'UNKNOWN'}</td>
            </tr>
            ${t.velocityKmH !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VELOCITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>
            ` : ''}
            ${t.alt !== undefined ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ALTITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.alt).toLocaleString()} <span style="font-size: 0.7rem;">m</span></td>
            </tr>
            ` : ''}
            ${t.heading !== undefined ? `
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
        `;
    }
};
