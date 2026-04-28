// dcsa_demo.js
(function() {
    const demoSteps = [
        {
            url: 'dcsa_dashboard.html',
            text: "Welcome to the Defense Counter Intelligence and Security Agency portal. This automated tour will guide you through our four core mission objectives and our long-term strategic priorities.",
            actions: [
                { time: 2000, type: 'scroll', value: 300 },
                { time: 7000, type: 'scroll', value: 'top' },
                { time: 9000, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_personnel_vetting.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_personnel_vetting.html',
            text: "Our first objective: Personnel Vetting. Here, we conduct background investigations and continuous vetting for the federal government. Using the advanced search interface, you can filter cases by Name, Case ID, Status, or Assigned Agent. Let's search by Name. Selecting an individual case ID reveals their comprehensive clearance timeline and assigned risk analysts. We will now select a case, scroll through their details, and securely open a classified document artifact.",
            actions: [
                { time: 4000, type: 'scroll', value: 400 },
                { time: 9000, type: 'custom', fn: () => { 
                    let el = document.querySelector('#search-criteria'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); } 
                } },
                { time: 14000, type: 'select', selector: '#search-criteria', value: 'name' },
                { time: 15000, type: 'type', selector: '#search-last-name', value: 'S' },
                { time: 16000, type: 'click', selector: 'button[onclick="executeSearch()"]' },
                { time: 18000, type: 'scroll', value: 800 },
                { time: 20000, type: 'click', selector: 'tbody tr:first-child a[onclick*="showSubject"]' },
                { time: 23000, type: 'scrollModal', selector: '#subject-modal', value: 400 },
                { time: 26000, type: 'click', selector: '#subj-timeline a[onclick*="openArtifact"]' },
                { time: 28000, type: 'type', selector: '#classified-password', value: 'admin' },
                { time: 30000, type: 'click', selector: '#password-modal button[onclick="submitPassword()"]' },
                { time: 33000, type: 'click', selector: '#artifact-modal button[onclick="closeArtifactModal()"]' },
                { time: 34500, type: 'click', selector: '#subject-modal button[onclick="closeSubjectModal()"]' }
            ]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_industrial_security.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_industrial_security.html',
            text: "Our second objective: Industrial Security. This team oversees cleared defense contractors. The advanced facility search features a dropdown to query by Contractor Name, CAGE code, Region, Facility Clearance Status, or Agent Assigned. We will now open a facility profile to view their compliance rates, active cyber infractions, and Security Compliance Review details. You can review the ten step clearance process and view compliance artifacts.",
            actions: [
                { time: 3000, type: 'scroll', value: 400 },
                { time: 8000, type: 'custom', fn: () => { 
                    let el = document.querySelector('#search-criteria'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); } 
                } },
                { time: 13000, type: 'select', selector: '#search-criteria', value: 'name' },
                { time: 14000, type: 'type', selector: '#search-name', value: 'L' },
                { time: 15000, type: 'click', selector: 'button[onclick="executeSearch()"]' },
                { time: 16000, type: 'scroll', value: 800 },
                { time: 18000, type: 'click', selector: 'tbody tr:first-child a[onclick*="showFacility"]' },
                { time: 20000, type: 'scrollModal', selector: '#facility-modal', value: 400 },
                { time: 24000, type: 'click', selector: '#fac-steps-tbody tr:first-child' },
                { time: 27000, type: 'click', selector: '#artifact-modal button[onclick="closeArtifactModal()"]' },
                { time: 29000, type: 'click', selector: '#facility-modal button[onclick="closeFacilityModal()"]' }
            ]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_counterintelligence.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_counterintelligence.html',
            text: "Our third objective: Counterintelligence. This team actively monitors foreign intelligence entities. The incident search dropdown enables filtering by Incident ID, Vector, Risk Level, or Assigned Agent. Authorized personnel can drill down into specific Suspicious Contact Reports, known as S C Rs, to review detailed descriptions, mitigation strategies, and case actions.",
            actions: [
                { time: 3000, type: 'scroll', value: 400 },
                { time: 8000, type: 'custom', fn: () => { 
                    let el = document.querySelector('#search-criteria'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); } 
                } },
                { time: 11000, type: 'select', selector: '#search-criteria', value: 'riskLevel' },
                { time: 12000, type: 'select', selector: '#search-risk-level', value: 'CRITICAL' },
                { time: 13000, type: 'click', selector: 'button[onclick="executeSearch()"]' },
                { time: 14000, type: 'scroll', value: 800 },
                { time: 16000, type: 'click', selector: 'tbody tr:first-child a[onclick*="showIncident"]' },
                { time: 19000, type: 'scrollModal', selector: '#incident-modal', value: 400 },
                { time: 23000, type: 'click', selector: '#incident-modal button[onclick="closeIncidentModal()"]' }
            ]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_security_training.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_security_training.html',
            text: "Our fourth objective: Security Training. We provide specialized certifications to maintain a highly skilled workforce. Using the dropdown, you can search our course directory by Title, Code, Status, or Assigned Resource. Let's filter for courses that require action. Administrators can select individual training records to view completion timelines, non-compliant personnel lists, and assignment details.",
            actions: [
                { time: 3000, type: 'scroll', value: 400 },
                { time: 8000, type: 'custom', fn: () => { 
                    let el = document.querySelector('#search-criteria'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); } 
                } },
                { time: 14000, type: 'select', selector: '#search-criteria', value: 'status' },
                { time: 15000, type: 'select', selector: '#search-status', value: 'Action Needed' },
                { time: 16000, type: 'click', selector: 'button[onclick="executeSearch()"]' },
                { time: 17000, type: 'scroll', value: 800 },
                { time: 19000, type: 'click', selector: 'tbody tr:first-child a[onclick*="showCourse"]' },
                { time: 22000, type: 'scrollModal', selector: '#course-modal', value: 400 },
                { time: 25000, type: 'click', selector: '#course-modal button[onclick="closeCourseModal()"]' }
            ]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'scroll', value: 'bottom' },
                { time: 1500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_full_integration.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_full_integration.html',
            text: "Now we move to our long-term strategic priorities for 2030. First: Achieve Full Integration. We are actively transitioning from siloed departments into a fully integrated agency, ensuring data flows seamlessly.",
            actions: [{ time: 4000, type: 'scroll', value: 'bottom' }]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'scroll', value: 'bottom' },
                { time: 1500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_2040_threats.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_2040_threats.html',
            text: "Our second priority: Prepare for 2040 Threat Landscapes. We are institutionalizing innovation and data integration to proactively anticipate emerging technology risks.",
            actions: [{ time: 4000, type: 'scroll', value: 'bottom' }]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'scroll', value: 'bottom' },
                { time: 1500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_agency_profile.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_agency_profile.html',
            text: "Our third priority: Elevate the Agency's Profile. We are establishing the DCSA as the premier provider of integrated security services, building transparency and trust.",
            actions: [{ time: 4000, type: 'scroll', value: 'bottom' }]
        },
        {
            url: 'dcsa_dashboard.html',
            text: "",
            actions: [
                { time: 500, type: 'scroll', value: 'bottom' },
                { time: 1500, type: 'custom', fn: () => { 
                    let el = document.querySelector('a[href="dcsa_resource_locator.html"]'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; } 
                } }
            ]
        },
        {
            url: 'dcsa_resource_locator.html',
            text: "Finally, the Resource Locator. This operational tool allows you to instantly search for DCSA personnel globally by first and last name. We will now locate an employee, view their profile on the map, and explore their duty status, schedule, and clearance. We can also seamlessly switch from 2D to a full 3D interactive globe perspective to visualize terrain and tactical data. After reviewing the asset, we conclude the automated tour.",
            actions: [
                { time: 3000, type: 'custom', fn: () => { 
                    let el = document.querySelector('#locateSearchFirst'); 
                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); } 
                } },
                { time: 6000, type: 'type', selector: '#locateSearchFirst', value: 'Jane' },
                { time: 7000, type: 'type', selector: '#locateSearchLast', value: 'Doe' },
                { time: 8000, type: 'click', selector: '#executeLocateSearchBtn' },
                { time: 11000, type: 'click', selector: '.result-item' },
                { time: 16000, type: 'custom', fn: 'show_countdown' },
                { time: 19000, type: 'click', selector: '#toggleViewBtn' },
                { time: 27000, type: 'click', selector: '.result-item' }, 
                { time: 35000, type: 'click', selector: '#closePopup' }
            ]
        }
    ];

    window.toggleDemo = function() {
        if (sessionStorage.getItem('dcsaDemoStep') !== null) {
            sessionStorage.removeItem('dcsaDemoStep');
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            window.location.reload();
        } else {
            const actualStep = demoSteps.findIndex(s => window.location.pathname.endsWith(s.url));
            sessionStorage.setItem('dcsaDemoStep', actualStep !== -1 ? actualStep : 0);
            window.location.reload();
        }
    };

    window.addEventListener('DOMContentLoaded', () => {
        let headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('btn-demo-toggle') && !window.location.pathname.endsWith('dcsa_dashboard.html')) {
            let demoBtn = document.createElement('button');
            demoBtn.id = 'btn-demo-toggle';
            demoBtn.className = 'btn btn-outline';
            demoBtn.style.cssText = "margin-right: 15px; border: 1px solid var(--border-color); color: var(--text-dark); background: transparent; cursor: pointer; padding: 0.6rem 1.2rem; border-radius: 6px; font-weight: 600; font-family: 'Outfit', sans-serif; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s;";
            demoBtn.innerHTML = '<i class="fa-solid fa-play"></i> DEMO';
            demoBtn.onclick = window.toggleDemo;
            headerActions.insertBefore(demoBtn, headerActions.firstChild);
        }
    });

    let step = sessionStorage.getItem('dcsaDemoStep');
    if (step === null) return;
    
    step = parseInt(step);
    let currentStepData = demoSteps[step];
    
    if (!window.location.pathname.endsWith(currentStepData.url)) {
        sessionStorage.removeItem('dcsaDemoStep');
        return;
    }

    window.addEventListener('DOMContentLoaded', () => {
        let btnContainer = document.createElement('div');
        btnContainer.style.position = 'fixed';
        btnContainer.style.bottom = '20px';
        btnContainer.style.right = '20px';
        btnContainer.style.zIndex = '999999';
        btnContainer.style.display = 'flex';
        btnContainer.style.alignItems = 'center';
        btnContainer.style.gap = '15px';
        
        let audioControls = document.createElement('div');
        audioControls.style.display = 'flex';
        audioControls.style.alignItems = 'center';
        audioControls.style.gap = '10px';
        audioControls.style.background = 'var(--surface-color, #fff)';
        audioControls.style.padding = '8px 15px';
        audioControls.style.borderRadius = '50px';
        audioControls.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        audioControls.style.opacity = '0';
        audioControls.style.transform = 'translateX(20px)';
        audioControls.style.transition = 'all 0.3s ease';
        audioControls.style.pointerEvents = 'none';

        let volIcon = document.createElement('i');
        volIcon.className = 'fa-solid fa-volume-high';
        volIcon.style.color = 'var(--text-dark, #333)';
        audioControls.appendChild(volIcon);
        
        let volSlider = document.createElement('input');
        volSlider.type = 'range';
        volSlider.min = '0';
        volSlider.max = '1';
        volSlider.step = '0.05';
        volSlider.value = sessionStorage.getItem('dcsaDemoVolume') || (currentStepData.voice_volume !== undefined ? currentStepData.voice_volume : 0.5);
        volSlider.style.width = '80px';
        volSlider.style.cursor = 'pointer';
        volSlider.oninput = (e) => {
            sessionStorage.setItem('dcsaDemoVolume', e.target.value);
        };
        audioControls.appendChild(volSlider);

        let stopBtn = document.createElement('button');
        stopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> STOP DEMO';
        stopBtn.style.background = 'var(--accent, #ff7a00)';
        stopBtn.style.color = '#fff';
        stopBtn.style.border = 'none';
        stopBtn.style.padding = '10px 20px';
        stopBtn.style.borderRadius = '50px';
        stopBtn.style.fontWeight = 'bold';
        stopBtn.style.fontFamily = 'Outfit, sans-serif';
        stopBtn.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        stopBtn.style.cursor = 'pointer';
        
        stopBtn.onclick = () => {
            sessionStorage.removeItem('dcsaDemoStep');
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            window.location.href = 'dcsa_dashboard.html';
        };
        
        btnContainer.appendChild(audioControls);
        btnContainer.appendChild(stopBtn);
        document.body.appendChild(btnContainer);

        btnContainer.addEventListener('mouseenter', () => {
            audioControls.style.opacity = '1';
            audioControls.style.transform = 'translateX(0)';
            audioControls.style.pointerEvents = 'auto';
        });
        btnContainer.addEventListener('mouseleave', () => {
            audioControls.style.opacity = '0';
            audioControls.style.transform = 'translateX(20px)';
            audioControls.style.pointerEvents = 'none';
        });
        
        document.querySelectorAll('a').forEach(a => {
            if (!a.href.includes('stop') && !a.onclick) {
                a.style.pointerEvents = 'none';
            }
        });

        var btn = document.getElementById('btn-demo-toggle');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-stop"></i> DEMO RUNNING';
            btn.style.color = 'var(--accent)';
            btn.style.borderColor = 'var(--accent)';
        }
    });

    function typeText(inputEl, text, callback) {
        if (!inputEl) {
            if (callback) callback();
            return;
        }
        inputEl.value = '';
        let i = 0;
        let interval = setInterval(() => {
            inputEl.value += text.charAt(i);
            let event = new Event('input', { bubbles: true });
            inputEl.dispatchEvent(event);
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                if (callback) setTimeout(callback, 200);
            }
        }, 100);
    }

    function playCurrentStep() {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        
        // Skip DB fetch if it's an intermediate dashboard return
        const pageName = currentStepData.url.replace('.html', '');
        if (pageName === 'dcsa_dashboard' && step > 0) {
            executeAudioAndActions();
            return;
        }

        // Fetch CMS demo configuration overrides
        fetch('https://sherpa-solutions-api-production.up.railway.app/api/demo-config/' + pageName)
            .then(r => r.json())
            .then(config => {
                if (config && config.text_content && config.text_content.trim() !== '') {
                    currentStepData.text = config.text_content;
                    currentStepData.actions = config.actions_json;
                    if (config.voice_uri) currentStepData.voice_uri = config.voice_uri;
                    if (config.voice_rate) currentStepData.voice_rate = config.voice_rate;
                    if (config.voice_volume !== undefined) currentStepData.voice_volume = config.voice_volume;
                }
                executeAudioAndActions();
            })
            .catch(err => {
                console.error("Failed to load demo config, using defaults", err);
                executeAudioAndActions();
            });
    }

    function smoothScrollTo(element, targetY, duration) {
        if (!duration) duration = 1000;
        const startY = element === window ? window.scrollY : element.scrollTop;
        let endY = targetY;
        if (targetY === 'bottom') {
            endY = element === window ? document.body.scrollHeight - window.innerHeight : element.scrollHeight - element.clientHeight;
        } else if (targetY === 'top') {
            endY = 0;
        } else {
            endY = parseInt(targetY, 10) || 0;
        }
        
        const distance = endY - startY;
        let startTime = null;

        function easeInOutQuad(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }

        function animation(currentTime) {
            if (startTime === null) startTime = currentTime;
            const timeElapsed = currentTime - startTime;
            const nextY = easeInOutQuad(timeElapsed, startY, distance, duration);
            
            if (element === window) window.scrollTo(0, nextY);
            else element.scrollTop = nextY;
            
            if (timeElapsed < duration) requestAnimationFrame(animation);
            else {
                if (element === window) window.scrollTo(0, endY);
                else element.scrollTop = endY;
            }
        }

        requestAnimationFrame(animation);
    }

    function executeAudioAndActions() {
        const finishStep = () => {
            let nextStep = step + 1;
            if (nextStep < demoSteps.length) {
                sessionStorage.setItem('dcsaDemoStep', nextStep);
                setTimeout(() => {
                    window.location.href = demoSteps[nextStep].url;
                }, 1500);
            } else {
                sessionStorage.removeItem('dcsaDemoStep');
                setTimeout(() => {
                    window.location.href = 'dcsa_dashboard.html';
                }, 1500);
            }
        };

        const demoStartTime = Date.now();
        let maxActionTime = 0;
        if (currentStepData.actions) {
            currentStepData.actions.forEach(a => {
                if (a.time > maxActionTime) maxActionTime = a.time;
            });
        }

        if (!currentStepData.text || currentStepData.text.trim() === '') {
            setTimeout(finishStep, maxActionTime + 500);
        } else {
            let utterance = new SpeechSynthesisUtterance(currentStepData.text);
            let vol = sessionStorage.getItem('dcsaDemoVolume') || 0.5;
            if(currentStepData.voice_volume !== undefined) vol = currentStepData.voice_volume;
            utterance.volume = parseFloat(vol);
            utterance.rate = currentStepData.voice_rate || 1.05;
            
            const setVoice = () => {
                const voices = window.speechSynthesis.getVoices();
                let preferredVoice = null;
                if (currentStepData.voice_uri) {
                    preferredVoice = voices.find(v => v.voiceURI === currentStepData.voice_uri);
                }
                if (!preferredVoice) preferredVoice = voices.find(v => v.lang === 'en-GB' && (v.name.includes('Female') || v.name.includes('Hazel') || v.name.includes('Sonia')));
                if (!preferredVoice) preferredVoice = voices.find(v => v.lang === 'en-GB');
                if (!preferredVoice) preferredVoice = voices.find(v => v.lang.startsWith('en'));
                if (preferredVoice) utterance.voice = preferredVoice;
                window.speechSynthesis.speak(utterance);
            };

            if (window.speechSynthesis.getVoices().length === 0) {
                window.speechSynthesis.onvoiceschanged = () => {
                    setVoice();
                    window.speechSynthesis.onvoiceschanged = null;
                };
            } else {
                setVoice();
            }

            utterance.onend = () => {
                let timeElapsed = Date.now() - demoStartTime;
                if (timeElapsed < maxActionTime) {
                    setTimeout(finishStep, (maxActionTime - timeElapsed) + 500);
                } else {
                    finishStep();
                }
            };
            
            utterance.onerror = () => {
                 sessionStorage.removeItem('dcsaDemoStep');
                 window.location.href = 'dcsa_dashboard.html';
            };
        }

        if (currentStepData.actions) {
            currentStepData.actions.forEach(action => {
                setTimeout(() => {
                    try {
                        if (action.type === 'scroll') {
                            smoothScrollTo(window, action.value, action.duration);
                        } else if (action.type === 'scrollModal') {
                            let m = document.querySelector(action.selector);
                            if (m) smoothScrollTo(m, action.value, action.duration);
                        } else if (action.type === 'click') {
                            let el = document.querySelector(action.selector);
                            if (el) {
                                el.click();
                            } else {
                                console.log('Demo click failed: ', action.selector);
                            }
                        } else if (action.type === 'type') {
                            let el = document.querySelector(action.selector);
                            if (el) {
                                typeText(el, action.value);
                            }
                        } else if (action.type === 'select') {
                            let el = document.querySelector(action.selector);
                            if (el) {
                                el.value = action.value;
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        } else if (action.type === 'custom') {
                            if (typeof action.fn === 'function') {
                                action.fn();
                            } else if (typeof action.fn === 'string') {
                                // Map JSON strings back to highlight logic
                                if (action.fn === 'highlight_personnel') {
                                    let el = document.querySelector('a[href="dcsa_personnel_vetting.html"]'); 
                                    if(el) { el.style.transition='all 0.3s'; el.style.outline='4px solid var(--accent)'; el.style.outlineOffset='4px'; }
                                } else if (action.fn === 'highlight_search') {
                                    let el = document.querySelector('#search-criteria'); 
                                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); }
                                } else if (action.fn === 'highlight_locate') {
                                    let el = document.querySelector('#locateSearchFirst'); 
                                    if(el) { el.style.transition='all 0.3s'; el.style.outline='3px solid var(--accent, #ff7a00)'; el.style.outlineOffset='3px'; setTimeout(()=>el.style.outline='none', 1500); }
                                } else if (action.fn === 'show_countdown') {
                                    let overlay = document.createElement('div');
                                    overlay.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(10,15,25,0.95); border:2px solid #ff7a00; color:#ff7a00; font-family:'Share Tech Mono', monospace; font-size:3rem; padding:3rem; z-index:9999999; text-align:center; box-shadow:0 0 30px rgba(255,122,0,0.5);";
                                    overlay.innerHTML = "INITIALIZING 3D ASSET TRACKING...<br><br><span id='demo-countdown' style='font-size: 5rem;'>3</span>";
                                    document.body.appendChild(overlay);
                                    let cnt = 3;
                                    let iv = setInterval(() => {
                                        cnt--;
                                        if(cnt > 0) document.getElementById('demo-countdown').innerText = cnt;
                                        else { clearInterval(iv); overlay.remove(); }
                                    }, 1000);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Action error', e);
                    }
                }, action.time);
            });
        }
    }
    
    setTimeout(playCurrentStep, 600);
})();
