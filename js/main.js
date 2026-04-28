let scene, camera, renderer, controls, raycaster;
let plotMeshes = [];       // { mesh, plotId }
let vegetableMeshes = {};  // plotId -> THREE.Group
let gameState;
let selectedPlotId = null;
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
  });

  document.getElementById('close-plant-menu').addEventListener('click', closePlantMenu);
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

function addDecorations() {
  createBarn();

  // Fence posts around a 3x3 base area
  const fencePositions = [];
  const halfFence = 4.5;
  for (let i = -4; i <= 4; i++) {
    fencePositions.push([i * 1.0, halfFence]);
    fencePositions.push([i * 1.0, -halfFence]);
    fencePositions.push([halfFence, i * 1.0]);
    fencePositions.push([-halfFence, i * 1.0]);
  }
  const postMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  fencePositions.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), postMat);
    post.position.set(x, 0.3, z);
    post.castShadow = true;
    scene.add(post);
  });

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

    if (plot.vegetable) addVegetableMesh(plot);
  });
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
      const plant = (plot.vegetable === 'tomato' && plot.state === 'growing')
        ? createTomatoPlantMesh()
        : createVegetableMesh(plot.vegetable);
      // Each plant starts at its grid position and grows in-place
      const s = 0.40 * Math.max(0.02, plot.growthProgress);
      plant.scale.setScalar(s);
      plant.position.set(offX + c * spX, 0, offZ + r * spZ);
      group.add(plant);
    }
  }

  group.userData.tomatoStage = (plot.vegetable === 'tomato') ? plot.state : null;
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

// ── Input ─────────────────────────────────────────────────────────────────────

let hoveredPlotId = null;

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
  const plotId = getPlotUnderMouse(event);
  if (plotId === hoveredPlotId) return;

  // Reset previous
  if (hoveredPlotId !== null) {
    const prev = plotMeshes.find(p => p.plotId === hoveredPlotId);
    if (prev) prev.mesh.material.color.setHex(0x7B5428);
  }
  hoveredPlotId = plotId;
  if (plotId !== null) {
    const cur = plotMeshes.find(p => p.plotId === plotId);
    if (cur) cur.mesh.material.color.setHex(0x9C6B3C);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    renderer.domElement.style.cursor = 'default';
  }
}

function handleTap(event) {
  const plotId = getPlotUnderMouse(event);
  if (plotId !== null) {
    handlePlotClick(plotId);
  } else {
    closePlantMenu();
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
      showToast(`+${result.earned} pts  ${result.emoji} ${result.vegName} harvested!`);
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
  const opts = document.getElementById('veggie-options');
  opts.innerHTML = '';
  Object.entries(VEGETABLES).forEach(([key, veg]) => {
    const canAfford = gameState.canAfford(veg.cost);
    const btn = document.createElement('button');
    btn.className = 'veggie-btn' + (canAfford ? '' : ' disabled');
    btn.innerHTML = `
      <span class="veggie-emoji">${veg.emoji}</span>
      <span class="veggie-name">${veg.name}</span>
      <span class="veggie-cost">💰 ${veg.cost}</span>
      <span class="veggie-time">⏱ ${veg.growTime}s</span>
      <span class="veggie-pts">+${veg.points}</span>`;
    if (canAfford) {
      btn.addEventListener('click', () => {
        if (gameState.plant(selectedPlotId, key)) {
          addVegetableMesh(gameState.plots[selectedPlotId]);
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

function closePlantMenu() {
  document.getElementById('plant-menu').classList.add('hidden');
  document.getElementById('backdrop').classList.remove('visible');
  selectedPlotId = null;
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
        ${owned ? '<span class="owned-badge">✓</span>' : `<span class="upgrade-cost">💰 ${upg.cost}</span>`}
      </div>
      <div class="upgrade-desc">${upg.desc}</div>`;
    if (!owned) {
      div.addEventListener('click', () => {
        if (gameState.buyUpgrade(upg.id)) {
          if (upg.id === 'expand_garden') { rebuildGarden(); adjustCamera(); }
          buildUpgradesUI();
          updateUI();
          showToast(`${upg.emoji} ${upg.name} purchased!`);
        } else {
          showToast('Not enough points!');
        }
      });
    }
    list.appendChild(div);
  });
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
      const affordable = gameState.canAfford(upg.cost);
      el.classList.toggle('affordable', affordable);
    }
  });
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

    gameState.plots.forEach(plot => {
      const hasMesh = !!vegetableMeshes[plot.id];

      if (plot.state === 'empty' && hasMesh) {
        removeVegetableMesh(plot.id);
        return;
      }
      if ((plot.state === 'growing' || plot.state === 'ready') && !hasMesh) {
        addVegetableMesh(plot);
      }

      const mesh = vegetableMeshes[plot.id];
      if (!mesh) return;

      if (plot.state === 'growing') {
        const s = 0.40 * Math.max(0.02, plot.growthProgress);
        mesh.children.forEach(plant => plant.scale.setScalar(s));
        setVegetableReady(mesh, false);
      } else if (plot.state === 'ready') {
        // Swap tomato plant → tomato fruit the moment it becomes ready
        if (plot.vegetable === 'tomato' && mesh.userData.tomatoStage === 'growing') {
          removeVegetableMesh(plot.id);
          addVegetableMesh(plot);
          return;
        }
        const bounce = 0.40 * (1 + Math.sin(time * 0.0025) * 0.06);
        mesh.children.forEach(plant => plant.scale.setScalar(bounce));
        setVegetableReady(mesh, true);
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
