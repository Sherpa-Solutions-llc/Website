import codecs

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with codecs.open(filepath, 'r', 'utf-8') as f:
    html = f.read()

# 1. Add ID to partnership path so we can animate on it
if '<path d="M100,550 L400,100" stroke="var(--accent)" stroke-width="8" stroke-dasharray="10,10" fill="none"\n                    filter="url(#glow)" />' in html:
    html = html.replace('<path d="M100,550 L400,100" stroke="var(--accent)" stroke-width="8" stroke-dasharray="10,10" fill="none"\n                    filter="url(#glow)" />', 
                        '<path id="partnership-path" d="M100,550 L400,100" stroke="var(--accent)" stroke-width="8" stroke-dasharray="10,10" fill="none"\n                    filter="url(#glow)" />')
else:
    # try single line replace
    html = html.replace('<path d="M100,550 L400,100" stroke="var(--accent)"', '<path id="partnership-path" d="M100,550 L400,100" stroke="var(--accent)"')


old_script_start = html.find('        // Multi-Sherpa Convoy Animation Logic')
if old_script_start == -1:
     old_script_start = html.find('        // Multi-Sherpa Follower Animation Logic')
     
old_script_end = html.find('    </script>', old_script_start)

if old_script_start != -1 and old_script_end != -1:
    new_script = """        // Advanced Convoy Animation Logic
        document.addEventListener("DOMContentLoaded", () => {
            const tsPath = document.getElementById('ts-path');
            const ppPath = document.getElementById('partnership-path');
            const container = document.getElementById('followers-container');
            if (!tsPath || !ppPath || !container) return;

            const tsLength = tsPath.getTotalLength();
            const ppLength = ppPath.getTotalLength();
            
            // Pausing logic: traditional nodes are at specific fractions
            const tsFractions = [0.13, 0.26, 0.41, 0.55, 0.70, 0.85];
            
            const sherpaIcons = ["fa-person-hiking"];
            const peopleIcons = ["fa-person-walking", "fa-person-walking-with-cane", "fa-person", "fa-person-dress"];
            
            const sherpaColors = ["var(--accent)"];
            const peopleColors = ["#4a5c4a", "#5a6d5a", "var(--primary)", "#6b8a6b"];

            function spawnIndividual(isSherpa, delayMs, pathChoice, convoySpeed, convoyPauses) {
                setTimeout(() => {
                    const follower = document.createElement("div");
                    follower.className = "walking-sherpa";
                    
                    const iconList = isSherpa ? sherpaIcons : peopleIcons;
                    const colorList = isSherpa ? sherpaColors : peopleColors;
                    
                    const iconClass = iconList[Math.floor(Math.random() * iconList.length)];
                    const color = colorList[Math.floor(Math.random() * colorList.length)];
                    
                    follower.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                    follower.style.color = color;
                    
                    const scale = isSherpa ? 1.0 : (0.7 + Math.random() * 0.2);
                    
                    container.appendChild(follower);

                    let progress = 0; // 0 to 1
                    const duration = convoySpeed; 
                    let lastTime = performance.now();
                    
                    const targetPath = pathChoice === 'ts' ? tsPath : ppPath;
                    const totalLength = pathChoice === 'ts' ? tsLength : ppLength;
                    
                    let isPaused = false;
                    let pauseTimeRemaining = 0;

                    function animate(time) {
                        const dt = time - lastTime;
                        lastTime = time;
                        
                        if (isPaused) {
                            pauseTimeRemaining -= dt;
                            if (pauseTimeRemaining <= 0) {
                                isPaused = false;
                            }
                        } else {
                            const oldProgress = progress;
                            progress += dt / duration;
                            
                            // Check for pauses (only on traditional path for convoys that chose to pause)
                            if (pathChoice === 'ts' && convoyPauses) {
                                for (let frac of tsFractions) {
                                    if (oldProgress < frac && progress >= frac) {
                                        // Randomly pause 30% of the time at a node
                                        if (Math.random() < 0.3) {
                                            isPaused = true;
                                            pauseTimeRemaining = 2000 + Math.random() * 2000; // pause for 2-4 seconds
                                            progress = frac; // snap to node
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (progress >= 1) {
                            follower.remove();
                            return; 
                        }

                        const pt = targetPath.getPointAtLength(progress * totalLength);
                        
                        const xPct = (pt.x / 1000) * 100;
                        const yPct = (pt.y / 600) * 100;
                        
                        let flip = 1;
                        if (progress < 0.99) {
                            const nextPt = targetPath.getPointAtLength((progress + 0.01) * totalLength);
                            // Partnership path goes left-to-right (100 to 400), so flip=1 is correct.
                            if (nextPt.x < pt.x) {
                                flip = -1;
                            }
                        }

                        follower.style.left = `${xPct}%`;
                        follower.style.top = `${yPct}%`;
                        follower.style.transform = `translate(-50%, -100%) scaleX(${flip}) scale(${scale})`;

                        const bounce = isPaused ? 0 : Math.abs(Math.sin(time / 150)) * 5; 
                        follower.style.marginTop = `-${bounce}px`;

                        requestAnimationFrame(animate);
                    }

                    requestAnimationFrame(animate);
                }, delayMs);
            }

            function spawnConvoy() {
                // Determine path: 30% chance for Partnership Path, 70% for Traditional Services
                const pathChoice = Math.random() < 0.3 ? 'pp' : 'ts';
                
                // Base speed for the convoy (15 to 25 seconds)
                const convoySpeed = 15000 + Math.random() * 10000;
                
                // Determine if this convoy will have pauses (only applies to TS path)
                const convoyPauses = true;
                
                // Spawn 1 Sherpa
                spawnIndividual(true, 0, pathChoice, convoySpeed, convoyPauses);
                
                // Spawn 1 to 3 followers VERY tightly packed behind the Sherpa
                const numFollowers = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numFollowers; i++) {
                    // Tighter spacing: 300ms gap instead of 700ms
                    spawnIndividual(false, (i + 1) * 300 + Math.random() * 100, pathChoice, convoySpeed, convoyPauses);
                }
            }

            // Spawn initial convoys
            spawnConvoy();
            setTimeout(spawnConvoy, 4000);

            // Continuously spawn new convoys
            setInterval(() => {
                spawnConvoy();
            }, 8000 + Math.random() * 4000);
        });
"""
    html = html[:old_script_start] + new_script + html[old_script_end:]
    with codecs.open(filepath, 'w', 'utf-8') as f:
        f.write(html)
    print("Successfully patched advanced convoy animation script into services.html")
else:
    print("Could not find the script block in HTML to replace.")
