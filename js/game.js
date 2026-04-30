const UPGRADES = [
  { id: 'auto_harvest',   name: 'Auto-Harvester', emoji: '👨‍🌾', desc: 'Harvests ready vegetables every 15s', cost: 500 },
  { id: 'speedy_growth',  name: 'Fast Growth',    emoji: '⚡', desc: '25% faster vegetable growth',         cost: 300 },
  { id: 'double_harvest', name: 'Double Harvest', emoji: '💎', desc: 'Earn 2× gold from every harvest',     cost: 800 },
];

// Costs for each expansion step: 3→4, 4→5, 5→6, 6→7
const EXPANSION_COSTS = [400, 800, 1500, 2500];
const HERB_CONTAINER_COST = 75;
const MAX_GRID_SIZE   = 7;

class HerbState {
  constructor() {
    this.locked = true;   // must be purchased individually before use
    this.state  = 'empty'; // empty | growing | ready
    this.herb   = null;
    this.plantedAt = 0;
    this.growthProgress = 0;
  }
}

class Plot {
  constructor(id, row, col) {
    this.id = id;
    this.row = row;
    this.col = col;
    this.state = 'empty'; // empty | growing | ready
    this.vegetable = null;
    this.plantedAt = 0;
    this.growthProgress = 0;
  }
}

class GameState {
  constructor() {
    this.points = 50;
    this.gridSize = 3;
    this.plots = [];
    this.upgrades = {};
    this.autoHarvestTimer = 0;
    this.totalHarvested = 0;
    this.autoHarvestPending = false;
    this.herbStates = {}; // containerId -> HerbState

    UPGRADES.forEach(u => { this.upgrades[u.id] = false; });
    // expansion tracked separately via gridSize
    this._initPlots();
  }

  _initPlots() {
    this.plots = [];
    let id = 0;
    for (let r = 0; r < this.gridSize; r++)
      for (let c = 0; c < this.gridSize; c++)
        this.plots.push(new Plot(id++, r, c));
  }

  canAfford(cost) { return this.points >= cost; }

  plant(plotId, vegType) {
    const plot = this.plots[plotId];
    const veg = VEGETABLES[vegType];
    if (!plot || plot.state !== 'empty' || !this.canAfford(veg.cost)) return false;
    this.points -= veg.cost;
    plot.state = 'growing';
    plot.vegetable = vegType;
    plot.plantedAt = performance.now();
    plot.growthProgress = 0;
    return true;
  }

  harvest(plotId) {
    const plot = this.plots[plotId];
    if (!plot || plot.state !== 'ready') return null;
    const veg = VEGETABLES[plot.vegetable];
    let earned = veg.points;
    if (this.upgrades['double_harvest']) earned *= 2;
    this.points += earned;
    this.totalHarvested++;
    const result = { earned, vegName: veg.name, emoji: veg.emoji };
    plot.state = 'empty';
    plot.vegetable = null;
    plot.plantedAt = 0;
    plot.growthProgress = 0;
    return result;
  }

  buyUpgrade(upgradeId) {
    const upg = UPGRADES.find(u => u.id === upgradeId);
    if (!upg || this.upgrades[upgradeId] || !this.canAfford(upg.cost)) return false;
    this.points -= upg.cost;
    this.upgrades[upgradeId] = true;
    return true;
  }

  canExpandGarden() { return this.gridSize < MAX_GRID_SIZE; }
  expansionCost()   { return EXPANSION_COSTS[this.gridSize - 3] ?? 9999; }

  expandGarden() {
    if (!this.canExpandGarden() || !this.canAfford(this.expansionCost())) return false;
    this.points -= this.expansionCost();
    this._expandGarden();
    return true;
  }

  _expandGarden() {
    const newSize = this.gridSize + 1;
    const newPlots = [];
    let id = 0;
    for (let r = 0; r < newSize; r++) {
      for (let c = 0; c < newSize; c++) {
        const existing = this.plots.find(p => p.row === r && p.col === c);
        if (existing) { existing.id = id; newPlots.push(existing); }
        else newPlots.push(new Plot(id, r, c));
        id++;
      }
    }
    this.plots = newPlots;
    this.gridSize = newSize;
  }

  // ── Herb container state ────────────────────────────────────────────────────

  resetHerbStates(count) {
    // Refund purchased boxes and any seeds still in the ground
    Object.values(this.herbStates).forEach(s => {
      if (!s.locked) this.points += HERB_CONTAINER_COST;          // box cost
      if (!s.locked && s.state !== 'empty' && s.herb)
        this.points += HERBS[s.herb].cost;                        // seed cost
    });
    this.herbStates = {};
    for (let i = 0; i < count; i++) this.herbStates[i] = new HerbState();
  }

  buyHerbContainer(id) {
    const s = this.herbStates[id];
    if (!s || !s.locked || !this.canAfford(HERB_CONTAINER_COST)) return false;
    this.points -= HERB_CONTAINER_COST;
    s.locked = false;
    return true;
  }

  plantHerb(containerId, herbType) {
    const s = this.herbStates[containerId];
    const herb = HERBS[herbType];
    if (!s || s.state !== 'empty' || !this.canAfford(herb.cost)) return false;
    this.points -= herb.cost;
    s.state      = 'growing';
    s.herb       = herbType;
    s.plantedAt  = performance.now();
    s.growthProgress = 0;
    return true;
  }

  harvestHerb(containerId) {
    const s = this.herbStates[containerId];
    if (!s || s.state !== 'ready') return null;
    const herb = HERBS[s.herb];
    let earned = herb.points;
    if (this.upgrades['double_harvest']) earned *= 2;
    this.points += earned;
    this.totalHarvested++;
    const result = { earned, herbName: herb.name, emoji: herb.emoji };
    s.state = 'empty'; s.herb = null; s.plantedAt = 0; s.growthProgress = 0;
    return result;
  }

  tick(deltaMs) {
    const speedMult = this.upgrades['speedy_growth'] ? 1.25 : 1.0;

    this.plots.forEach(plot => {
      if (plot.state !== 'growing') return;
      const veg = VEGETABLES[plot.vegetable];
      const elapsed = (performance.now() - plot.plantedAt) / 1000;
      plot.growthProgress = Math.min(elapsed / (veg.growTime / speedMult), 1.0);
      if (plot.growthProgress >= 1.0) plot.state = 'ready';
    });

    // Herb growth
    const speedMult2 = this.upgrades['speedy_growth'] ? 1.25 : 1.0;
    Object.values(this.herbStates).forEach(s => {
      if (s.state !== 'growing') return;
      const elapsed = (performance.now() - s.plantedAt) / 1000;
      s.growthProgress = Math.min(elapsed / (HERBS[s.herb].growTime / speedMult2), 1.0);
      if (s.growthProgress >= 1.0) s.state = 'ready';
    });

    if (this.upgrades['auto_harvest']) {
      this.autoHarvestTimer += deltaMs;
      if (this.autoHarvestTimer >= 15000) {
        this.autoHarvestTimer = 0;
        this.autoHarvestPending = true; // let main.js animate the farmer
      }
    }
  }

  getReadyCount()   { return this.plots.filter(p => p.state === 'ready').length; }
  getGrowingCount() { return this.plots.filter(p => p.state === 'growing').length; }
}
