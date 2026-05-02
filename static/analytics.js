(function() {
    // Determine the API URL base depending on environment
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const API_URL = isLocalhost ? '/api/analytics' : 'https://sherpa-solutions-api-production.up.railway.app/api/analytics';

    // Generate or retrieve a persistent session ID
    let sessionId = localStorage.getItem('sherpa_analytics_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('sherpa_analytics_session_id', sessionId);
    }

    const pageName = window.location.pathname === '/' ? '/index.html' : window.location.pathname;
    let pageLoadTime = Date.now();

    // Helper to send data via fetch (fire-and-forget)
    function sendAnalytics(eventType, duration = 0) {
        // Do not block or wait, catch errors silently
        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: sessionId,
                page: pageName,
                event_type: eventType,
                duration: duration
            }),
            keepalive: true // helps ensure the request fires even if page unloads
        }).catch(e => { /* Ignore errors on the client */ });
    }

    // Log the initial page view
    sendAnalytics('page_view');

    // Track time spent when leaving the page or hiding the tab
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            const timeSpentMs = Date.now() - pageLoadTime;
            const timeSpentSec = Math.floor(timeSpentMs / 1000);
            sendAnalytics('page_leave', timeSpentSec);
        } else {
            // Reset timer when coming back to the tab
            pageLoadTime = Date.now();
        }
    });

    // Fallback for beforeunload just in case visibilitychange doesn't fire
    window.addEventListener('beforeunload', function() {
        const timeSpentMs = Date.now() - pageLoadTime;
        const timeSpentSec = Math.floor(timeSpentMs / 1000);
        sendAnalytics('page_leave', timeSpentSec);
    });

})();
