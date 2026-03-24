// static/layers/weather.js

window.WeatherLayer = {
    id: 'weather',
    dataSource: null,
    imageryLayer: null,
    lastType: null,

    init: function(viewer) {
        this.dataSource = new Cesium.CustomDataSource('weather');
        viewer.dataSources.add(this.dataSource);
        console.log('[WeatherLayer] Initialized');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
        if (this.imageryLayer && window.viewer) {
            window.viewer.imageryLayers.remove(this.imageryLayer, true);
            this.imageryLayer = null;
        }
        this.lastType = null;
    },

    fetch: async function() {
        try {
            const url = `${window.API_BASE || ''}/api/weather-proxy?_t=` + Date.now();
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const dataArr = await res.json();

            if (window.state) window.state.weatherData = dataArr.map(d => ({
                city: d.city,
                lat: d.lat,
                lng: d.lng,
                temp: d.temp,
                unit: d.unit,
                tier: d.tier || 1
            })).filter(w => w.temp !== null && w.temp !== undefined);

            console.log(`[WeatherLayer] Temperature data loaded for ${window.state.weatherData.length} cities`);
            if (window.updateLastFetchTime) window.updateLastFetchTime('weather');
            if (window.state && window.state.layers && window.state.layers.weather) {
                this.render();
                if (window.updateHUDCounts) window.updateHUDCounts();
            }
        } catch (e) {
            console.error("[WeatherLayer] fetch failed:", e);
            if (window.setSystemOffline) window.setSystemOffline();
        }
    },

    applyImageryLayer: function(type) {
        if (!window.viewer) return;
        
        if (this.imageryLayer) {
            window.viewer.imageryLayers.remove(this.imageryLayer, true);
            this.imageryLayer = null;
        }

        if (type === 'rain') {
            const timeLayer = new Cesium.WebMapTileServiceImageryProvider({
                url: 'https://tilecache.rainviewer.com/v2/radar/now/512/{TileMatrix}/{TileCol}/{TileRow}/2/1_1.png',
                layer: 'rainviewer',
                style: 'default',
                format: 'image/png',
                tileMatrixSetID: 'a',
                maximumLevel: 6,
                enablePickFeatures: false
            });
            this.imageryLayer = window.viewer.imageryLayers.addImageryProvider(timeLayer);
            this.imageryLayer.alpha = 0.5;
        }

        this.lastType = type;
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;

        if (window.state && window.state.layers && window.state.layers.weather) {
            try {
                this.dataSource.entities.suspendEvents();
                this.dataSource.entities.removeAll();
                
                const weatherType = document.getElementById('weather-layer')?.value || 'rain';
                const weatherP = document.getElementById('layer-weather')?.querySelector('p');
                if (weatherP) weatherP.innerText = `Active: \${weatherType}`;

                if (weatherType === 'temperature' && window.state && window.state.weatherData) {
                    window.state.weatherData.forEach(w => {
                        let farDist = Number.MAX_VALUE;
                        if (w.tier === 2) farDist = 8000000.0;
                        if (w.tier === 3) farDist = 3500000.0;
                        
                        this.dataSource.entities.add({
                            id: 'weather_' + w.city,
                            position: Cesium.Cartesian3.fromDegrees(w.lng || 0, w.lat || 0, 10000),
                            label: {
                                text: `\${w.city}\\n\${w.temp} \${w.unit}`,
                                font: 'bold 14pt "Share Tech Mono"',
                                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                fillColor: Cesium.Color.fromCssColorString('#a4b0be'),
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 3,
                                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                                pixelOffset: new Cesium.Cartesian2(0, -10),
                                showBackground: false,
                                backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7),
                                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, farDist)
                            },
                            point: { 
                                pixelSize: 8, 
                                color: Cesium.Color.fromCssColorString('#a4b0be'), 
                                outlineColor: Cesium.Color.BLACK, 
                                outlineWidth: 2,
                                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, farDist)
                            }
                        });
                    });
                    
                    if (this.imageryLayer) { 
                        window.viewer.imageryLayers.remove(this.imageryLayer, true); 
                        this.imageryLayer = null; 
                        this.lastType = null; 
                    }
                } else {
                    if (this.lastType !== weatherType) {
                        this.applyImageryLayer(weatherType);
                    }
                }
            } catch (e) {
                console.error('[Globe] Weather render fail:', e);
            } finally {
                this.dataSource.entities.resumeEvents();
            }
        } else {
            this.dataSource.entities.removeAll();
            if (this.imageryLayer) {
                window.viewer.imageryLayers.remove(this.imageryLayer, true);
                this.imageryLayer = null;
                this.lastType = null;
            }
        }
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        return ''; // Weather nodes are only labels, no target locks
    }
};
