import codecs

filepath = r'C:\Users\choos\Documents\Antigravity\sherpa_solutions\services.html'
with codecs.open(filepath, 'r', 'utf-8') as f:
    html = f.read()

old_script_start = html.find('        // Multi-Sherpa Follower Animation Logic')
old_script_end = html.find('    </script>', old_script_start)

if old_script_start != -1 and old_script_end != -1:
    new_script = """        // Multi-Sherpa Convoy Animation Logic
        document.addEventListener("DOMContentLoaded", () => {
            const tsPath = document.getElementById('ts-path');
            const container = document.getElementById('followers-container');
            if (!tsPath || !container) return;

            const totalLength = tsPath.getTotalLength();
            
            const sherpaIcons = ["fa-person-hiking"];
            const peopleIcons = ["fa-person-walking", "fa-person-walking-with-cane", "fa-person", "fa-person-dress"];
            
            const sherpaColors = ["var(--accent)"];
            const peopleColors = ["#4a5c4a", "#5a6d5a", "var(--primary)", "#6b8a6b"];

            function spawnIndividual(isSherpa, delayMs) {
                setTimeout(() => {
                    const follower = document.createElement("div");
                    follower.className = "walking-sherpa";
                    
                    const iconList = isSherpa ? sherpaIcons : peopleIcons;
                    const colorList = isSherpa ? sherpaColors : peopleColors;
                    
                    const iconClass = iconList[Math.floor(Math.random() * iconList.length)];
                    const color = colorList[Math.floor(Math.random() * colorList.length)];
                    
                    follower.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
                    follower.style.color = color;
                    
                    // Make sherpa slightly larger, followers slightly smaller
                    const scale = isSherpa ? 1.0 : (0.7 + Math.random() * 0.2);
                    
                    container.appendChild(follower);

                    let progress = 0; // 0 to 1
                    // Fixed duration so followers don't pass the sherpa
                    const duration = 20000; 
                    let lastTime = performance.now();

                    function animate(time) {
                        const dt = time - lastTime;
                        lastTime = time;
                        
                        progress += dt / duration;
                        
                        if (progress >= 1) {
                            follower.remove();
                            return; 
                        }

                        const pt = tsPath.getPointAtLength(progress * totalLength);
                        
                        const xPct = (pt.x / 1000) * 100;
                        const yPct = (pt.y / 600) * 100;
                        
                        let flip = 1;
                        if (progress < 0.99) {
                            const nextPt = tsPath.getPointAtLength((progress + 0.01) * totalLength);
                            if (nextPt.x < pt.x) {
                                flip = -1;
                            }
                        }

                        follower.style.left = `${xPct}%`;
                        follower.style.top = `${yPct}%`;
                        follower.style.transform = `translate(-50%, -100%) scaleX(${flip}) scale(${scale})`;

                        const bounce = Math.abs(Math.sin(time / 150)) * 5; 
                        follower.style.marginTop = `-${bounce}px`;

                        requestAnimationFrame(animate);
                    }

                    requestAnimationFrame(animate);
                }, delayMs);
            }

            function spawnConvoy() {
                // Spawn 1 Sherpa
                spawnIndividual(true, 0);
                
                // Spawn 1 to 3 followers tightly packed behind the Sherpa
                const numFollowers = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numFollowers; i++) {
                    // 700ms gap groups them closely
                    spawnIndividual(false, (i + 1) * 700 + Math.random() * 200);
                }
            }

            // Spawn initial convoys
            spawnConvoy();
            setTimeout(spawnConvoy, 6000);

            // Continuously spawn new convoys
            setInterval(() => {
                spawnConvoy();
            }, 10000 + Math.random() * 4000);
        });
"""
    html = html[:old_script_start] + new_script + html[old_script_end:]
    with codecs.open(filepath, 'w', 'utf-8') as f:
        f.write(html)
    print("Successfully patched convoy animation script into services.html")
else:
    print("Could not find the script block in HTML to replace.")
