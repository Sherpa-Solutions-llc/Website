// Open Vote Data & Simulation
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '') ? '' : 'https://sherpa-solutions-api-production.up.railway.app';


let polls = [];

let currentPollId = 1;
let selectedOptionId = null;
let simulationInterval;
let isVerified = false;
let verifiedCountry = null; // Stores verified jurisdiction
let currentDemographicFilter = 'all';

function setDemographicFilter(filter, el) {
    currentDemographicFilter = filter;
    document.querySelectorAll('.demo-pill').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    
    // Changing filters regenerates math algorithms
    loadPollData(currentPollId);
}

// Initialize View
async function init() {
    try {
        const response = await fetch(API_BASE + '/api/open-vote/polls');
        if (response.ok) {
            polls = await response.json();
            if (polls.length > 0) currentPollId = polls[0].id;
        }
    } catch (e) {
        console.error("Failed to fetch polls", e);
    }
    
    renderPollList();
    if(polls.length > 0) loadPollData(currentPollId);
    startLiveSimulation();
}

function renderPollList() {
    const list = document.getElementById('poll-list');
    list.innerHTML = '';
    
    // Filter polls based on verification state
    let visiblePolls = polls;
    if (isVerified && verifiedCountry && verifiedCountry !== "Global") {
        // If verified, only show Global polls and polls matching their exact country
        visiblePolls = polls.filter(p => p.region === "Global" || p.region === verifiedCountry);
    }
    
    visiblePolls.forEach(poll => {
        const div = document.createElement('div');
        div.className = `poll-card ${poll.id === currentPollId ? 'active' : ''}`;
        div.onclick = () => {
            currentPollId = poll.id;
            renderPollList();
            loadPollData(poll.id);
            
            // If user verified and poll active and unvoted, clicking the poll opens the ballot
            if (isVerified && poll.active && !poll.hasVoted) {
                openBallotModal(poll);
            }
        };
        
        let statusHtml = poll.active ? `<div class="status-badge"><div class="pulse-dot"></div> Active Voting</div>` : `<div style="color: var(--text-secondary)"><i class="fa-solid fa-lock"></i> Concluded</div>`;

        div.innerHTML = `
            <div class="poll-category">${poll.category}</div>
            <div class="poll-title">${poll.title}</div>
            <div class="poll-meta">
                ${statusHtml}
                <span>ID: 0x${Math.random().toString(16).substr(2, 6).toUpperCase()}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Ease-out quart for satisfying deceleration
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(ease * (end - start) + start);
        obj.innerHTML = current.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end.toLocaleString();
        }
    };
    window.requestAnimationFrame(step);
}

function loadPollData(id) {
    const poll = polls.find(p => p.id === id);
    if (!poll) return;

    document.getElementById('current-poll-title').textContent = poll.title;
    
    // Fetch demographic weights dynamically based on the current filter selection
    let optModA = 1, optModB = 1, optModC = 1, optModD = 1;
    if (currentDemographicFilter === 'verified') {
         optModA = 1.1; optModB = 0.9;
    } else if (currentDemographicFilter === 'genz') {
         optModA = 1.6; optModB = 0.4; optModC = 1.3;
    } else if (currentDemographicFilter === 'boomer') {
         optModA = 0.6; optModB = 1.4; optModC = 0.8;
    }
    
    const mods = [optModA, optModB, optModC, optModD];
    
    // Pre-calculate modified votes for animation targets
    const weightedOptions = poll.options.map((opt, i) => {
        return { ...opt, weightedVotes: Math.floor(opt.votes * (mods[i] || 1)) };
    });

    // Calculate total layout using the demographic weighted arrays
    const totalVotes = weightedOptions.reduce((sum, opt) => sum + opt.weightedVotes, 0);
    const totalEl = document.getElementById('stat-total');
    let currentTotal = parseInt(totalEl.innerText.replace(/,/g, '')) || 0;
    
    const scoreContainer = document.getElementById('stat-nodes');
    const isNewPoll = scoreContainer.getAttribute('data-poll-id') !== id.toString();
    scoreContainer.setAttribute('data-poll-id', id);

    if (isNewPoll) {
        currentTotal = 0; // force animate from zero on switch
    }
    animateValue(totalEl, currentTotal, totalVotes, 1500);
    
    // Inject dynamic Score block structured for animation
    if (isNewPoll) {
        let scoreHtml = '';
        weightedOptions.forEach((opt, index) => {
            scoreHtml += `<div style="color: ${opt.color}; padding-bottom: 3px; font-size: 0.95rem;"><span id="score-val-${index}">0</span> <span style="color: var(--text-secondary);">${opt.label}</span></div>`;
        });
        scoreContainer.innerHTML = scoreHtml;
    }

    weightedOptions.forEach((opt, index) => {
        const valEl = document.getElementById(`score-val-${index}`);
        if(valEl) {
             const currentVal = parseInt(valEl.innerText.replace(/,/g, '')) || 0;
             animateValue(valEl, currentVal, opt.weightedVotes, 1500 + (index * 200));
        }
    });
    
    // Render Bars
    const barsContainer = document.getElementById('results-bars');
    if (isNewPoll) {
        barsContainer.innerHTML = '';
        weightedOptions.forEach((opt, index) => {
            const div = document.createElement('div');
            div.className = 'result-row';
            div.innerHTML = `
                <div class="result-label">
                    <span>${opt.label}</span>
                    <span class="result-pct" id="bar-pct-${index}">0% (0)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" id="bar-fill-${index}" style="width: 0%; background: ${opt.color}"></div>
                </div>
            `;
            barsContainer.appendChild(div);
        });
    }

    // Assign bar values securely without killing DOM
    setTimeout(() => {
        weightedOptions.forEach((opt, index) => {
            const pct = totalVotes > 0 ? ((opt.weightedVotes / totalVotes) * 100).toFixed(1) : 0;
            const pctEl = document.getElementById(`bar-pct-${index}`);
            const fillEl = document.getElementById(`bar-fill-${index}`);
            
            if(pctEl && fillEl) {
                 pctEl.innerHTML = `${pct}% (${opt.weightedVotes.toLocaleString()})`;
                 fillEl.style.width = `${pct}%`;
            }
        });
    }, 50);
    
    // Persistently display the Map View across all polls
    if (typeof isMapView !== 'undefined' && !isMapView) {
        toggleMapView();
    } else if (typeof updateMapForPoll === 'function') {
        updateMapForPoll();
    }
}

function startLiveSimulation() {
    // Randomly tick up votes on the active poll
    simulationInterval = setInterval(() => {
        const activePolls = polls.filter(p => p.active);
        if(activePolls.length === 0) return;
        
        const poll = activePolls[0];
        // add random votes
        poll.options.forEach(opt => {
            if(Math.random() > 0.5) {
                opt.votes += Math.floor(Math.random() * 5);
            }
        });
        
        // trigger pulse
        if(typeof triggerGlobalPulse === 'function') {
             triggerGlobalPulse();
             if(Math.random() > 0.3) setTimeout(triggerGlobalPulse, 400);
             if(Math.random() > 0.6) setTimeout(triggerGlobalPulse, 800); 
        }
        
        // update UI if we are looking at it
        if(currentPollId === poll.id) {
            loadPollData(poll.id);
        }
        
    }, 3000);
}


// --- Modals and Interactions ---

function openAdminModal() {
    document.getElementById('admin-modal').classList.add('active');
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    // reset scanner
    const scanner = document.getElementById('scanner');
    scanner.className = 'scanner-container';
    document.getElementById('scan-status').textContent = 'AWAITING INPUT...';
}

function startVerificationProcess() {
    // 1. Show Identity Method Modal
    document.getElementById('id-method-modal').classList.add('active');
}

function updateVerifiedUI() {
    // Update global header badge
    const headerStatus = document.getElementById('global-id-status');
    if (headerStatus) {
        headerStatus.style.color = 'var(--accent-green)';
        headerStatus.innerHTML = '<div class="pulse-dot"></div><span style="font-family: \'Share Tech Mono\'; font-size: 0.9rem;">ID VERIFIED</span>';
    }
    
    // Update right panel
    document.getElementById('right-panel-unverified').classList.add('hidden');
    document.getElementById('right-panel-verified').classList.remove('hidden');
}

let currentAuthMethod = '';

function selectIdMethod(method) {
    const countrySelect = document.getElementById('user-country-select');
    const vpnToggle = document.getElementById('vpn-simulator-toggle');
    const warningEl = document.getElementById('ip-mismatch-warning');
    
    if (!countrySelect.value) {
        alert("Please select your legal jurisdiction before choosing a biometric vector.");
        return;
    }
    
    if (warningEl) warningEl.classList.add('hidden');
    document.getElementById('id-method-modal').classList.remove('active');
    
    // Reset Modal Steps
    document.getElementById('biometric-step-1').style.display = 'block';
    document.getElementById('biometric-step-2').style.display = 'none';
    
    currentAuthMethod = method;
    const titleEl = document.getElementById('biometric-title');
    const descEl = document.getElementById('biometric-desc');
    const captureCont = document.getElementById('capture-container');
    const simControls = document.getElementById('simulation-controls');
    
    // Generate dynamic capture UI based on vector
    if (method === 'face') {
        titleEl.textContent = 'Facial Authentication';
        descEl.textContent = 'Please position your face within the frame. AI will map your 3D geometry.';
        captureCont.innerHTML = `
            <div style="width: 200px; height: 200px; margin: 0 auto; border: 2px dashed var(--accent-glow); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,210,255,0.05); position: relative; overflow: hidden;">
                <i class="fa-solid fa-user" style="font-size: 5rem; color: rgba(255,255,255,0.2);"></i>
                <div id="face-scanner-line" style="position: absolute; width: 100%; height: 100%; background: linear-gradient(180deg, transparent, rgba(0,210,255,0.4), transparent); top: -100%; display: none;"></div>
            </div>
        `;
        simControls.style.display = 'block';
        document.getElementById('sim-capture-btn').innerHTML = '<i class="fa-solid fa-camera"></i> Scan Face Geometry';
    } else if (method === 'fingerprint') {
        titleEl.textContent = 'Biometric Scan';
        descEl.textContent = 'Please place your finger on the sensor.';
        captureCont.innerHTML = `
            <div class="scanner-container" id="scanner">
                <i class="fa-solid fa-fingerprint fingerprint-icon" id="scanner-icon">
                    <div class="scan-line"></div>
                </i>
            </div>
        `;
        simControls.style.display = 'block';
        document.getElementById('sim-capture-btn').innerHTML = '<i class="fa-solid fa-fingerprint"></i> Simulate Finger Match';
    } else if (method === 'id_card') {
        titleEl.textContent = 'Document Verification';
        descEl.textContent = 'Please upload or capture the Front and Back of your State ID.';
        captureCont.innerHTML = `
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <div class="id-capture-box" style="border: 1px dashed var(--text-secondary); background: rgba(0,0,0,0.4); padding: 1.5rem; border-radius: 8px;">
                    <i class="fa-solid fa-id-card-clip" style="font-size: 2rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.5);"></i><br><span style="font-size: 0.8rem;">FRONT</span>
                </div>
                <div class="id-capture-box" style="border: 1px dashed var(--text-secondary); background: rgba(0,0,0,0.4); padding: 1.5rem; border-radius: 8px;">
                    <i class="fa-solid fa-barcode" style="font-size: 2rem; margin-bottom: 0.5rem; color: rgba(255,255,255,0.5);"></i><br><span style="font-size: 0.8rem;">BACK</span>
                </div>
            </div>
        `;
        simControls.style.display = 'block';
        document.getElementById('sim-capture-btn').innerHTML = '<i class="fa-solid fa-file-invoice"></i> Simulate OCR Extraction';
    }

    document.getElementById('scan-status').textContent = 'AWAITING INPUT...';
    document.getElementById('scan-status').style.color = '';
    
    // Wire up simulation button (replace clone to ensure single listener)
    const simBtn = document.getElementById('sim-capture-btn');
    const newSimBtn = simBtn.cloneNode(true);
    simBtn.parentNode.replaceChild(newSimBtn, simBtn);
    
    newSimBtn.style.display = 'inline-block'; // reset visibility

    newSimBtn.addEventListener('click', () => {
        newSimBtn.style.display = 'none'; // hide during processing
        document.getElementById('scan-status').textContent = 'AI PROCESSING VERIFICATION...';
        document.getElementById('scan-status').style.color = 'var(--accent-glow)';
        
        // Face animation
        const fsl = document.getElementById('face-scanner-line');
        if (fsl) {
            fsl.style.display = 'block';
            fsl.animate([{top: '-100%'}, {top: '100%'}], {duration: 1200, iterations: Infinity, direction: 'alternate'});
        }
        
        // Fingerprint animation
        const scannerEl = document.getElementById('scanner');
        if (scannerEl) scannerEl.classList.add('scanning');

        // VPN validation
        if (vpnToggle.checked) {
            setTimeout(() => {
                if (scannerEl) scannerEl.classList.remove('scanning');
                if (fsl) fsl.style.display = 'none';
                
                document.getElementById('scan-status').textContent = 'VALIDATION FAILED';
                document.getElementById('scan-status').style.color = 'var(--accent-red)';
                
                const w = document.getElementById('ip-mismatch-warning');
                if (w) w.classList.remove('hidden');
                
                setTimeout(() => {
                    document.getElementById('biometric-modal').classList.remove('active');
                    startVerificationProcess(); 
                    const mw = document.getElementById('ip-mismatch-warning-method');
                    if(mw) mw.classList.remove('hidden');
                }, 3000);
            }, 2500);
            return;
        }

        // Move to PII form
        setTimeout(() => {
            if (scannerEl) scannerEl.className = 'scanner-container scan-success';
            if (fsl) fsl.style.background = 'linear-gradient(180deg, transparent, rgba(63, 185, 80, 0.4), transparent)';
            
            document.getElementById('scan-status').textContent = 'EXTRACTED. PROCEEDING TO REGISTRY.';
            document.getElementById('scan-status').style.color = 'var(--accent-green)';
            
            setTimeout(() => {
                document.getElementById('biometric-step-1').style.display = 'none';
                document.getElementById('biometric-step-2').style.display = 'block';
                
                // Pre-fill logic depending on vector
                if (currentAuthMethod === 'id_card') {
                    document.getElementById('pii-name').value = "John Doe";
                    document.getElementById('pii-address').value = "123 Springfield Ave, USA";
                } else {
                    document.getElementById('pii-name').value = "";
                    document.getElementById('pii-address').value = "";
                }
                document.getElementById('pii-ssn').value = "";
                document.getElementById('pii-error-msg').style.display = 'none';
            }, 1500);
        }, 2500);
    });

    document.getElementById('biometric-modal').classList.add('active');
}

async function submitRegistration(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('pii-submit-btn');
    const errorMsg = document.getElementById('pii-error-msg');
    
    const name = document.getElementById('pii-name').value;
    const address = document.getElementById('pii-address').value;
    const ssn = document.getElementById('pii-ssn').value;
    
    // Simulate biometric hash matching the mock extraction
    // If state ID is used, biometric hash is simulated via the photo.
    const biometricHash = currentAuthMethod === 'id_card' ? "DOC-" + Math.random().toString(36).substr(2, 9).toUpperCase() : "BIO-" + Math.random().toString(36).substr(2, 9).toUpperCase();

    submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
    submitBtn.disabled = true;
    errorMsg.style.display = 'none';
    
    try {
        const response = await fetch(API_BASE + '/api/open-vote/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                method: currentAuthMethod,
                name: name,
                address: address,
                ssn: ssn,
                biometric_hash: biometricHash
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            errorMsg.innerText = data.detail || "Verification failed.";
            errorMsg.style.display = 'block';
            submitBtn.innerHTML = '<i class="fa-solid fa-server"></i> Submit to Registrar';
            submitBtn.disabled = false;
            return;
        }
        
        // Success!
        isVerified = true;
        verifiedCountry = document.getElementById('user-country-select').value;
        updateVerifiedUI();
        
        // Update Dashboard Region text
        const dashLabel = document.getElementById('dashboard-region-label');
        if (dashLabel && verifiedCountry) {
            const selectEl = document.getElementById('user-country-select');
            const countryText = selectEl.options[selectEl.selectedIndex].text;
            dashLabel.innerHTML = `| ${countryText}`;
        }
        
        renderPollList();
        
        const jurisdictionPoll = polls.find(p => p.region === verifiedCountry);
        if (jurisdictionPoll) {
            currentPollId = jurisdictionPoll.id;
            renderPollList();
            loadPollData(currentPollId);
        } else {
            const activePolls = document.querySelectorAll('.poll-card');
            if (activePolls.length > 0) activePolls[0].click();
        }
        
        closeModals();
        
    } catch (err) {
        console.error(err);
        errorMsg.innerText = "Network Error. Unable to reach Global Registrar.";
        errorMsg.style.display = 'block';
        submitBtn.innerHTML = '<i class="fa-solid fa-server"></i> Submit to Registrar';
        submitBtn.disabled = false;
    }
}

function openBallotModal(poll) {
    document.getElementById('ballot-modal').classList.add('active');
    document.getElementById('ballot-title').textContent = poll.category;
    document.getElementById('ballot-desc').textContent = poll.description;
    
    const optsContainer = document.getElementById('ballot-options');
    optsContainer.innerHTML = '';
    selectedOptionId = null;
    
    const submitBtn = document.getElementById('submit-vote-btn');
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    document.getElementById('vote-encrypt-status').classList.add('hidden');
    submitBtn.innerHTML = 'Authorize & Submit Entry';
    
    poll.options.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'ballot-option';
        div.onclick = () => selectOption(opt.id);
        div.id = `ballot-opt-${opt.id}`;
        
        div.innerHTML = `
            <div class="custom-radio"></div>
            <span style="font-weight: 500;">${opt.label}</span>
        `;
        optsContainer.appendChild(div);
    });
}

function selectOption(id) {
    selectedOptionId = id;
    document.querySelectorAll('.ballot-option').forEach(el => el.classList.remove('selected'));
    document.getElementById(`ballot-opt-${id}`).classList.add('selected');
    
    const submitBtn = document.getElementById('submit-vote-btn');
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
}

async function submitVote() {
    if (!selectedOptionId) return;
    
    const submitBtn = document.getElementById('submit-vote-btn');
    const encryptStatus = document.getElementById('vote-encrypt-status');
    
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    encryptStatus.classList.remove('hidden');
    
    // Scramble Animation Setup
    const poll = polls.find(p => p.id === currentPollId);
    const opt = poll.options.find(o => o.id === selectedOptionId);
    
    const payloadBytes = JSON.stringify({
        vector: isVerified ? "BIO-" + Math.random().toString(36).substr(2, 6).toUpperCase() : "ANON",
        poll_id: currentPollId,
        choice: opt.label
    });
    
    encryptStatus.innerHTML = `<div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:5px;">ENCRYPTING PAYLOAD</div><div id="scramble-text" style="font-family:'Share Tech Mono'; color:var(--accent-glow); font-size: 0.8rem; word-break:break-all;">${payloadBytes}</div>`;
    
    const scrambleEl = document.getElementById('scramble-text');
    let scrambleInterval = setInterval(() => {
        let sc = "0x";
        for(let i=0; i<64; i++) {
            sc += Math.floor(Math.random()*16).toString(16);
        }
        scrambleEl.innerHTML = sc;
    }, 50);

    try {
        await fetch(API_BASE + '/api/open-vote/vote', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({poll_id: currentPollId, option_id: selectedOptionId})
        });
        
        // Final receipt hash
        const receiptHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
        
        setTimeout(() => {
            clearInterval(scrambleInterval);
            scrambleEl.innerHTML = receiptHash;
            scrambleEl.style.color = "var(--accent-green)";
            
            opt.votes += 1;
            poll.hasVoted = true; 
            
            setTimeout(() => {
                closeModals();
                loadPollData(currentPollId); 
                
                document.getElementById('right-panel-verified').classList.add('hidden');
                document.getElementById('right-panel-unverified').classList.add('hidden');
                document.getElementById('right-panel-receipt').classList.remove('hidden');
                
                document.getElementById('receipt-hash-display').innerText = receiptHash;
                window.lastVoteReceiptHash = receiptHash;
                
            }, 1000);
        }, 1500); // Give 1.5 seconds of scramble

    } catch (e) {
        clearInterval(scrambleInterval);
        encryptStatus.innerHTML = '<span style="color:var(--accent-red)">NETWORK ERROR</span>';
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
    }
}

async function adminSavePoll() {
    const btn = document.getElementById('admin-save-btn');
    const msg = document.getElementById('admin-msg');
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deploying...';
    btn.disabled = true;
    
    const category = document.getElementById('admin-poll-category').value;
    const title = document.getElementById('admin-poll-title').value;
    const desc = document.getElementById('admin-poll-desc').value;
    const region = document.getElementById('admin-poll-region').value;
    const optionsRaw = document.getElementById('admin-poll-options').value;
    
    const colors = ["#58a6ff", "#3fb950", "#f85149", "#faa61a", "#12b6cf", "#0087dc", "#e4003b", "#00008b"];
    const options = optionsRaw.split(",").map((opt, idx) => {
        return {
            label: opt.trim(),
            color: colors[idx % colors.length]
        };
    }).filter(opt => opt.label.length > 0);
    
    try {
        const resp = await fetch(API_BASE + '/api/open-vote/poll', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                category, title, description: desc, region, options
            })
        });
        
        if (resp.ok) {
            msg.innerHTML = '<i class="fa-solid fa-check"></i> Poll Deployed to Network';
            msg.style.display = 'block';
            msg.style.color = 'var(--accent-green)';
            
            // Re-fetch and re-render
            const pResp = await fetch(API_BASE + '/api/open-vote/polls');
            if (pResp.ok) {
                polls = await pResp.json();
                renderPollList();
            }
            
            setTimeout(() => {
                closeModals();
                msg.style.display = 'none';
                btn.innerHTML = 'Deploy to Network';
                btn.disabled = false;
            }, 1000);
            return;
        }
    } catch(e) {
        console.error(e);
    }
    
    msg.innerHTML = '<i class="fa-solid fa-xmark"></i> Deployment Failed';
    msg.style.display = 'block';
    msg.style.color = 'var(--accent-red)';
    btn.innerHTML = 'Deploy to Network';
    btn.disabled = false;
}

// --- Audit Ledger Terminal Logic ---

function openAuditLedger() {
    document.getElementById('audit-modal').classList.add('active');
    
    const targetHash = window.lastVoteReceiptHash || "N/A";
    document.getElementById('audit-my-hash').innerText = targetHash;
    
    const terminal = document.getElementById('ledger-terminal');
    terminal.innerHTML = '<div style="color: var(--accent-glow);">[ ! ] ESTABLISHING SECURE CONNECTION TO PUBLIC NODE...</div>';
    
    let count = 0;
    const scrollMax = 20;
    
    // Simulate terminal hash synchronization
    const terminalSpam = setInterval(() => {
        if(count > scrollMax) {
            clearInterval(terminalSpam);
            const successDiv = document.createElement('div');
            successDiv.style.color = "var(--accent-green)";
            successDiv.style.marginTop = "10px";
            successDiv.innerHTML = `> VERIFIED: RECEIPT [${targetHash}] IS SECURELY RECORDED IN BLOCK #${Math.floor(Math.random()*900000) + 100000}<br>> IMMUTABILITY STATUS: LOCKED`;
            terminal.appendChild(successDiv);
            terminal.scrollTop = terminal.scrollHeight;
            return;
        }
        
        const div = document.createElement('div');
        const randomHash = "0x" + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('');
        
        // Randomly decide if this line simulates finding our hash
        if(count === scrollMax - 3 && targetHash !== "N/A") {
            div.style.color = "var(--accent-green)";
            div.innerHTML = `[SYNC] INCOMING TX: <span style="background: rgba(63, 185, 80, 0.2);">${targetHash}</span> (MATCH FOUND)`;
        } else {
            div.style.color = "rgba(255,255,255,0.4)";
            div.innerText = `[SYNC] INCOMING TX: ${randomHash}`;
        }
        
        terminal.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight; // auto scroll
        count++;
    }, 150);
}

// Start
document.addEventListener('DOMContentLoaded', init);


// ==========================================
// DEMO MODE AUTOPILOT LOGIC
// ==========================================

let isDemoModeActive = false;
let virtualCursor = null;

function initVirtualCursor() {
    if (virtualCursor) return;
    virtualCursor = document.createElement('div');
    virtualCursor.id = 'virtual-cursor';
    document.body.appendChild(virtualCursor);
}

function removeVirtualCursor() {
    if (virtualCursor) {
        virtualCursor.remove();
        virtualCursor = null;
    }
}

async function moveVirtualMouse(targetX, targetY, duration = 1000, click = false) {
    if (!virtualCursor || !isDemoModeActive) return;
    virtualCursor.style.display = 'block';
    return new Promise(resolve => {
        const startX = parseFloat(virtualCursor.style.left) || window.innerWidth / 2;
        const startY = parseFloat(virtualCursor.style.top) || window.innerHeight / 2;
        const startTime = performance.now();
        function animate(now) {
            if (!isDemoModeActive) {
                virtualCursor.style.display = 'none';
                return resolve();
            }
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            const curX = startX + (targetX - startX) * ease;
            const curY = startY + (targetY - startY) * ease;
            virtualCursor.style.left = `${curX}px`;
            virtualCursor.style.top = `${curY}px`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                if (click) {
                    virtualCursor.classList.add('clicking');
                    setTimeout(() => {
                        virtualCursor.classList.remove('clicking');
                        resolve();
                    }, 200);
                } else {
                    resolve();
                }
            }
        }
        requestAnimationFrame(animate);
    });
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const demoVoice = window.speechSynthesis;
let currentDemoUtterance = null;
let resolveCurrentSpeech = null;
let isIntentionalCancel = false;

function speakDemoText(text) {
    if (!isDemoModeActive || !demoVoice) return Promise.resolve();
    isIntentionalCancel = true;
    demoVoice.cancel();
    isIntentionalCancel = false;
    
    return new Promise(resolve => {
        resolveCurrentSpeech = resolve;
        currentDemoUtterance = new SpeechSynthesisUtterance(text);
        
        const voices = demoVoice.getVoices();
        let preferredVoice = voices.find(v => v.lang.includes('en-GB') && (v.name.includes('Female') || v.name.includes('Hazel') || v.name.includes('Google')));
        if (!preferredVoice) {
            preferredVoice = voices.find(v => v.lang.includes('en-US') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Female')));
        }
        if (preferredVoice) currentDemoUtterance.voice = preferredVoice;
        
        currentDemoUtterance.rate = 1.15; // Energetic pacing
        const volSliderEl = document.getElementById('demo-volume-slider');
        if (volSliderEl) currentDemoUtterance.volume = parseFloat(volSliderEl.value);
        
        const fallbackTimer = setTimeout(() => {
            if (resolveCurrentSpeech) { resolveCurrentSpeech(); resolveCurrentSpeech = null; }
        }, text.length * 100 + 2000);
        
        currentDemoUtterance.onend = () => {
            if (!isIntentionalCancel && resolveCurrentSpeech) {
                clearTimeout(fallbackTimer); resolveCurrentSpeech(); resolveCurrentSpeech = null;
            }
        };
        demoVoice.speak(currentDemoUtterance);
    });
}

const demoBtn = document.getElementById('demo-mode-btn');
if (demoBtn) {
    demoBtn.addEventListener('click', () => {
        isDemoModeActive = !isDemoModeActive;
        if (isDemoModeActive) {
            demoBtn.style.background = 'rgba(255, 71, 87, 0.1)';
            demoBtn.style.color = '#ff4757';
            demoBtn.style.borderColor = '#ff4757';
            demoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> DEMO ON';
            document.getElementById('demo-volume-slider').style.display = 'inline-block';
            runDemoCycle();
        } else {
            demoBtn.style.background = 'rgba(0, 210, 255, 0.1)';
            demoBtn.style.color = '#00d2ff';
            demoBtn.style.borderColor = '#00d2ff';
            demoBtn.innerHTML = '<i class="fa-solid fa-play"></i> DEMO OFF';
            document.getElementById('demo-volume-slider').style.display = 'none';
            if (demoVoice) demoVoice.cancel();
            removeVirtualCursor();
        }
    });
}

// Volume slider logic
document.getElementById('demo-volume-slider').addEventListener('input', (e) => {
    if (currentDemoUtterance) {
        currentDemoUtterance.volume = parseFloat(e.target.value);
        if(e.target.value === "0" && demoVoice.speaking) demoVoice.cancel();
    }
});

// Demo interupt handler
document.addEventListener('mousedown', (e) => {
    if (isDemoModeActive && e.target.id !== 'demo-mode-btn' && !e.target.closest('#demo-mode-btn') && e.target.id !== 'demo-volume-slider') {
        if (demoVoice) demoVoice.cancel();
        if (demoBtn) demoBtn.click();
    }
}, true);

// Get Element Center Coordinate
function getCenterCoords(el) {
    if(!el) return {x: window.innerWidth/2, y: window.innerHeight/2};
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
}

async function runDemoCycle() {
    initVirtualCursor();
    await delay(500);
    if (!isDemoModeActive) return;

    // 1. Intro
    await speakDemoText("Welcome to Open Vote by Sherpa Solutions. This interactive dashboard aggregates real-time global consensus intelligence while utilizing cryptographic auditing formulas to enforce democratic integrity.");
    await delay(500); if (!isDemoModeActive) return;
    
    // 2. Pulse Maps
    const mapBounds = getCenterCoords(document.getElementById('map-container'));
    await moveVirtualMouse(mapBounds.x + 100, mapBounds.y, 1000);
    await speakDemoText("The map dynamically listens for live telemetry. As global votes trickle in, the geospatial engine renders live radar pulses mapping their absolute origin points.");
    await delay(1500); if (!isDemoModeActive) return;
    
    // 3. Demographics
    const demoBtnGenzEl = Array.from(document.querySelectorAll('.filter-pill')).find(el => el.innerText.includes('Gen Z'));
    if(demoBtnGenzEl) {
        const c = getCenterCoords(demoBtnGenzEl);
        await moveVirtualMouse(c.x, c.y, 1000, true);
        demoBtnGenzEl.click();
        await speakDemoText("Metrics can be targeted dynamically. Selecting the Gen Z matrix instantly recalculates the entire planetary model using predictive density weighting... notice how the terrain colors organically shift to represent the specific demographic slice.");
        await delay(2000); if (!isDemoModeActive) return;
    }

    // 4. US Poll & Slot Machines
    const usPollEl = Array.from(document.querySelectorAll('.poll-card')).find(el => el.innerText.includes('United States Presidential'));
    if(usPollEl) {
        const c = getCenterCoords(usPollEl);
        await moveVirtualMouse(c.x, c.y, 1000, true);
        usPollEl.click();
        await speakDemoText("Watch the velocity counters at the top. The dashboard integrates ease-out algorithmic scrolling to smoothly emulate financial slot-machines, while the geospatial engine automatically down-scales from the 3D globe visualization directly to the targeted local American jurisdiction.");
        await delay(2000); if (!isDemoModeActive) return;
    }

    // 5. Verification
    const authBtn = document.getElementById('verify-btn');
    if(authBtn && !isVerified) {
        const c = getCenterCoords(authBtn);
        await moveVirtualMouse(c.x, c.y, 1500, true);
        authBtn.click();
        await speakDemoText("Let's look at blockchain security. In order to cast a vote, you first authenticate your identity utilizing advanced multi-modal biometrics.");
        await delay(1000); if (!isDemoModeActive) return;
        
        const countrySelect = document.getElementById('user-country-select');
        if(countrySelect) {
            const cs = getCenterCoords(countrySelect);
            await moveVirtualMouse(cs.x, cs.y, 800, true);
            countrySelect.value = 'Global';
        }

        const faceBtn = document.querySelector('.method-card[onclick="selectIdMethod(\'face\')"]');
        if(faceBtn) {
            const fc = getCenterCoords(faceBtn);
            await moveVirtualMouse(fc.x, fc.y, 800, true);
            faceBtn.click();
            await delay(1000); if (!isDemoModeActive) return;

            // Click the 'Scan Face Geometry' simulation button
            const simBtn = document.getElementById('sim-capture-btn');
            if (simBtn) {
                const sc = getCenterCoords(simBtn);
                await moveVirtualMouse(sc.x, sc.y, 800, true);
                simBtn.click();
            }
            // Wait for 3D AI scan animation to succeed and transition to PII form
            await delay(3500); if (!isDemoModeActive) return;

            // Helper to simulate keystrokes
            async function typeText(elId, txt) {
                const el = document.getElementById(elId);
                if(!el) return;
                const ec = getCenterCoords(el);
                await moveVirtualMouse(ec.x, ec.y, 500, true);
                for(let i=0; i<txt.length; i++) {
                    if(!isDemoModeActive) return;
                    el.value += txt[i];
                    await delay(50);
                }
            }

            await speakDemoText("After capturing your unique volumetric geometry, we merge the vector with your personally identifiable information. The custom verification backend instantly queries the centralized registry to confirm nobody has cast a ballot under this digital footprint.");
            
            await typeText('pii-name', "Sherpa Evaluator");
            await typeText('pii-address', "Global Summit HQ");
            await typeText('pii-ssn', "000-XXX-0000");
            
            await delay(500); if (!isDemoModeActive) return;

            const submitPiBtn = document.getElementById('pii-submit-btn');
            if(submitPiBtn) {
                const spc = getCenterCoords(submitPiBtn);
                await moveVirtualMouse(spc.x, spc.y, 800, true);
                submitPiBtn.click();
            }

            // Wait for backend FastAPI response
            await delay(2500); if (!isDemoModeActive) return;
        }
        // 6. Casting Vote
        const p2PollEl = Array.from(document.querySelectorAll('.poll-card')).find(el => el.innerText.includes('Universal Basic Income'));
        if(p2PollEl) {
            const p2C = getCenterCoords(p2PollEl);
            await moveVirtualMouse(p2C.x, p2C.y, 1000, true);
            p2PollEl.click();
            await delay(1000); if (!isDemoModeActive) return;
            
            // wait for modal
            const optEl = document.querySelector('.ballot-option');
            if(optEl) {
                const optC = getCenterCoords(optEl);
                await moveVirtualMouse(optC.x, optC.y, 1000, true);
                optEl.click();
                await delay(500);
                
                const subBtn = document.getElementById('submit-vote-btn');
                const subC = getCenterCoords(subBtn);
                await moveVirtualMouse(subC.x, subC.y, 800, true);
                subBtn.click();
                
                await speakDemoText("Once cast, your entry is injected through a mathematical SHA-256 algorithm. The system permanently associates your selection with a deterministic string hash receipt.");
                await delay(3500); if (!isDemoModeActive) return;
                
                const ledgerBtn = document.getElementById('view-ledger-btn');
                if(ledgerBtn) {
                    const lC = getCenterCoords(ledgerBtn);
                    await moveVirtualMouse(lC.x, lC.y, 1000, true);
                    ledgerBtn.click();
                    await speakDemoText("We can seamlessly interface with the public terminal. By comparing your receipt against the network's decentralized block synchronization, we establish uncompromising cryptographic immutability.");
                }
            }
        }
    }
    
    await delay(12000);
    // End demo gracefully
    if(isDemoModeActive && demoBtn) {
        demoBtn.click();
    }
}
