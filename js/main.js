let scene, camera, renderer, controls, raycaster;
let plotMeshes = [];       // { mesh, plotId }
let vegetableMeshes = {};  // plotId -> THREE.Group
let signMeshes = {};        // plotId -> THREE.Group
let signTextureCache = {};  // vegetable key -> THREE.CanvasTexture
let fencePosts = [];        // THREE.Mesh[]
let herbContainers = [];    // THREE.Group[]
let farmerMesh       = null;
let farmerState      = 'idle';   // 'idle' | 'walking_to_plot' | 'walking_home'
let farmerWalkTarget = null;     // THREE.Vector3 | null
let farmerHarvestQueue = [];     // plotId[]
const FARMER_HOME       = new THREE.Vector3(-2.5, 0, -5.5);
const FARMER_WALK_SPEED = 3.5;   // world-units per second

// ── Dog rescue ───────────────────────────────────────────────────────────────
let dogMesh       = null;
let dogState      = 'absent';   // 'absent' | 'walking_in' | 'walking_out'
let dogWalkTarget = null;
let dogCooldown   = 0;          // seconds until next possible visit
const DOG_HOME        = new THREE.Vector3(-2.0, 0, -9.2); // beside barn
const DOG_DROP        = new THREE.Vector3( 0.0, 0, -3.4); // garden entrance
const DOG_WALK_SPEED  = 2.8;
const DOG_COINS       = 6;
const DOG_COOLDOWN_S  = 60;

// ── Bird ─────────────────────────────────────────────────────────────────────
let birdMesh      = null;
let birdVel       = null;      // THREE.Vector3
let birdBaseY     = 0;
let birdTimer     = 30;        // seconds until first/next spawn
let droppingCoins = [];        // { mesh, vel, age }

const BIRD_SPEED = 8.5;
const BIRD_COINS = 5;

let gameState;
let selectedPlotId = null;
let selectedHerbContainerId = null;
let lastTime = 0;
let touchStart = null;

const isMobile = () => window.innerWidth < 641 || /Mobi|Android/i.test(navigator.userAgent);

const PLOT_SIZE = 2.0;
const PLOT_GAP  = 0.3;
const PLOT_H    = 0.18;

// ── Scene setup ──────────────────────────────────────────────────────────────

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 25, 55);

  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  setCameraForViewport();
  camera.lookAt(0, 0, 0);

  const mobile = isMobile();
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: !mobile });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Orbit controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 6;
  controls.maxDistance = 35;
  controls.target.set(0, 0, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xFFE4B5, 1.3);
  sun.position.set(12, 20, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.width  = mobile ? 1024 : 2048;
  sun.shadow.mapSize.height = mobile ? 1024 : 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0x4a7c3f })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  addDecorations();

  raycaster = new THREE.Raycaster();
  gameState = new GameState();
  rebuildGarden();

  // Mouse events (desktop)
  renderer.domElement.addEventListener('click', e => handleTap(e));
  renderer.domElement.addEventListener('mousemove', onCanvasHover);

  // Touch events (mobile) — detect taps separately from OrbitControls drags
  renderer.domElement.addEventListener('touchstart', e => {
    if (e.touches.length === 1)
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    else
      touchStart = null;
  }, { passive: true });

  renderer.domElement.addEventListener('touchend', e => {
    if (!touchStart || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - touchStart.x);
    const dy = Math.abs(t.clientY - touchStart.y);
    const dt = Date.now() - touchStart.t;
    touchStart = null;
    if (dx < 14 && dy < 14 && dt < 350) {
      handleTap({ clientX: t.clientX, clientY: t.clientY });
    }
  }, { passive: true });

  window.addEventListener('resize', onResize);

  // Shop FAB (mobile)
  const shopToggle = document.getElementById('shop-toggle');
  const shopPanel  = document.getElementById('shop-panel');
  const backdrop   = document.getElementById('backdrop');

  shopToggle.addEventListener('click', () => {
    const open = shopPanel.classList.toggle('open');
    backdrop.classList.toggle('visible', open);
  });
  backdrop.addEventListener('click', () => {
    shopPanel.classList.remove('open');
    backdrop.classList.remove('visible');
    document.getElementById('plant-menu').classList.add('hidden');
    selectedPlotId = null;
    selectedHerbContainerId = null;
  });

  document.getElementById('close-plant-menu').addEventListener('click', closePlantMenu);

  // ── Swipe-down to dismiss plant/herb menu ────────────────────────────────
  const plantMenu = document.getElementById('plant-menu');
  let menuSwipeY = null;
  plantMenu.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && plantMenu.scrollTop <= 0)
      menuSwipeY = e.touches[0].clientY;
  }, { passive: true });
  plantMenu.addEventListener('touchend', e => {
    if (menuSwipeY === null || e.changedTouches.length !== 1) { menuSwipeY = null; return; }
    const dy = e.changedTouches[0].clientY - menuSwipeY;
    menuSwipeY = null;
    if (dy > 60) closePlantMenu();
  }, { passive: true });

  // ── Swipe-down to dismiss shop drawer ───────────────────────────────────
  let shopSwipeY = null;
  shopPanel.addEventListener('touchstart', e => {
    if (e.touches.length === 1 && shopPanel.scrollTop <= 0)
      shopSwipeY = e.touches[0].clientY;
  }, { passive: true });
  shopPanel.addEventListener('touchend', e => {
    if (shopSwipeY === null || e.changedTouches.length !== 1) { shopSwipeY = null; return; }
    const dy = e.changedTouches[0].clientY - shopSwipeY;
    shopSwipeY = null;
    if (dy > 60) {
      shopPanel.classList.remove('open');
      backdrop.classList.remove('visible');
    }
  }, { passive: true });

  document.getElementById('recenter-btn').addEventListener('click', () => {
    setCameraForViewport();
    camera.updateProjectionMatrix();
  });

  buildUpgradesUI();
  onResize(); // set correct FOV for current orientation
  requestAnimationFrame(animate);
}

// ── Barn ─────────────────────────────────────────────────────────────────────

function buildPrismRoof(halfW, peakH, halfD) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -halfW, 0,  halfD,   //0 front-left
     halfW, 0,  halfD,   //1 front-right
         0, peakH,  halfD,  //2 front-peak
    -halfW, 0, -halfD,   //3 back-left
     halfW, 0, -halfD,   //4 back-right
         0, peakH, -halfD,  //5 back-peak
  ]), 3));
  geo.setIndex([0,2,1, 3,4,5, 0,3,5, 0,5,2, 1,2,5, 1,5,4]);
  geo.computeVertexNormals();
  return geo;
}

function buildGableTriangle(halfW, peakH, frontFace) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -halfW, 0, 0,  halfW, 0, 0,  0, peakH, 0,
  ]), 3));
  geo.setIndex(frontFace ? [0,2,1] : [0,1,2]);
  geo.computeVertexNormals();
  return geo;
}

function addXCross(parent, cx, cy, cz, w, h, mat) {
  const len = Math.hypot(w, h);
  const a   = Math.atan2(h, w);
  [a, -a].forEach(angle => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.06), mat);
    bar.position.set(cx, cy, cz);
    bar.rotation.z = angle;
    parent.add(bar);
  });
}

function createBarn() {
  const g = new THREE.Group();
  const bW = 5.0, bH = 3.6, bD = 8.0, rH = 2.8;
  const fY = 0.28; // foundation height

  const redMat   = new THREE.MeshLambertMaterial({ color: 0x7A1010 });
  const roofMat  = new THREE.MeshLambertMaterial({ color: 0x282828, side: THREE.DoubleSide });
  const doorMat  = new THREE.MeshLambertMaterial({ color: 0x3E1C06 });
  const trimMat  = new THREE.MeshLambertMaterial({ color: 0xECE9CC });
  const winMat   = new THREE.MeshLambertMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.75 });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8A8A78 });

  // Stone foundation
  const fnd = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.5, fY, bD + 0.5), stoneMat);
  fnd.position.y = fY / 2;
  fnd.receiveShadow = true;
  g.add(fnd);

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), redMat);
  body.position.y = fY + bH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Gable triangles (fill gap above walls at each end)
  const wallTop = fY + bH;
  const frontGable = new THREE.Mesh(buildGableTriangle(bW / 2, rH, true), redMat);
  frontGable.position.set(0, wallTop, bD / 2);
  g.add(frontGable);
  const backGable = new THREE.Mesh(buildGableTriangle(bW / 2, rH, false), redMat);
  backGable.position.set(0, wallTop, -bD / 2);
  g.add(backGable);

  // Peaked roof — slightly wider/longer than body for overhang
  const roof = new THREE.Mesh(buildPrismRoof(bW/2 + 0.4, rH + 0.08, bD/2 + 0.3), roofMat);
  roof.position.y = wallTop;
  roof.castShadow = true;
  g.add(roof);

  // Ridge beam along the top
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, bD + 0.6), roofMat);
  ridge.position.set(0, wallTop + rH + 0.09, 0);
  g.add(ridge);

  // Barn doors (two panels, front face)
  const dW = 1.35, dH = 2.3, dY = fY + dH / 2;
  [-1, 1].forEach(side => {
    const xOff = side * dW / 2;
    const door = new THREE.Mesh(new THREE.BoxGeometry(dW, dH, 0.09), doorMat);
    door.position.set(xOff, dY, bD/2 + 0.06);
    door.castShadow = true;
    g.add(door);
    addXCross(g, xOff, dY, bD/2 + 0.13, dW * 0.8, dH * 0.8, trimMat);
  });

  // Door surround trim
  const dsTop = new THREE.Mesh(new THREE.BoxGeometry(dW * 2 + 0.2, 0.13, 0.09), trimMat);
  dsTop.position.set(0, fY + dH + 0.07, bD/2 + 0.08);
  g.add(dsTop);
  [-dW, 0, dW].forEach(x => {
    const dsV = new THREE.Mesh(new THREE.BoxGeometry(0.13, dH + 0.2, 0.09), trimMat);
    dsV.position.set(x, dY, bD/2 + 0.08);
    g.add(dsV);
  });

  // Loft window in front gable
  const winY = wallTop + rH * 0.5;
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), winMat);
  win.position.set(0, winY, bD/2 + 0.07);
  g.add(win);
  // Window frame
  [[bW, 0.12, 0.7 + 0.16, winY + 0.41], [bW, 0.12, 0.7 + 0.16, winY - 0.41]].forEach(([,w,h,y]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.9 + 0.2, 0.12, 0.09), trimMat);
    f.position.set(0, y, bD/2 + 0.09);
    g.add(f);
  });
  [-0.55, 0.55].forEach(x => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7 + 0.16, 0.09), trimMat);
    f.position.set(x, winY, bD/2 + 0.09);
    g.add(f);
  });

  // Corner trim boards
  [-bW/2, bW/2].forEach(x => [-bD/2, bD/2].forEach(z => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, bH + 0.1, 0.16), trimMat);
    t.position.set(x, fY + bH/2, z);
    g.add(t);
  }));

  // Horizontal siding lines (just 3 accent strips for detail)
  [1.2, 2.2, 3.1].forEach(y => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(bW + 0.04, 0.07, bD + 0.04), trimMat);
    strip.position.set(0, fY + y, 0);
    g.add(strip);
  });

  g.position.set(-3, 0, -11);
  g.rotation.y = 0.15; // slight angle so you see the front and one side
  scene.add(g);
}

// ── Decorations ──────────────────────────────────────────────────────────────

function buildFence(gridSize) {
  // Remove existing posts
  fencePosts.forEach(p => scene.remove(p));
  fencePosts = [];

  const total    = gridSize * (PLOT_SIZE + PLOT_GAP) - PLOT_GAP;
  const halfFence = total / 2 + 1.2; // 1.2 units of clearance outside the plots
  const iMax     = Math.floor(halfFence);
  const postMat  = new THREE.MeshLambertMaterial({ color: 0x8B6914 });

  for (let i = -iMax; i <= iMax; i++) {
    [[i, halfFence], [i, -halfFence], [halfFence, i], [-halfFence, i]].forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), postMat);
      post.position.set(x, 0.3, z);
      post.castShadow = true;
      scene.add(post);
      fencePosts.push(post);
    });
  }
}

// ── Herb containers ──────────────────────────────────────────────────────────

function createHerbContainerMesh() {
  const g = new THREE.Group();

  // Locked colours — darker/unsaturated until purchased
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x4A2E0C });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x4A2E0C });
  const soilMat = new THREE.MeshLambertMaterial({ color: 0x5C3A1A });

  // Planter body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.30, 0.46), woodMat);
  body.position.y = 0.15;
  body.castShadow = true;
  g.add(body);

  // Top trim rail
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.06, 0.50), trimMat);
  trim.position.y = 0.285;
  g.add(trim);

  // Soil surface — hidden until unlocked
  const soil = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.36), soilMat);
  soil.position.y = 0.305;
  soil.visible = false;
  g.add(soil);

  // Store refs for unlock animation
  g.userData.woodMat = woodMat;
  g.userData.trimMat = trimMat;
  g.userData.soilMesh = soil;

  // Bobbing coin — removed when box is purchased
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.028, 12),
    new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0x886600 })
  );
  coin.rotation.x = Math.PI / 2; // stand the coin upright
  coin.position.y = 0.52;
  g.add(coin);
  g.userData.coinMesh = coin;

  return g;
}

function unlockHerbContainerVisual(cg) {
  cg.userData.woodMat.color.setHex(0x7B4F1A);
  cg.userData.trimMat.color.setHex(0xA0692A);
  cg.userData.soilMesh.visible = true;
  if (cg.userData.coinMesh) {
    cg.remove(cg.userData.coinMesh);
    cg.userData.coinMesh = null;
  }
}

function buildHerbContainers(gridSize) {
  // Remove existing
  herbContainers.forEach(c => scene.remove(c));
  herbContainers = [];
  if (!gameState) return;

  const total      = gridSize * (PLOT_SIZE + PLOT_GAP) - PLOT_GAP;
  const gardenHalf = total / 2;
  const stripMid   = gardenHalf + 0.6; // halfway between garden edge and fence

  // Plot-column centres along each axis
  const centres = [];
  for (let i = 0; i < gridSize; i++)
    centres.push(-gardenHalf + PLOT_SIZE / 2 + i * (PLOT_SIZE + PLOT_GAP));

  let idx = 0;
  const tag = (c, id) => {
    c.userData.containerId = id;
    c.traverse(child => {
      if (child.isMesh) { child.userData.isHerbContainer = true; child.userData.containerId = id; }
    });
  };

  centres.forEach(pos => {
    // North / South sides — long axis along X
    [-stripMid, stripMid].forEach(z => {
      const c = createHerbContainerMesh();
      c.position.set(pos, 0, z);
      tag(c, idx++);
      scene.add(c);
      herbContainers.push(c);
    });
    // East / West sides — long axis along Z, rotate 90°
    [-stripMid, stripMid].forEach(x => {
      const c = createHerbContainerMesh();
      c.position.set(x, 0, pos);
      c.rotation.y = Math.PI / 2;
      tag(c, idx++);
      scene.add(c);
      herbContainers.push(c);
    });
  });

  gameState.resetHerbStates(herbContainers.length);
  // Restore unlock visuals for any already-purchased slots
  herbContainers.forEach((cg, i) => {
    if (gameState.herbStates[i] && !gameState.herbStates[i].locked)
      unlockHerbContainerVisual(cg);
  });
}

// ── Farmer ───────────────────────────────────────────────────────────────────

function createFarmerMesh() {
  const g = new THREE.Group();

  const skinMat    = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
  const overallMat = new THREE.MeshLambertMaterial({ color: 0x3B6EA8 });
  const shirtMat   = new THREE.MeshLambertMaterial({ color: 0xF0D9A0 });
  const hatMat     = new THREE.MeshLambertMaterial({ color: 0xD4AC0D });
  const hatBandMat = new THREE.MeshLambertMaterial({ color: 0x4E342E });
  const bootMat    = new THREE.MeshLambertMaterial({ color: 0x3E2723 });

  // ── Legs (pivot at hip so they swing during walking) ──────────────────────
  const leftLegPivot  = new THREE.Group();
  const rightLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.10, 0.50, 0);
  rightLegPivot.position.set( 0.10, 0.50, 0);

  [leftLegPivot, rightLegPivot].forEach(pivot => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.50, 0.15), overallMat);
    leg.position.set(0, -0.25, 0);
    leg.castShadow = true;
    pivot.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.20), bootMat);
    boot.position.set(0, -0.53, 0.02);
    pivot.add(boot);
    g.add(pivot);
  });
  g.userData.leftLegPivot  = leftLegPivot;
  g.userData.rightLegPivot = rightLegPivot;

  // ── Torso ──────────────────────────────────────────────────────────────────
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.48, 0.22), overallMat);
  torso.position.set(0, 0.74, 0);
  torso.castShadow = true;
  g.add(torso);

  // Denim bib / strap accent
  const bibMat = new THREE.MeshLambertMaterial({ color: 0x2860A8 });
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.24), bibMat);
  bib.position.set(0, 0.90, 0);
  g.add(bib);

  // ── Arms (pivot at shoulder so they swing) ─────────────────────────────────
  const leftArmPivot  = new THREE.Group();
  const rightArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.27, 1.00, 0);
  rightArmPivot.position.set( 0.27, 1.00, 0);

  [leftArmPivot, rightArmPivot].forEach(pivot => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.40, 0.14), shirtMat);
    arm.position.set(0, -0.20, 0);
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 5, 4), skinMat);
    hand.position.set(0, -0.43, 0);
    pivot.add(hand);
    g.add(pivot);
  });
  g.userData.leftArmPivot  = leftArmPivot;
  g.userData.rightArmPivot = rightArmPivot;

  // ── Head ───────────────────────────────────────────────────────────────────
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.28), skinMat);
  head.position.set(0, 1.13, 0);
  head.castShadow = true;
  g.add(head);

  // Eyes
  [-0.075, 0.075].forEach(x => {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.042, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    eye.position.set(x, 1.14, 0.145);
    g.add(eye);
  });

  // Smile
  const smileMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  [-0.05, 0.05].forEach((x, i) => {
    const sm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.035), smileMat);
    sm.position.set(x, 1.08, 0.145);
    sm.rotation.z = i === 0 ? 0.3 : -0.3;
    g.add(sm);
  });

  // ── Straw hat ──────────────────────────────────────────────────────────────
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.055, 14), hatMat);
  brim.position.set(0, 1.305, 0);
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.22, 0.24, 10), hatMat);
  crown.position.set(0, 1.415, 0);
  g.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.06, 10), hatBandMat);
  band.position.set(0, 1.315, 0);
  g.add(band);

  return g;
}

function showFarmer() {
  if (farmerMesh) return;
  farmerMesh = createFarmerMesh();
  farmerMesh.position.copy(FARMER_HOME);
  // Face the garden from home
  const toGarden = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), FARMER_HOME);
  farmerMesh.rotation.y = Math.atan2(toGarden.x, toGarden.z);
  scene.add(farmerMesh);
}

// items = array of { type: 'plot'|'herb', id: number }
function queueFarmerHarvest(items) {
  items.forEach(item => {
    if (!farmerHarvestQueue.some(q => q.type === item.type && q.id === item.id))
      farmerHarvestQueue.push(item);
  });
  if (farmerState === 'idle') walkFarmerToNext();
  else if (farmerState === 'walking_home' && farmerHarvestQueue.length > 0) walkFarmerToNext();
}

function walkFarmerToNext() {
  if (farmerHarvestQueue.length > 0) {
    const item = farmerHarvestQueue[0]; // peek — shift happens on arrival
    let pos;
    if (item.type === 'plot') {
      const plot = gameState.plots.find(p => p.id === item.id);
      if (!plot) { farmerHarvestQueue.shift(); walkFarmerToNext(); return; }
      const { x, z } = plotWorldPos(plot.row, plot.col);
      pos = new THREE.Vector3(x, 0, z);
    } else {
      const cg = herbContainers[item.id];
      if (!cg) { farmerHarvestQueue.shift(); walkFarmerToNext(); return; }
      pos = new THREE.Vector3(cg.position.x, 0, cg.position.z);
    }
    farmerWalkTarget = pos;
    farmerState = 'walking_to_plot';
  } else {
    farmerWalkTarget = FARMER_HOME.clone();
    farmerState = 'walking_home';
  }
}

function updateFarmer(deltaS, time) {
  if (!farmerMesh) return;

  // Limb swing — fast when walking, barely perceptible at idle
  const walking = farmerState !== 'idle';
  const swing = Math.sin(time * 0.006) * (walking ? 0.65 : 0.04);
  farmerMesh.userData.leftArmPivot.rotation.x  =  swing;
  farmerMesh.userData.rightArmPivot.rotation.x = -swing;
  farmerMesh.userData.leftLegPivot.rotation.x  = -swing * 0.75;
  farmerMesh.userData.rightLegPivot.rotation.x =  swing * 0.75;

  if (!farmerWalkTarget) return;

  const pos = farmerMesh.position;
  const dx = farmerWalkTarget.x - pos.x;
  const dz = farmerWalkTarget.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Face the direction of travel
  farmerMesh.rotation.y = Math.atan2(dx, dz);

  if (dist < 0.18) {
    // Arrived at destination
    farmerMesh.position.copy(farmerWalkTarget);
    farmerWalkTarget = null;

    if (farmerState === 'walking_to_plot') {
      const item = farmerHarvestQueue.shift();
      let toastMsg = null;
      if (item.type === 'plot') {
        const result = gameState.harvest(item.id);
        if (result) {
          removeVegetableMesh(item.id);
          removeSignMesh(item.id);
          toastMsg = `🌾 +🪙${result.earned}  ${result.emoji} ${result.vegName}`;
        }
      } else {
        const result = gameState.harvestHerb(item.id);
        if (result) toastMsg = `🌾 +🪙${result.earned}  ${result.emoji} ${result.herbName}`;
      }
      if (toastMsg) { showToast(toastMsg); updateUI(); }
      walkFarmerToNext();
    } else {
      // Back home — rest and face the garden
      farmerState = 'idle';
      const toGarden = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), FARMER_HOME);
      farmerMesh.rotation.y = Math.atan2(toGarden.x, toGarden.z);
    }
  } else {
    const step = FARMER_WALK_SPEED * deltaS;
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
  }
}

// ── Dog ──────────────────────────────────────────────────────────────────────

function createDogMesh() {
  const g = new THREE.Group();

  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xC8860A }); // golden brown
  const bellyMat = new THREE.MeshLambertMaterial({ color: 0xEDD28A }); // pale belly
  const noseMat  = new THREE.MeshLambertMaterial({ color: 0x1A0A00 });
  const eyeMat   = new THREE.MeshLambertMaterial({ color: 0x1A0A00 });

  // Body (dog faces +Z by default)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 0.50), bodyMat);
  body.position.set(0, 0.38, 0);
  body.castShadow = true;
  g.add(body);

  // Belly highlight
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.36), bellyMat);
  belly.position.set(0, 0.26, 0.02);
  g.add(belly);

  // Neck
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.16), bodyMat);
  neck.position.set(0, 0.50, 0.28);
  g.add(neck);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.23, 0.24), bodyMat);
  head.position.set(0, 0.58, 0.43);
  head.castShadow = true;
  g.add(head);

  // Snout (protrudes toward +Z)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), bellyMat);
  snout.position.set(0, 0.52, 0.57);
  g.add(snout);

  // Nose tip
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), noseMat);
  nose.position.set(0, 0.57, 0.65);
  g.add(nose);

  // Eyes
  [-0.09, 0.09].forEach(x => {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.04), eyeMat);
    eye.position.set(x, 0.63, 0.55);
    g.add(eye);
  });

  // Floppy ears
  [-0.148, 0.148].forEach(x => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.11), bodyMat);
    ear.position.set(x, 0.54, 0.43);
    g.add(ear);
  });

  // Tail pivot (at -Z end of body — tail wags side to side)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.42, -0.25);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.065, 0.22), bodyMat);
  tail.position.set(0, 0.10, -0.07);
  tail.rotation.x = 0.5; // natural upward tilt
  tailPivot.add(tail);
  g.add(tailPivot);
  g.userData.tailPivot = tailPivot;

  // Legs — pivot at hip, leg hangs down; trot in X-rotation
  // Order: [front-right, front-left, back-right, back-left]
  const legDefs = [
    {  x:  0.12, z:  0.14 },
    {  x: -0.12, z:  0.14 },
    {  x:  0.12, z: -0.14 },
    {  x: -0.12, z: -0.14 },
  ];
  const legPivots = [];
  legDefs.forEach(({ x, z }) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.29, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.26, 0.09), bodyMat);
    leg.position.y = -0.13;
    leg.castShadow = true;
    pivot.add(leg);
    g.add(pivot);
    legPivots.push(pivot);
  });
  g.userData.legPivots = legPivots;

  return g;
}

function spawnDog() {
  dogMesh = createDogMesh();
  dogMesh.position.copy(DOG_HOME);
  // Face toward garden initially
  const dx = DOG_DROP.x - DOG_HOME.x, dz = DOG_DROP.z - DOG_HOME.z;
  dogMesh.rotation.y = Math.atan2(dx, dz);
  scene.add(dogMesh);
  dogState      = 'walking_in';
  dogWalkTarget = DOG_DROP.clone();
}

function updateDog(deltaS, time) {
  if (!dogMesh) return;

  // Tail wags at all times
  dogMesh.userData.tailPivot.rotation.y = Math.sin(time * 0.008) * 0.65;

  // Leg trot while walking (diagonal pairs: FR+BL vs FL+BR)
  const pivots = dogMesh.userData.legPivots;
  if (dogWalkTarget) {
    const swing = Math.sin(time * 0.007) * 0.52;
    pivots[0].rotation.x =  swing; // front-right
    pivots[1].rotation.x = -swing; // front-left
    pivots[2].rotation.x = -swing; // back-right
    pivots[3].rotation.x =  swing; // back-left
  } else {
    pivots.forEach(p => { p.rotation.x = 0; });
  }

  if (!dogWalkTarget) return;

  const pos = dogMesh.position;
  const dx  = dogWalkTarget.x - pos.x;
  const dz  = dogWalkTarget.z - pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  dogMesh.rotation.y = Math.atan2(dx, dz);

  if (dist < 0.18) {
    dogMesh.position.copy(dogWalkTarget);
    dogWalkTarget = null;

    if (dogState === 'walking_in') {
      // Drop coins, immediately head back — no sitting delay
      gameState.points += DOG_COINS;
      showToast(`🐕 A dog dropped off 🪙${DOG_COINS} gold!`);
      updateUI();
      dogState      = 'walking_out';
      dogWalkTarget = DOG_HOME.clone();
    } else if (dogState === 'walking_out') {
      scene.remove(dogMesh);
      dogMesh     = null;
      dogState    = 'absent';
      dogCooldown = DOG_COOLDOWN_S;
    }
  } else {
    const step = DOG_WALK_SPEED * deltaS;
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
  }
}

// ── Bird ─────────────────────────────────────────────────────────────────────

function createBirdMesh() {
  const g = new THREE.Group();

  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x5B9BD5 }); // sky blue
  const wingMat  = new THREE.MeshLambertMaterial({ color: 0x2E6FAF }); // deep blue
  const bellyMat = new THREE.MeshLambertMaterial({ color: 0xF0EDE0 }); // off-white
  const beakMat  = new THREE.MeshLambertMaterial({ color: 0xFF9900 }); // orange
  const eyeMat   = new THREE.MeshLambertMaterial({ color: 0x111111 });

  // Body — faces +Z by default so atan2(dx,dz) rotation aligns naturally
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
  body.scale.set(0.75, 0.70, 1.15);
  body.castShadow = true;
  g.add(body);

  // Belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), bellyMat);
  belly.scale.set(0.60, 0.55, 0.80);
  belly.position.set(0, -0.10, 0.03);
  g.add(belly);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), bodyMat);
  head.position.set(0, 0.12, 0.20);
  g.add(head);

  // Beak (cone pointing +Z)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 5), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.11, 0.36);
  g.add(beak);

  // Eye
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.030, 5, 4), eyeMat);
  eye.position.set(0.065, 0.175, 0.28);
  g.add(eye);

  // Tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 0.18), bodyMat);
  tail.position.set(0, -0.06, -0.28);
  tail.rotation.x = 0.35;
  g.add(tail);

  // Wings — each wing is offset from pivot so rotation.z flaps it up/down
  [{ px: -0.15, wx: -0.16 }, { px: 0.15, wx: 0.16 }].forEach(({ px, wx }) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, 0.02, -0.02);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.035, 0.24), wingMat);
    wing.position.set(wx, 0, 0);
    wing.castShadow = true;
    pivot.add(wing);
    g.add(pivot);
    if (px < 0) g.userData.leftWingPivot  = pivot;
    else        g.userData.rightWingPivot = pivot;
  });

  return g;
}

function spawnBird() {
  if (birdMesh) return;
  const fromLeft = Math.random() < 0.5;
  birdBaseY = 7.5 + Math.random() * 3.0;   // 7.5 – 10.5 above ground
  const z   = -7  + Math.random() * 9.0;   // pass through/over the garden
  birdMesh  = createBirdMesh();
  birdMesh.position.set(fromLeft ? -22 : 22, birdBaseY, z);
  birdMesh.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
  birdVel = new THREE.Vector3(fromLeft ? BIRD_SPEED : -BIRD_SPEED, 0, 0);
  scene.add(birdMesh);
}

function removeBird() {
  if (!birdMesh) return;
  scene.remove(birdMesh);
  birdMesh = null;
  birdVel  = null;
}

function playChirp() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [
      { freq: 880,  t: 0.00, dur: 0.09 },
      { freq: 1200, t: 0.10, dur: 0.07 },
      { freq: 1050, t: 0.18, dur: 0.11 },
    ].forEach(({ freq, t, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.09, ctx.currentTime + t + dur * 0.55);
      gain.gain.setValueAtTime(0.28, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.02);
    });
  } catch (_) { /* audio unavailable */ }
}

function spawnCoinBurst(pos) {
  for (let i = 0; i < BIRD_COINS; i++) {
    const mat  = new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0x886600 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), mat);
    coin.rotation.x = Math.PI / 2; // stand upright
    coin.position.copy(pos);
    const angle = (i / BIRD_COINS) * Math.PI * 2 + Math.random() * 0.4;
    const hSpeed = 1.8 + Math.random() * 1.6;
    scene.add(coin);
    droppingCoins.push({
      mesh: coin,
      vel:  new THREE.Vector3(Math.cos(angle) * hSpeed, 3.5 + Math.random() * 2, Math.sin(angle) * hSpeed),
      age:  0,
    });
  }
}

function updateDroppingCoins(deltaS) {
  const MAX_AGE = 1.6;
  for (let i = droppingCoins.length - 1; i >= 0; i--) {
    const c = droppingCoins[i];
    c.age += deltaS;
    c.vel.y -= 14 * deltaS;   // gravity
    c.mesh.position.addScaledVector(c.vel, deltaS);
    c.mesh.rotation.y += deltaS * 5;
    // Bounce off ground
    if (c.mesh.position.y < 0.06) {
      c.mesh.position.y = 0.06;
      c.vel.y  = Math.abs(c.vel.y) * 0.35;
      c.vel.x *= 0.65; c.vel.z *= 0.65;
    }
    // Fade in last 30% of life
    const t = c.age / MAX_AGE;
    if (t > 0.70) {
      c.mesh.material.transparent = true;
      c.mesh.material.opacity = 1 - (t - 0.70) / 0.30;
    }
    if (c.age >= MAX_AGE) {
      scene.remove(c.mesh);
      droppingCoins.splice(i, 1);
    }
  }
}

function getBirdUnderMouse(event) {
  if (!birdMesh) return false;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = ((event.clientX - rect.left) / rect.width)  *  2 - 1;
  const my = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const meshes = [];
  birdMesh.traverse(ch => { if (ch.isMesh) meshes.push(ch); });
  return raycaster.intersectObjects(meshes).length > 0;
}

function handleBirdClick() {
  if (!birdMesh) return;
  const pos = birdMesh.position.clone();
  playChirp();
  spawnCoinBurst(pos);
  gameState.points += BIRD_COINS;
  showToast(`🐦 Tweet! +🪙${BIRD_COINS} gold!`);
  updateUI();
  removeBird();
  birdTimer = 30; // reset timer for next visit
}

function updateBird(deltaS, time) {
  if (!birdMesh || !birdVel) return;
  // Flapping wings — rotation.z on each pivot sweeps tip up/down in local Y
  const flap = Math.sin(time * 0.015) * 0.70;
  birdMesh.userData.leftWingPivot.rotation.z  = -flap;
  birdMesh.userData.rightWingPivot.rotation.z =  flap;
  // Gentle altitude bob around base Y
  birdMesh.position.y = birdBaseY + Math.sin(time * 0.003) * 0.28;
  // Advance along flight path
  birdMesh.position.addScaledVector(birdVel, deltaS);
  // Exit scene — reset timer
  if (Math.abs(birdMesh.position.x) > 22) {
    removeBird();
    birdTimer = 30;
  }
}

function addDecorations() {
  createBarn();

  buildFence(3); // initial 3×3 grid (gameState not yet constructed here)

  // Trees — kept far enough from the camera not to obstruct mobile view
  const treePositions = [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, -14], [-14, 0]];
  treePositions.forEach(([x, z]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.25, 1.4, 7),
      new THREE.MeshLambertMaterial({ color: 0x6D4C41 })
    );
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const foliage = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0x2E7D32 })
    );
    foliage.position.set(x, 2.2, z);
    foliage.castShadow = true;
    scene.add(foliage);
  });
}

// ── Garden grid ───────────────────────────────────────────────────────────────

function plotWorldPos(row, col) {
  const total = gameState.gridSize * (PLOT_SIZE + PLOT_GAP) - PLOT_GAP;
  const off = total / 2 - PLOT_SIZE / 2;
  return { x: col * (PLOT_SIZE + PLOT_GAP) - off, z: row * (PLOT_SIZE + PLOT_GAP) - off };
}

function rebuildGarden() {
  plotMeshes.forEach(({ mesh }) => scene.remove(mesh));
  plotMeshes = [];
  Object.values(vegetableMeshes).forEach(m => scene.remove(m));
  vegetableMeshes = {};
  Object.values(signMeshes).forEach(m => scene.remove(m));
  signMeshes = {};

  const borderMat = new THREE.MeshLambertMaterial({ color: 0x4E342E });

  gameState.plots.forEach(plot => {
    const { x, z } = plotWorldPos(plot.row, plot.col);

    const border = new THREE.Mesh(new THREE.BoxGeometry(PLOT_SIZE + 0.12, PLOT_H * 0.45, PLOT_SIZE + 0.12), borderMat);
    border.position.set(x, PLOT_H * 0.22, z);
    border.receiveShadow = true;
    scene.add(border);
    plotMeshes.push({ mesh: border, plotId: null });

    // Each plot gets its own material so hover color changes don't bleed to others
    const soil = new THREE.Mesh(new THREE.BoxGeometry(PLOT_SIZE, PLOT_H, PLOT_SIZE),
      new THREE.MeshLambertMaterial({ color: 0x7B5428 }));
    soil.position.set(x, PLOT_H / 2, z);
    soil.receiveShadow = true;
    soil.castShadow = false;
    soil.userData.plotId = plot.id;
    soil.userData.isPlot = true;
    soil.userData.origColor = 0x7B5428;
    scene.add(soil);
    plotMeshes.push({ mesh: soil, plotId: plot.id });

    if (plot.vegetable) { addVegetableMesh(plot); addSignMesh(plot); }
  });

  buildHerbContainers(gameState.gridSize);
}

function addVegetableMesh(plot) {
  const group = new THREE.Group();
  const { x, z } = plotWorldPos(plot.row, plot.col);

  // 2 rows × 3 columns of plants per plot
  const COLS = 3, ROWS = 2;
  const spX = 0.62, spZ = 0.52; // spacing between plants
  const offX = -spX * (COLS - 1) / 2;
  const offZ = -spZ * (ROWS - 1) / 2;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let plant;
      if (plot.vegetable === 'tomato' && plot.state === 'growing') {
        plant = createTomatoPlantMesh();
      } else if (plot.vegetable === 'carrot' && plot.state === 'growing') {
        plant = createCarrotTopMesh();
      } else {
        plant = createVegetableMesh(plot.vegetable);
      }
      // Each plant starts at its grid position and grows in-place
      const s = 0.40 * Math.max(0.02, plot.growthProgress);
      plant.scale.setScalar(s);
      plant.position.set(offX + c * spX, 0, offZ + r * spZ);
      group.add(plant);
    }
  }

  // Track growing-stage for vegetables that swap mesh on ready
  const hasSwap = plot.vegetable === 'tomato' || plot.vegetable === 'carrot';
  group.userData.swapStage = hasSwap ? plot.state : null;
  group.position.set(x, PLOT_H, z);
  // Group stays at scale 1 — individual plants scale up instead
  scene.add(group);
  vegetableMeshes[plot.id] = group;
}

function removeVegetableMesh(plotId) {
  if (vegetableMeshes[plotId]) {
    scene.remove(vegetableMeshes[plotId]);
    delete vegetableMeshes[plotId];
  }
}

// ── Plot signs ────────────────────────────────────────────────────────────────

function getSignTexture(vegetable) {
  if (signTextureCache[vegetable]) return signTextureCache[vegetable];
  const veg = VEGETABLES[vegetable];
  const W = 256, H = 220;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Rounded cream background
  ctx.fillStyle = '#F7F3E6';
  ctx.beginPath();
  const r = 22;
  ctx.moveTo(r, 0); ctx.arcTo(W, 0, W, H, r); ctx.arcTo(W, H, 0, H, r);
  ctx.arcTo(0, H, 0, 0, r); ctx.arcTo(0, 0, W, 0, r); ctx.closePath();
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = '#D8CFA8';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Emoji
  ctx.font = '110px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(veg.emoji, W / 2, 136);

  // Name
  ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#4A3A1A';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(veg.name.toUpperCase(), W / 2, 200);

  const tex = new THREE.CanvasTexture(canvas);
  signTextureCache[vegetable] = tex;
  return tex;
}

function addSignMesh(plot) {
  if (signMeshes[plot.id]) return; // already exists
  const { x, z } = plotWorldPos(plot.row, plot.col);
  const group = new THREE.Group();

  // Wooden stake
  const stake = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.38, 0.045),
    new THREE.MeshLambertMaterial({ color: 0xB8894A })
  );
  stake.position.y = 0.19;
  stake.castShadow = true;
  group.add(stake);

  // Sign board — front face (+Z) gets the canvas texture
  const tex = getSignTexture(plot.vegetable);
  const frontMat = new THREE.MeshLambertMaterial({ map: tex });
  const sideMat  = new THREE.MeshLambertMaterial({ color: 0xEDE4C8 });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.26, 0.04),
    [sideMat, sideMat, sideMat, sideMat, frontMat, frontMat]
  );
  board.position.y = 0.50;
  board.castShadow = true;
  group.add(board);

  // Place at the front-right corner of the plot, facing the camera
  group.position.set(x + PLOT_SIZE * 0.46, 0, z + PLOT_SIZE * 0.46);
  group.rotation.y = -Math.PI / 4; // face toward +X+Z (default camera direction)
  scene.add(group);
  signMeshes[plot.id] = group;
}

function removeSignMesh(plotId) {
  if (signMeshes[plotId]) {
    scene.remove(signMeshes[plotId]);
    delete signMeshes[plotId];
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────

let hoveredPlotId = null;
let hoveredHerbContainerId = null;

function getPlotUnderMouse(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = ((event.clientX - rect.left) / rect.width)  *  2 - 1;
  const my = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const soilMeshes = plotMeshes.filter(p => p.plotId !== null).map(p => p.mesh);
  const hits = raycaster.intersectObjects(soilMeshes);
  return hits.length > 0 ? hits[0].object.userData.plotId : null;
}

function onCanvasHover(event) {
  // ── Plot hover ───────────────────────────────────────────────────────────
  const plotId = getPlotUnderMouse(event);
  if (plotId !== hoveredPlotId) {
    if (hoveredPlotId !== null) {
      const prev = plotMeshes.find(p => p.plotId === hoveredPlotId);
      if (prev) prev.mesh.material.color.setHex(0x7B5428);
    }
    hoveredPlotId = plotId;
    if (plotId !== null) {
      const cur = plotMeshes.find(p => p.plotId === plotId);
      if (cur) cur.mesh.material.color.setHex(0x9C6B3C);
    }
  }

  // ── Herb container hover (skip if a plot is already under cursor) ─────────
  const cid = plotId === null ? getHerbContainerUnderMouse(event) : null;
  if (cid !== hoveredHerbContainerId) {
    if (hoveredHerbContainerId !== null) {
      const prev = herbContainers[hoveredHerbContainerId];
      if (prev) { prev.userData.woodMat.emissive.setHex(0); prev.userData.trimMat.emissive.setHex(0); }
    }
    hoveredHerbContainerId = cid;
    if (cid !== null) {
      herbContainers[cid].userData.woodMat.emissive.setHex(0x3A1F00);
      herbContainers[cid].userData.trimMat.emissive.setHex(0x3A1F00);
    }
  }

  // ── Bird cursor ───────────────────────────────────────────────────────────
  const overBird = (plotId === null && cid === null) ? getBirdUnderMouse(event) : false;

  // ── Cursor ────────────────────────────────────────────────────────────────
  renderer.domElement.style.cursor = (plotId !== null || cid !== null || overBird) ? 'pointer' : 'default';
}

function getHerbContainerUnderMouse(event) {
  if (herbContainers.length === 0) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = ((event.clientX - rect.left) / rect.width)  *  2 - 1;
  const my = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const meshes = [];
  herbContainers.forEach(cg => cg.traverse(ch => { if (ch.isMesh) meshes.push(ch); }));
  const hits = raycaster.intersectObjects(meshes);
  if (hits.length > 0 && hits[0].object.userData.containerId !== undefined)
    return hits[0].object.userData.containerId;
  return null;
}

function handleTap(event) {
  // Bird is in the sky — check it first (no overlap with ground elements)
  if (getBirdUnderMouse(event)) { handleBirdClick(); return; }
  const plotId = getPlotUnderMouse(event);
  if (plotId !== null) { handlePlotClick(plotId); return; }
  const cid = getHerbContainerUnderMouse(event);
  if (cid !== null) { handleHerbContainerClick(cid); return; }
  closePlantMenu();
}

function handleHerbContainerClick(containerId) {
  const s = gameState.herbStates[containerId];
  if (!s) return;

  if (s.locked) {
    if (gameState.buyHerbContainer(containerId)) {
      unlockHerbContainerVisual(herbContainers[containerId]);
      showToast(`🪴 Herb box unlocked!`);
      updateUI();
    } else {
      showToast(`Need 🪙${HERB_CONTAINER_COST} to unlock a herb box`);
    }
    return;
  }

  if (s.state === 'empty') {
    selectedHerbContainerId = containerId;
    selectedPlotId = null;
    openHerbMenu();
  } else if (s.state === 'ready') {
    const result = gameState.harvestHerb(containerId);
    if (result) {
      showToast(`+🪙${result.earned}  ${result.emoji} ${result.herbName} harvested!`);
      updateUI();
    }
  } else {
    const herb = HERBS[s.herb];
    const rem  = Math.ceil(herb.growTime * (1 - s.growthProgress) / (gameState.upgrades['speedy_growth'] ? 1.25 : 1));
    showToast(`${herb.emoji} ${herb.name} — ${rem}s remaining`);
  }
}

function handlePlotClick(plotId) {
  const plot = gameState.plots[plotId];
  if (!plot) return;

  if (plot.state === 'empty') {
    selectedPlotId = plotId;
    openPlantMenu();
  } else if (plot.state === 'ready') {
    const result = gameState.harvest(plotId);
    if (result) {
      removeVegetableMesh(plotId);
      removeSignMesh(plotId);
      showToast(`+🪙${result.earned}  ${result.emoji} ${result.vegName} harvested!`);
      updateUI();
    }
  } else if (plot.state === 'growing') {
    const veg = VEGETABLES[plot.vegetable];
    const rem = Math.ceil(veg.growTime * (1 - plot.growthProgress) / (gameState.upgrades['speedy_growth'] ? 1.25 : 1));
    showToast(`${veg.emoji} ${veg.name} — ${rem}s remaining`);
  }
}

// ── Plant Menu ────────────────────────────────────────────────────────────────

function openPlantMenu() {
  document.getElementById('plant-menu').querySelector('h3').textContent = '🌱 Choose a Vegetable';
  const opts = document.getElementById('veggie-options');
  opts.innerHTML = '';
  Object.entries(VEGETABLES).forEach(([key, veg]) => {
    const canAfford = gameState.canAfford(veg.cost);
    const btn = document.createElement('button');
    btn.className = 'veggie-btn' + (canAfford ? '' : ' disabled');
    btn.innerHTML = `
      <span class="veggie-emoji">${veg.emoji}</span>
      <span class="veggie-name">${veg.name}</span>
      <span class="veggie-cost">🪙 ${veg.cost}</span>
      <span class="veggie-time">⏱ ${veg.growTime}s</span>
      <span class="veggie-pts">🪙 +${veg.points}</span>`;
    if (canAfford) {
      btn.addEventListener('click', () => {
        if (gameState.plant(selectedPlotId, key)) {
          const p = gameState.plots[selectedPlotId];
          addVegetableMesh(p);
          addSignMesh(p);
          closePlantMenu();
          updateUI();
          showToast(`🌱 Planted ${veg.name}!`);
        }
      });
    }
    opts.appendChild(btn);
  });
  document.getElementById('plant-menu').classList.remove('hidden');
  if (isMobile()) document.getElementById('backdrop').classList.add('visible');
}

function openHerbMenu() {
  document.getElementById('plant-menu').querySelector('h3').textContent = '🌿 Choose an Herb';
  const opts = document.getElementById('veggie-options');
  opts.innerHTML = '';
  Object.entries(HERBS).forEach(([key, herb]) => {
    const canAfford = gameState.canAfford(herb.cost);
    const btn = document.createElement('button');
    btn.className = 'veggie-btn' + (canAfford ? '' : ' disabled');
    btn.innerHTML = `
      <span class="veggie-emoji">${herb.emoji}</span>
      <span class="veggie-name">${herb.name}</span>
      <span class="veggie-cost">🪙 ${herb.cost}</span>
      <span class="veggie-time">⏱ ${herb.growTime}s</span>
      <span class="veggie-pts">🪙 +${herb.points}</span>`;
    if (canAfford) {
      btn.addEventListener('click', () => {
        if (gameState.plantHerb(selectedHerbContainerId, key)) {
          closePlantMenu();
          updateUI();
          showToast(`🌿 Planted ${herb.name}!`);
        }
      });
    }
    opts.appendChild(btn);
  });
  document.getElementById('plant-menu').classList.remove('hidden');
  if (isMobile()) document.getElementById('backdrop').classList.add('visible');
}

function closePlantMenu() {
  document.getElementById('plant-menu').classList.add('hidden');
  document.getElementById('backdrop').classList.remove('visible');
  selectedPlotId = null;
  selectedHerbContainerId = null;
}

function openShopDrawer() {
  document.getElementById('shop-panel').classList.add('open');
  document.getElementById('backdrop').classList.add('visible');
}

// ── Upgrades UI ───────────────────────────────────────────────────────────────

function buildUpgradesUI() {
  const list = document.getElementById('upgrades-list');
  list.innerHTML = '';
  UPGRADES.forEach(upg => {
    const owned = gameState.upgrades[upg.id];
    const div = document.createElement('div');
    div.className = 'upgrade-item' + (owned ? ' owned' : '');
    div.id = `upg-${upg.id}`;
    div.innerHTML = `
      <div class="upgrade-header">
        <span>${upg.emoji} ${upg.name}</span>
        ${owned ? '<span class="owned-badge">✓</span>' : `<span class="upgrade-cost">🪙 ${upg.cost}</span>`}
      </div>
      <div class="upgrade-desc">${upg.desc}</div>`;
    if (!owned) {
      div.addEventListener('click', () => {
        if (gameState.buyUpgrade(upg.id)) {
          if (upg.id === 'auto_harvest')    showFarmer();
          if (upg.id === 'herb_containers') buildHerbContainers(gameState.gridSize);
          buildUpgradesUI();
          updateUI();
          showToast(`${upg.emoji} ${upg.name} purchased!`);
        } else {
          showToast('Not enough gold!');
        }
      });
    }
    list.appendChild(div);
  });

  // Dynamic expand-garden row — repeatable until MAX_GRID_SIZE
  if (gameState.canExpandGarden()) {
    const cost = gameState.expansionCost();
    const next = gameState.gridSize + 1;
    const affordable = gameState.canAfford(cost);
    const div = document.createElement('div');
    div.className = 'upgrade-item' + (affordable ? ' affordable' : '');
    div.id = 'upg-expand';
    div.innerHTML = `
      <div class="upgrade-header">
        <span>🌿 Expand Garden</span>
        <span class="upgrade-cost">🪙 ${cost}</span>
      </div>
      <div class="upgrade-desc">Grow garden from ${gameState.gridSize}×${gameState.gridSize} to ${next}×${next} (${next * next} plots)</div>`;
    div.addEventListener('click', () => {
      if (gameState.expandGarden()) {
        rebuildGarden(); // also calls buildHerbContainers internally
        buildFence(gameState.gridSize);
        adjustCamera();
        buildUpgradesUI();
        updateUI();
        showToast(`🌿 Garden expanded to ${gameState.gridSize}×${gameState.gridSize}!`);
      } else {
        showToast('Not enough gold!');
      }
    });
    list.appendChild(div);
  }
}

function adjustCamera() {
  const d = gameState.gridSize * 3.6;
  camera.position.set(d, d * 1.3, d);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ── HUD ───────────────────────────────────────────────────────────────────────

function updateUI() {
  document.getElementById('points').textContent = Math.floor(gameState.points);
  document.getElementById('plots-ready').textContent = gameState.getReadyCount();
  document.getElementById('plots-total').textContent = gameState.plots.length;
  UPGRADES.forEach(upg => {
    const el = document.getElementById(`upg-${upg.id}`);
    if (el && !gameState.upgrades[upg.id]) {
      el.classList.toggle('affordable', gameState.canAfford(upg.cost));
    }
  });
  const expandEl = document.getElementById('upg-expand');
  if (expandEl) expandEl.classList.toggle('affordable', gameState.canAfford(gameState.expansionCost()));
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'fade-out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ── Animation loop ────────────────────────────────────────────────────────────

function animate(time) {
  requestAnimationFrame(animate);
  const delta = time - lastTime;
  lastTime = time;

  if (delta > 0 && delta < 500) {
    gameState.tick(delta);

    // ── Auto-harvest: send farmer (or instant-harvest if no farmer yet) ──────
    if (gameState.autoHarvestPending) {
      gameState.autoHarvestPending = false;
      const readyPlotItems = gameState.plots
        .filter(p => p.state === 'ready')
        .map(p => ({ type: 'plot', id: p.id }));
      const readyHerbItems = Object.entries(gameState.herbStates)
        .filter(([, s]) => s.state === 'ready')
        .map(([id]) => ({ type: 'herb', id: Number(id) }));
      const allReady = [...readyPlotItems, ...readyHerbItems];
      if (farmerMesh && allReady.length > 0) {
        queueFarmerHarvest(allReady);
      } else {
        readyPlotItems.forEach(({ id }) => {
          const r = gameState.harvest(id);
          if (r) { removeVegetableMesh(id); removeSignMesh(id); }
        });
        readyHerbItems.forEach(({ id }) => gameState.harvestHerb(id));
        if (allReady.length > 0) updateUI();
      }
    }

    updateFarmer(delta / 1000, time);

    // ── Dog rescue ────────────────────────────────────────────────────────────
    if (dogCooldown > 0) dogCooldown -= delta / 1000;
    if (dogState === 'absent' && dogCooldown <= 0 && gameState.points <= 0) {
      const allEmpty =
        gameState.plots.every(p => p.state === 'empty') &&
        Object.values(gameState.herbStates).every(s => s.locked || s.state === 'empty');
      if (allEmpty) spawnDog();
    }
    updateDog(delta / 1000, time);

    // ── Bird ─────────────────────────────────────────────────────────────────
    birdTimer -= delta / 1000;
    if (birdTimer <= 0 && !birdMesh) { spawnBird(); birdTimer = 30; }
    updateBird(delta / 1000, time);
    updateDroppingCoins(delta / 1000);

    gameState.plots.forEach(plot => {
      const hasMesh = !!vegetableMeshes[plot.id];

      if (plot.state === 'empty' && hasMesh) {
        removeVegetableMesh(plot.id);
        removeSignMesh(plot.id);
        return;
      }
      if ((plot.state === 'growing' || plot.state === 'ready') && !hasMesh) {
        addVegetableMesh(plot);
        addSignMesh(plot);
      }

      const mesh = vegetableMeshes[plot.id];
      if (!mesh) return;

      if (plot.state === 'growing') {
        const s = 0.40 * Math.max(0.02, plot.growthProgress);
        mesh.children.forEach(plant => plant.scale.setScalar(s));
        setVegetableReady(mesh, false);
      } else if (plot.state === 'ready') {
        // Swap growing plant → harvest model the moment it becomes ready
        if (mesh.userData.swapStage === 'growing') {
          removeVegetableMesh(plot.id);
          addVegetableMesh(plot);
          return;
        }
        const bounce = 0.40 * (1 + Math.sin(time * 0.0025) * 0.06);
        mesh.children.forEach(plant => plant.scale.setScalar(bounce));
        setVegetableReady(mesh, true);
      }
    });

    // ── Herb container visuals ───────────────────────────────────────────────
    // Coin bob + spin on locked boxes
    herbContainers.forEach((cg, i) => {
      const s = gameState.herbStates[i];
      if (!s || !s.locked || !cg.userData.coinMesh) return;
      cg.userData.coinMesh.position.y = 0.52 + Math.sin(time * 0.003 + i * 0.9) * 0.055;
      cg.userData.coinMesh.rotation.y = time * 0.002;
    });

    Object.entries(gameState.herbStates).forEach(([idxStr, s]) => {
      const cg = herbContainers[Number(idxStr)];
      if (!cg || s.locked) return;
      const existing = cg.userData.herbMesh || null;

      if (s.state === 'empty') {
        if (existing) { cg.remove(existing); cg.userData.herbMesh = null; }
        return;
      }
      if (!existing) {
        const hm = createHerbPlantMesh(s.herb);
        hm.position.y = 0.305;
        hm.scale.setScalar(0.01);
        cg.add(hm);
        cg.userData.herbMesh = hm;
      }
      const hm = cg.userData.herbMesh;
      if (s.state === 'growing') {
        hm.scale.setScalar(Math.max(0.05, s.growthProgress));
        setVegetableReady(hm, false);
      } else {
        const bounce = 1.0 + Math.sin(time * 0.0025) * 0.055;
        hm.scale.setScalar(bounce);
        setVegetableReady(hm, true);
      }
    });

    updateUI();
  }

  controls.update();
  renderer.render(scene, camera);
}

function setCameraForViewport() {
  if (innerWidth < innerHeight) {
    // Portrait: steep overhead angle so the garden fills the center of screen
    camera.position.set(0, 14, 4);
    camera.fov = 60;
    if (controls) { controls.minDistance = 6; controls.maxDistance = 22; }
  } else {
    camera.position.set(9, 13, 11);
    camera.fov = 45;
    if (controls) { controls.minDistance = 6; controls.maxDistance = 35; }
  }
  camera.lookAt(0, 0, 0);
  if (controls) { controls.target.set(0, 0, 0); controls.update(); }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  setCameraForViewport();
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

init();
