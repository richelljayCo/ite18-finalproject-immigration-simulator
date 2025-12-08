let mixer;
let modelCache = {};
const modelLoader = new THREE.GLTFLoader(); 
// Enhanced configuration
const CONFIG = {
    SIMULATION_INTERVAL: 2500,
    INITIAL_POPULATION: 1000,
    INITIAL_GDP: 55000,
    INITIAL_HAPPINESS: 70,
    INITIAL_UNEMPLOYMENT: 5.0,
    INITIAL_BUDGET: 55000,
    MOVEMENT_SPEED: 6,
    MOUSE_SENSITIVITY: 0.002,
    JUMP_FORCE: 9,
    GRAVITY: 9.8,
    FOG_DENSITY: 0.025,
    MAX_PEOPLE: 150,
    BORDER_RADIUS: 50
};

// Enhanced game state
const gameState = {
    started: false,
    paused: false,
    difficulty: 'medium',
    population: CONFIG.INITIAL_POPULATION,
    gdp: CONFIG.INITIAL_GDP,
    happiness: CONFIG.INITIAL_HAPPINESS,
    unemployment: CONFIG.INITIAL_UNEMPLOYMENT,
    year: 2024,
    budget: CONFIG.INITIAL_BUDGET,
    score: 0,
    weather: 'sunny',
    achievements: new Set(),
    policies: {
        openBorders: false,
        skilledWorker: false,
        refugee: false,
        family: false,
        investor: false,
        strict: false
    },
    policyCosts: {
        openBorders: 500,
        skilledWorker: 300,
        refugee: 400,
        family: 200,
        investor: 100,
        strict: 300
    },
    difficultySettings: {
        easy: { budget: 10000, happinessDrain: 1, unempMultiplier: 0.7, gdpMultiplier: 1.3 },
        medium: { budget: 5000, happinessDrain: 2, unempMultiplier: 1.0, gdpMultiplier: 1.0 },
        hard: { budget: 2000, happinessDrain: 3.5, unempMultiplier: 1.5, gdpMultiplier: 0.7 }
    }
};

// Three.js variables
let scene, camera, renderer, canvas;
let clock = new THREE.Clock();
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let lastSimulationTime = Date.now();

// Movement
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false, velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let prevTime = performance.now();

// Game objects
let interactiveObjects = [], gates = [], buildings = [], people = [], monument;
let particles = [];

// FPS counter
let fps = 60, fpsFrames = 0, fpsTime = 0;

// Mini-map
let miniMapCtx;

// Loading
let loadingProgress = 0;

function updateLoadingProgress(step, message) {
    loadingProgress = (step / 8) * 100;
    document.getElementById('loadingProgress').style.width = `${loadingProgress}%`;
    document.getElementById('loadingSubtitle').textContent = message;
    document.getElementById('loadingObjects').textContent = Math.floor(50 + step * 20);
    document.getElementById('loadingTextures').textContent = Math.floor(10 + step * 4);
    document.getElementById('loadingModels').textContent = Math.floor(5 + step * 3);
}

function initVRScene() {
    updateLoadingProgress(1, 'Initializing graphics engine...');
    setupThreeJS();
    
    updateLoadingProgress(2, 'Creating environment...');
    createScene();
    
    updateLoadingProgress(3, 'Building terrain...');
    createGround();
    
    updateLoadingProgress(4, 'Constructing border...');
    createBorder();
    createGates();
    
    updateLoadingProgress(5, 'Generating city...');
    createBuildings();
    
    updateLoadingProgress(6, 'Adding landmarks...');
    createMonument();
    createInteractiveObjects();
    
    updateLoadingProgress(7, 'Populating world...');
    createInitialPopulation();
    
    updateLoadingProgress(8, 'Finalizing...');
    setupControls();
    setupMiniMap();
    animate();
    
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('fade-out');
        setTimeout(() => {
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('vrMenu').classList.add('active');
        }, 1000);
    }, 500);
}

function setupThreeJS() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x87CEEB, CONFIG.FOG_DENSITY);
    
    canvas = document.querySelector('canvas.webgl');
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 10);
    camera.rotation.order = 'YXZ';
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x87CEEB);
    
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight('#ffffff', 0.9);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x4CAF50, 0.4);
    scene.add(hemisphereLight);
}

function createScene() {
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
        color: 0x87CEEB,
        side: THREE.BackSide
    });
    const skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skybox);
    
    // Clouds
    for (let i = 0; i < 30; i++) {
        const cloudGeometry = new THREE.SphereGeometry(Math.random() * 6 + 4, 8, 8);
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloud.position.set(
            (Math.random() - 0.5) * 400,
            Math.random() * 80 + 60,
            (Math.random() - 0.5) * 400
        );
        cloud.userData = { 
            driftSpeed: Math.random() * 0.02 + 0.01,
            originalZ: cloud.position.z
        };
        scene.add(cloud);
    }
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(250, 250, 30, 30);
    const vertices = groundGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = Math.random() * 0.5;
    }
    groundGeometry.attributes.position.needsUpdate = true;
    groundGeometry.computeVertexNormals();
    
    const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4CAF50,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Grass patches
    for (let i = 0; i < 40; i++) {
        const patchGeometry = new THREE.CircleGeometry(Math.random() * 5 + 2, 12);
        const patchMaterial = new THREE.MeshLambertMaterial({ 
            color: Math.random() > 0.5 ? 0x388E3C : 0x66BB6A
        });
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(
            (Math.random() - 0.5) * 200,
            0.05,
            (Math.random() - 0.5) * 200
        );
        scene.add(patch);
    }
}

function createBorder() {
    const radius = CONFIG.BORDER_RADIUS;
    const postCount = 40;
    
    for (let i = 0; i < postCount; i++) {
        const angle = (i / postCount) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        const postGeometry = new THREE.CylinderGeometry(0.35, 0.35, 3, 8);
        const postMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.8,
            metalness: 0.2
        });
        
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(x, 1.5, z);
        post.castShadow = true;
        scene.add(post);
    }
}

function createGates() {
    const gatePositions = [
        { x: CONFIG.BORDER_RADIUS, z: 0, rotation: 0, name: 'North Gate' },
        { x: -CONFIG.BORDER_RADIUS, z: 0, rotation: Math.PI, name: 'South Gate' },
        { x: 0, z: CONFIG.BORDER_RADIUS, rotation: Math.PI / 2, name: 'East Gate' },
        { x: 0, z: -CONFIG.BORDER_RADIUS, rotation: -Math.PI / 2, name: 'West Gate' }
    ];
    
    gatePositions.forEach(pos => {
        const gateGroup = new THREE.Group();
        
        const postGeometry = new THREE.BoxGeometry(1, 7, 1);
        const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        
        const leftPost = new THREE.Mesh(postGeometry, postMaterial);
        leftPost.position.set(-2.5, 3.5, 0);
        leftPost.castShadow = true;
        gateGroup.add(leftPost);
        
        const rightPost = new THREE.Mesh(postGeometry, postMaterial);
        rightPost.position.set(2.5, 3.5, 0);
        rightPost.castShadow = true;
        gateGroup.add(rightPost);
        
        const archGeometry = new THREE.TorusGeometry(2.5, 0.25, 10, 40, Math.PI);
        const archMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xFFD700,
            emissive: 0xFFD700,
            emissiveIntensity: 0.3
        });
        const arch = new THREE.Mesh(archGeometry, archMaterial);
        arch.position.set(0, 7, 0);
        arch.rotation.x = Math.PI / 2;
        gateGroup.add(arch);
        
        gateGroup.position.set(pos.x, 0, pos.z);
        gateGroup.rotation.y = pos.rotation;
        gateGroup.userData = { type: 'gate', name: pos.name, interactive: true };
        
        scene.add(gateGroup);
        gates.push(gateGroup);
        interactiveObjects.push(gateGroup);
    });
}

function createBuildings() {
    const buildingTypes = [
        { color: 0x3498db, name: 'Residential' },
        { color: 0xe74c3c, name: 'Commercial' },
        { color: 0x2ecc71, name: 'Government' },
        { color: 0xf39c12, name: 'Industrial' },
        { color: 0x9b59b6, name: 'Tech' }
    ];
    
    for (let i = 0; i < 25; i++) {
        const type = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        const height = Math.random() * 12 + 6;
        const width = Math.random() * 5 + 3;
        const depth = Math.random() * 5 + 3;
        
        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshLambertMaterial({ 
            color: type.color,
            transparent: true,
            opacity: 0.9
        });
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 35 + 8;
        building.position.set(
            Math.cos(angle) * radius,
            height / 2,
            Math.sin(angle) * radius
        );
        
        building.castShadow = true;
        building.receiveShadow = true;
        building.userData = { type: 'building', name: `${type.name} Building`, interactive: true };
        
        // Windows
        const windowCount = Math.floor(height / 2);
        for (let w = 0; w < windowCount; w++) {
            const windowGeometry = new THREE.PlaneGeometry(width * 0.8, 0.5);
            const windowMaterial = new THREE.MeshBasicMaterial({ 
                color: Math.random() > 0.3 ? 0xffff00 : 0x333333,
                transparent: true,
                opacity: 0.8
            });
            const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
            window1.position.set(0, -height/2 + 1 + w * 2, depth/2 + 0.01);
            building.add(window1);
        }
        
        scene.add(building);
        buildings.push(building);
        interactiveObjects.push(building);
    }
}

function createMonument() {
    const monumentGroup = new THREE.Group();
    
    const baseGeometry = new THREE.CylinderGeometry(5, 5, 1.5, 20);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.75;
    base.castShadow = true;
    monumentGroup.add(base);
    
    const columnGeometry = new THREE.CylinderGeometry(1.2, 1.2, 12, 20);
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0xCCCCCC });
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.y = 7.5;
    column.castShadow = true;
    monumentGroup.add(column);
    
    const torchGeometry = new THREE.ConeGeometry(2, 4, 10);
    const torchMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffaa00,
        emissive: 0xff4400,
        emissiveIntensity: 0.6
    });
    const torch = new THREE.Mesh(torchGeometry, torchMaterial);
    torch.position.y = 15;
    torch.rotation.x = Math.PI;
    monumentGroup.add(torch);
    
    const light = new THREE.PointLight(0xffaa00, 2, 30);
    light.position.y = 14;
    monumentGroup.add(light);
    
    monumentGroup.position.set(0, 0, 0);
    monumentGroup.userData = { type: 'monument', name: 'Unity Monument', interactive: true };
    
    scene.add(monumentGroup);
    monument = monumentGroup;
    interactiveObjects.push(monumentGroup);
}

function createInteractiveObjects() {
    // Nothing for now
}

function createInitialPopulation() {
    for (let i = 0; i < 40; i++) {
        createPerson(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50,
            'citizen'
        );
    }
}

function createPerson(x, z, type = 'citizen') {
    if (people.length >= CONFIG.MAX_PEOPLE) return null;
    
    const personGroup = new THREE.Group();
    
    // First create a simple placeholder (cube) while loading
    const placeholderGeometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
    const placeholderMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.5,
        wireframe: true
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    personGroup.add(placeholder);
    
    personGroup.position.set(x, 0.9, z);
    personGroup.userData = {
        type: 'person',
        personType: type,
        walkSpeed: Math.random() * 0.025 + 0.01,
        walkDirection: new THREE.Vector3(
            Math.random() - 0.5, 0, Math.random() - 0.5
        ).normalize(),
        idleTime: 0,
        isIdle: false,
        animations: null,
        mixer: null,
        modelLoaded: false
    };
    
    // Load the 3D model based on type
    loadPersonModel(personGroup, type).then((loadedPerson) => {
        if (loadedPerson) {
            // Remove placeholder
            personGroup.remove(placeholder);
            
            // Add the loaded model
            scene.add(personGroup);
            people.push(personGroup);
            interactiveObjects.push(personGroup);
            
            // Add entry animation
            personGroup.scale.set(0.1, 0.1, 0.1);
            gsap.to(personGroup.scale, {
                x: 1, y: 1, z: 1,
                duration: 0.6,
                ease: "back.out(1.7)"
            });
        }
    }).catch(error => {
        console.warn('Failed to load model, using placeholder:', error);
        // Use the placeholder as fallback
        placeholder.material.color.setHex(getColorForType(type));
        placeholder.material.wireframe = false;
        placeholder.material.opacity = 1;
        
        scene.add(personGroup);
        people.push(personGroup);
        interactiveObjects.push(personGroup);
    });
    
    return personGroup;
}

// Helper function to get colors for different types
function getColorForType(type) {
    const colors = {
        citizen: 0x3498db,
        openBorders: 0xe74c3c,
        skilled: 0x9b59b6,
        skilledWorker: 0x9b59b6,
        refugee: 0xf39c12,
        family: 0xe91e63,
        investor: 0x2ecc71
    };
    return colors[type] || 0x3498db;
}

// Function to load 3D model
// Function to load 3D model - MINIMAL FIX VERSION
async function loadPersonModel(personGroup, personType) {
    // Map person types to model files
    const modelMap = {
        citizen: './assets/models/male/scene.gltf',
        openBorders: './assets/models/male/scene.gltf',
        skilledWorker: './assets/models/male/scene.gltf',
        refugee: './assets/models/male/scene.gltf',
        family: './assets/models/male/scene.gltf',
        investor: './assets/models/male/scene.gltf',
        skilled: './assets/models/male/scene.gltf'
    };
    
    const modelPath = './assets/models/male/scene.gltf';
    
    return new Promise((resolve, reject) => {
        // Check cache first
        if (modelCache[modelPath]) {
            const model = modelCache[modelPath].clone();
            setupModel(personGroup, model);
            setupSimpleAnimations(personGroup, model); // SIMPLE version
            resolve(personGroup);
            return;
        }
        
        // Load the model
        modelLoader.load(
            modelPath,
            (gltf) => {
                // Cache the loaded model
                modelCache[modelPath] = gltf.scene;
                
                // Clone the model for this person
                const model = gltf.scene.clone();
                
                setupModel(personGroup, model);
                
                // Set up SIMPLE animations
                setupSimpleAnimations(personGroup, model, gltf.animations);
                
                resolve(personGroup);
            },
            // Progress callback
            (xhr) => {
                const percentComplete = (xhr.loaded / xhr.total) * 100;
                if (percentComplete % 25 < 1) {
                    console.log(`${personType} model: ${percentComplete.toFixed(0)}% loaded`);
                }
            },
            // Error callback
            (error) => {
                console.error('Error loading model:', error);
                reject(error);
            }
        );
    });
}

// SIMPLE animation setup that won't break your models
function setupSimpleAnimations(personGroup, model, animations) {
    if (!animations || animations.length === 0) {
        console.log('No animations found');
        return;
    }
    
    console.log('Available animations:', animations.map(a => a.name).join(', '));
    
    // Create animation mixer
    const mixer = new THREE.AnimationMixer(model);
    personGroup.userData.mixer = mixer;
    
    // Try to find and play any walk animation
    let walkAnimation = null;
    
    // Look for walk animations
    for (const anim of animations) {
        if (anim.name.toLowerCase().includes('walk')) {
            walkAnimation = anim;
            break;
        }
    }
    
    // If no walk animation found, use first animation
    if (!walkAnimation) {
        walkAnimation = animations[0];
    }
    
    console.log('Using animation:', walkAnimation.name);
    
    // Create and play the animation
    const action = mixer.clipAction(walkAnimation);
    action.play();
    
    // Store reference
    personGroup.userData.walkAction = action;
}
// Function to set up animations
function setupAnimations(personGroup, model, animations) {
    if (!animations || animations.length === 0) {
        console.log('No animations found for this model');
        return;
    }
    
    console.log('Setting up animations...');
    
    // Create animation mixer
    personGroup.userData.mixer = new THREE.AnimationMixer(model);
    
    // Find walking animation
    let walkAnimation = null;
    
    // Try to find walk animation by name
    const walkKeywords = ['walk', 'Walk', 'WALK', 'slow', 'Slow', 'Slow Walk', 'slow_walk'];
    
    for (const anim of animations) {
        for (const keyword of walkKeywords) {
            if (anim.name.includes(keyword)) {
                walkAnimation = anim;
                console.log(`Found walk animation: "${anim.name}"`);
                break;
            }
        }
        if (walkAnimation) break;
    }
    
    // If no walk animation found, use the first animation
    if (!walkAnimation) {
        walkAnimation = animations[0];
        console.log(`Using first animation: "${walkAnimation.name}"`);
    }
    
    // Create and play the animation
    const action = personGroup.userData.mixer.clipAction(walkAnimation);
    action.play();
    
    console.log('Animation playing:', walkAnimation.name);
    
    // Store animation info for debugging
    personGroup.userData.animationName = walkAnimation.name;
    personGroup.userData.animationDuration = walkAnimation.duration;
}
// Add this debug function
// function debugFilePaths() {
//     console.log('Testing file paths...');
//     console.log('Current working directory:', window.location.href);
    
//     // Test if the file exists
//     const testPaths = [
//         './assets/models/male/scene.gltf',
//         'assets/models/male/scene.gltf',
//         '/assets/models/male/scene.gltf',
//         'models/male/scene.gltf'
//     ];
    
//     testPaths.forEach(path => {
//         fetch(path)
//             .then(response => {
//                 console.log(`✓ Path accessible: ${path}`);
//             })
//             .catch(error => {
//                 console.log(`✗ Path not accessible: ${path}`);
//             });
//     });
// }

// Call this in your init or after DOM loads
window.addEventListener('DOMContentLoaded', () => {
    debugFilePaths(); // Add this line
    initVRScene();
    // ... rest of your code
});
// Function to set up the model
// Function to set up the model with proper rotation and scaling
function setupModel(personGroup, model) {
    // Calculate the bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    console.log('Model size:', size);
    console.log('Model center:', center);
    
    // Calculate scale to make person ~1.8 units tall (human height)
    const targetHeight = 1.8;
    let scale;


    scale = targetHeight / size.z;
    
    // Rotate model to stand up
    model.rotation.x = Math.PI / 2;
    
    // Determine which axis is height (usually Y, but sometimes Z)
    // if (size.y >= size.z && size.y >= size.x) {
    //     // Model is standing up (Y is height)
    //     scale = targetHeight / size.y;
    // } else if (size.z >= size.y && size.z >= size.x) {
    //     // Model is lying down (Z is height) - need to rotate
    //     scale = targetHeight / size.z;
        
    //     // Rotate model to stand up
    //     model.rotation.x = Math.PI / 2; // Rotate 90 degrees
    //     console.log('Rotated model to stand up');
    // } else {
    //     // Model is on its side (X is height) - need to rotate
    //     scale = targetHeight / size.x;
        
    //     // Rotate model to stand up
    //     model.rotation.z = Math.PI / 2; // Rotate 90 degrees
    //     console.log('Rotated model to stand up');
    // }
    
    // Apply scale
    model.scale.setScalar(scale * 0.8); // Slightly smaller for better fit
    
    // Center the model
    model.position.sub(center.multiplyScalar(scale));
    
    // Position model at ground level
    model.position.y =  -0.5  *scale; // Slightly above ground
    
    // Add to person group
    personGroup.add(model);
    
    // Enable shadows
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Optional: Improve material appearance
            if (child.material) {
                child.material.roughness = 0.8;
                child.material.metalness = 0.2;
            }
        }
    });
    
    personGroup.userData.modelLoaded = true;
    console.log('Model setup complete with scale:', scale);
}

function setupMiniMap() {
    const miniMapCanvas = document.getElementById('miniMapCanvas');
    miniMapCtx = miniMapCanvas.getContext('2d');
    miniMapCanvas.width = 180;
    miniMapCanvas.height = 140;
}

function updateMiniMap() {
    if (!miniMapCtx) return;
    
    const ctx = miniMapCtx;
    const canvas = ctx.canvas;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background
    ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Border circle
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, 60, 0, Math.PI * 2);
    ctx.stroke();
    
    // Gates
    ctx.fillStyle = '#FFD700';
    gates.forEach(gate => {
        const x = (gate.position.x / CONFIG.BORDER_RADIUS) * 60 + canvas.width/2;
        const y = (gate.position.z / CONFIG.BORDER_RADIUS) * 60 + canvas.height/2;
        ctx.fillRect(x - 2, y - 2, 4, 4);
    });
    
    // People
    ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
    people.slice(0, 50).forEach(person => {
        const x = (person.position.x / CONFIG.BORDER_RADIUS) * 60 + canvas.width/2;
        const y = (person.position.z / CONFIG.BORDER_RADIUS) * 60 + canvas.height/2;
        ctx.fillRect(x - 1, y - 1, 2, 2);
    });
    
    // Player position
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    const px = (camera.position.x / CONFIG.BORDER_RADIUS) * 60 + canvas.width/2;
    const py = (camera.position.z / CONFIG.BORDER_RADIUS) * 60 + canvas.height/2;
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Player direction
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const dirX = Math.sin(camera.rotation.y) * 10;
    const dirY = Math.cos(camera.rotation.y) * 10;
    ctx.lineTo(px + dirX, py + dirY);
    ctx.stroke();
}

function setupControls() {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', () => {
        if (gameState.started && !document.pointerLockElement) {
            document.body.requestPointerLock();
        }
    });
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
    
    document.querySelectorAll('.policy-card').forEach(card => {
        card.addEventListener('click', function() {
            if (!gameState.started) return;
            togglePolicy(this.dataset.policy);
        });
        
        card.addEventListener('mouseenter', function() {
            showTooltip(this);
        });
        
        card.addEventListener('mouseleave', hideTooltip);
    });

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            gameState.difficulty = this.dataset.difficulty;
        });
    });
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= event.movementX * CONFIG.MOUSE_SENSITIVITY;
        camera.rotation.x -= event.movementY * CONFIG.MOUSE_SENSITIVITY;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    }
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (canJump && gameState.started) {
                velocity.y = CONFIG.JUMP_FORCE;
                canJump = false;
            }
            break;
        case 'KeyE': 
            if (gameState.started) interactWithObject();
            break;
        case 'Tab': 
            event.preventDefault();
            toggleMenu();
            break;
        case 'KeyP':
            gameState.paused = !gameState.paused;
            showNotification(gameState.paused ? 'Game Paused' : 'Game Resumed', 'info');
            break;
    }
    
    if (event.code.startsWith('Digit') && gameState.started) {
        const digit = parseInt(event.code[5]);
        if (digit >= 1 && digit <= 6) {
            const policies = ['openBorders', 'skilledWorker', 'refugee', 'family', 'investor', 'strict'];
            togglePolicy(policies[digit - 1]);
        }
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function togglePolicy(policyName) {
    if (!gameState.started || gameState.paused) return;
    
    const cost = gameState.policyCosts[policyName];
    const currentState = gameState.policies[policyName];
    
    if (!currentState && cost > gameState.budget) {
        showNotification('Insufficient Budget!', 'error');
        return;
    }
    
    gameState.policies[policyName] = !currentState;
    
    const btn = document.querySelector(`[data-policy="${policyName}"]`);
    if (gameState.policies[policyName]) {
        btn.classList.add('active');
        showNotification(`${formatPolicyName(policyName)} Enabled`, 'success');
        gameState.budget -= cost;
        spawnImmigrants(getImmigrantCount(policyName), policyName);
    } else {
        btn.classList.remove('active');
        showNotification(`${formatPolicyName(policyName)} Disabled`, 'info');
    }
    
    updateHUD();
}

function formatPolicyName(policyName) {
    return policyName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase());
}

function getImmigrantCount(policyName) {
    const counts = {
        openBorders: 60,
        skilledWorker: 25,
        refugee: 35,
        family: 30,
        investor: 12,
        strict: 0
    };
    return counts[policyName] || 0;
}

function spawnImmigrants(count, type) {
    if (count === 0) return;
    
    const gate = gates[Math.floor(Math.random() * gates.length)];
    const spawnCount = Math.min(Math.ceil(count / 6), 5);
    
    for (let i = 0; i < spawnCount; i++) {
        const person = createPerson(
            gate.position.x + (Math.random() - 0.5) * 4,
            gate.position.z + (Math.random() - 0.5) * 4,
            type
        );
        
        if (person) {
            person.scale.set(0.1, 0.1, 0.1);
            gsap.to(person.scale, {
                x: 1, y: 1, z: 1,
                duration: 0.6,
                ease: "back.out(1.7)"
            });
        }
    }
}

function simulateYear() {
    if (!gameState.started || gameState.paused) return;
    
    gameState.year++;
    
    let totalImmigrants = 0;
    Object.keys(gameState.policies).forEach(policy => {
        if (gameState.policies[policy]) {
            totalImmigrants += getImmigrantCount(policy);
        }
    });
    
    if (gameState.policies.strict) {
        totalImmigrants = Math.floor(totalImmigrants * 0.5);
    }
    
    gameState.population += totalImmigrants;
    
    const difficulty = gameState.difficultySettings[gameState.difficulty];
    let gdpChange = 0;
    
    if (gameState.policies.skilledWorker) gdpChange += 2500 * difficulty.gdpMultiplier;
    if (gameState.policies.investor) gdpChange += 3500 * difficulty.gdpMultiplier;
    if (gameState.policies.openBorders) gdpChange += Math.random() > 0.4 ? 1200 : -600;
    if (gameState.policies.strict) gdpChange -= 1000;
    
    gdpChange += Math.floor(gameState.population / 80) * difficulty.gdpMultiplier;
    gdpChange += Math.floor(Math.random() * 800 - 400);
    
    gameState.gdp = Math.max(1000, gameState.gdp + Math.floor(gdpChange));
    
    let happinessChange = -difficulty.happinessDrain;
    
    if (gameState.policies.family) happinessChange += 6;
    if (gameState.policies.refugee) happinessChange += 4;
    if (gameState.policies.strict) happinessChange -= 6;
    if (gameState.unemployment > 15) happinessChange -= 5;
    if (gameState.gdp > 15000) happinessChange += 4;
    
    gameState.happiness = Math.max(0, Math.min(100, 
        gameState.happiness + happinessChange
    ));
    
    let unempChange = (totalImmigrants / 180) * difficulty.unempMultiplier;
    if (gameState.policies.skilledWorker) unempChange -= 1.5;
    if (gameState.policies.investor) unempChange -= 1.0;
    if (gameState.policies.refugee) unempChange += 0.7;
    
    gameState.unemployment = Math.max(0, Math.min(40, 
        gameState.unemployment + unempChange
    ));
    
    const newScore = Math.floor(
        (gameState.population / 80) + 
        (gameState.gdp / 80) + 
        (gameState.happiness * 2.5) - 
        (gameState.unemployment * 12)
    );
    
    gameState.score += Math.max(0, newScore);
    gameState.budget += Math.floor(gameState.gdp / 3.5);
    
    if (Math.random() < 0.18) {
        triggerRandomEvent();
    }
    
    checkAchievements();
    updateHUD();
    checkGameState();
    updateWeather();
}

function triggerRandomEvent() {
    const events = [
        {
            name: 'Economic Boom',
            weight: 0.4,
            effect: () => {
                const bonus = Math.floor(Math.random() * 2500 + 1500);
                gameState.gdp += bonus;
                showNotification(`🚀 Economic Boom! GDP +${bonus.toLocaleString()}`, 'success');
                createParticleEffect(camera.position, 0xffcc00, 20);
            }
        },
        {
            name: 'Natural Disaster',
            weight: 0.25,
            effect: () => {
                gameState.happiness -= 10;
                gameState.gdp -= 800;
                showNotification('⚠️ Natural Disaster! Resources depleted', 'error');
                createParticleEffect(camera.position, 0xff0000, 15);
            }
        },
        {
            name: 'Tech Breakthrough',
            weight: 0.25,
            effect: () => {
                gameState.unemployment = Math.max(0, gameState.unemployment - 2);
                gameState.gdp += 600;
                showNotification('💡 Tech Breakthrough! Innovation thrives', 'success');
                createParticleEffect(camera.position, 0x00ffff, 18);
            }
        },
        {
            name: 'Cultural Festival',
            weight: 0.1,
            effect: () => {
                gameState.happiness += 8;
                showNotification('🎭 Cultural Festival! Happiness rises', 'success');
                createParticleEffect(camera.position, 0xff69b4, 15);
            }
        }
    ];
    
    const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const event of events) {
        if (random < event.weight) {
            event.effect();
            break;
        }
        random -= event.weight;
    }
}

function createParticleEffect(position, color, count) {
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const rgb = new THREE.Color(color);
    
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 5;
        positions[i * 3 + 1] = Math.random() * 3;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
        
        colors[i * 3] = rgb.r;
        colors[i * 3 + 1] = rgb.g;
        colors[i * 3 + 2] = rgb.b;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8
    });
    
    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.position.copy(position);
    particleSystem.position.y += 2;
    scene.add(particleSystem);
    particles.push(particleSystem);
    
    gsap.to(particleSystem.scale, {
        x: 2.5, y: 2.5, z: 2.5,
        duration: 1.2,
        ease: "power2.out",
        onComplete: () => {
            scene.remove(particleSystem);
            particles = particles.filter(p => p !== particleSystem);
        }
    });
    
    gsap.to(particleMaterial, {
        opacity: 0,
        duration: 1.2,
        ease: "power2.out"
    });
}

function checkAchievements() {
    const achievements = [
        { condition: () => gameState.population >= 5000, name: 'Population Boom', id: 'pop_5000', icon: '👥' },
        { condition: () => gameState.population >= 10000, name: 'Mega Nation', id: 'pop_10000', icon: '🏙️' },
        { condition: () => gameState.gdp >= 25000, name: 'Economic Powerhouse', id: 'gdp_25000', icon: '💰' },
        { condition: () => gameState.gdp >= 50000, name: 'Global Leader', id: 'gdp_50000', icon: '🌍' },
        { condition: () => gameState.happiness >= 90, name: 'Utopia', id: 'happy_90', icon: '😊' },
        { condition: () => gameState.unemployment <= 2, name: 'Full Employment', id: 'unemp_2', icon: '💼' },
        { condition: () => gameState.year >= 2028, name: 'Decade of Progress', id: 'year_10', icon: '📅' },
        { condition: () => gameState.score >= 10000, name: 'Master Builder', id: 'score_10k', icon: '⭐' }
    ];
    
    achievements.forEach(achievement => {
        if (!gameState.achievements.has(achievement.id) && achievement.condition()) {
            gameState.achievements.add(achievement.id);
            showAchievement(`${achievement.icon} ${achievement.name}!`);
        }
    });
}

function checkGameState() {
    if (gameState.happiness <= 0) {
        endGame('💔 Your nation collapsed due to extreme unhappiness!');
    } else if (gameState.unemployment >= 40) {
        endGame('📉 Economic collapse! Unemployment reached critical levels!');
    } else if (gameState.budget < -15000) {
        endGame('💸 Bankruptcy! The nation is in massive debt!');
    } else if (gameState.population <= 100) {
        endGame('⚠️ Population crisis! Not enough citizens!');
    }
}

function updateWeather() {
    const weathers = ['☀️', '⛅', '☁️', '🌧️'];
    const weatherIndicator = document.getElementById('weatherIndicator');
    if (Math.random() < 0.3) {
        weatherIndicator.textContent = weathers[Math.floor(Math.random() * weathers.length)];
    }
}

function updateHUD() {
    document.getElementById('statYear').textContent = gameState.year;
    document.getElementById('statPopulation').textContent = gameState.population.toLocaleString();
    document.getElementById('statGDP').textContent = 
        + gameState.gdp.toLocaleString();
    document.getElementById('statHappiness').textContent = gameState.happiness.toFixed(0) + '%';
    document.getElementById('statUnemployment').textContent = gameState.unemployment.toFixed(1) + '%';
    document.getElementById('statBudget').textContent = 
        + gameState.budget.toLocaleString();
    document.getElementById('statScore').textContent = gameState.score.toLocaleString();
    document.getElementById('yearDisplay').textContent = gameState.year - 2023;
    
    const happinessBar = document.getElementById('happinessBar');
    if (happinessBar) {
        happinessBar.style.width = `${gameState.happiness}%`;
        
        if (gameState.happiness < 30) {
            happinessBar.style.background = 'linear-gradient(90deg, #ff0000, #ff6b6b)';
        } else if (gameState.happiness > 70) {
            happinessBar.style.background = 'linear-gradient(90deg, #00ff88, #51cf66)';
        } else {
            happinessBar.style.background = 'linear-gradient(90deg, #ffcc00, #ffd700)';
        }
    }
    
    const now = Date.now();
    const elapsed = now - lastSimulationTime;
    const progress = Math.min(100, (elapsed / CONFIG.SIMULATION_INTERVAL) * 100);
    const yearProgress = document.getElementById('yearProgress');
    if (yearProgress) {
        yearProgress.style.height = `${progress}%`;
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    const colors = {
        success: '#00ff88',
        error: '#ff6b6b',
        info: '#00d4ff',
        achievement: '#FFD700'
    };
    
    notification.style.borderColor = colors[type] || colors.info;
    notification.style.color = colors[type] || colors.info;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3500);
}

function showAchievement(message) {
    const achievement = document.getElementById('achievement');
    achievement.textContent = `🏆 ${message}`;
    achievement.classList.add('show');
    
    setTimeout(() => {
        achievement.classList.remove('show');
    }, 4000);
}

function showTooltip(card) {
    const descriptions = {
        openBorders: 'Allows unrestricted immigration. High volume, mixed economic impact.',
        skilledWorker: 'Attracts educated professionals. Major GDP boost, reduces unemployment.',
        refugee: 'Provides asylum to refugees. Humanitarian choice with moderate costs.',
        family: 'Allows family reunification. Greatly increases happiness and stability.',
        investor: 'Attracts wealthy investors. Significant budget and GDP increases.',
        strict: 'Enforces strict immigration controls. Reduces immigration flow by 50%.'
    };
    
    const policy = card.dataset.policy;
    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = `
        <div style="color: #00d4ff; font-size: 16px; margin-bottom: 8px; font-weight: bold;">${formatPolicyName(policy)}</div>
        <div style="color: #aaa; font-size: 13px; line-height: 1.5;">${descriptions[policy] || ''}</div>
    `;
    tooltip.style.opacity = '1';
    tooltip.style.left = (event.clientX + 20) + 'px';
    tooltip.style.top = (event.clientY + 20) + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.opacity = '0';
}

function startGame() {
    gameState.started = true;
    gameState.paused = false;
    gameState.budget = gameState.difficultySettings[gameState.difficulty].budget + CONFIG.INITIAL_BUDGET;
    
    document.getElementById('vrMenu').classList.remove('active');
    
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    }
    
    showNotification('🎮 Welcome to Nation Builder VR!', 'info');
    updateHUD();
}

function endGame(reason) {
    gameState.started = false;
    gameState.paused = true;
    
    const menu = document.getElementById('vrMenu');
    menu.innerHTML = `
        <div class="menu-title">GAME OVER</div>
        <div style="color: #ff6b6b; font-size: 18px; text-align: center; margin-bottom: 20px;">
            ${reason}
        </div>
        <div style="color: #aaa; margin-bottom: 30px; text-align: center; line-height: 1.8;">
            <p><strong>Years Survived:</strong> ${gameState.year - 2023}</p>
            <p><strong>Final Population:</strong> ${gameState.population.toLocaleString()}</p>
            <p><strong>Final GDP:</strong> ${gameState.gdp.toLocaleString()}</p>
            <p><strong>Final Happiness:</strong> ${gameState.happiness.toFixed(0)}%</p>
            <p><strong>Final Score:</strong> ${gameState.score.toLocaleString()}</p>
            <p><strong>Achievements:</strong> ${gameState.achievements.size}/8</p>
        </div>
        <button class="menu-button" onclick="restartGame()">🔄 RESTART GAME</button>
    `;
    menu.classList.add('active');
    document.exitPointerLock();
}

function restartGame() {
    location.reload();
}

function showTutorial() {
    alert(`
NATION BUILDER VR - ENHANCED TUTORIAL

CONTROLS:
• WASD - Move around the world
• Mouse - Look around (click to lock)
• SPACE - Jump
• E - Interact with objects
• TAB - Open/close menu
• P - Pause game
• 1-6 - Quick policy toggle

GAMEPLAY:
• Manage immigration policies to grow your nation
• Balance population, GDP, happiness, and unemployment
• Each policy has unique effects on your nation
• Random events can help or hinder your progress
• Don't run out of budget or let metrics crash
• Survive as long as possible and earn achievements

DIFFICULTY LEVELS:
• Easy: More budget, slower happiness drain
• Medium: Balanced challenge
• Hard: Limited budget, rapid changes

POLICIES EXPLAINED:
🌐 Open Borders - Many immigrants, unpredictable effects
💼 Skilled Workers - Boosts GDP, reduces unemployment
🛡️ Refugee Program - Humanitarian, moderate cost
👨‍👩‍👧‍👦 Family Reunion - Increases happiness significantly
💰 Investor Visa - Wealthy immigrants, high GDP boost
🚫 Strict Control - Reduces immigration by 50%

ACHIEVEMENTS:
Unlock 8 special achievements by reaching milestones!

Good luck building your nation!
    `);
}

function showStats() {
    const achievementList = Array.from(gameState.achievements).join(', ') || 'None yet';
    alert(`
CURRENT STATISTICS

Year: ${gameState.year}
Population: ${gameState.population.toLocaleString()}
GDP: ${gameState.gdp.toLocaleString()}
Happiness: ${gameState.happiness.toFixed(1)}%
Unemployment: ${gameState.unemployment.toFixed(1)}%
Budget: ${gameState.budget.toLocaleString()}
Score: ${gameState.score.toLocaleString()}

Difficulty: ${gameState.difficulty.toUpperCase()}
Achievements: ${gameState.achievements.size}/8

Active Policies:
${Object.keys(gameState.policies).filter(p => gameState.policies[p]).map(p => '• ' + formatPolicyName(p)).join('\n') || '• None'}
    `);
}

function toggleMenu() {
    const menu = document.getElementById('vrMenu');
    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
        if (gameState.started && !gameState.paused) {
            document.body.requestPointerLock();
        }
    } else {
        menu.classList.add('active');
        document.exitPointerLock();
    }
}

function interactWithObject() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(interactiveObjects);
    
    if (intersects.length > 0 && intersects[0].distance < 6) {
        const object = intersects[0].object.parent?.userData ? intersects[0].object.parent : intersects[0].object;
        const userData = object.userData;
        
        if (userData.interactive) {
            showNotification(`📍 ${userData.name}`, 'info');
            
            if (userData.type === 'person') {
                showNotification(`Met a ${userData.personType} immigrant`, 'info');
            }
        }
    }
}
function updateObjects(delta) {
    const elapsedTime = clock.getElapsedTime();
    
    if (monument) {
        monument.rotation.y = elapsedTime * 0.12;
    }
    
    // Update animation mixers for all people FIRST
    people.forEach((person) => {
        if (person.userData.mixer) {
            person.userData.mixer.update(delta);
        }
    });
    
    // Now update positions and behavior
    people.forEach((person, index) => {
        const data = person.userData;
        
        if (data.isIdle) {
            // IDLE STATE - standing still
            data.idleTime += delta;
            
            // Subtle idle breathing animation
            person.position.y = 0.9 + Math.sin(elapsedTime * 1.5 + index) * 0.005;
            
            // End idle period and start walking
            if (data.idleTime > 2 + Math.random() * 3) {
                data.isIdle = false;
                data.idleTime = 0;
                data.walkDirection.set(
                    Math.random() - 0.5, 
                    0, 
                    Math.random() - 0.5
                ).normalize();
                
                // Start walk animation if available
                if (data.walkAction && data.walkAction.paused) {
                    data.walkAction.play();
                    data.walkAction.timeScale = 1.0; // Normal walking speed
                }
                
                // Pause idle animation if available
                if (data.idleAction && !data.idleAction.paused) {
                    data.idleAction.pause();
                }
            }
            
        } else {
            // WALKING STATE - moving around
            
            // Calculate movement (this is what makes them actually move forward)
            const walkDistance = 0.03; // Adjust this value to control walking speed
            person.position.x += data.walkDirection.x * walkDistance;
            person.position.z += data.walkDirection.z * walkDistance;
            
            // Make person face walking direction
            if (Math.abs(data.walkDirection.x) > 0.01 || Math.abs(data.walkDirection.z) > 0.01) {
                const targetAngle = Math.atan2(data.walkDirection.x, data.walkDirection.z);
                person.rotation.y = targetAngle;
            }
            
            // Walking bobbing motion
            person.position.y = 0.9 + Math.sin(elapsedTime * 8 + index) * 0.02;
            
            // Check if person hits the border
            const distanceFromCenter = Math.sqrt(
                person.position.x * person.position.x + 
                person.position.z * person.position.z
            );
            
            if (distanceFromCenter > CONFIG.BORDER_RADIUS - 4) {
                // Hit border - bounce back
                data.walkDirection.multiplyScalar(-0.7); // Reverse and slow down
                data.walkDirection.normalize();
                
                // Add some random angle variation
                const randomAngle = (Math.random() - 0.5) * Math.PI / 3;
                const currentAngle = Math.atan2(data.walkDirection.x, data.walkDirection.z);
                const newAngle = currentAngle + randomAngle;
                
                data.walkDirection.set(
                    Math.sin(newAngle),
                    0,
                    Math.cos(newAngle)
                ).normalize();
                
                // Briefly go idle
                data.isIdle = true;
                data.idleTime = Math.random() * 1.5;
            }
            
            // Random chance to switch to idle
            if (Math.random() < 0.002) {
                data.isIdle = true;
                data.idleTime = Math.random() * 2 + 1;
            }
        }
        
        // Keep within bounds (safety check)
        const maxDistance = CONFIG.BORDER_RADIUS - 3;
        const currentDistance = Math.sqrt(person.position.x ** 2 + person.position.z ** 2);
        if (currentDistance > maxDistance) {
            const scale = maxDistance / currentDistance;
            person.position.x *= scale;
            person.position.z *= scale;
        }
    });
    
    // Update building animations
    buildings.forEach((building, index) => {
        building.rotation.y = Math.sin(elapsedTime * 0.1 + index) * 0.002;
    });
}
// Fix skinned mesh warnings
// function fixSkinnedMeshWarnings(model) {
//     model.traverse((child) => {
//         if (child.isSkinnedMesh && child.material) {
//             // Enable skinning for the material (CRITICAL for animations)
//             child.material.skinning = true;
            
//             // Disable shadows to avoid warnings
//             child.castShadow = false;
//             child.receiveShadow = false;
            
//             // If material is an array (multiple materials)
//             if (Array.isArray(child.material)) {
//                 child.material.forEach(mat => {
//                     mat.skinning = true;
//                 });
//             }
//         }
//     });
// }
function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;
    
    // FPS counter
    fpsFrames++;
    fpsTime += delta;
    if (fpsTime >= 1) {
        fps = Math.round(fpsFrames / fpsTime);
        document.getElementById('fpsCounter').textContent = `FPS: ${fps}`;
        fpsFrames = 0;
        fpsTime = 0;
    }
    
    if (gameState.paused) {
        renderer.render(scene, camera);
        return;
    }
    
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    
    if (moveForward || moveBackward) velocity.z -= direction.z * CONFIG.MOVEMENT_SPEED * 100.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * CONFIG.MOVEMENT_SPEED * 100.0 * delta;
    
    camera.translateX(-velocity.x * delta);
    camera.translateZ(-velocity.z * delta);
    
    velocity.y -= CONFIG.GRAVITY * 100.0 * delta;
    camera.position.y += velocity.y * delta;
    
    if (camera.position.y < 1.7) {
        velocity.y = 0;
        camera.position.y = 1.7;
        canJump = true;
    }
    
    updateObjects(delta);
    updateMiniMap();
    
    const currentTime = Date.now();
    if (gameState.started && currentTime - lastSimulationTime > CONFIG.SIMULATION_INTERVAL) {
        simulateYear();
        lastSimulationTime = currentTime;
    }
    
    renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
    initVRScene();
    window.startGame = startGame;
    window.restartGame = restartGame;
    window.showTutorial = showTutorial;
    window.showStats = showStats;
    window.toggleMenu = toggleMenu;
});
