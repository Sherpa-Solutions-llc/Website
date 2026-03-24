// static/layers/cctv.js

window.cctvSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NzYgNTEyIiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjxwYXRoIGZpbGw9IiMwMGQyZmYiIGQ9Ik0wIDEyOEMwIDkyLjcgMjguNyA2NCA2NCA2NGwyNTYgMGMzNS4zIDAgNjQgMjguNyA2NCA2NGwwIDI1NmMwIDM1LjMtMjguNyA2NC02NCA2NEw2NCA0NDhjLTM1LjMgMC02NC0yOC43LTY0LTY0TDAgMTI4ek01NTkuMSA5OS44YzEwLjQgNS42IDE2LjkgMTYuNCAxNi45IDI4LjJsMCAyNTZjMCAxMS44LTYuNSAyMi42LTE2LjkgMjguMnMtMjMgNS0zMi45LTEuNmwtOTYtNjRMNDE2IDMzNy4xbDAtMTcuMSAwLTEyOCAwLTE3LjEgMTQuMi05LjUgOTYtNjRjOS44LTYuNSAyMi40LTcuMiAzMi45LTEuNnoiLz48L3N2Zz4=';
window.CCTVLayer = {
    id: 'cctv',
    dataSource: null,

    init: function(viewer) {
        this.dataSource = window.cctvDataSource;
        console.log('[CCTVLayer] Initialized with global clustered dataSource');
    },

    clear: function() {
        if (this.dataSource) {
            this.dataSource.entities.removeAll();
        }
    },

    fetch: async function() {
        try {
            const res = await fetch('/api/cameras?_t=' + Date.now());
            if (!res.ok) throw new Error('cameras API unavailable');
            const data = await res.json();
            if (window.state) window.state.cctv_cameras = data;
            
            const cctvEl = document.getElementById('layer-cctv');
            if (cctvEl) {
                const countBadge = cctvEl.querySelector('.layer-count');
                if (countBadge) countBadge.innerText = data.length;
            }
            console.log(`[CCTV] Loaded ${data.length} cameras (WSDOT, Oregon, UK, Norway, BC Canada)`);
            if (window.updateLastFetchTime) window.updateLastFetchTime('cctv');
            
            if (window.state && window.state.layers && window.state.layers.cctv) {
                this.render();
                if (window.updateHUDCounts) window.updateHUDCounts();
            }
        } catch (e) {
            console.warn('[CCTV] /api/cameras failed, falling back to static file:', e);
            try {
                const res2 = await fetch('/static/insecam_data.json');
                if (!res2.ok) throw new Error('static file also missing');
                const data = await res2.json();
                if (window.state) window.state.cctv_cameras = data;
                if (window.state && window.state.layers && window.state.layers.cctv) {
                    this.render();
                    if (window.updateHUDCounts) window.updateHUDCounts();
                }
            } catch (e2) {
                console.error('[CCTV] All camera sources failed:', e2);
                if (window.setSystemOffline) window.setSystemOffline();
            }
        }
    },

    render: function() {
        if (!window.viewer || !this.dataSource) return;
        
        if (window.state && window.state.layers && window.state.layers.cctv) {
            try {
                this.dataSource.entities.suspendEvents();
                this.dataSource.entities.removeAll();
                (window.state.cctv_cameras || []).forEach(cam => {
                    this.dataSource.entities.add({
                        id: cam.id,
                        position: Cesium.Cartesian3.fromDegrees(cam.lng, cam.lat),
                        billboard: {
                            image: window.cctvSvg,
                            scale: window.isMobile ? 0.6 : 0.8,
                            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                            heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY
                        },
                        customData: { ...cam, type: 'cctv' }
                    });
                });
            } catch(e) { 
                console.error('[Globe] CCTV render fail:', e); 
            } finally { 
                try { this.dataSource.entities.resumeEvents(); } catch(e){} 
            }
        } else {
            this.dataSource.entities.removeAll();
        }
        window.viewer.scene.requestRender();
    },

    getDetailsHTML: function(t) {
        const streamType = t.stream_type || (t.stream ? 'url' : 'none');
        const camId = `live-cam-${t.id.replace(/[^a-z0-9]/gi,'_')}`;

        if (t.video || t.hls_url) {
            const liveLink = t.link || '#';
            // UK TfL videos are hosted on AWS S3 which natively allows CORS & Byte-Ranges
            const videoDirect = t.video ? (t.video + '?_t=' + Date.now()) : '';
            return `
        <tr>
            <td colspan="2" style="padding: 10px 0 4px; text-align: center;">
                <div style="position:relative; border-radius:6px; overflow:hidden; border:1px solid rgba(123,237,159,0.5); background:#0a1018; min-height:190px;">
                    <video id="${camId}"
                         ${videoDirect ? `src="${videoDirect}"` : ''}
                         autoplay loop muted playsinline
                         style="width:100%; height:190px; display:block; object-fit:cover;"
                         onerror="this.style.opacity='0.3'; document.getElementById('${camId}-err').style.display='flex';"
                         onloadeddata="this.style.opacity='1'; document.getElementById('${camId}-err').style.display='none';">
                    </video>
                    <div id="${camId}-err" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:0.75rem;font-family:'Share Tech Mono',monospace;color:#ff6b6b;background:rgba(0,0,0,0.7); pointer-events:none;">
                        📷 OFFLINE / NO ACCESS
                    </div>
                    <div style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.7); padding:2px 7px; border-radius:3px; font-size:0.65rem; font-family:'Share Tech Mono',monospace;">
                        <span style="color:#ff4757;">●</span> <span style="color:#7bed9f;">LIVE</span>
                    </div>
                </div>
            </td>
        </tr>`;
        } else if (t.snapshot) {
            const liveLink = t.link || '#';
            const proxyUrl = t.country === 'UK' 
                ? t.snapshot + '&_t=' + Date.now()
                : '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
            return `
        <tr>
            <td colspan="2" style="padding: 10px 0 4px; text-align: center;">
                <div style="position:relative; border-radius:6px; overflow:hidden; border:1px solid rgba(123,237,159,0.5); background:#0a1018; min-height:190px;">
                    <img id="${camId}"
                         src="${proxyUrl}"
                         style="width:100%; height:190px; display:block; object-fit:cover;"
                         onerror="this.style.opacity='0.3'; document.getElementById('${camId}-err').style.display='flex';"
                         onload="this.style.opacity='1'; document.getElementById('${camId}-err').style.display='none';"
                    />
                    <div id="${camId}-err" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:0.75rem;font-family:'Share Tech Mono',monospace;color:#ff6b6b;background:rgba(0,0,0,0.7); pointer-events:none;">
                        📷 OFFLINE / NO ACCESS
                    </div>
                    <div style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,0.7); padding:2px 7px; border-radius:3px; font-size:0.65rem; font-family:'Share Tech Mono',monospace;">
                        <span style="color:#ff4757;">●</span> <span style="color:#7bed9f;">LIVE</span>
                    </div>
                </div>
                <a href="${liveLink}" target="_blank"
                   style="color:#00d2ff; font-size:0.72rem; display:block; margin-top:5px; text-decoration:none;">
                    ▶ Local Traffic Cameras ↗
                </a>
            </td>
        </tr>`;

        } else if (streamType === 'mjpeg' || (t.stream && /\\.mjpg|\\.cgi|\\.jpg(\\?|$)|snapshot/i.test(t.stream))) {
            return `
        <tr>
            <td colspan="2" style="padding: 10px 0; text-align: center;">
                <img src="${t.stream}" style="width:100%; height:180px; object-fit:cover; border-radius:4px; border:1px solid rgba(123,237,159,0.5); background:#000;"
                     onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
                <div style="display:none; color:#7bed9f; text-align:center; padding:10px; font-size:0.8rem;">⚠ Stream unreachable</div>
                <a href="${t.stream}" target="_blank" style="color:#7bed9f; font-size:0.75rem; display:block; margin-top:4px;">↗ Open stream in new tab</a>
            </td>
        </tr>`;

        } else if (t.stream) {
            return `
        <tr>
            <td colspan="2" style="padding: 10px 0; text-align: center;">
                <iframe width="100%" height="190"
                    src="${t.stream}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    style="border-radius:4px; border:1px solid rgba(123,237,159,0.5); background:#000;"
                ></iframe>
                <a href="${t.stream}" target="_blank" style="color:#7bed9f; font-size:0.75rem; display:block; margin-top:4px;">↗ Open in new tab if blocked</a>
            </td>
        </tr>`;
        }
        return '';
    },

    onDetailsRendered: function(t) {
        const camId = `live-cam-${t.id.replace(/[^a-z0-9]/gi,'_')}`;
        
        // HLS video processing
        if (t.hls_url) {
            const videoElem = document.getElementById(camId);
            if (videoElem && typeof Hls !== 'undefined' && Hls.isSupported()) {
                if (window._hlsCCTVSession) {
                    window._hlsCCTVSession.destroy();
                }
                const hls = new Hls({
                    maxBufferLength: 5,
                    maxMaxBufferLength: 10
                });
                window._hlsCCTVSession = hls;
                hls.loadSource(t.hls_url);
                hls.attachMedia(videoElem);
                hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) {
                        console.warn("HLS Stream Failed. Falling back to proxy snapshots...", data);
                        hls.destroy();
                        
                        if (t.snapshot) {
                            // Seamless graceful degradation to image snapshot loop
                            const parent = videoElem.parentElement;
                            const proxyUrl = `${window.API_BASE || ''}/api/cam-proxy?url=` + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                            
                            const imgElem = document.createElement('img');
                            imgElem.id = videoElem.id;
                            imgElem.src = proxyUrl;
                            imgElem.style.cssText = videoElem.style.cssText;
                            imgElem.onerror = function() {
                                this.style.opacity = '0.3';
                                const err = document.getElementById(`${camId}-err`);
                                if (err) err.style.display = 'flex';
                            };
                            parent.replaceChild(imgElem, videoElem);
                            
                            // Ignite the 5-second image loop
                            window._camRefreshInterval = setInterval(() => {
                                if (window._camRefreshInterval === null) return;
                                const currentImg = document.getElementById(camId);
                                if (!currentImg || currentImg.tagName.toLowerCase() === 'video') {
                                    clearInterval(window._camRefreshInterval);
                                    window._camRefreshInterval = null;
                                    return;
                                }
                                currentImg.src = (window.API_BASE || '') + '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
                            }, 5000);
                            
                        } else {
                            videoElem.style.opacity = '0.3';
                            const errOverlay = document.getElementById(`${camId}-err`);
                            if (errOverlay) errOverlay.style.display = 'flex';
                        }
                    }
                });
            }
        }
        // Fallback: Auto-refresh the camera snapshot img every 5 seconds if no video tag
        else if (t.snapshot && !t.video) {
            window._camRefreshInterval = setInterval(() => {
                // Stop if a different camera was selected or if the panel was closed
                if (window._camRefreshInterval === null) return;
                const img = document.getElementById(camId);
                if (!img || img.tagName.toLowerCase() === 'video') { 
                    clearInterval(window._camRefreshInterval); 
                    window._camRefreshInterval = null; 
                    return; 
                }
                // Swap src to force-reload the JPEG 
                img.src = t.country === 'UK'
                    ? t.snapshot + '&_t=' + Date.now()
                    : '/api/cam-proxy?url=' + encodeURIComponent(t.snapshot) + '&_t=' + Date.now();
            }, 5000);
        }
        // UK MP4 Loop Auto-Refresh: TfL provides 10s MP4s that infinitely loop. 
        // We force load the absolute newest version from AWS every 60 seconds so it remains "live".
        else if (t.video && !t.hls_url) {
            window._camRefreshInterval = setInterval(() => {
                if (window._camRefreshInterval === null) return;
                const vid = document.getElementById(camId);
                if (!vid || vid.tagName.toLowerCase() !== 'video') {
                    clearInterval(window._camRefreshInterval);
                    window._camRefreshInterval = null;
                    return;
                }
                // Refresh the src cleanly
                vid.src = t.video + '?_t=' + Date.now();
                vid.play().catch(e => console.log('Auto-play prevented (background):', e));
            }, 60000);
        }
    }
};
