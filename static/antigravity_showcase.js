document.addEventListener('DOMContentLoaded', () => {
    let voiceEnabled = false;
    let sherpaVoice = null;
    const synth = window.speechSynthesis;
    const voiceBtn = document.getElementById('voice-guide-btn');

    // Attempt to load voices and find a British female voice
    function loadVoices() {
        const voices = synth.getVoices();
        sherpaVoice = voices.find(v => v.name.includes('Google UK English Female')) || 
                      voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) ||
                      voices.find(v => v.lang === 'en-GB');
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices();

    const fakeCursor = document.createElement('div');
    fakeCursor.className = 'fake-cursor';
    document.body.appendChild(fakeCursor);

    function speakAndWait(text, onEndCallback) {
        if (!text) return;
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (sherpaVoice) {
            utterance.voice = sherpaVoice;
        } else {
            utterance.lang = 'en-GB';
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        
        utterance.onend = () => {
            if (onEndCallback) setTimeout(onEndCallback, 600);
        };
        
        synth.speak(utterance);
    }

    const describeElements = [
        { el: document.querySelector('.hero-section'), text: 'Welcome to the Antigravity Showcase. I am an autonomous AI system designed to handle complex engineering directly within your environment.' },
        { el: document.getElementById('card-engineering'), text: 'Autonomous Engineering. I can write complex front-end and back-end code from scratch, entirely autonomously.' },
        { el: document.getElementById('card-browser'), text: 'Agentic Browser Automation. I can spin up sub-agents to interact with web interfaces and record the sessions, as seen in the embedded video.' },
        { el: document.getElementById('card-sysadmin'), text: 'System Administration. I can run terminal commands to resolve linux dependencies and configure your system.' },
        { el: document.getElementById('card-assets'), text: 'Generative AI Assets. I can generate high-resolution custom graphics tailored to your specific project needs.' }
    ];

    function runAutomatedTour() {
        voiceEnabled = true;
        voiceBtn.textContent = '⏹️ Stop Demo';
        voiceBtn.style.background = 'rgba(239, 68, 68, 0.1)';
        voiceBtn.style.borderColor = '#ef4444';
        voiceBtn.style.color = '#ef4444';
        
        fakeCursor.style.transform = `translate(${window.innerWidth / 2}px, -50px)`;
        fakeCursor.classList.add('visible');

        let step = 0;

        function nextStep() {
            if (step >= describeElements.length || !voiceEnabled) {
                // End of tour
                fakeCursor.classList.remove('visible');
                voiceEnabled = false;
                voiceBtn.textContent = '▶️ Run Demo';
                voiceBtn.style.background = '';
                voiceBtn.style.borderColor = '';
                voiceBtn.style.color = '';
                return;
            }

            const current = describeElements[step];
            if (current.el) {
                const rect = current.el.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                // Smooth scroll into view if needed
                if (y > window.innerHeight - 100 || y < 100) {
                    window.scrollBy({ top: rect.top - 100, behavior: 'smooth' });
                }

                // Adjust cursor to scroll offset
                setTimeout(() => {
                    const finalY = current.el.getBoundingClientRect().top + rect.height / 2;
                    fakeCursor.style.transform = `translate(${x}px, ${finalY}px)`;
                    
                    setTimeout(() => {
                        if (!voiceEnabled) return;
                        current.el.classList.add('simulated-hover');
                        
                        speakAndWait(current.text, () => {
                            current.el.classList.remove('simulated-hover');
                            step++;
                            nextStep();
                        });
                    }, 1000);
                }, 500);
            } else {
                step++;
                nextStep();
            }
        }

        speakAndWait("Initiating Antigravity Capabilities Tour.", () => {
            nextStep();
        });
    }

    voiceBtn.addEventListener('click', () => {
        if (voiceEnabled) {
            // Cancel
            voiceEnabled = false;
            voiceBtn.textContent = '▶️ Run Demo';
            voiceBtn.style.background = '';
            voiceBtn.style.borderColor = '';
            voiceBtn.style.color = '';
            synth.cancel();
            fakeCursor.classList.remove('visible');
            document.querySelectorAll('.simulated-hover').forEach(el => el.classList.remove('simulated-hover'));
        } else {
            runAutomatedTour();
        }
    });

    // Hover descriptions
    describeElements.forEach(item => {
        if(item.el) {
            item.el.addEventListener('mouseenter', () => {
                if(!voiceEnabled && item.el !== document.querySelector('.hero-section')) {
                    // Quick manual speak
                    synth.cancel();
                    const utterance = new SpeechSynthesisUtterance(item.text);
                    if(sherpaVoice) utterance.voice = sherpaVoice;
                    else utterance.lang = 'en-GB';
                    utterance.rate = 1.0; utterance.pitch = 1.1;
                    synth.speak(utterance);
                }
            });
            item.el.addEventListener('mouseleave', () => {
                if(!voiceEnabled) synth.cancel();
            });
        }
    });
});
