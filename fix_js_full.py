import codecs

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with codecs.open(filepath, 'r', 'utf-8') as f:
    html = f.read()

# We need to find script tags. The animation script starts with '        // Refined Convoy Animation Logic'
start_idx = html.find('        // Refined Convoy Animation Logic')
if start_idx == -1:
    print("Could not find script start.")
    exit(1)

# Find the end of this script block
end_idx = html.find('    </script>', start_idx)

new_script = """        // Refined Convoy Animation Logic
        document.addEventListener("DOMContentLoaded", () => {
            const tsPath = document.getElementById('ts-path');
            const ppPath = document.getElementById('partnership-path');
            const container = document.getElementById('followers-container');
            if (!tsPath || !ppPath || !container) return;

            const tsLength = tsPath.getTotalLength();
            const ppLength = ppPath.getTotalLength();
            
            // Nodes mapped to their approximate path fractions
            const tsNodes = [
                { frac: 0.13, el: document.querySelectorAll('.ts-node')[1] }, // Competitor Analysis
                { frac: 0.26, el: document.querySelectorAll('.ts-node')[2] }, // Operational Review
                { frac: 0.41, el: document.querySelectorAll('.ts-node')[3] }, // Quality Assessment
                { frac: 0.55, el: document.querySelectorAll('.ts-node')[4] }, // Marketing Strategy
                { frac: 0.70, el: document.querySelectorAll('.ts-node')[5] }, // Leadership Coaching
                { frac: 0.85, el: document.querySelectorAll('.ts-node')[6] }, // AI Integration
                { frac: 0.95, el: document.querySelectorAll('.ts-node')[7] }  // Strategy Development
            ];
            
            const sherpaIcons = ["fa-person-hiking"];
            const peopleIcons = ["fa-person-walking", "fa-person-walking-with-cane", "fa-person", "fa-person-dress"];
            
            const sherpaColors = ["var(--accent)"];
            const peopleColors = ["#4a5c4a", "#5a6d5a", "var(--primary)", "#6b8a6b"];

            function spawnConvoy() {
                const pathChoice = Math.random() < 0.3 ? 'pp' : 'ts';
                const convoySpeed = 15000 + Math.random() * 10000;
                const convoyPauses = true;
                
                const targetPath = pathChoice === 'ts' ? tsPath : ppPath;
                const totalLength = pathChoice === 'ts' ? tsLength : ppLength;
                
                // Unified convoy state
                const convoy = {
                    progress: 0,
                    isPaused: false,
                    pauseTimeRemaining: 0,
                    members: []
                };
                
                // Helper to create a member
                function createMember(isSherpa, delayOffset) {
                    const follower = document.createElement("div");
                    follower.className = "walking-sherpa";
                    
                    const iconList = isSherpa ? sherpaIcons : peopleIcons;
                    const colorList = isSherpa ? sherpaColors : peopleColors;
                    
                    const iconClass = iconList[Math.floor(Math.random() * iconList.length)];
                    const color = colorList[Math.floor(Math.random() * colorList.length)];
                    
                    follower.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                    follower.style.color = color;
                    follower.style.zIndex = isSherpa ? "20" : "15";
                    
                    const scale = isSherpa ? 1.0 : (0.7 + Math.random() * 0.2);
                    
                    container.appendChild(follower);
                    
                    convoy.members.push({
                        el: follower,
                        offsetProgress: delayOffset / convoySpeed,
                        scale: scale
                    });
                }
                
                createMember(true, 0);
                
                const numFollowers = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numFollowers; i++) {
                    createMember(false, (i + 1) * 200 + Math.random() * 100);
                }

                let lastTime = performance.now();
                let activeNodeTooltip = null;

                function animateConvoy(time) {
                    const dt = time - lastTime;
                    lastTime = time;
                    
                    if (convoy.isPaused) {
                        convoy.pauseTimeRemaining -= dt;
                        if (convoy.pauseTimeRemaining <= 0) {
                            convoy.isPaused = false;
                            if (activeNodeTooltip) {
                                activeNodeTooltip.style.visibility = '';
                                activeNodeTooltip.style.opacity = '';
                                activeNodeTooltip.style.zIndex = '';
                                activeNodeTooltip = null;
                            }
                        }
                    } else {
                        const oldProgress = convoy.progress;
                        convoy.progress += dt / convoySpeed;
                        
                        if (pathChoice === 'ts' && convoyPauses) {
                            for (let nodeObj of tsNodes) {
                                if (oldProgress < nodeObj.frac && convoy.progress >= nodeObj.frac) {
                                    if (Math.random() < 0.4) {
                                        convoy.isPaused = true;
                                        convoy.pauseTimeRemaining = 2500 + Math.random() * 1500;
                                        convoy.progress = nodeObj.frac;
                                        
                                        if (nodeObj.el) {
                                            const tooltip = nodeObj.el.querySelector('.node-tooltip');
                                            if (tooltip) {
                                                activeNodeTooltip = tooltip;
                                                tooltip.style.visibility = 'visible';
                                                tooltip.style.opacity = '1';
                                                tooltip.style.zIndex = '100';
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    let allFinished = true;
                    
                    for (let member of convoy.members) {
                        let memberProgress = convoy.progress - member.offsetProgress;
                        
                        if (memberProgress < 0) {
                            member.el.style.display = 'none';
                            allFinished = false;
                            continue;
                        } else {
                            member.el.style.display = 'block';
                        }
                        
                        if (memberProgress >= 1) {
                            member.el.style.display = 'none';
                            continue; 
                        }
                        
                        allFinished = false;

                        const pt = targetPath.getPointAtLength(memberProgress * totalLength);
                        
                        const xPct = (pt.x / 1000) * 100;
                        const yPct = (pt.y / 600) * 100;
                        
                        let flip = 1;
                        if (memberProgress < 0.99) {
                            const nextPt = targetPath.getPointAtLength((memberProgress + 0.01) * totalLength);
                            if (nextPt.x < pt.x) {
                                flip = -1;
                            }
                        }

                        member.el.style.left = `${xPct}%`;
                        member.el.style.top = `${yPct}%`;
                        member.el.style.transform = `translate(-50%, -100%) scaleX(${flip}) scale(${member.scale})`;

                        const bounce = convoy.isPaused ? 0 : Math.abs(Math.sin(time / 150)) * 5; 
                        member.el.style.marginTop = `-${bounce}px`;
                    }
                    
                    if (allFinished) {
                        for (let member of convoy.members) {
                            member.el.remove();
                        }
                        return;
                    }

                    requestAnimationFrame(animateConvoy);
                }

                requestAnimationFrame(animateConvoy);
            }

            spawnConvoy();
            setTimeout(spawnConvoy, 4000);

            setInterval(() => {
                spawnConvoy();
            }, 8000 + Math.random() * 4000);
        });\n"""

html = html[:start_idx] + new_script + html[end_idx:]

with codecs.open(filepath, 'w', 'utf-8') as f:
    f.write(html)
print("Injected perfect js")
