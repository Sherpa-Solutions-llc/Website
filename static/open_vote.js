// Open Vote Data & Simulation

const polls = [
    {
        id: 1,
        category: "Referendum",
        title: "Global Legalization of Adult-Use Cannabis",
        description: "Should cannabis be removed from international drug control treaties and legalized for adult recreational use globally?",
        options: [
            { id: "opt1", label: "Approve (Full Legalization)", votes: 89432, color: "#3fb950" },
            { id: "opt2", label: "Approve (Medical Only)", votes: 34105, color: "#58a6ff" },
            { id: "opt3", label: "Reject (Maintain Prohibition)", votes: 19056, color: "#f85149" }
        ],
        region: "Global",
        active: true
    },
    {
        id: 2,
        category: "Approval Rating",
        title: "United Nations Secretariat Global Confidence",
        description: "Do you have confidence in the current direction and effectiveness of the UN Secretariat?",
        options: [
            { id: "opt1", label: "Favorable", votes: 45210, color: "#3fb950" },
            { id: "opt2", label: "Neutral / Undecided", votes: 62890, color: "#8b949e" },
            { id: "opt3", label: "Unfavorable", votes: 115802, color: "#f85149" }
        ],
        region: "Global",
        active: false
    },
    {
        id: 3,
        category: "Political Initiative",
        title: "Universal Basic Income (UBI) Mandate",
        description: "Should a global taxation framework be established to fund a localized Universal Basic Income baseline?",
        options: [
            { id: "opt1", label: "Strongly Support", votes: 105423, color: "#3fb950" },
            { id: "opt2", label: "Support with Means Testing", votes: 45612, color: "#58a6ff" },
            { id: "opt3", label: "Oppose", votes: 98450, color: "#f85149" }
        ],
        region: "Global",
        active: true
    },
    {
        id: 4,
        category: "Presidential Election",
        title: "2024 United States Presidential Election",
        description: "Official results for the 2024 Presidential Election of the United States of America.",
        options: [
            { id: "opt1", label: "Republican Nominee (Trump)", votes: 77302580, color: "#f85149" },
            { id: "opt2", label: "Democratic Nominee (Harris)", votes: 75017613, color: "#58a6ff" }
        ],
        region: "US",
        active: false
    },
    {
        id: 5,
        category: "National Senate",
        title: "2024 US Senate - Pennsylvania",
        description: "General election to represent Pennsylvania in the United States Senate.",
        options: [
            { id: "opt1", label: "Dave McCormick (R)", votes: 3399295, color: "#f85149" },
            { id: "opt2", label: "Bob Casey Jr. (D)", votes: 3384180, color: "#58a6ff" }
        ],
        region: "US",
        active: false
    },
    {
        id: 6,
        category: "Congressional District",
        title: "2024 US House - NY 14th District",
        description: "General election for the 14th Congressional District of New York.",
        options: [
            { id: "opt1", label: "Alexandria Ocasio-Cortez (D)", votes: 123269, color: "#58a6ff" },
            { id: "opt2", label: "Tina Forte (R)", votes: 55580, color: "#f85149" }
        ],
        region: "US",
        active: false
    },
    {
        id: 7,
        category: "General Election",
        title: "UK General Election 2024",
        description: "Vote for the next Prime Minister and governing party of the United Kingdom.",
        options: [
            { id: "opt1", label: "Labour Party", votes: 9731363, color: "#e4003b" },
            { id: "opt2", label: "Conservative Party", votes: 6814469, color: "#0087dc" },
            { id: "opt3", label: "Reform UK", votes: 4117610, color: "#12b6cf" },
            { id: "opt4", label: "Liberal Democrats", votes: 3519143, color: "#faa61a" }
        ],
        region: "UK",
        active: false
    },
    {
        id: 8,
        category: "Legislative Election",
        title: "French Legislative Election 2024 (Round 2)",
        description: "Snap legislative election to determine the composition of the French National Assembly.",
        options: [
            { id: "opt1", label: "New Popular Front (NFP)", votes: 7005500, color: "#e4003b" },
            { id: "opt2", label: "Ensemble (ENS)", votes: 6314000, color: "#faa61a" },
            { id: "opt3", label: "National Rally (RN)", votes: 8740000, color: "#00008b" }
        ],
        region: "France",
        active: false
    }
];

let currentPollId = 1;
let selectedOptionId = null;
let simulationInterval;
let isVerified = false;
let verifiedCountry = null; // Stores verified jurisdiction

// Initialize View
function init() {
    renderPollList();
    loadPollData(currentPollId);
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

function loadPollData(id) {
    const poll = polls.find(p => p.id === id);
    if (!poll) return;

    document.getElementById('current-poll-title').textContent = poll.title;
    
    // Calculate total layout
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);
    document.getElementById('stat-total').textContent = totalVotes.toLocaleString();
    
    // Inject dynamic Score block
    const scoreHtml = poll.options.map(opt => `<div style="color: ${opt.color}; padding-bottom: 3px; font-size: 0.95rem;">${opt.votes.toLocaleString()} <span style="color: var(--text-secondary);">${opt.label}</span></div>`);
    document.getElementById('stat-nodes').innerHTML = scoreHtml.join('');
    
    // Render Bars
    const barsContainer = document.getElementById('results-bars');
    barsContainer.innerHTML = '';
    
    poll.options.forEach(opt => {
        const pct = ((opt.votes / totalVotes) * 100).toFixed(1);
        const div = document.createElement('div');
        div.className = 'result-row';
        div.innerHTML = `
            <div class="result-label">
                <span>${opt.label}</span>
                <span class="result-pct">${pct}% (${opt.votes.toLocaleString()})</span>
            </div>
            <div class="bar-track">
                <div class="bar-fill" style="width: 0%; background: ${opt.color}"></div>
            </div>
        `;
        barsContainer.appendChild(div);
        
        // Animate in
        setTimeout(() => {
            div.querySelector('.bar-fill').style.width = `${pct}%`;
        }, 100);
    });
    
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

function selectIdMethod(method) {
    // Get the country select and VPN toggle
    const countrySelect = document.getElementById('user-country-select');
    const vpnToggle = document.getElementById('vpn-simulator-toggle');
    const warningEl = document.getElementById('ip-mismatch-warning');
    
    if (!countrySelect.value) {
        alert("Please select your legal jurisdiction before choosing a biometric vector.");
        return; // Halt flow
    }
    
    // Hide warning initially
    if (warningEl) {
        warningEl.classList.add('hidden');
    }

    document.getElementById('id-method-modal').classList.remove('active');
    
    const titleEl = document.getElementById('biometric-title');
    const descEl = document.getElementById('biometric-desc');
    const iconEl = document.getElementById('scanner-icon');
    
    iconEl.className = ''; // Reset classes
    
    if (method === 'face') {
        titleEl.textContent = 'Facial Authentication';
        descEl.textContent = 'Please position your face within the camera frame. AI will analyze your facial geometry to confirm your uniqueness and verify you haven\'t already registered.';
        iconEl.classList.add('fa-solid', 'fa-face-viewfinder', 'fingerprint-icon');
    } else if (method === 'fingerprint') {
        titleEl.textContent = 'Biometric Scan';
        descEl.textContent = 'Please place your finger on the sensor. AI will analyze minutiae points to confirm your identity and guarantee this is your first vote.';
        iconEl.classList.add('fa-solid', 'fa-fingerprint', 'fingerprint-icon');
    } else if (method === 'id_card') {
        titleEl.textContent = 'Document Verification';
        descEl.textContent = 'Please hold your State ID up to the camera. AI optical character recognition will extract data and cross-reference biometric markers to ensure you have not already voted.';
        iconEl.classList.add('fa-solid', 'fa-id-card', 'fingerprint-icon');
    }

    iconEl.innerHTML = '<div class="scan-line"></div>';

    document.getElementById('biometric-modal').classList.add('active');
    
    const scanner = document.getElementById('scanner');
    const status = document.getElementById('scan-status');
    const poll = polls.find(p => p.id === currentPollId);
    
    setTimeout(() => {
        scanner.classList.add('scanning');
        status.textContent = 'AI PROCESSING & ENUMERATING MATCHES...';
        status.style.color = 'var(--accent-glow)';
        
        // VPN Simulation Logic Validation
        if (vpnToggle.checked) {
            setTimeout(() => {
                scanner.className = 'scanner-container';
                scanner.classList.remove('scanning'); // reset animation
                
                status.textContent = 'VALIDATION FAILED';
                status.style.color = 'var(--accent-red)';
                
                if (warningEl) {
                    warningEl.classList.remove('hidden');
                }
                
                // Allow them to retry easily by not closing the modal completely, 
                // just show error. But prompt dictates "will not be able to vote until corrected (i.e. turn off VPN)".
                setTimeout(() => {
                    document.getElementById('biometric-modal').classList.remove('active');
                    startVerificationProcess(); // Push them back to the start menu so they can fix it
                    // The warning state will persist in the method-modal HTML now
                    const methodModalWarning = document.getElementById('ip-mismatch-warning-method');
                    if(methodModalWarning) methodModalWarning.classList.remove('hidden');
                }, 3000);
            }, 2500);
            return; // Break successful timeout tree
        }

        setTimeout(() => {
            scanner.className = 'scanner-container scan-success';
            status.textContent = 'UNIQUE IDENTITY VERIFIED. ONE-TIME TOKEN GENERATED.';
            status.style.color = 'var(--accent-green)';
            
            setTimeout(() => {
                isVerified = true;
                verifiedCountry = countrySelect.value;
                updateVerifiedUI();
                
                // Update Dashboard Region text and re-render pool list to apply jurisdiction filter
                const dashLabel = document.getElementById('dashboard-region-label');
                if (dashLabel && verifiedCountry) {
                    const selectEl = document.getElementById('user-country-select');
                    const countryText = selectEl.options[selectEl.selectedIndex].text;
                    dashLabel.innerHTML = `| ${countryText}`;
                }
                
                // Refresh list
                renderPollList();
                
                // Prioritize loading their local jurisdiction map instead of global default
                const jurisdictionPoll = polls.find(p => p.region === verifiedCountry);
                if (jurisdictionPoll) {
                    currentPollId = jurisdictionPoll.id;
                    renderPollList(); // re-render to set active class
                    loadPollData(currentPollId);
                } else {
                    const activePolls = document.querySelectorAll('.poll-card');
                    if (activePolls.length > 0) {
                        activePolls[0].click();
                    }
                }
                
                closeModals();
            }, 2500);
        }, 3000);
    }, 1000);
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

function submitVote() {
    if (!selectedOptionId) return;
    
    const submitBtn = document.getElementById('submit-vote-btn');
    const encryptStatus = document.getElementById('vote-encrypt-status');
    
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    encryptStatus.classList.remove('hidden');
    
    // Simulate blockchain submission
    setTimeout(() => {
        encryptStatus.innerHTML = '<i class="fa-solid fa-check"></i> TX BROADCAST TO NETWORK';
        
        // Add vote to local data
        const poll = polls.find(p => p.id === currentPollId);
        const opt = poll.options.find(o => o.id === selectedOptionId);
        opt.votes += 1;
        poll.hasVoted = true; // Mark as voted
        
        setTimeout(() => {
            closeModals();
            loadPollData(currentPollId); // refresh ui
            alert("Success! Your vote has been securely recorded on the ledger.");
        }, 1000);
    }, 2000);
}

// Start
document.addEventListener('DOMContentLoaded', init);
