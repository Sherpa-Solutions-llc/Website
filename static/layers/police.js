// static/layers/police.js

window.policeSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiMwZDQ3YTEiIGQ9Ik0wIDQ4QzAgMjEuNSAyMS41IDAgNDggMEwzMzYgMGMyNi41IDAgNDggMjEuNSA0OCA0OGwwIDE1OS00Mi40IDE3TDMwNCAyMjRsLTMyIDBjLTguOCAwLTE2IDcuMi0xNiAxNmwwIDMyIDAgMjQuMiAwIDcuOGMwIC45IC4xIDEuNyAuMiAyLjZjMi4zIDU4LjEgMjQuMSAxNDQuOCA5OC43IDIwMS41Yy01LjggMi41LTEyLjIgMy45LTE4LjkgMy45bC05NiAwIDAtODBjMC0yNi41LTIxLjUtNDgtNDgtNDhzLTQ4IDIxLjUtNDggNDhsMCA4MC05NiAwYy0yNi41IDAtNDgtMjEuNS00OC00OEwwIDQ4ek04MCAyMjRjLTguOCAwLTE2IDcuMi0xNiAxNmwwIDMyYzAgOC44IDcuMiAxNiAxNiAxNmwzMiAwYzguOCAwIDE2LTcuMiAxNi0xNmwwLTMyYzAtOC44LTcuMi0xNi0xNi0xNmwtMzIgMHptODAgMTZsMCAzMmMwIDguOCA3LjIgMTYgMTYgMTZsMzIgMGM4LjggMCAxNi03LjIgMTYtMTZsMC0zMmMwLTguOC03LjItMTYtMTYtMTZsLTMyIDBjLTguOCAwLTE2IDcuMi0xNiAxNnpNNjQgMTEybDAgMzJjMCA4LjggNy4yIDE2IDE2IDE2bDMyIDBjOC44IDAgMTYtNy4yIDE2LTE2bDAtMzJjMC04LjgtNy4yLTE2LTE2LTE2TDgwIDk2Yy04LjggMC0xNiA3LjItMTYgMTZ6TTE3NiA5NmMtOC44IDAtMTYgNy4yLTE2IDE2bDAgMzJjMCA4LjggNy4yIDE2IDE2IDE2bDMyIDBjOC44IDAgMTYtNy4yIDE2LTE2bDAtMzJjMC04LjgtNy4yLTE2LTE2LTE2bC0zMiAwem04MCAxNmwwIDMyYzAgOC44IDcuMiAxNiAxNiAxNmwzMiAwYzguOCAwIDE2LTcuMiAxNi0xNmwwLTMyYzAtOC44LTcuMi0xNi0xNi0xNmwtMzIgMGMtOC44IDAtMTYgNy4yLTE2IDE2ek00MjMuMSAyMjUuN2M1LjctMi4zIDEyLjEtMi4zIDE3LjggMGwxMjAgNDhDNTcwIDI3Ny40IDU3NiAyODYuMiA1NzYgMjk2YzAgNjMuMy0yNS45IDE2OC44LTEzNC44IDIxNC4yYy01LjkgMi41LTEyLjYgMi41LTE4LjUgMEMzMTMuOSA0NjQuOCAyODggMzU5LjMgMjg4IDI5NmMwLTkuOCA2LTE4LjYgMTUuMS0yMi4zbDEyMC00OHpNNTI3LjQgMzEyTDQzMiAyNzMuOGwwIDE4Ny44YzY4LjItMzMgOTEuNS05OSA5NS40LTE0OS43eiIvPjwvc3ZnPg==';
window.PoliceLayer = {
    id: 'police',
    dataSource: null,

    init: function(viewer) {
        this.dataSource = window.policeDataSource;
        console.log('[PoliceLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        if (window._fetchingPolice) return;
        window._fetchingPolice = true;
        try {
            const layerType = document.getElementById('police-layer-type')?.value || 'stations';
            const url = `${window.API_BASE || ''}/api/police-data?layer=${layerType}&_t=` + Date.now();
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            
            if (window.state) window.state.police_data = data.features || [];
            console.log(`[PoliceLayer] Loaded ${window.state ? window.state.police_data.length : 0} ${layerType}`);
            if (window.updateLastFetchTime) window.updateLastFetchTime('police');
            if (window.state && window.state.layers && window.state.layers.police) {
                this.render();
                if (window.updateHUDCounts) window.updateHUDCounts();
            }
        } catch (e) {
            console.error("[PoliceLayer] Fetch failed:", e);
            if (window.setSystemOffline) window.setSystemOffline();
        } finally {
            window._fetchingPolice = false;
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;
        this.clear();
        
        if (!window.state || !window.state.layers || !window.state.layers.police) return;

        const layerType = document.getElementById('police-layer-type')?.value || 'stations';

        (window.state.police_data || []).forEach(feature => {
            if (!feature.geometry) return;

            if (layerType === 'grids' && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                // Draw Polygons for Grids
                const positions = [];
                const coords = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0];
                if (coords) {
                    coords.forEach(coord => {
                        positions.push(Cesium.Cartesian3.fromDegrees(coord[0], coord[1]));
                    });
                }
                
                this.dataSource.entities.add({
                    id: 'police_' + (feature.properties.OBJECTID || feature.properties.GlobalID || Math.random()),
                    polygon: {
                        hierarchy: new Cesium.PolygonHierarchy(positions),
                        material: Cesium.Color.fromHsl(0.6, 1.0, 0.5, 0.2), // Transparent Blue
                        outline: true,
                        outlineColor: Cesium.Color.fromHsl(0.6, 1.0, 0.8, 0.8),
                        outlineWidth: 2,
                        height: 0,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
                    },
                    properties: feature.properties,
                    customData: { type: 'police', properties: feature.properties }
                });
            } else if (layerType === 'stations' && feature.geometry.type === 'Point') {
                // Draw Shield Icons for Stations
                const lon = feature.geometry.coordinates[0];
                const lat = feature.geometry.coordinates[1];
                this.dataSource.entities.add({
                    id: 'police_' + (feature.properties.OBJECTID || feature.properties.GlobalID || Math.random()),
                    position: Cesium.Cartesian3.fromDegrees(lon, lat),
                    billboard: {
                        image: window.policeSvg,
                        scale: window.isMobile ? 0.05 : 0.06,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    label: {
                        text: feature.properties.NAME || feature.properties.name || 'Police Station',
                        font: 'bold 12px "Share Tech Mono"',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -24),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    properties: feature.properties,
                    customData: { type: 'police', properties: feature.properties }
                });
            }
        });
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        if (!t.properties) return '';
        return `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ADDRESS</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.0rem;">${t.properties.ADDRESS || t.properties.address || 'N/A'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">PHONE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.0rem;">${t.properties.PHONE || t.properties.phone || 'N/A'}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">COMMANDER</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.0rem; color: var(--hud-cyan);">${t.properties.MAJOR || t.properties.COMMANDER || t.properties.commander || 'N/A'}</td>
            </tr>
        `;
    }
};
