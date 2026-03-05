import codecs

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with codecs.open(filepath, 'r', 'utf-8') as f:
    html = f.read()

old_script_start = html.find('        // Advanced Convoy Animation Logic')
if old_script_start == -1:
    print("Could not find script block")
    exit(1)
     
old_script_end = html.find('    </script>', old_script_start)

if old_script_start != -1 and old_script_end != -1:
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
                { frac: 0.55, el: document.querySelectorAll('.ts-node')[4] }, // AI Integration
                { frac: 0.70, el: document.querySelectorAll('.ts-node')[5] }, // Strategy Execution
                { frac: 0.85, el: document.querySelectorAll('.ts-node')[6] }  // Market Domination
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
                    // Ensure Sherpa renders on top of followers if they overlap
                    follower.style.zIndex = isSherpa ? "20" : "15";
                    
                    const scale = isSherpa ? 1.0 : (0.7 + Math.random() * 0.2);
                    
                    container.appendChild(follower);
                    
                    convoy.members.push({
                        el: follower,
                        offsetProgress: delayOffset / convoySpeed, // Distance behind leader as a fraction of total path
                        scale: scale
                    });
                }
                
                // Spawn 1 Sherpa (leader, offset 0)
                createMember(true, 0);
                
                // Spawn 1 to 3 followers tightly packed behind the Sherpa
                const numFollowers = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numFollowers; i++) {
                    // Offset by 200-300ms equivalent of travel
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
                            // Hide tooltip when pause ends
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
                        
                        // Check for pauses (only on traditional path)
                        if (pathChoice === 'ts' && convoyPauses) {
                            for (let nodeObj of tsNodes) {
                                if (oldProgress < nodeObj.frac && convoy.progress >= nodeObj.frac) {
                                    // Randomly pause 40% of the time at a node
                                    if (Math.random() < 0.4) {
                                        convoy.isPaused = true;
                                        convoy.pauseTimeRemaining = 2500 + Math.random() * 1500; // pause for 2.5 - 4 seconds
                                        convoy.progress = nodeObj.frac; // snap leader to node
                                        
                                        // Show Tooltip
                                        if (nodeObj.el) {
                                            const tooltip = nodeObj.el.querySelector('.node-tooltip');
                                            if (tooltip) {
                                                activeNodeTooltip = tooltip;
                                                tooltip.style.visibility = 'visible';
                                                tooltip.style.opacity = '1';
                                                tooltip.style.zIndex = '100'; // pop to front
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    // Update all members based on unified convoy progress
                    let allFinished = true;
                    
                    for (let member of convoy.members) {
                        // Calculate individual progress (leader is exactly at convoy.progress)
                        let memberProgress = convoy.progress - member.offsetProgress;
                        
                        // Don't start rendering until member is on path
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
                        // Clean up DOM and end loop
                        for (let member of convoy.members) {
                            member.el.remove();
                        }
                        return;
                    }

                    requestAnimationFrame(animateConvoy);
                }

                requestAnimationFrame(animateConvoy);
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
    print("Successfully patched structured convoy animation script into services.html")
