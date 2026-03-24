// static/layers/satellites.js

window.satelliteSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiMyZWQ1NzMiIGQ9Ik0yMzMgN2MtOS40LTkuNC0yNC42LTkuNC0zMy45IDBsLTk2IDk2Yy05LjQgOS40LTkuNCAyNC42IDAgMzMuOWw4OS40IDg5LjQtMTUuNSAxNS41QzE1Mi4zIDIzMC40IDEyNC45IDIyNCA5NiAyMjRjLTMxLjcgMC02MS41IDcuNy04Ny44IDIxLjJjLTkgNC43LTEwLjMgMTYuNy0zLjEgMjMuOEwxMTIuNyAzNzYuNyA5Ni4zIDM5My4xYy0yLjYtLjctNS40LTEuMS04LjMtMS4xYy0xNy43IDAtMzIgMTQuMy0zMiAzMnMxNC4zIDMyIDMyIDMyczMyLTE0LjMgMzItMzJjMC0yLjktLjQtNS42LTEuMS04LjNsMTYuNC0xNi40TDI0Mi45IDUwNi45YzcuMiA3LjIgMTkuMiA1LjkgMjMuOC0zLjFDMjgwLjMgNDc3LjUgMjg4IDQ0Ny43IDI4OCA0MTZjMC0yOC45LTYuNC01Ni4zLTE3LjgtODAuOWwxNS41LTE1LjVMMzc1IDQwOWM5LjQgOS40IDI0LjYgOS40IDMzLjkgMGw5Ni05NmM5LjQtOS40IDkuNC0yNC42IDAtMzMuOWwtODkuNC04OS40IDU1LTU1YzEyLjUtMTIuNSAxMi41LTMyLjggMC00NS4zbC00OC00OGMtMTIuNS0xMi41LTMyLjgtMTIuNS00NS4zIDBsLTU1IDU1TDIzMyA3em0xNTkgMzUxbC03Mi40LTcyLjQgNjIuMS02Mi4xTDQ1NC4xIDI5NiAzOTIgMzU4LjF6TTIyNi4zIDE5Mi40TDE1My45IDEyMCAyMTYgNTcuOWw3Mi40IDcyLjQtNjIuMSA2Mi4xeiIvPjwvc3ZnPg==';
window.SatellitesLayer = {
    id: 'satellites',
    dataSource: null,
    SAT_DISPLAY_CAP: 600, // Hard limit to prevent WebGL lockups

    init: function(viewer) {
        this.dataSource = window.satellitesDataSource;
        console.log('[SatellitesLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        if (window._fetchingSatellites) return;
        window._fetchingSatellites = true;
        
        console.log('[SatellitesLayer] Fetching satellite definitions...');
        try {
            const res = await fetch(`${window.API_BASE || ''}/api/satellites`);
            if (!res.ok) throw new Error('Proxy API Error');
            const data = await res.json();

            if (!data || data.length === 0) throw new Error('Empty satellite response');

            if (window.state) window.state.satellites = [];
            let parseErrors = 0;

            for (let i = 0; i < data.length; i++) {
                const sat = data[i];
                const name = sat.name.trim();
                const tleLine1 = sat.line1.trim();
                const tleLine2 = sat.line2.trim();
                const subtype = sat.type;
                const country = sat.country;
                const status = sat.status;

                if (!tleLine1.startsWith('1 ') || !tleLine2.startsWith('2 ')) {
                    parseErrors++;
                    continue;
                }

                try {
                    // Requires satellite.js to be globally available
                    const satRec = satellite.twoline2satrec(tleLine1, tleLine2);
                    if (!satRec || satRec.error !== 0) continue; 

                    const catalogNum = tleLine1.substring(2, 7).trim();
                    const satId = name + '_' + catalogNum;

                    if (window.state) window.state.satellites.push({
                        id: satId,
                        type: 'satellite',
                        subtype: subtype,
                        country: country,
                        status: status,
                        satRec: satRec
                    });
                } catch (parseErr) {
                    parseErrors++;
                }
            }
            console.log(`[SatellitesLayer] Parsed ${window.state ? window.state.satellites.length : 0} satellites (${parseErrors} skipped).`);
            if (window.updateLastFetchTime) window.updateLastFetchTime('satellites');
            this.render();
            if (window.updateHUDCounts) window.updateHUDCounts();
        } catch (e) {
            console.error("[SatellitesLayer] Fetch failed:", e);
            if (window.setSystemOffline) window.setSystemOffline();
        } finally {
            window._fetchingSatellites = false;
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;

        if (window.state && window.state.layers && window.state.layers.satellites) {
            try {
                this.dataSource.entities.suspendEvents();
                const currentSatIds = new Set();
                
                const satType = document.getElementById('satellite-type')?.value || 'all';
                const satCountry = document.getElementById('satellite-country')?.value || 'all';
                const satStatus = document.getElementById('satellite-status')?.value || 'all';
                const visibleSatellites = (window.state.satellites || []).filter(s => {
                    if (satType !== 'all' && s.subtype !== satType) return false;
                    if (satCountry !== 'all' && s.country !== satCountry) return false;
                    if (satStatus !== 'all' && s.status !== satStatus) return false;
                    return true;
                });

                const renderingSlice = visibleSatellites.slice(0, this.SAT_DISPLAY_CAP);

                renderingSlice.forEach(s => {
                    currentSatIds.add(s.id);
                    if (!this.dataSource.entities.getById(s.id)) {
                        this.dataSource.entities.add({
                            id: s.id,
                            position: new Cesium.CallbackProperty(() => {
                                try {
                                    const now = new Date();
                                    const pv = satellite.propagate(s.satRec, now);
                                    if (!pv.position) return undefined;
                                    const gmst = satellite.gstime(now);
                                    const gd = satellite.eciToGeodetic(pv.position, gmst);
                                    return Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000);
                                } catch(e) { return undefined; }
                            }, false),
                            billboard: {
                                image: window.satelliteSvg,
                                scale: window.isMobile ? 0.35 : 0.45,
                                disableDepthTestDistance: Number.POSITIVE_INFINITY
                            },
                            customData: s
                        });
                    }
                });
                
                const existingSats = this.dataSource.entities.values;
                const toRemoveSats = [];
                for (let i = 0; i < existingSats.length; i++) {
                    if (!currentSatIds.has(existingSats[i].id)) toRemoveSats.push(existingSats[i].id);
                }
                toRemoveSats.forEach(id => this.dataSource.entities.removeById(id));
            } catch(e) { 
                console.error('[SatellitesLayer] Render fail:', e); 
            } finally { 
                try { this.dataSource.entities.resumeEvents(); } catch(e){} 
            }
        } else {
            this.clear();
        }
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        let html = `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">IDENTIFIER</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${t.id ? t.id.toString().split('_')[1] : 'N/A'}</td>
            </tr>
        `;

        if (t.status) {
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">OPERATIONAL STATUS</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-weight: bold; color: ${t.status === 'active' ? '#7bed9f' : '#ff4757'};">${t.status.toUpperCase()}</td>
            </tr>
            `;
        }
        if (t.velocityKmH !== undefined) {
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">VELOCITY</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.velocityKmH).toLocaleString()} <span style="font-size: 0.7rem;">km/h</span></td>
            </tr>`;
        }
        if (t.alt !== undefined) {
            html += `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">ALTITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: var(--hud-cyan); font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${Math.round(t.alt).toLocaleString()} <span style="font-size: 0.7rem;">m</span></td>
            </tr>`;
        }
        return html;
    }
};
