// speech-metrics.js - Web Audio API & Speech Recognition core for Avatar Training

window.audioContext = null;
window.audioAnalyser = null;
window.micStream = null;
window.speechRec = null;

window.currentMetrics = {
    volume: 0,
    toneHz: 0,
    startTime: 0,
    wpm: 0,
    isListening: false
};

window.currentStep = 1;
window.teleprompterInterval = null;
window.targetText = "";

const phraseBank = [
    "The most effective leaders listen more than they speak.",
    "Executive presence is built on a foundation of deliberate stillness.",
    "Do not apologize for taking up space in the room.",
    "Your value is not determined by the volume of your words.",
    "The best path forward is option A. Here is exactly why."
];

const newsArticles = [
    "Global markets rallied sharply today following unexpected stabilization in traditional economic sectors. Analysts predict that this momentum could trigger significant institutional investment throughout the remainder of the fiscal quarter, signaling renewed confidence.",
    "The upcoming summit in Geneva will focus heavily on standardizing global supply chains. Key stakeholders from both the technology and manufacturing sectors are expected to announce a historic joint initiative that alters logistical paradigms for the next decade."
];

function setStep(stepNum) {
    if (window.currentMetrics.isListening) stopListening();
    
    window.currentStep = stepNum;
    
    // UI Tab highlighting
    document.querySelectorAll('.step-tab').forEach(t => t.style.background = 'transparent');
    const activeTab = document.getElementById(`tab-step-${stepNum}`);
    if (activeTab) activeTab.style.background = 'rgba(255, 255, 255, 0.1)';
    
    const resultBox = document.getElementById('assessment-result');
    const startBtn = document.getElementById('btn-assess-start');
    
    if (stepNum === 1) {
        if(resultBox) resultBox.innerHTML = `<strong>Step 1: Baseline Test.</strong><br>We will assess your raw, unguided pacing.<br><br>Hit start and read the phrase that appears.`;
        if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Baseline Assessment';
    } else if (stepNum === 2) {
        if(resultBox) resultBox.innerHTML = `<strong>Step 2: Echo Training.</strong><br>The Digital Sherpa will demonstrate the correct cadence. Listen carefully, then echo the phrase back.`;
        if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Demo & Record';
    } else if (stepNum === 3) {
        if(resultBox) resultBox.innerHTML = `<strong>Step 3: Teleprompter Run.</strong><br>A full statement will appear. Read aloud, syncing your voice exactly with the visual highlighter.`;
        if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Launch Teleprompter';
    }
}

function initSpeechSimulator() {
    if (window.currentMetrics.isListening) return;

    if (window.teleprompterInterval) {
        clearInterval(window.teleprompterInterval);
        window.teleprompterInterval = null;
    }

    const startBtn = document.getElementById('btn-assess-start');
    const resultBox = document.getElementById('assessment-result');
    
    // Reset HUD
    document.getElementById('metric-vol').style.width = '0%';
    document.getElementById('metric-tone').style.width = '0%';
    document.getElementById('metric-pace').style.width = '0%';

    // Step Logic
    if (window.currentStep === 1 || window.currentStep === 2) {
        window.targetText = phraseBank[Math.floor(Math.random() * phraseBank.length)];
    } else {
        window.targetText = newsArticles[Math.floor(Math.random() * newsArticles.length)];
    }

    if (window.currentStep === 2) {
        // Step 2 starts with Avatar demonstrating natively
        if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-volume-high fa-fade"></i> Avatar Demonstrating...';
        if(resultBox) resultBox.innerHTML = `Listen to the correct cadence:<br><br><strong style="color:var(--accent);font-size:1.2rem;">"${window.targetText}"</strong>`;
        
        triggerAvatarDemonstration(window.targetText, () => {
             // Start mic immediately after demo finishes
             activateMicrophone();
        });
    } else {
        activateMicrophone();
    }
}

function triggerAvatarDemonstration(text, callbackFn) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = 0.8; // Lower, richer executive tone
        utterance.rate = 0.85; // Measured pace
        
        function setVoiceAndSpeak() {
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = 
                voices.find(v => (v.lang.includes('en-GB') || v.lang.includes('en_GB')) && (v.name.includes('Female') || v.name.includes('Hazel') || v.name.includes('Sonia') || v.name.includes('Libby'))) ||
                voices.find(v => v.name.includes('UK English Female') || v.name.includes('Google UK English Female')) ||
                voices.find(v => v.lang.includes('en-GB') || v.lang.includes('en_GB')) ||
                voices.find(v => v.name.includes('Hazel') || v.name.includes('Serena')) ||
                voices.find(v => v.name.includes('Female')) || 
                voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            
            utterance.onstart = () => { setAiPulse(true); };
            utterance.onend = () => { 
                setAiPulse(false); 
                if (callbackFn) callbackFn();
            };
            window.speechSynthesis.speak(utterance);
        }

        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {
                setVoiceAndSpeak();
                window.speechSynthesis.onvoiceschanged = null;
            };
        } else {
            setVoiceAndSpeak();
        }
    } else {
        // Fallback natively if no TTS
        setTimeout(callbackFn, 2000);
    }
}

function activateMicrophone() {
    const startBtn = document.getElementById('btn-assess-start');
    const resultBox = document.getElementById('assessment-result');

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
            window.micStream = stream;
            window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            window.audioAnalyser = window.audioContext.createAnalyser();
            window.audioAnalyser.fftSize = 2048;
            const source = window.audioContext.createMediaStreamSource(stream);
            source.connect(window.audioAnalyser);

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                window.speechRec = new SpeechRecognition();
                window.speechRec.continuous = false;
                window.speechRec.interimResults = true;
                window.speechRec.lang = 'en-US';

                window.speechRec.onstart = () => {
                    window.currentMetrics.isListening = true;
                    window.currentMetrics.startTime = Date.now();
                    
                    if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-microphone-lines fa-fade"></i> Listening... Speak Now!';
                    
                    if (window.currentStep === 1 || window.currentStep === 2) {
                        if(resultBox) resultBox.innerHTML = `Please recite:<br><br><strong style="color:var(--accent);font-size:1.2rem;">"${window.targetText}"</strong>`;
                    } else if (window.currentStep === 3) {
                        renderTeleprompterUI(resultBox, window.targetText);
                        startTeleprompterLogic();
                    }
                    
                    requestAnimationFrame(updateTelemetryHUD);
                };

                window.speechRec.onresult = (event) => {
                    let transcript = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        transcript += event.results[i][0].transcript;
                    }
                    if(event.results[0].isFinal) {
                        finalizeAssessment(transcript);
                    }
                };

                window.speechRec.onerror = (e) => {
                    if (e.error !== 'no-speech') console.error(e);
                    stopListening();
                };

                window.speechRec.start();
            } else {
                if(resultBox) resultBox.innerHTML = "Speech API unvailable.";
            }
        })
        .catch(err => {
            console.error("Mic denied", err);
            if(resultBox) resultBox.innerHTML = "Microphone access denied.";
        });
}

function renderTeleprompterUI(container, text) {
    const words = text.split(" ");
    let html = `<div style="font-size:1.2rem; line-height: 1.8;">`;
    words.forEach((w, i) => {
        html += `<span id="tp-w-${i}" style="transition: color 0.2s, text-shadow 0.2s;">${w}</span> `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

function startTeleprompterLogic() {
    window.teleprompterIndex = 0;
    const words = window.targetText.split(" ");
    // Target pace: 120 WPM = 2 words per second = 500ms per word
    const MS_PER_WORD = 500; 

    window.teleprompterInterval = setInterval(() => {
        if (window.teleprompterIndex > 0) {
            const prev = document.getElementById(`tp-w-${window.teleprompterIndex - 1}`);
            if (prev) {
                prev.style.color = '#ccc';
                prev.style.fontWeight = 'normal';
                prev.style.textShadow = 'none';
            }
        }
        
        if (window.teleprompterIndex < words.length) {
            const current = document.getElementById(`tp-w-${window.teleprompterIndex}`);
            if (current) {
                current.style.color = 'var(--accent, #ff5500)';
                current.style.fontWeight = 'bold';
                current.style.textShadow = '0 0 8px var(--accent, #ff5500)';
            }
            window.teleprompterIndex++;
        } else {
            clearInterval(window.teleprompterInterval);
            // Auto finish after prompter ends if speech rec didn't automatically close
            setTimeout(() => {
                if (window.currentMetrics.isListening && window.speechRec) {
                    window.speechRec.stop();
                }
            }, 1500);
        }
    }, MS_PER_WORD);
}

function updateTelemetryHUD() {
    if (!window.currentMetrics.isListening || !window.audioAnalyser) return;

    const bufferLength = window.audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    window.audioAnalyser.getByteFrequencyData(dataArray);

    let squareSum = 0;
    let dominantFreqIndex = 0;
    let maxAmp = 0;

    for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxAmp) {
            maxAmp = dataArray[i];
            dominantFreqIndex = i;
        }
        let val = dataArray[i] / 255.0;
        squareSum += val * val;
    }
    
    let rms = Math.sqrt(squareSum / bufferLength);
    let volumePercent = Math.min(100, Math.floor(rms * 400)); 
    
    const sampleRate = window.audioContext.sampleRate;
    const toneHz = (dominantFreqIndex * sampleRate) / window.audioAnalyser.fftSize;

    let tonePercent = 50; 
    if (maxAmp > 20) { 
        if (toneHz > 350) tonePercent = 20; 
        else if (toneHz >= 80 && toneHz <= 220) tonePercent = 95; 
        else tonePercent = 60; 
        window.currentMetrics.toneHz = toneHz; 
    } else {
        tonePercent = 0;
    }
    
    window.currentMetrics.volume = volumePercent;
    document.getElementById('metric-vol').style.width = volumePercent + '%';
    document.getElementById('metric-tone').style.width = tonePercent + '%';
    
    window.isSpeaking = (maxAmp > 30);
    
    // Scale the voice orb natively
    const orb = document.getElementById('voice-orb');
    if (orb && window.isSpeaking && !window.aiIsSpeaking) {
        orb.classList.remove('idle-orb');
        const scaleVal = 1 + (maxAmp / 255.0) * 1.5;
        orb.style.transform = `scale(${scaleVal})`;
    } else if (orb && !window.isSpeaking && !window.aiIsSpeaking) {
        orb.classList.add('idle-orb');
        orb.style.transform = '';
    }

    requestAnimationFrame(updateTelemetryHUD);
}

function stopListening() {
    window.currentMetrics.isListening = false;
    window.isSpeaking = false;
    if (window.speechRec) window.speechRec.stop();
    if (window.micStream) {
        window.micStream.getTracks().forEach(track => track.stop());
    }
    if (window.audioContext) {
        window.audioContext.close();
    }
    if (window.teleprompterInterval) {
        clearInterval(window.teleprompterInterval);
    }
    const startBtn = document.getElementById('btn-assess-start');
    if(startBtn) startBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Retry Run';
}

function finalizeAssessment(spokenText) {
    stopListening();
    
    const durationSeconds = (Date.now() - window.currentMetrics.startTime) / 1000;
    // Base it on the generated targetText length to prevent mic noise bugs skewing WPM
    const wordCount = window.targetText.split(' ').length;
    window.currentMetrics.wpm = Math.floor((wordCount / durationSeconds) * 60);

    let paceScore = 0;
    if (window.currentMetrics.wpm < 90) paceScore = 50; 
    else if (window.currentMetrics.wpm >= 110 && window.currentMetrics.wpm <= 135) paceScore = 95; 
    else if (window.currentMetrics.wpm > 135) paceScore = 30; 
    
    document.getElementById('metric-pace').style.width = paceScore + '%';

    // Dynamic Critical Feedback Matrix
    let feedback = "";
    
    let speedOffset = Math.abs(window.currentMetrics.wpm - 120);
    let speedPercent = Math.floor((speedOffset / 120) * 100);
    
    if (window.currentMetrics.wpm < 90) {
        feedback += `Your pacing was ${window.currentMetrics.wpm} words per minute. That is ${speedPercent} percent too slow. Pick up the tempo to hold engagement. `;
    } else if (window.currentMetrics.wpm > 135) {
        feedback += `Your pacing was ${window.currentMetrics.wpm} words per minute. That is ${speedPercent} percent too fast. Rushing projects anxiety. `;
    } else {
        feedback += "Outstanding pacing. You hit the perfect executive cadence. ";
    }

    if (window.currentMetrics.volume < 20) {
        feedback += "However, your projection is slightly weak. Speak louder from the diaphragm. ";
    } else if (window.currentMetrics.toneHz > 300) {
        feedback += "Your tone was slightly elevated. Ground your voice deeper into your chest to project authority.";
    }

    const resultBox = document.getElementById('assessment-result');
    if(resultBox) {
        resultBox.innerHTML = `
            <strong>Assessment Yield</strong><br>
            Target Pace: 120 WPM<br>
            Your Pace: ${window.currentMetrics.wpm} WPM<br>
            Avg Pitch: ${Math.floor(window.currentMetrics.toneHz || 0)} Hz<br>
            <br>
            <span style="color:var(--accent)"><strong>Avatar Feedback:</strong> "${feedback}"</span>
        `;
    }

    triggerAvatarFeedback(feedback);
}

let aiPulseInterval = null;
window.aiIsSpeaking = false;

function setAiPulse(speaking) {
    window.aiIsSpeaking = speaking;
    const orb = document.getElementById('voice-orb');
    if (!orb) return;
    
    if (speaking) {
        orb.classList.remove('idle-orb');
        let growing = true;
        // Fake dynamic waveform pulsing when the synthetic engine speaks
        aiPulseInterval = setInterval(() => {
            const scaleVal = growing ? 1.25 : 1.05;
            orb.style.transform = `scale(${scaleVal})`;
            growing = !growing;
        }, 150);
    } else {
        if(aiPulseInterval) clearInterval(aiPulseInterval);
        orb.classList.add('idle-orb');
        orb.style.transform = '';
    }
}

function triggerAvatarFeedback(speechString) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(speechString);
        utterance.pitch = 0.8; 
        utterance.rate = 0.85; 
        
        function setVoiceAndSpeak() {
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = 
                voices.find(v => (v.lang.includes('en-GB') || v.lang.includes('en_GB')) && (v.name.includes('Female') || v.name.includes('Hazel') || v.name.includes('Sonia') || v.name.includes('Libby'))) ||
                voices.find(v => v.name.includes('UK English Female') || v.name.includes('Google UK English Female')) ||
                voices.find(v => v.lang.includes('en-GB') || v.lang.includes('en_GB')) ||
                voices.find(v => v.name.includes('Hazel') || v.name.includes('Serena')) ||
                voices.find(v => v.name.includes('Female')) || 
                voices[0];
            if (preferredVoice) utterance.voice = preferredVoice;
            
            utterance.onstart = () => { setAiPulse(true); };
            utterance.onend = () => { setAiPulse(false); };
            
            window.speechSynthesis.speak(utterance);
        }

        if (window.speechSynthesis.getVoices().length === 0) {
            window.speechSynthesis.onvoiceschanged = () => {
                setVoiceAndSpeak();
                window.speechSynthesis.onvoiceschanged = null;
            };
        } else {
            setVoiceAndSpeak();
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if(typeof setStep === 'function') setStep(1);
    }, 500); 
});
