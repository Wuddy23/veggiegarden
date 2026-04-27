let scene, camera, renderer, controls, raycaster;
let plotMeshes = [];       // { mesh, plotId }
let vegetableMeshes = {};  // plotId -> THREE.Group
let gameState;
let selectedPlotId = null;
let lastTime = 0;
let mouseDownPos = { x: 0, y: 0 };

const PLOT_SIZE = 2.0;
const PLOT_GAP  = 0.3;
const PLOT_H    = 0.18;

// ── Scene setup ──────────────────────────────────────────────────────────────

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 25, 55);

  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(9, 13, 11);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
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

  renderer.domElement.addEventListener('mousedown', e => { mouseDownPos = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('mouseup', onCanvasClick);
  renderer.domElement.addEventListener('mousemove', onCanvasHover);
  window.addEventListener('resize', onResize);

  document.getElementById('close-plant-menu').addEventListener('click', closePlantMenu);
  buildUpgradesUI();
  requestAnimationFrame(animate);
}

// ── Decorations ──────────────────────────────────────────────────────────────

function addDecorations() {
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

  // Trees
  const treePositions = [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -10], [-10, 0]];
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

  const soilMat   = new THREE.MeshLambertMaterial({ color: 0x7B5428 });
  const borderMat = new THREE.MeshLambertMaterial({ color: 0x4E342E });

  gameState.plots.forEach(plot => {
    const { x, z } = plotWorldPos(plot.row, plot.col);

    const border = new THREE.Mesh(new THREE.BoxGeometry(PLOT_SIZE + 0.12, PLOT_H * 0.45, PLOT_SIZE + 0.12), borderMat);
    border.position.set(x, PLOT_H * 0.22, z);
    border.receiveShadow = true;
    scene.add(border);
    plotMeshes.push({ mesh: border, plotId: null });

    const soil = new THREE.Mesh(new THREE.BoxGeometry(PLOT_SIZE, PLOT_H, PLOT_SIZE), soilMat);
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
  const mesh = createVegetableMesh(plot.vegetable);
  const { x, z } = plotWorldPos(plot.row, plot.col);
  mesh.position.set(x, PLOT_H, z);
  mesh.scale.setScalar(Math.max(0.05, plot.growthProgress));
  scene.add(mesh);
  vegetableMeshes[plot.id] = mesh;
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

function onCanvasClick(event) {
  const dx = Math.abs(event.clientX - mouseDownPos.x);
  const dy = Math.abs(event.clientY - mouseDownPos.y);
  if (dx > 5 || dy > 5) return; // drag, not click

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
}

function closePlantMenu() {
  document.getElementById('plant-menu').classList.add('hidden');
  selectedPlotId = null;
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
        const s = Math.max(0.05, plot.growthProgress);
        mesh.scale.setScalar(s);
        setVegetableReady(mesh, false);
      } else if (plot.state === 'ready') {
        const bounce = 1 + Math.sin(time * 0.0025) * 0.06;
        mesh.scale.setScalar(bounce);
        mesh.rotation.y = (time * 0.001) % (Math.PI * 2);
        setVegetableReady(mesh, true);
      }
    });

    updateUI();
  }

  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

init();
