// static/layers/scanners.js

window.scannerSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzODQgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiNkMzJmMmYiIGQ9Ik0xMTIgMjRjMC0xMy4zLTEwLjctMjQtMjQtMjRTNjQgMTAuNyA2NCAyNGwwIDcyTDQ4IDk2QzIxLjUgOTYgMCAxMTcuNSAwIDE0NEwwIDMwMC4xYzAgMTIuNyA1LjEgMjQuOSAxNC4xIDMzLjlsMy45IDMuOWM5IDkgMTQuMSAyMS4yIDE0LjEgMzMuOUwzMiA0NjRjMCAyNi41IDIxLjUgNDggNDggNDhsMjI0IDBjMjYuNSAwIDQ4LTIxLjUgNDgtNDhsMC05Mi4xYzAtMTIuNyA1LjEtMjQuOSAxNC4xLTMzLjlsMy45LTMuOWM5LTkgMTQuMS0yMS4yIDE0LjEtMzMuOUwzODQgMTQ0YzAtMjYuNS0yMS41LTQ4LTQ4LTQ4bC0xNiAwYzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMybC0zMiAwYzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMybC00OCAwIDAtNzJ6bTAgMTM2bDE2MCAwYzguOCAwIDE2IDcuMiAxNiAxNnMtNy4yIDE2LTE2IDE2bC0xNjAgMGMtOC44IDAtMTYtNy4yLTE2LTE2czcuMi0xNiAxNi0xNnptMCA2NGwxNjAgMGM4LjggMCAxNiA3LjIgMTYgMTZzLTcuMiAxNi0xNiAxNmwtMTYwIDBjLTguOCAwLTE2LTcuMi0xNi0xNnM3LjItMTYgMTYtMTZ6bTAgNjRsMTYwIDBjOC44IDAgMTYgNy4yIDE2IDE2cy03LjIgMTYtMTYgMTZsLTE2MCAwYy04LjggMC0xNi03LjItMTYtMTZzNy4yLTE2IDE2LTE2em0wIDY0bDE2MCAwYzguOCAwIDE2IDcuMiAxNiAxNnMtNy4yIDE2LTE2IDE2bC0xNjAgMGMtOC44IDAtMTYtNy4yLTE2LTE2czcuMi0xNiAxNi0xNnoiLz48L3N2Zz4=';
window.ScannersLayer = {
    id: 'scanners',
    dataSource: null,

    init: function(viewer) {
        this.dataSource = window.scannersDataSource;
        console.log('[ScannersLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        try {
            const res = await fetch(`${window.API_BASE || ''}/api/scanners?_t=` + Date.now());
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            
            if (window.state) window.state.scanners_data = data || [];
            console.log(`[ScannersLayer] Loaded ${window.state ? window.state.scanners_data.length : 0} endpoints`);
            
            const countSpan = document.getElementById('count-scanners');
            if (countSpan && window.state && window.state.scanners_data) countSpan.innerText = window.state.scanners_data.length;
            
            if (window.updateLastFetchTime) window.updateLastFetchTime('scanners');
            
            // Auto-populate the scanner dropdown filters based on fetched data
            window.buildScannerDropdown = function() {
                const data = window.state.scanners_data || [];
                const stateSelect = document.getElementById('scanner-state-filter');
                const feedSelect = document.getElementById('scanner-feed-select');
                if (!stateSelect || !feedSelect) return;
                
                // Extract unique states and sort them
                const states = new Set();
                data.forEach(s => { if (s.state) states.add(s.state); });
                const sortedStates = Array.from(states).sort();
                
                // Preserve current selection if possible
                const currentState = stateSelect.value;
                stateSelect.innerHTML = '<option value="all">All States</option>';
                sortedStates.forEach(st => {
                    const opt = document.createElement('option');
                    opt.value = st;
                    opt.innerText = st;
                    stateSelect.appendChild(opt);
                });
                if (sortedStates.includes(currentState)) stateSelect.value = currentState;

                // Function to update the feed dropdown based on state
                const updateFeeds = () => {
                    const selectedState = stateSelect.value;
                    const currentFeed = feedSelect.value;
                    feedSelect.innerHTML = '<option value="">-- Select Scanner --</option>';
                    
                    const filteredFeeds = data.filter(s => selectedState === 'all' || s.state === selectedState).sort((a,b) => (a.city || '').localeCompare(b.city || ''));
                    filteredFeeds.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f.audio_url;
                        opt.dataset.id = f.id;
                        opt.innerText = `${f.city ? f.city + ', ' : ''}${f.state} - ${f.name}`;
                        feedSelect.appendChild(opt);
                    });
                    
                    // If the previously selected feed is still valid in the new state, keep it selected
                    let found = false;
                    for (let i=0; i<feedSelect.options.length; i++) {
                        if (feedSelect.options[i].value === currentFeed && currentFeed !== '') {
                            feedSelect.selectedIndex = i;
                            found = true;
                            break;
                        }
                    }
                };

                // Apply initial feed filter
                updateFeeds();
                
                // Set up event listeners (ensure we don't attach multiple times)
                if (!stateSelect.dataset.listenerAttached) {
                    stateSelect.addEventListener('change', () => {
                        updateFeeds();
                        if (window.ScannersLayer) window.ScannersLayer.render();
                    });
                    stateSelect.dataset.listenerAttached = 'true';
                }
                
                const searchInput = document.getElementById('scanner-search');
                if (searchInput && !searchInput.dataset.listenerAttached) {
                    searchInput.addEventListener('input', () => {
                        if (window.ScannersLayer) window.ScannersLayer.render();
                    });
                    searchInput.dataset.listenerAttached = 'true';
                }
            };
            
            window.buildScannerDropdown();

            if (window.state && window.state.layers && window.state.layers.scanners) {
                this.render();
            }
        } catch (e) {
            console.error("[ScannersLayer] Fetch failed:", e);
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;
        this.clear();

        if (window.state && window.state.layers && window.state.layers.scanners) {
            const stateFilter = document.getElementById('scanner-state-filter')?.value || 'all';
            const searchFilter = (document.getElementById('scanner-search')?.value || '').toLowerCase();
            
            (window.state.scanners_data || []).forEach(scanner => {
                if (!scanner.lat || !scanner.lng) return;
                if (stateFilter !== 'all' && scanner.state !== stateFilter) return;
                
                if (searchFilter) {
                    const searchable = `${scanner.name} ${scanner.city} ${scanner.state}`.toLowerCase();
                    if (!searchable.includes(searchFilter)) return;
                }

                this.dataSource.entities.add({
                    id: 'scanner_' + scanner.id,
                    position: Cesium.Cartesian3.fromDegrees(scanner.lng, scanner.lat),
                    billboard: {
                        image: window.scannerSvg,
                        scale: window.isMobile ? 0.35 : 0.45,
                        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    label: {
                        text: scanner.name || 'Live Scanner',
                        font: 'bold 12px "Share Tech Mono"',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 3,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -24),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    customData: {
                        type: 'scanner',
                        audio_url: scanner.audio_url,
                        name: scanner.name,
                        city: scanner.city,
                        state: scanner.state,
                        country: scanner.country
                    }
                });
            });
            window.viewer.scene.requestRender();
        }
    },

    getDetailsHTML: function(t) {
        return `
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); opacity: 0.7;">LOCATION</td>
                <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; font-family: 'Share Tech Mono', monospace; font-size: 1.0rem;">${t.city}, ${t.state}</td>
            </tr>
            <tr>
                <td colspan="2" style="padding: 8px 0; text-align: center; color: #2ed573; font-family: 'Share Tech Mono', monospace;">
                    <i class="fa-solid fa-satellite-dish fa-fade"></i> ESTABLISHING AUDIO LINK...
                    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" onload="
                        setTimeout(() => {
                            const select = document.getElementById('scanner-feed-select');
                            const playBtn = document.getElementById('scanner-play-btn');
                            if (select && playBtn) {
                                // Trick the UI into selecting this option if it isn't currently listed in the filtered dropdown
                                let found = false;
                                for(let i=0; i<select.options.length; i++) {
                                    if(select.options[i].value === '${t.audio_url}') {
                                        select.selectedIndex = i;
                                        found = true;
                                        break;
                                    }
                                }
                                if(!found) {
                                    const newOpt = document.createElement('option');
                                    newOpt.value = '${t.audio_url}';
                                    newOpt.dataset.id = '${t.id}';
                                    newOpt.innerText = '${t.city}, ${t.state} - ${t.name}';
                                    select.appendChild(newOpt);
                                    select.value = '${t.audio_url}';
                                }
                                playBtn.click();
                            }
                        }, 50);
                    " style="display:none;">
                </td>
            </tr>
        `;
    }
};
