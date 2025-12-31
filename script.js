// ==============================================
// SECTION 1: CONFIGURATION & GAME STATE
// ==============================================

// Removed GLTF-related variables
let modelCache = {};

// Enhanced configuration
const CONFIG = {
    SIMULATION_INTERVAL: 2500,
    INITIAL_POPULATION: 1000,
    INITIAL_GDP: 55000,
    INITIAL_HAPPINESS: 70,
    INITIAL_UNEMPLOYMENT: 5.0,
    INITIAL_BUDGET: 10000,
    MOVEMENT_SPEED: 6,
    MOUSE_SENSITIVITY: 0.002,
    JUMP_FORCE: 9,
    GRAVITY: 9.8,
    FOG_DENSITY: 0.025,
    MAX_PEOPLE: 150,
    BORDER_RADIUS: 50,
    CITY_RADIUS: 45 // Keep people away from border
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
    refugeeProgramStarted: null,
    
    policies: {
        openBorders: false,
        skilledWorker: false,
        refugee: false,
        family: false,
        investor: false,
        strict: false
    },
    
    policyCosts: {
        openBorders: 700,
        skilledWorker: 600,
        refugee: 900,
        family: 400,
        investor: -1500, // Negative = income
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

// ==============================================
// SECTION 2: CORE GAME LOGIC
// ==============================================

// Budget and Economy System
function calculateYearlyBudget() {
    let totalIncome = 0;
    let totalExpenses = 0;
    
    // INCOME
    totalIncome += Math.floor(gameState.gdp * 0.25); // 25% tax rate
    totalIncome += Math.floor(gameState.population * 0.5); // Tourism/export
    
    // POLICY INCOME (Investor visa gives money)
    if (gameState.policies.investor) {
        totalIncome += 1500;
    }
    
    // EXPENSES
    // Base infrastructure costs
    totalExpenses += Math.floor(gameState.population * 0.8); // Healthcare, education, etc.
    
    // Policy maintenance costs
    Object.keys(gameState.policies).forEach(policy => {
        if (gameState.policies[policy]) {
            const cost = gameState.policyCosts[policy];
            if (cost > 0) totalExpenses += cost;
        }
    });
    
    // Unemployment benefits
    const unemployed = Math.floor(gameState.population * (gameState.unemployment / 100));
    totalExpenses += unemployed * 100;
    
    return totalIncome - totalExpenses;
}

function simulateYear() {
    if (!gameState.started || gameState.paused) return;
    
    gameState.year++;
    
    // Track changes for this year
    let gdpChange = 0;
    let happinessChange = 0;
    let unemploymentChange = 0;
    let populationChange = 0;
    
    const difficulty = gameState.difficultySettings[gameState.difficulty];
    
    // BASE CHANGES (happens every year)
    happinessChange -= difficulty.happinessDrain;
    gdpChange += Math.floor(gameState.population / 100);
    gdpChange += Math.floor(Math.random() * 800 - 400);
    
    // --- POLICY EFFECTS ---
    
    // 1. OPEN BORDERS
    if (gameState.policies.openBorders) {
        const immigrants = 60;
        populationChange += immigrants;
        gdpChange += 1200;
        happinessChange -= 12;
        unemploymentChange += 2.5;
        spawnImmigrants(6, 'openBorders');
    }
    
    // 2. SKILLED WORKER
    if (gameState.policies.skilledWorker) {
        const immigrants = 20;
        populationChange += immigrants;
        gdpChange += 2200;
        unemploymentChange -= 1.2;
        happinessChange -= 5;
        
        if (Math.random() < 0.15) {
            populationChange -= 3;
            showNotification("🧠 Skilled workers leaving for better opportunities abroad", "error");
        }
        
        spawnImmigrants(4, 'skilledWorker');
    }
    
    // 3. REFUGEE PROGRAM
    if (gameState.policies.refugee) {
        const immigrants = 30;
        populationChange += immigrants;
        happinessChange += 8;
        gdpChange -= 400;
        unemploymentChange += 1.5;
        
        if (gameState.refugeeProgramStarted && gameState.year >= gameState.refugeeProgramStarted + 2) {
            gdpChange += 600;
            unemploymentChange -= 1.0;
            showNotification("🛡️ Refugees integrated successfully!", "success");
        }
        
        spawnImmigrants(5, 'refugee');
    }
    
    // 4. FAMILY REUNIFICATION
    if (gameState.policies.family) {
        const immigrants = 25;
        populationChange += immigrants;
        happinessChange += 15;
        gdpChange -= 300;
        
        if (Math.random() < 0.3) {
            populationChange += 5;
            showNotification("👶 Family policies lead to baby boom!", "success");
        }
        
        spawnImmigrants(5, 'family');
    }
    
    // 5. INVESTOR VISA
    if (gameState.policies.investor) {
        const immigrants = 8;
        populationChange += immigrants;
        gdpChange += 1800;
        happinessChange -= 8;
        unemploymentChange -= 0.8;
        
        if (Math.random() < 0.1) {
            gameState.budget -= 1000;
            happinessChange -= 10;
            showNotification("⚖️ Investor visa corruption scandal!", "error");
        }
        
        spawnImmigrants(2, 'investor');
    }
    
    // 6. STRICT CONTROLS
    if (gameState.policies.strict) {
        populationChange = Math.floor(populationChange * 0.5);
        gdpChange = Math.floor(gdpChange * 0.7);
        happinessChange += 20;
        
        const naturalDecline = Math.floor(gameState.population * 0.008);
        populationChange -= naturalDecline;
        gdpChange -= Math.floor(gameState.gdp * 0.01);
        
        if (naturalDecline > 0) {
            showNotification("📉 Aging population: Workforce shrinking", "error");
        }
    }
    
    // --- APPLY ALL CHANGES ---
    
    gameState.population = Math.max(100, gameState.population + populationChange);
    gameState.gdp = Math.max(1000, gameState.gdp + gdpChange);
    gameState.happiness = Math.max(0, Math.min(100, gameState.happiness + happinessChange));
    gameState.unemployment = Math.max(0, Math.min(40, gameState.unemployment + unemploymentChange));
    
    // Budget calculation
    const budgetChange = calculateYearlyBudget();
    gameState.budget += budgetChange;
    
    // Score
    const newScore = Math.floor(
        (populationChange * 2) + 
        (gdpChange / 100) + 
        (happinessChange * 3) - 
        (Math.abs(unemploymentChange) * 20)
    );
    gameState.score += Math.max(-1000, newScore);
    
    // Random events
    if (Math.random() < 0.25) {
        triggerRandomEvent();
    }
    
    checkAchievements();
    updateHUD();
    checkGameState();
    updateWeather();
    
    // Show year summary
    showYearSummary(populationChange, gdpChange, happinessChange, unemploymentChange, budgetChange);
}

function showYearSummary(popChange, gdpChange, happinessChange, unempChange, budgetChange) {
    const summary = [
        `📅 YEAR ${gameState.year} REPORT`,
        `💰 Budget: ${budgetChange > 0 ? '+' : ''}$${budgetChange.toLocaleString()}`,
        `👥 Population: ${popChange > 0 ? '+' : ''}${popChange}`,
        `📈 GDP: ${gdpChange > 0 ? '+' : ''}$${gdpChange.toLocaleString()}`,
        `😊 Happiness: ${happinessChange > 0 ? '+' : ''}${happinessChange}%`,
        `💼 Unemployment: ${unempChange > 0 ? '+' : ''}${unempChange.toFixed(1)}%`
    ].join('\n');
    
    showNotification(summary, 'info');
}

// Policy Management
function togglePolicy(policyName) {
    if (!gameState.started || gameState.paused) return;
    
    const cost = gameState.policyCosts[policyName];
    const currentState = gameState.policies[policyName];
    
    if (!currentState && cost > gameState.budget) {
        showNotification(`Insufficient Budget! Need $${cost}`, 'error');
        return;
    }
    
    gameState.policies[policyName] = !currentState;
    
    if (policyName === 'refugee' && !currentState) {
        gameState.refugeeProgramStarted = gameState.year;
        showNotification('🛡️ Refugee Program: Integration takes 2 years', 'info');
    }
    
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
        openBorders: 6,
        skilledWorker: 4,
        refugee: 5,
        family: 5,
        investor: 2,
        strict: 0
    };
    return counts[policyName] || 0;
}

// Random Events
function triggerRandomEvent() {
    const events = [
        {
            name: 'Economic Boom',
            weight: 0.25,
            effect: () => {
                const bonus = Math.floor(Math.random() * 3000 + 2000);
                gameState.gdp += bonus;
                gameState.happiness += 5;
                showNotification(`🚀 ECONOMIC BOOM! GDP +$${bonus.toLocaleString()}`, 'success');
                createParticleEffect(camera.position, 0xffcc00, 25);
            }
        },
        {
            name: 'Natural Disaster',
            weight: 0.2,
            effect: () => {
                const severity = Math.random();
                let gdpLoss, happinessLoss, populationLoss, budgetCost;
                
                if (severity < 0.33) {
                    gdpLoss = 1200;
                    happinessLoss = 8;
                    populationLoss = Math.floor(gameState.population * 0.002);
                    budgetCost = 500;
                    showNotification('🌧️ Minor Flooding!', 'error');
                } else if (severity < 0.66) {
                    gdpLoss = 2500;
                    happinessLoss = 15;
                    populationLoss = Math.floor(gameState.population * 0.005);
                    budgetCost = 1000;
                    showNotification('🌪️ Severe Storm!', 'error');
                } else {
                    gdpLoss = 5000;
                    happinessLoss = 25;
                    populationLoss = Math.floor(gameState.population * 0.01);
                    budgetCost = 2000;
                    showNotification('🔥 MAJOR EARTHQUAKE!', 'error');
                }
                
                gameState.gdp -= gdpLoss;
                gameState.happiness -= happinessLoss;
                gameState.population = Math.max(100, gameState.population - populationLoss);
                gameState.budget -= budgetCost;
                
                createParticleEffect(camera.position, 0xff0000, 30);
                
                if (populationLoss > 0) {
                    showNotification(`💔 ${populationLoss.toLocaleString()} lives lost`, 'error');
                }
            }
        },
        {
            name: 'Tech Breakthrough',
            weight: 0.15,
            effect: () => {
                gameState.unemployment = Math.max(0, gameState.unemployment - 2.5);
                gameState.gdp += 1500;
                gameState.budget -= 300;
                showNotification('💡 TECH BREAKTHROUGH!', 'success');
                createParticleEffect(camera.position, 0x00ffff, 20);
            }
        },
        {
            name: 'Cultural Festival',
            weight: 0.1,
            effect: () => {
                gameState.happiness += 12;
                gameState.budget -= 200;
                showNotification('🎭 CULTURAL FESTIVAL!', 'success');
                createParticleEffect(camera.position, 0xff69b4, 18);
            }
        },
        {
            name: 'Trade War',
            weight: 0.1,
            effect: () => {
                gameState.gdp -= 1800;
                gameState.unemployment += 1.5;
                showNotification('⚔️ TRADE WAR!', 'error');
                createParticleEffect(camera.position, 0x8B0000, 15);
            }
        }
    ];
    
    const totalWeight = events.reduce((sum, event) => sum + event.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const event of events) {
        if (random < event.weight) {
            event.effect();
            logEvent(event.name);
            break;
        }
        random -= event.weight;
    }
}

function logEvent(eventName) {
    const eventLog = document.getElementById('eventLog');
    if (eventLog) {
        const entry = document.createElement('div');
        entry.className = 'event-log-entry';
        entry.textContent = `Year ${gameState.year}: ${eventName}`;
        eventLog.prepend(entry);
        
        if (eventLog.children.length > 10) {
            eventLog.removeChild(eventLog.lastChild);
        }
    }
}

// Achievement System
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
    } else if (gameState.population <= 500) {
        endGame('⚠️ Population crisis! Not enough citizens!');
    }
}

// ==============================================
// SECTION 3: 3D WORLD & MODELS
// ==============================================

// Environment Creation
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
        const archMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xFFD700
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

// People and Population Management
function createInitialPopulation() {
    // Create citizens distributed throughout the city
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * (CONFIG.CITY_RADIUS - 10);
        createPerson(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            'citizen'
        );
    }
}

function createPerson(x, z, type = 'citizen') {
    if (people.length >= CONFIG.MAX_PEOPLE) return null;
    
    const personGroup = new THREE.Group();
    const color = getColorForType(type);
    
    // Create a simple geometric person shape
    createGeometricPerson(personGroup, color);
    
    personGroup.position.set(x, 0.9, z);
    
    // Enhanced person data with roaming
    personGroup.userData = {
        type: 'person',
        personType: type,
        destination: null,
        reachedDestination: false,
        walkTime: 0,
        idleTime: Math.random() * 3,
        isIdle: true,
        walkSpeed: Math.random() * 0.02 + 0.01,
        modelLoaded: true,
        roamRadius: CONFIG.CITY_RADIUS - 5
    };
    
    scene.add(personGroup);
    people.push(personGroup);
    interactiveObjects.push(personGroup);
    
    return personGroup;
}

function createGeometricPerson(group, color) {
    // Body (torso)
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.18, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xFFE0BD,
        roughness: 0.8,
        metalness: 0.2
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.15;
    head.castShadow = true;
    group.add(head);
    
    // Arms
    const armGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
    const armMaterial = new THREE.MeshLambertMaterial({ color: color });
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.3, 0.7, 0);
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = true;
    group.add(leftArm);
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.3, 0.7, 0);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    group.add(rightArm);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6);
    const legMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x333333,
        roughness: 0.9,
        metalness: 0.1
    });
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.1, 0.25, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.1, 0.25, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    
    // Face features (simple)
    const eyeGeometry = new THREE.SphereGeometry(0.03, 4, 4);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.05, 1.17, 0.15);
    group.add(leftEye);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.05, 1.17, 0.15);
    group.add(rightEye);
    
    // Mouth (simple line)
    const mouthGeometry = new THREE.BoxGeometry(0.08, 0.01, 0.02);
    const mouthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, 1.1, 0.15);
    group.add(mouth);
}

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

// Enhanced Person Movement with Roaming
function updatePersonMovement(person, delta) {
    const data = person.userData;
    
    if (data.isIdle) {
        // IDLE STATE
        data.idleTime -= delta;
        person.position.y = 0.9 + Math.sin(clock.elapsedTime * 1.5) * 0.005;
        
        if (data.idleTime <= 0) {
            // End idle, start walking
            data.isIdle = false;
            
            // Pick a random destination within city bounds
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * data.roamRadius;
            data.destination = new THREE.Vector3(
                Math.cos(angle) * radius,
                0.9,
                Math.sin(angle) * radius
            );
            data.reachedDestination = false;
            data.walkTime = 0;
            
            // Ensure destination is away from border
            const distanceToCenter = Math.sqrt(
                data.destination.x * data.destination.x + 
                data.destination.z * data.destination.z
            );
            if (distanceToCenter > CONFIG.CITY_RADIUS) {
                data.destination.multiplyScalar(CONFIG.CITY_RADIUS / distanceToCenter);
            }
        }
    } else {
        // WALKING STATE
        if (!data.destination || data.reachedDestination) {
            data.isIdle = true;
            data.idleTime = Math.random() * 4 + 2;
            return;
        }
        
        // Calculate direction to destination
        const direction = new THREE.Vector3()
            .subVectors(data.destination, person.position)
            .normalize();
        
        // Move toward destination
        const speed = data.walkSpeed;
        person.position.x += direction.x * speed;
        person.position.z += direction.z * speed;
        
        // Face walking direction
        if (Math.abs(direction.x) > 0.01 || Math.abs(direction.z) > 0.01) {
            const targetAngle = Math.atan2(direction.x, direction.z);
            person.rotation.y = THREE.MathUtils.lerp(person.rotation.y, targetAngle, 0.1);
        }
        
        // Walking bobbing animation
        data.walkTime += delta;
        person.position.y = 0.9 + Math.sin(data.walkTime * 8) * 0.02;
        
        // Simple arm swing animation for walking
        if (person.children.length >= 6) { // Check if we have arms and legs
            const leftArm = person.children[2];
            const rightArm = person.children[3];
            const leftLeg = person.children[4];
            const rightLeg = person.children[5];
            
            const swingAmount = Math.sin(data.walkTime * 8) * 0.3;
            leftArm.rotation.z = Math.PI / 6 + swingAmount;
            rightArm.rotation.z = -Math.PI / 6 - swingAmount;
            leftLeg.rotation.z = swingAmount * 0.5;
            rightLeg.rotation.z = -swingAmount * 0.5;
        }
        
        // Check if reached destination
        const distanceToDestination = person.position.distanceTo(data.destination);
        if (distanceToDestination < 1.0) {
            data.reachedDestination = true;
            data.isIdle = true;
            data.idleTime = Math.random() * 3 + 1;
            
            // Reset arm positions when idle
            if (person.children.length >= 6) {
                const leftArm = person.children[2];
                const rightArm = person.children[3];
                const leftLeg = person.children[4];
                const rightLeg = person.children[5];
                
                leftArm.rotation.z = Math.PI / 6;
                rightArm.rotation.z = -Math.PI / 6;
                leftLeg.rotation.z = 0;
                rightLeg.rotation.z = 0;
            }
        }
        
        // Avoid buildings
        buildings.forEach(building => {
            const distance = person.position.distanceTo(building.position);
            if (distance < 4) {
                // Too close to building, move away
                const awayDirection = new THREE.Vector3()
                    .subVectors(person.position, building.position)
                    .normalize();
                person.position.x += awayDirection.x * 0.05;
                person.position.z += awayDirection.z * 0.05;
            }
        });
        
        // Stay within city bounds
        const distanceFromCenter = Math.sqrt(
            person.position.x * person.position.x + 
            person.position.z * person.position.z
        );
        
        if (distanceFromCenter > CONFIG.CITY_RADIUS) {
            // Push back toward center
            const scale = CONFIG.CITY_RADIUS / distanceFromCenter;
            person.position.x *= scale;
            person.position.z *= scale;
            
            // Change direction
            data.destination = new THREE.Vector3(
                -person.position.x * 0.5,
                0.9,
                -person.position.z * 0.5
            );
        }
    }
}

function spawnImmigrants(count, type) {
    if (count === 0) return;
    
    const gate = gates[Math.floor(Math.random() * gates.length)];
    const spawnCount = Math.min(count, 10);
    
    for (let i = 0; i < spawnCount; i++) {
        const person = createPerson(
            gate.position.x + (Math.random() - 0.5) * 3,
            gate.position.z + (Math.random() - 0.5) * 3,
            type
        );
        
        if (person) {
            // Spawn animation
            person.scale.set(0.1, 0.1, 0.1);
            gsap.to(person.scale, {
                x: 1, y: 1, z: 1,
                duration: 0.6,
                ease: "back.out(1.7)"
            });
            
            // Give them an initial destination away from gate
            setTimeout(() => {
                if (person.userData) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.random() * (CONFIG.CITY_RADIUS - 10);
                    person.userData.destination = new THREE.Vector3(
                        Math.cos(angle) * radius,
                        0.9,
                        Math.sin(angle) * radius
                    );
                    person.userData.isIdle = false;
                }
            }, 1000);
        }
    }
}

// ==============================================
// SECTION 4: UI & CONTROLS
// ==============================================

// Loading
function updateLoadingProgress(step, message) {
    loadingProgress = (step / 8) * 100;
    document.getElementById('loadingProgress').style.width = `${loadingProgress}%`;
    document.getElementById('loadingSubtitle').textContent = message;
    document.getElementById('loadingObjects').textContent = Math.floor(50 + step * 20);
    document.getElementById('loadingTextures').textContent = Math.floor(10 + step * 4);
    document.getElementById('loadingModels').textContent = Math.floor(5 + step * 3);
}

// Mini-map
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

// Controls
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

// UI Updates
function updateHUD() {
    document.getElementById('statYear').textContent = gameState.year;
    document.getElementById('statPopulation').textContent = gameState.population.toLocaleString();
    document.getElementById('statGDP').textContent = '$' + gameState.gdp.toLocaleString();
    document.getElementById('statHappiness').textContent = gameState.happiness.toFixed(0) + '%';
    document.getElementById('statUnemployment').textContent = gameState.unemployment.toFixed(1) + '%';
    document.getElementById('statBudget').textContent = '$' + gameState.budget.toLocaleString();
    document.getElementById('statScore').textContent = gameState.score.toLocaleString();
    document.getElementById('yearDisplay').textContent = gameState.year - 2023;
    
    // Happiness bar
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
    
    // Year progress
    const now = Date.now();
    const elapsed = now - lastSimulationTime;
    const progress = Math.min(100, (elapsed / CONFIG.SIMULATION_INTERVAL) * 100);
    const yearProgress = document.getElementById('yearProgress');
    if (yearProgress) {
        yearProgress.style.height = `${progress}%`;
    }
}

function updateWeather() {
    const weathers = ['☀️', '⛅', '☁️', '🌧️'];
    const weatherIndicator = document.getElementById('weatherIndicator');
    if (Math.random() < 0.3) {
        weatherIndicator.textContent = weathers[Math.floor(Math.random() * weathers.length)];
    }
}

// Notifications
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

// Tooltips
function showTooltip(card) {
    const descriptions = {
        openBorders: 'Allows unrestricted immigration. +60 people, +$1200 GDP, -12% happiness, +2.5% unemployment. Cost: $700/year.',
        skilledWorker: 'Attracts educated professionals. +20 people, +$2200 GDP, -1.2% unemployment, -5% happiness. Risk: Brain drain. Cost: $600/year.',
        refugee: 'Provides asylum to refugees. +30 people, +8% happiness, -$400 GDP short-term, +1.5% unemployment. Benefits start after 2 years. Cost: $900/year.',
        family: 'Allows family reunification. +25 people, +15% happiness, -$300 GDP (dependents). May cause baby boom. Cost: $400/year.',
        investor: 'Attracts wealthy investors. +8 people, +$1800 GDP, -0.8% unemployment, YOU GET $1500. But -8% happiness. Risk: Corruption. Cost: -$1500 (they pay you).',
        strict: 'Enforces strict immigration controls. Reduces ALL immigration by 50%, +20% happiness, -1% GDP, population declines naturally. Cost: $300/year.'
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

// Interactions
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

// Game Management
function startGame() {
    gameState.started = true;
    gameState.paused = false;
    gameState.budget = gameState.difficultySettings[gameState.difficulty].budget + CONFIG.INITIAL_BUDGET;
    
    document.getElementById('vrMenu').classList.remove('active');
    
    // Show event log
    const eventLogPanel = document.getElementById('eventLogPanel');
    if (eventLogPanel) {
        eventLogPanel.style.display = 'block';
    }
    
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    }
    
    showNotification('🎮 Welcome to Nation Builder VR! Make tough policy choices!', 'info');
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
            <p><strong>Final GDP:</strong> $${gameState.gdp.toLocaleString()}</p>
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
• Each policy has TRADE-OFFS - nothing is free!
• Balance population, GDP, happiness, and unemployment
• Random events can help or hinder your progress
• Don't run out of budget or let metrics crash
• Survive as long as possible and earn achievements

POLICY TRADE-OFFS:
🌐 Open Borders - Many immigrants, GDP boost, but hurts happiness
💼 Skilled Workers - High GDP, but expensive and causes resentment
🛡️ Refugee Program - Humanitarian, but costly short-term
👨‍👩‍👧‍👦 Family Reunion - Great for happiness, but economic strain
💰 Investor Visa - Immediate cash, but inequality and corruption risk
🚫 Strict Control - Security and happiness, but economic decline

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
GDP: $${gameState.gdp.toLocaleString()}
Happiness: ${gameState.happiness.toFixed(1)}%
Unemployment: ${gameState.unemployment.toFixed(1)}%
Budget: $${gameState.budget.toLocaleString()}
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

// Particle Effects
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

// ==============================================
// SECTION 5: INITIALIZATION & MAIN LOOP
// ==============================================

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

// Main animation loop
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
    
    // Update animations if game not paused
    if (!gameState.paused) {
        const deltaTime = clock.getDelta();
        
        // Update all people movement
        people.forEach((person) => {
            updatePersonMovement(person, deltaTime);
        });
    }
    
    // Player movement
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
    
    // Update monument rotation
    if (monument) {
        monument.rotation.y += 0.01;
    }
    
    updateMiniMap();
    
    // Yearly simulation
    const currentTime = Date.now();
    if (gameState.started && currentTime - lastSimulationTime > CONFIG.SIMULATION_INTERVAL) {
        simulateYear();
        lastSimulationTime = currentTime;
    }
    
    renderer.render(scene, camera);
}

// Initialize everything
window.addEventListener('DOMContentLoaded', () => {
    initVRScene();
    window.startGame = startGame;
    window.restartGame = restartGame;
    window.showTutorial = showTutorial;
    window.showStats = showStats;
    window.toggleMenu = toggleMenu;
});
