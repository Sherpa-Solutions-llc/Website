/**
 * Voice Sherpa - JS Logic
 * Handles STT, API communication, and TTS.
 */

const mountainBtn = document.getElementById('mountain-btn');
const statusBadge = document.getElementById('status');
const userTranscript = document.getElementById('user-transcript');
const agentText = document.getElementById('agent-text');
const audioToggle = document.getElementById('toggle-audio');
const demoBtn = document.getElementById('demo-btn');
const volumeSlider = document.getElementById('volume-slider');
const bars = document.querySelectorAll('.bar');

// Settings Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.querySelector('.close-modal');
const saveSettingsBtn = document.getElementById('save-settings');
const voiceSelect = document.getElementById('voice-select');
const rateInput = document.getElementById('rate-input');
const rateVal = document.getElementById('rate-val');
const pitchInput = document.getElementById('pitch-input');
const pitchVal = document.getElementById('pitch-val');
const apiUrlInput = document.getElementById('api-url-input');
const uiPasskeyInput = document.getElementById('ui-passkey-input');
const modePtt = document.getElementById('mode-ptt');
const modeTel = document.getElementById('mode-tel');

const visualModeMountain = document.getElementById('visual-mode-mountain');
const visualModeAvatar = document.getElementById('visual-mode-avatar');
const avatarBtn = document.getElementById('avatar-btn');

const SHERPA_PASSKEY = localStorage.getItem('sherpa_ui_passkey') || '8909';

// Live Internet Security Guard (Enforced on page load)
const isLive = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
if (isLive) {
    const currentPasskey = localStorage.getItem('sherpa_ui_passkey');
    if (currentPasskey !== '8909') {
        const entered = prompt("Sherpa Solutions Security: Please enter your interface passkey to proceed (Default: 8909):");
        if (entered === '8909') {
            localStorage.setItem('sherpa_ui_passkey', '8909');
        } else {
            document.body.innerHTML = '<div style="text-align: center; margin-top: 50px; font-family: sans-serif; color: white;"><h2>Access Denied</h2><p>Please reload and enter the correct passkey.</p></div>';
            throw new Error("Access Denied. Passkey missing or incorrect.");
        }
    }
}

// Persistent Settings
let config = {
    apiUrl: localStorage.getItem('hermes_api_url') || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (window.location.origin + '/v1') : 'https://sherpa-solutions-api-production.up.railway.app/v1'),
    voiceName: localStorage.getItem('hermes_voice_name') || '',
    rate: parseFloat(localStorage.getItem('hermes_speech_rate')) || 1.0,
    pitch: parseFloat(localStorage.getItem('hermes_speech_pitch')) || 1.0,
    volume: parseFloat(localStorage.getItem('hermes_speech_volume')) || 1.0,
    interactionMode: localStorage.getItem('hermes_interaction_mode') || 'ptt',
    visualMode: localStorage.getItem('hermes_visual_mode') || 'mountain'
};

let isListening = false;
let isSpeaking = false;
let audioEnabled = true;
let currentVolume = config.volume;
let recognition = null;

let synthesis = window.speechSynthesis;
let currentUtterance = null;

// Initialize Speech Recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        mountainBtn.classList.add('listening');
        avatarBtn.classList.add('listening');
        statusBadge.textContent = 'Listening...';
        userTranscript.textContent = 'Listening for your command...';
        startVisualizer();
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        userTranscript.textContent = finalTranscript || interimTranscript;

        if (finalTranscript) {
            processCommand(finalTranscript);
        }
    };

    recognition.onerror = (event) => {
        console.error('Recognition error:', event.error);
        stopListening();
        
        if (event.error === 'no-speech') {
            statusBadge.textContent = 'I didn\'t hear anything.';
            userTranscript.textContent = 'Try speaking again...';
        } else if (event.error === 'not-allowed') {
            statusBadge.textContent = 'Microphone access denied.';
            userTranscript.textContent = 'Please enable microphone permissions in your browser settings.';
        } else if (event.error === 'audio-capture') {
            statusBadge.textContent = 'No microphone found.';
        } else {
            statusBadge.textContent = 'Error: ' + event.error;
        }

        if (config.interactionMode === 'tel' && event.error !== 'no-speech') {
            setTimeout(startListening, 1000);
        } else if (config.interactionMode === 'tel') {
             setTimeout(startListening, 200);
        }
    };

    recognition.onend = () => {
        isListening = false;
        mountainBtn.classList.remove('listening');
        avatarBtn.classList.remove('listening');
        if (!isSpeaking && !isListening) {
            stopVisualizer();
            statusBadge.textContent = 'Standby';
            if (config.interactionMode === 'tel' && !isSpeaking) {
                setTimeout(startListening, 500);
            }
        }
    };
}

volumeSlider.value = config.volume;
if (config.interactionMode === 'tel') setTimeout(startListening, 1500);

// Settings Logic
function populateVoices() {
    const voices = synthesis.getVoices();
    voiceSelect.innerHTML = voices
        .map(v => `<option value="${v.name}" ${v.name === config.voiceName ? 'selected' : ''}>${v.name} (${v.lang})</option>`)
        .join('');
}

if (synthesis.onvoiceschanged !== undefined) {
    synthesis.onvoiceschanged = populateVoices;
}
populateVoices();

settingsBtn.addEventListener('click', () => {
    apiUrlInput.value = config.apiUrl;
    rateInput.value = config.rate;
    rateVal.textContent = config.rate;
    pitchInput.value = config.pitch;
    pitchVal.textContent = config.pitch;
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    if (config.interactionMode === 'ptt') modePtt.classList.add('active');
    else modeTel.classList.add('active');

    populateVoices();
    settingsModal.style.display = 'block';
});

modePtt.onclick = () => { modePtt.classList.add('active'); modeTel.classList.remove('active'); };
modeTel.onclick = () => { modeTel.classList.add('active'); modePtt.classList.remove('active'); };

closeModal.onclick = () => settingsModal.style.display = 'none';
window.onclick = (e) => { if (e.target == settingsModal) settingsModal.style.display = 'none'; };

visualModeMountain.onclick = () => { 
    visualModeMountain.classList.add('active'); 
    visualModeAvatar.classList.remove('active'); 
};
visualModeAvatar.onclick = () => { 
    visualModeAvatar.classList.add('active'); 
    visualModeMountain.classList.remove('active'); 
};

rateInput.oninput = () => rateVal.textContent = rateInput.value;
pitchInput.oninput = () => pitchVal.textContent = pitchInput.value;

saveSettingsBtn.addEventListener('click', () => {
    config.apiUrl = apiUrlInput.value;
    config.voiceName = voiceSelect.value;
    config.rate = parseFloat(rateInput.value);
    config.pitch = parseFloat(pitchInput.value);
    config.interactionMode = modePtt.classList.contains('active') ? 'ptt' : 'tel';
    config.visualMode = visualModeMountain.classList.contains('active') ? 'mountain' : 'avatar';

    if (uiPasskeyInput.value) {
        localStorage.setItem('sherpa_ui_passkey', uiPasskeyInput.value);
    }

    localStorage.setItem('hermes_api_url', config.apiUrl);
    localStorage.setItem('hermes_voice_name', config.voiceName);
    localStorage.setItem('hermes_speech_rate', config.rate);
    localStorage.setItem('hermes_speech_pitch', config.pitch);
    localStorage.setItem('hermes_interaction_mode', config.interactionMode);
    localStorage.setItem('hermes_visual_mode', config.visualMode);

    applyVisualMode();
window.speechSynthesis.onvoiceschanged = () => { applyVisualMode(); };
    settingsModal.style.display = 'none';
    statusBadge.textContent = 'Calibrated';
    if (config.interactionMode === 'tel') startListening();
    else stopListening();
    setTimeout(() => statusBadge.textContent = 'Standby', 2000);
});

// Demo Button
demoBtn.addEventListener('click', () => {
    const demoText = "Welcome to the Sherpa Solutions Voice Interface. I am your specialized enterprise agent, ready to assist with your strategic ascent. How can I help you today?";
    userTranscript.textContent = "Requesting Demo Intro...";
    agentText.textContent = demoText;
    speak(demoText);
});

// Volume Control
volumeSlider.oninput = (e) => {
    currentVolume = parseFloat(e.target.value);
    config.volume = currentVolume;
    localStorage.setItem('hermes_speech_volume', currentVolume);
    if (currentUtterance) {
        // Unfortunately, you can't change volume mid-speech in Web Speech API reliably
        // but it will take effect on the next utterance.
    }
};

// Main Logic
mountainBtn.addEventListener('click', () => {
    handleInteraction();
});

avatarBtn.addEventListener('click', () => {
    handleInteraction();
});

function handleInteraction() {
    if (isListening) stopListening();
    else {
        if (isSpeaking) { synthesis.cancel(); isSpeaking = false; }
        startListening();
    }
}

audioToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    audioToggle.innerHTML = audioEnabled ? '<i class="fa-solid fa-volume-high"></i> Audio On' : '<i class="fa-solid fa-volume-xmark"></i> Audio Off';
    if (!audioEnabled) synthesis.cancel();
});

function startListening() {
    if (isListening) return;
    try { recognition.start(); } catch (e) {}
}

function stopListening() {
    isListening = false;
    try { recognition.stop(); } catch (e) {}
    mountainBtn.classList.remove('listening');
    statusBadge.textContent = 'Standby';
    stopVisualizer();
}

async function processCommand(text) {
    stopListening();
    statusBadge.textContent = 'Thinking...';
    mountainBtn.classList.add('thinking');
    avatarBtn.classList.add('thinking');
    agentText.textContent = '';

    try {
        const response = await fetch(`${config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer sk-hermes` },
            body: JSON.stringify({ model: 'hermes-agent', messages: [{ role: 'user', content: text }], stream: false })
        });
        const data = await response.json();
        const reply = data.choices[0].message.content;
        mountainBtn.classList.remove('thinking');
        avatarBtn.classList.remove('thinking');
        agentText.textContent = reply;
        statusBadge.textContent = 'Speaking...';
        if (audioEnabled) speak(reply);
        else {
            statusBadge.textContent = 'Standby';
            if (config.interactionMode === 'tel') startListening();
        }
    } catch (error) {
        statusBadge.textContent = 'API Error';
        mountainBtn.classList.remove('thinking');
        agentText.textContent = "I couldn't reach the basecamp server.";
        if (config.interactionMode === 'tel') setTimeout(startListening, 3000);
    }
}

function speak(text) {
    isSpeaking = true;
    currentUtterance = new SpeechSynthesisUtterance(text);
    const voices = synthesis.getVoices();
    const selectedVoice = voices.find(v => v.name === config.voiceName);
    if (selectedVoice) currentUtterance.voice = selectedVoice;
    currentUtterance.rate = config.rate;
    currentUtterance.pitch = config.pitch;
    currentUtterance.volume = currentVolume;

    currentUtterance.onerror = (e) => {
        console.error('Speech error:', e);
        isSpeaking = false;
        statusBadge.textContent = 'Standby';
    };

    currentUtterance.onend = () => {
        isSpeaking = false;
        statusBadge.textContent = 'Standby';
        if (config.interactionMode === 'tel') setTimeout(startListening, 500);
    };
    synthesis.speak(currentUtterance);
}

// Visualizer
let visualizerInterval = null;
function startVisualizer() {
    if (visualizerInterval) return;
    visualizerInterval = setInterval(() => {
        bars.forEach(bar => { bar.style.height = (Math.random() * 30 + 10) + 'px'; });
    }, 100);
}
function stopVisualizer() {
    clearInterval(visualizerInterval);
    visualizerInterval = null;
    bars.forEach(bar => { bar.style.height = '8px'; });
}

function getAvatarImage() {
    const voices = synthesis.getVoices();
    const voiceName = config.voiceName || localStorage.getItem('hermes_voice_name');
    
    if (voiceName) {
        const name = voiceName.toLowerCase();
        
        // Check for female FIRST because the string 'female' contains 'male'
        if (name.includes('female') || 
            name.includes('samantha') || 
            name.includes('victoria') || 
            name.includes('claire') ||
            name.includes('monica') ||
            name.includes('alice')) {
            return '/static/realistic_female_sherpa.png';
        }

        // Explicitly check for male keywords
        if (name.includes('male') || 
            name.includes('david') || 
            name.includes('mark') || 
            name.includes('george') || 
            name.includes('paul')) {
            return '/static/realistic_sherpa.png';
        }
    }

    // Default to female avatar (matches default voice)
    return '/static/realistic_female_sherpa.png';
}

function applyVisualMode() {
    if (config.visualMode === 'avatar') {
        mountainBtn.style.display = 'none';
        avatarBtn.style.display = 'block';
        
        // Dynamic gender selection
        const img = avatarBtn.querySelector('img');
        if (img) {
            const targetSrc = getAvatarImage();
            if (img.getAttribute('src') !== targetSrc) {
                img.src = targetSrc;
            }
        }

        visualModeAvatar.classList.add('active');
        visualModeMountain.classList.remove('active');
    } else {
        mountainBtn.style.display = 'block';
        avatarBtn.style.display = 'none';
        visualModeMountain.classList.add('active');
        visualModeAvatar.classList.remove('active');
    }
}

// Lip Sync Animation Loop
function updateAvatarLipSync() {
    if (synthesis.speaking && config.visualMode === 'avatar') {
        avatarBtn.classList.add('talking');
    } else {
        avatarBtn.classList.remove('talking');
    }
    requestAnimationFrame(updateAvatarLipSync);
}

// Initial initialization
applyVisualMode();
window.speechSynthesis.onvoiceschanged = () => { applyVisualMode(); };
updateAvatarLipSync();

// Auto-scroll transcript container
const transcriptContainer = document.querySelector('.transcript-container');
if (transcriptContainer) {
    const observer = new MutationObserver(() => {
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    });
    observer.observe(transcriptContainer, { childList: true, subtree: true, characterData: true });
}


