// avitar-3d.js - The WebGL Hologram matrix powered by Three.js
// Mounts physical skeletal models with dynamic animation rendering

window.robotMixer = null;
window.robotActions = {};
window.activeRobotAction = null;
window.currentModel = null;
window.loader = null;

let scene, camera, renderer, clock;

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('webgl-container');
    if (!container) return;

    // Three.js Core Initialization
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 45, container.clientWidth / container.clientHeight, 0.25, 100 );
    camera.position.set( 0, 1.5, 15 );
    camera.lookAt( 0, 1, 0 );

    renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( container.clientWidth, container.clientHeight );
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild( renderer.domElement );

    // Cyberpunk Environment Lighting
    const hemiLight = new THREE.HemisphereLight( 0xffffff, 0x444444 );
    hemiLight.position.set( 0, 20, 0 );
    scene.add( hemiLight );

    // --- HIGH-TECH CYBER PEDESTAL (Mockup Recreation) ---
    const pedestalGroup = new THREE.Group();
    pedestalGroup.position.y = -3.5;
    
    // Dark Metal Base
    const baseGeo = new THREE.CylinderGeometry( 4.5, 5.0, 0.5, 32 );
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
    const baseMesh = new THREE.Mesh( baseGeo, baseMat );
    baseMesh.position.y = -0.25; 
    pedestalGroup.add( baseMesh );

    // Glowing Cyan Outer Ring
    const outerRingGeo = new THREE.TorusGeometry( 4.2, 0.08, 16, 64 );
    const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const outerRingMesh = new THREE.Mesh( outerRingGeo, outerRingMat );
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.position.y = 0.05;
    pedestalGroup.add( outerRingMesh );

    // Glowing Orange Inner Ring (Sherpa Theme Orange)
    const innerRingGeo = new THREE.TorusGeometry( 3.0, 0.05, 16, 64 );
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    const innerRingMesh = new THREE.Mesh( innerRingGeo, innerRingMat );
    innerRingMesh.rotation.x = Math.PI / 2;
    innerRingMesh.position.y = 0.05;
    pedestalGroup.add( innerRingMesh );

    // Center Glowing Cyan Core
    const coreGeo = new THREE.CylinderGeometry( 1.5, 1.5, 0.05, 32 );
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
    const coreMesh = new THREE.Mesh( coreGeo, coreMat );
    coreMesh.position.y = 0.02;
    pedestalGroup.add( coreMesh );

    // Huge Orbital Swirling Rings (floating around avatar)
    const orbit1Geo = new THREE.TorusGeometry( 4.5, 0.03, 16, 80 );
    const orbit1Mat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.8 });
    const orbit1 = new THREE.Mesh( orbit1Geo, orbit1Mat );
    orbit1.rotation.x = Math.PI / 3;
    orbit1.rotation.y = Math.PI / 6;
    orbit1.position.y = 3.5; 
    pedestalGroup.add( orbit1 );

    const orbit2Geo = new THREE.TorusGeometry( 5.0, 0.03, 16, 80 );
    const orbit2Mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
    const orbit2 = new THREE.Mesh( orbit2Geo, orbit2Mat );
    orbit2.rotation.x = -Math.PI / 4;
    orbit2.rotation.y = -Math.PI / 8;
    orbit2.position.y = 3.0; 
    pedestalGroup.add( orbit2 );
    
    // Intense core up-light to illuminate the avatar natively
    const coreLight = new THREE.PointLight( 0x00e5ff, 30, 15 );
    coreLight.position.set(0, 0.5, 0);
    pedestalGroup.add( coreLight );

    scene.add( pedestalGroup );
    window.cyberPedestalOrbits = [orbit1, orbit2];
    // --- END HIGH-TECH CYBER PEDESTAL ---

    const cyanLight = new THREE.PointLight( 0x00e5ff, 5, 50 );
    cyanLight.position.set(8, 5, 8);
    scene.add(cyanLight);

    const orangeLight = new THREE.PointLight( 0xff8c00, 5, 50 );
    orangeLight.position.set(-8, -2, 5);
    scene.add(orangeLight);

    const dirLight = new THREE.DirectionalLight( 0xffffff );
    dirLight.position.set( 0, 10, 10 );
    scene.add( dirLight );

    window.loader = new THREE.GLTFLoader();
    clock = new THREE.Clock();

    window.fadeToAction = function( name, duration ) {
        if(!window.robotActions) return;
        
        let action = window.robotActions[ name ];
        // Graceful fallback for 3D models missing explicit animation tags
        if(!action && name === 'Dance') action = window.robotActions['Run'];
        if(!action && name === 'Wave') action = window.robotActions['Walk'];
        if(!action) action = window.robotActions['Idle'];
        
        if(!action) return;

        if ( window.activeRobotAction && window.activeRobotAction !== action ) {
            // Smoothly lerp between physics states
            window.activeRobotAction.fadeOut( duration );
        }

        // Prevent looping animations from persisting indefinitely if they are finite emotes
        if(name === 'Wave' || name === 'Yes' || name === 'ThumbsUp') {
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
        } else {
            action.setLoop(THREE.LoopRepeat);
            action.clampWhenFinished = false;
        }

        action.reset().setEffectiveTimeScale( 1 ).setEffectiveWeight( 1 ).fadeIn( duration ).play();
        window.activeRobotAction = action;
    };

    // Export function to global scope for state-machine usage in avitar.html
    window.playRobotAnimation = function(name) {
        if (!window.robotMixer || !window.robotActions) return;
        const action = window.robotActions[name];
        if (!action) {
            // Emulate geometric motion fallbacks natively if the 3D topology is totally unrigged
            if (name === 'Wave' || name === 'Yes') {
                window.isWaving = true;
                setTimeout(() => window.isWaving = false, 2000); // 2 second hop sequence
            }
            return;
        }
        window.fadeToAction(name, 0.5);
    };

    window.playRandomMovement = function() {
        if(!window.robotActions) return 'Idle';
        // Eradicate static or inappropriate animation tags from the randomization pool
        const blacklist = ['Idle', 'Death', 'Sitting', 'Standing', 'TPose', 'No', 'Yes', 'ThumbsUp', 'Punch', 'Wave'];
        const available = Object.keys(window.robotActions).filter(name => !blacklist.includes(name));
        
        let targetAnim = 'Idle';
        if (available.length > 0) {
            targetAnim = available[Math.floor(Math.random() * available.length)];
        } else {
            // Hard fallback array matching common Three.js rig schemas
            const fallbacks = ['Walk', 'Run', 'Dance', 'Jump'];
            targetAnim = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
        
        window.fadeToAction(targetAnim, 0.5);
        return targetAnim;
    };

    window.loadModel = function(url, renderConfig) {
        if (window.currentModel) {
            scene.remove(window.currentModel);
            window.activeRobotAction = null;
            if(window.robotMixer) {
                window.robotMixer.stopAllAction();
                window.robotMixer = null;
            }
            window.robotActions = {};
        }

        window.loader.load( url, function ( gltf ) {
            const model = gltf.scene;
            model.animations = gltf.animations || [];
            scene.add( model );
            window.currentModel = model;

            // Build rendering arrays for Holographic Lips executed later in chain to prevent Box3 bounds stretching

            // Core Rotation Math
            if (renderConfig.rot !== undefined) {
                model.rotation.y = renderConfig.rot;
                window.baseRotY = renderConfig.rot;
            } else {
                window.baseRotY = model.rotation.y;
            }

            // Execute robust algorithmic size normalization specifically bounded identically to Robot proportions
            const renderBox = new THREE.Box3().setFromObject(model);
            const size = renderBox.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            // The camera frustum comfortably fits an object of height ~7.5 units from floor to ceiling.
            // We set the target max dimension to exactly 6.0 units, so any 3D model scales perfectly without clipping the header!
            const targetSize = 6.0;
            let autoScale = targetSize / maxDim;
            model.scale.setScalar(autoScale);
            window.baseScaleY = autoScale;
            if (renderConfig.y !== undefined) {
                model.position.y = renderConfig.y;
            }

            // Dynamically ground the mesh absolutely mathematically onto Y = -3.5 uniformly to strike the CSS Grid visually
            const finalBox = new THREE.Box3().setFromObject(model);
            const floorOffset = -3.55 - finalBox.min.y; // Match the physical pedestal surface exactly
            model.position.y += floorOffset;
            
            // Align center mass geometrically back over native coordinates
            const finalCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
            model.position.x += (model.position.x - finalCenter.x);
            model.position.z += (model.position.z - finalCenter.z);
            
            window.basePosY = model.position.y; // Capture the final physical floor position safely for animation loops

            // Advanced 3-Tier Lip Sync Algorithmic Parser (Blendshapes -> Jaw Bone -> Holographic Fallback)
            window.mouthMorphs = [];
            window.jawBone = null;
            window.baseJawRot = 0;
            window.robotMouth = null;
            
            let hasOrganicMouth = false;
            model.traverse((child) => {
                if (child.isMesh && child.morphTargetDictionary) {
                    for (const key in child.morphTargetDictionary) {
                        const lowKey = key.toLowerCase();
                        // Aggressively map VRoid, Mixamo, VRM, and ARKit blendshape naming conventions for maximum lip-sync compatibility
                        if (lowKey.includes('jaw') || lowKey.includes('mouth') || lowKey.includes('lip') || lowKey.includes('speak') || 
                            lowKey.includes('talk') || lowKey.includes('v_') || lowKey === 'a' || lowKey === 'e' || lowKey === 'i' || 
                            lowKey === 'o' || lowKey === 'u' || lowKey.includes('aa') || lowKey.includes('oh') || lowKey.includes('ih') || 
                            lowKey.includes('ou') || lowKey.includes('ee') || lowKey.includes('open') || lowKey.includes('smile')) {
                            
                            window.mouthMorphs.push({ mesh: child, index: child.morphTargetDictionary[key] });
                            hasOrganicMouth = true;
                        }
                    }
                }
                if (child.isBone && (child.name.toLowerCase().includes('jaw') || child.name.toLowerCase().includes('mouth'))) {
                    window.jawBone = child;
                    window.baseJawRot = child.rotation.x;
                    hasOrganicMouth = true;
                }
            });

            // Holographic Fail-safe ONLY for canonical synthetic Robot chassis
            if (!hasOrganicMouth && url.includes('RobotExpressive')) {
                let headBone = null;
                model.traverse((child) => {
                    if (child.isBone && (child.name.toLowerCase().includes('head') || child.name.toLowerCase().includes('neck'))) {
                        headBone = child;
                    }
                });
                
                const mouthMat = new THREE.MeshBasicMaterial({color: 0x00e5ff, transparent: true, opacity: 0});
                const mouthGeo = new THREE.BoxGeometry(0.3, 0.05, 0.1); 
                const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
                
                if (headBone) {
                    mouthMesh.position.set(0, -0.4, 0.5);
                    headBone.add(mouthMesh);
                } else {
                    // Calculate visual face vectors definitively in World Space to bypass scaling anomalies
                    const worldMouthPos = new THREE.Vector3(finalCenter.x, finalCenter.y + (targetSize * 0.35), finalCenter.z + (targetSize * 0.15));
                    model.worldToLocal(worldMouthPos);
                    mouthMesh.position.copy(worldMouthPos);
                    // Scale it inversely so the global model scale doesn't stretch the mouth bounds
                    mouthMesh.scale.setScalar(1.0 / autoScale);
                    model.add(mouthMesh);
                }
                window.robotMouth = mouthMesh;
            }

            window.robotMixer = new THREE.AnimationMixer( model );

            // Extract native keyframes from memory bone structure
            if (model.animations && model.animations.length > 0) {
                // Determine the correct animation index:
                let animIndex = 0;
                let waveIndex = -1;
                model.animations.forEach((anim, idx) => {
                    const name = anim.name.toLowerCase();
                    if (name.includes('idle')) animIndex = idx;
                    if (name.includes('wave') || name.includes('hello')) waveIndex = idx;
                });
                
                const idleAction = window.robotMixer.clipAction( model.animations[ animIndex ] );
                idleAction.play();
                
                // Note: The Greeting sequence has been abstracted structurally to window.avatarGreetSequence() inherently to bypass browser Autoplay policies securely!
            }
            
            // Populate window.robotActions for external control
            for ( let i = 0; i < gltf.animations.length; i ++ ) {
                const clip = gltf.animations[ i ];
                const action = window.robotMixer.clipAction( clip );
                window.robotActions[ clip.name ] = action;
            }
            
            // Execute absolute physical page-load Greeting exactly when the WebGL geometry secures mounting
            if (window.playRobotAnimation) {
                window.playRobotAnimation('Wave');
            }

            // Engage default Idle state loop (this might be redundant if the above greeting handles it)
            // window.fadeToAction( 'Idle', 0.0 );
            
            // Execute Startup Wave procedure naturally across memory (this is now handled by the greeting sequence)
            // setTimeout(() => {
            //      window.fadeToAction('Wave', 0.2);
            //      setTimeout(() => window.fadeToAction('Idle', 0.5), 2000);
            // }, 500); 
        }, undefined, function ( e ) {
            console.error( "CRITICAL: GLTF Framework Load Failure", e );
            // Failsafe auto-recovery for dead Blob urls in localStorage cache
            const defaultRobot = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb";
            if (url !== defaultRobot) {
                console.warn("Autonomously booting fallback Failsafe Matrix.");
                window.loadModel(defaultRobot, {scale: 1.6, y: -3.5, rot: Math.PI});
            }
        });
    };

    // Default Initialization
    const savedConfig = localStorage.getItem('sherpa_default_avatar');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            window.loadModel(config.url, {scale: config.scale, y: config.y, rot: config.rot});
        } catch(e) {
            window.loadModel("https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb", {scale: 1.6, y: -3.5, rot: Math.PI});
        }
    } else {
        window.loadModel("https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/RobotExpressive/RobotExpressive.glb", {scale: 1.6, y: -3.5, rot: Math.PI});
    }

    // Responsive Canvas Resize Hook
    window.addEventListener( 'resize', () => {
        if(!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( container.clientWidth, container.clientHeight );
    });

    // Engine Render Loop
    window.controls = new THREE.OrbitControls( camera, renderer.domElement );
    // Focus the orbital target bounds physically onto the extreme lower torso to vertically lift the massive 3D pedestal visually
    window.controls.target.set(0, -3.0, 0);
    window.controls.update();
    window.controls.enableDamping = true;
    window.controls.dampingFactor = 0.05;
    window.controls.enableZoom = true;
    window.controls.minDistance = 2;
    window.controls.maxDistance = 25;
    
    function animate() {
        requestAnimationFrame( animate );
        if(window.robotMixer) window.robotMixer.update(clock.getDelta());
        if(window.controls) window.controls.update();
        
        // Tumbling gyroscopic logic for the neon rings
        if (window.cyberPedestalOrbits && window.cyberPedestalOrbits.length === 2) {
            window.cyberPedestalOrbits[0].rotation.x += 0.005;
            window.cyberPedestalOrbits[0].rotation.y += 0.008;

            window.cyberPedestalOrbits[1].rotation.x -= 0.004;
            window.cyberPedestalOrbits[1].rotation.y -= 0.006;
        }

        // Advanced Algorithmic Multi-Tier Lip Sync Simulation
        if (true) {
            let mouthVal = Math.max(0, Math.sin(Date.now() * 0.04));
            // Procedural Idle Bodily Motion (Constant breathing & slight hip/body sway for unrigged statues)
            if (window.currentModel && window.baseScaleY) {
                 const idleTime = Date.now() * 0.001;
                 const breath = Math.sin(idleTime * 2.0) * 0.015; // 1.5% scale breathing
                 const sway = Math.sin(idleTime * 1.0) * 0.05;    // Highly visible rotational metronome sway
                 
                 let finalScaleY = window.baseScaleY + (window.baseScaleY * breath);
                 let squashScale = window.baseScaleY - (window.baseScaleY * (breath * 0.3)); // Squash & Stretch
                 
                 // Apply additional aggressive pulsing during WebSpeech
                 if (window.isSpeaking) {
                     finalScaleY += (mouthVal * window.baseScaleY * 0.02);
                     squashScale -= (mouthVal * window.baseScaleY * 0.01);
                 }
                 
                 window.currentModel.scale.set(squashScale, finalScaleY, squashScale);
                 
                 // Force organic Y/X axis pivoting to violently prove 3D geometry depth (preventing 2D cutout illusions)
                 if (!window.jawBone && window.baseRotY !== undefined) {
                     window.currentModel.rotation.y = window.baseRotY + sway;
                     window.currentModel.rotation.x = breath * 0.5;
                 }
                 
                 // --- PROCEDURAL DANCE ALGORITHM FOR STATIC MESHES ---
                 if (window.isWaving) {
                     const beat = Date.now() * 0.015;
                     window.currentModel.position.y = window.basePosY + Math.abs(Math.sin(beat)) * 0.4;
                     if (!window.jawBone) window.currentModel.rotation.x = Math.sin(beat * 0.5) * 0.4; // Enthusiastic head-nodding
                 } else if (window.isDancing && (!window.robotActions || !window.robotActions['Dance'])) {
                     const beat = Date.now() * 0.005;
                     // Aggressive rhythmic geometric bouncing
                     window.currentModel.position.y = window.basePosY + Math.abs(Math.sin(beat)) * 0.6;
                     window.currentModel.scale.y = window.baseScaleY + (Math.cos(beat * 2.0) * 0.1 * window.baseScaleY);
                     
                     // If it's a completely unrigged statue, force it to wildly spin and tilt into a mathematical geometry dance!
                     if (!window.jawBone) {
                         window.currentModel.rotation.y = window.baseRotY + beat * 0.4;
                         window.currentModel.rotation.z = Math.sin(beat * 0.5) * 0.4;
                         window.currentModel.rotation.x = Math.cos(beat * 0.5) * 0.3;
                     }
                 } else if (window.basePosY !== undefined) {
                     // Gravity snap back to baseline safely
                     window.currentModel.position.y = window.basePosY;
                 }
            }
            
            if (window.isSpeaking) {
                // Tier 1: Morph Targets (Blendshapes)
                if (window.mouthMorphs && window.mouthMorphs.length > 0) {
                    window.mouthMorphs.forEach(m => m.mesh.morphTargetInfluences[m.index] = mouthVal);
                }
                // Tier 2: Jaw Bone Rotation Execution
                else if (window.jawBone) {
                    window.jawBone.rotation.x = window.baseJawRot + (mouthVal * 0.3); // Open structural jaw smoothly by ~17 degrees
                }
                // Tier 3: Holographic Override
                else if (window.robotMouth) {
                    window.robotMouth.material.opacity = 0.8;
                    window.robotMouth.scale.y = 1 + mouthVal * 4.0;
                    window.robotMouth.scale.x = 1 + Math.sin(Date.now() * 0.01) * 0.2;
                }
            } else {
                if (window.mouthMorphs && window.mouthMorphs.length > 0) {
                    window.mouthMorphs.forEach(m => m.mesh.morphTargetInfluences[m.index] = 0);
                }
                if (window.jawBone) {
                    window.jawBone.rotation.x = window.baseJawRot;
                }
                if (window.robotMouth) {
                    window.robotMouth.material.opacity = 0;
                }
            }
        }
        
        renderer.render( scene, camera );
    }
    animate();
});

// Global Structural Greeting Function mapping the Text-To-Speech and Keyframe matrix natively
window.avatarGreetSequence = function() {
    if (!window.currentModel || !window.robotMixer) return;
    
    let waveIndex = -1;
    let idleIndex = 0;
    if (window.currentModel.animations) {
        window.currentModel.animations.forEach((anim, idx) => {
            const name = anim.name.toLowerCase();
            if (name.includes('idle')) idleIndex = idx;
            if (name.includes('wave') || name.includes('hello')) waveIndex = idx;
        });
    }

    // Execute Synthetic WebSpeech Payload Globally
    if ('speechSynthesis' in window) {
        let text = "What problems are we going to solve today";
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.pitch = 1.1;
        utterance.rate = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google US English'));
        if (femaleVoice) utterance.voice = femaleVoice;
        window.speechSynthesis.speak(utterance);
    }

    // Execute Native Physical Bone Translations
    if (waveIndex !== -1 && window.currentModel.animations) {
        window.robotMixer.stopAllAction();
        const waveAction = window.robotMixer.clipAction( window.currentModel.animations[ waveIndex ] );
        waveAction.reset();
        waveAction.setLoop(THREE.LoopOnce);
        waveAction.clampWhenFinished = true;
        waveAction.play();
        
        // Return organically to Idle loop once arm terminates
        const onAnimFinish = function(e) {
            if (e.action === waveAction) {
                window.robotMixer.removeEventListener('finished', onAnimFinish);
                const idleAction = window.robotMixer.clipAction( window.currentModel.animations[ idleIndex ] );
                idleAction.reset().fadeIn(0.5).play();
            }
        };
        window.robotMixer.addEventListener('finished', onAnimFinish);
    }
};
