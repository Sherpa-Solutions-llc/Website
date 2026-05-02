// static/layers/earthquakes.js

window.EarthquakesLayer = {
    id: 'earthquakes',
    dataSource: null,

    init: function(viewer) {
        this.dataSource = window.earthquakesDataSource;
        console.log('[EarthquakesLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        if (window._fetchingEarthquakes) return;
        window._fetchingEarthquakes = true;
        try {
            const duration = document.getElementById('quake-duration')?.value || 'day';
            let url = `${window.API_BASE || ''}/api/earthquakes?duration=${duration == 'days' ? 'day' : (duration == 'weeks' ? 'week' : 'month')}`;

            if (window.state && window.state.dataSources && window.state.dataSources.earthquakes === 'emsc') {
                const limit = duration === 'weeks' ? 2000 : (duration === 'months' ? 5000 : 500);
                url = `https://www.seismicportal.eu/fdsnws/event/1/query?limit=${limit}&format=json`;
            }

            const res = await fetch(url);
            const data = await res.json();
            if (!data || !data.features) {
                console.warn('[EarthquakesLayer] Invalid data received:', data);
                return;
            }
            if (window.state) window.state.earthquakes = data.Features || data.features || [];
            console.log(`[EarthquakesLayer] Loaded ${window.state ? window.state.earthquakes.length : 0} events.`);
            if (window.updateLastFetchTime) window.updateLastFetchTime('earthquakes');
            if (window.state && window.state.layers && window.state.layers.earthquakes) {
                this.render();
                if (window.updateHUDCounts) window.updateHUDCounts();
            }
        } catch (e) {
            console.error("[EarthquakesLayer] fetch failed:", e);
            if (window.setSystemOffline) window.setSystemOffline();
        } finally {
            window._fetchingEarthquakes = false;
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;

        if (window.state && window.state.layers && window.state.layers.earthquakes) {
            try {
                this.dataSource.entities.suspendEvents();
                this.dataSource.entities.removeAll();
                (window.state.earthquakes || []).forEach(q => {
                    const mag = q.properties.mag || 1;
                    const clampedMag = Math.max(1, Math.min(8, mag));
                    const lightness = 0.8 - ((clampedMag - 1) / 7) * 0.3; 
                    const quakeColor = Cesium.Color.fromHsl(0.16, 1.0, lightness, 0.9);

                    this.dataSource.entities.add({
                        id: q.id,
                        position: Cesium.Cartesian3.fromDegrees(q.geometry.coordinates[0], q.geometry.coordinates[1], q.geometry.coordinates[2] * 1000),
                        point: { 
                        pixelSize: Math.max(6, Math.pow(clampedMag, 1.8) * 1.5), 
                        color: quakeColor,
                        outlineColor: Cesium.Color.fromHsl(0.16, 1.0, lightness * 0.8, 1.0),
                        outlineWidth: clampedMag >= 5 ? 2.5 : 1.5
                        },
                        customData: { 
                            type: 'earthquake', id: q.id, title: q.properties?.title || 'Earthquake', 
                            lat: q.geometry.coordinates[1], lng: q.geometry.coordinates[0], depth: q.geometry.coordinates[2], 
                            mag: mag, time: q.properties?.time, felt: q.properties?.felt, tsunami: q.properties?.tsunami, place: q.properties?.place || q.properties?.flynn_region 
                        }
                    });
                });
            } catch(e) { console.error('[Globe] Earthquakes render fail:', e); }
            finally { try { this.dataSource.entities.resumeEvents(); } catch(e){} }
        } else {
            this.dataSource.entities.removeAll();
        }
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        return `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">MAGNITUDE</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: ${t.mag >= 6 ? '#ff4757' : (t.mag >= 4 ? '#ffa502' : '#7bed9f')}; font-family: 'Share Tech Mono', monospace; font-size: 1.2rem; font-weight: bold;">${Number(t.mag).toFixed(1)}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">DEPTH</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.1rem;">${(t.depth || 0).toFixed(1)} <span style="font-size: 0.7rem;">km</span></td>
            </tr>
            ${t.time ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">TIME (UTC)</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace;">${new Date(t.time).toLocaleString('en-US', {timeZone:'UTC', dateStyle:'short', timeStyle:'short'})}</td>
            </tr>
            ` : ''}
            ${t.felt !== undefined && t.felt !== null ? `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">REPORTS FELT</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; color: #ffa502;">${Number(t.felt).toLocaleString()}</td>
            </tr>
            ` : ''}
            ${t.tsunami ? `
            <tr>
                <td colspan="2" style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: center; color: #ff4757; font-family: 'Share Tech Mono', monospace; font-weight: bold; background: rgba(255,71,87,0.1);">TSUNAMI WARNING ISSUED</td>
            </tr>
            ` : ''}
        `;
    }
};
