// static/layers/shipping.js

window.shipSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiNmZjZiODEiIGQ9Ik0xOTIgMzJjMC0xNy43IDE0LjMtMzIgMzItMzJMMzUyIDBjMTcuNyAwIDMyIDE0LjMgMzIgMzJsMCAzMiA0OCAwYzI2LjUgMCA0OCAyMS41IDQ4IDQ4bDAgMTI4IDQ0LjQgMTQuOGMyMy4xIDcuNyAyOS41IDM3LjUgMTEuNSA1My45bC0xMDEgOTIuNmMtMTYuMiA5LjQtMzQuNyAxNS4xLTUwLjkgMTUuMWMtMTkuNiAwLTQwLjgtNy43LTU5LjItMjAuM2MtMjIuMS0xNS41LTUxLjYtMTUuNS03My43IDBjLTE3LjEgMTEuOC0zOCAyMC4zLTU5LjIgMjAuM2MtMTYuMiAwLTM0LjctNS43LTUwLjktMTUuMWwtMTAxLTkyLjZjLTE4LTE2LjUtMTEuNi00Ni4yIDExLjUtNTMuOUw5NiAyNDBsMC0xMjhjMC0yNi41IDIxLjUtNDggNDgtNDhsNDggMCAwLTMyek0xNjAgMjE4LjdsMTA3LjgtMzUuOWMxMy4xLTQuNCAyNy4zLTQuNCA0MC41IDBMNDE2IDIxOC43bDAtOTAuNy0yNTYgMCAwIDkwLjd6TTMwNi41IDQyMS45QzMyOSA0MzcuNCAzNTYuNSA0NDggMzg0IDQ0OGMyNi45IDAgNTUuNC0xMC44IDc3LjUtMjYuMWMwIDAgMCAwIDAgMGMxMS45LTguNSAyOC4xLTcuOCAzOS4yIDEuN2MxNC40IDExLjkgMzIuNSAyMSA1MC42IDI1LjJjMTcuMiA0IDI3LjkgMjEuMiAyMy45IDM4LjRzLTIxLjIgMjcuOS0zOC40IDIzLjljLTI0LjUtNS43LTQ0LjktMTYuNS01OC4yLTI1QzQ0OS41IDUwMS43IDQxNyA1MTIgMzg0IDUxMmMtMzEuOSAwLTYwLjYtOS45LTgwLjQtMTguOWMtNS44LTIuNy0xMS4xLTUuMy0xNS42LTcuN2MtNC41IDIuNC05LjcgNS4xLTE1LjYgNy43Yy0xOS44IDktNDguNSAxOC45LTgwLjQgMTguOWMtMzMgMC02NS41LTEwLjMtOTQuNS0yNS44Yy0xMy40IDguNC0zMy43IDE5LjMtNTguMiAyNWMtMTcuMiA0LTM0LjQtNi43LTM4LjQtMjMuOXM2LjctMzQuNCAyMy45LTM4LjRjMTguMS00LjIgMzYuMi0xMy4zIDUwLjYtMjUuMmMxMS4xLTkuNCAyNy4zLTEwLjEgMzkuMi0xLjdjMCAwIDAgMCAwIDBDMTM2LjcgNDM3LjIgMTY1LjEgNDQ4IDE5MiA0NDhjMjcuNSAwIDU1LTEwLjYgNzcuNS0yNi4xYzExLjEtNy45IDI1LjktNy45IDM3IDB6Ii8+PC9zdmc+';

window.ShippingLayer = {
    id: 'traffic',
    dataSource: null,

    init: function(viewer) {
        this.dataSource = window.shippingDataSource;
        console.log('[ShippingLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        try {
            const res = await fetch(`${window.API_BASE || ''}/api/vessels?_t=` + Date.now());
            const data = await res.json();
            
            // Ensure data is an array
            if (!Array.isArray(data)) return;
            
            if (data.length === 0) {
                if (window.state) window.state.traffic = [];
                if (window.state && window.state.layers && window.state.layers.traffic) {
                    this.render();
                    if (window.updateHUDCounts) window.updateHUDCounts();
                }
                return;
            }
            
            const oldTrafficMap = new Map((window.state.traffic || []).map(t => [t.id, t]));

            // Update traffic state with new data
            window.state.traffic = data.map(v => {
                const oldVessel = oldTrafficMap.get(v.id);
                if (oldVessel) {
                    oldVessel.vesselType = v.vesselType || 'other';
                    oldVessel.title = v.title || oldVessel.title;
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
                v.vesselType = v.vesselType || 'other';
                return v;
            });
            if (window.updateLastFetchTime) window.updateLastFetchTime('traffic');
            
            if (window.state && window.state.layers && window.state.layers.traffic) {
                this.render();
                if (window.updateHUDCounts) window.updateHUDCounts();
            }
        } catch (e) {
            console.error("[ShippingLayer] traffic update failed:", e);
            if (window.setSystemOffline) window.setSystemOffline();
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource || !window.state || !window.state.layers) return;

        if (window.state.layers.traffic) {
            try {
                // Apply vessel type filter from dropdown
                const typeFilter = document.getElementById('traffic-type');
                const selectedType = typeFilter ? typeFilter.value : 'all';
                const filteredTraffic = (window.state.traffic || []).filter(t => {
                    if (selectedType === 'all') return true;
                    return (t.vesselType || 'other') === selectedType;
                });

                // Clean slate: remove all entities and re-add only filtered ones
                // This is the only reliable way to force CesiumJS to recalculate clusters
                this.dataSource.entities.removeAll();

                const earthRadius = 6371000;
                filteredTraffic.forEach(t => {
                    this.dataSource.entities.add({
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
                                return Cesium.Cartesian3.fromRadians(nLng, nLat, 0, window.viewer.scene.globe.ellipsoid, result);
                            } catch (cpErr) {
                                return undefined;
                            }
                        }, false),
                        billboard: {
                            image: window.shipSvg,
                            scale: window.isMobile ? 0.15 : 0.20,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY
                        },
                        customData: { ...t, type: 'vessel' }
                    });
                });
            } catch (e) {
                console.error('[Globe] Traffic fail:', e);
            }
        } else {
            this.dataSource.entities.removeAll();
        }
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        let html = '';
        if (t.vesselType) {
            const typeLabel = (t.vesselType || 'other').charAt(0).toUpperCase() + (t.vesselType || 'other').slice(1);
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">TYPE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${typeLabel}</td>
            </tr>`;
        }
        if (t.velocityKmH !== undefined) {
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VELOCITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>`;
        }
        if (t.heading !== undefined) {
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">HEADING</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.heading)}°</td>
            </tr>`;
        }
        return html;
    }
};
