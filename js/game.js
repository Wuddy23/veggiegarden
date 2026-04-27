const UPGRADES = [
  { id: 'auto_harvest',   name: 'Auto-Harvester', emoji: '🤖', desc: 'Harvests ready vegetables every 15s',    cost: 500 },
  { id: 'speedy_growth',  name: 'Fast Growth',    emoji: '⚡', desc: '25% faster vegetable growth',            cost: 300 },
  { id: 'expand_garden',  name: 'Expand Garden',  emoji: '🌿', desc: 'Grow garden from 3×3 to 4×4 (16 plots)', cost: 400 },
  { id: 'double_harvest', name: 'Double Harvest', emoji: '💎', desc: 'Earn 2× points from every harvest',       cost: 800 },
];

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

    UPGRADES.forEach(u => { this.upgrades[u.id] = false; });
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
    if (upgradeId === 'expand_garden') this._expandGarden();
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

  tick(deltaMs) {
    const speedMult = this.upgrades['speedy_growth'] ? 1.25 : 1.0;

    this.plots.forEach(plot => {
      if (plot.state !== 'growing') return;
      const veg = VEGETABLES[plot.vegetable];
      const elapsed = (performance.now() - plot.plantedAt) / 1000;
      plot.growthProgress = Math.min(elapsed / (veg.growTime / speedMult), 1.0);
      if (plot.growthProgress >= 1.0) plot.state = 'ready';
    });

    if (this.upgrades['auto_harvest']) {
      this.autoHarvestTimer += deltaMs;
      if (this.autoHarvestTimer >= 15000) {
        this.autoHarvestTimer = 0;
        this.plots.filter(p => p.state === 'ready').forEach(p => this.harvest(p.id));
      }
    }
  }

  getReadyCount()   { return this.plots.filter(p => p.state === 'ready').length; }
  getGrowingCount() { return this.plots.filter(p => p.state === 'growing').length; }
}
