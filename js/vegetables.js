const VEGETABLES = {
  carrot:  { name: 'Carrot',  emoji: '🥕', growTime: 15,  cost: 2,  points: 10,  color: 0xFF6B35, stemColor: 0x4CAF50 },
  lettuce: { name: 'Lettuce', emoji: '🥬', growTime: 30,  cost: 8,  points: 25,  color: 0x66BB6A, stemColor: 0x2E7D32 },
  tomato:  { name: 'Tomato',  emoji: '🍅', growTime: 60,  cost: 20, points: 60,  color: 0xE53935, stemColor: 0x4CAF50 },
  potato:  { name: 'Potato',  emoji: '🥔', growTime: 90,  cost: 35, points: 100, color: 0x8D6E63, stemColor: 0x6D4C41 },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', growTime: 150, cost: 60, points: 200, color: 0xFF8C00, stemColor: 0x558B2F },
};

function makeMat(color, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.7, metalness: 0.0 });
}

function createVegetableMesh(type) {
  const veg = VEGETABLES[type];
  const group = new THREE.Group();

  switch (type) {
    case 'carrot': {
      // Tapered body — wider at shoulder, narrow at root tip
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.025, 0.52, 8), makeMat(veg.color));
      body.position.y = 0.30;
      body.castShadow = true;
      group.add(body);
      // Root tip cone
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), makeMat(veg.color));
      tip.position.y = 0.0;
      group.add(tip);
      // Shoulder ring — slight bulge where greens meet root
      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.06, 8), makeMat(veg.color));
      shoulder.position.y = 0.55;
      group.add(shoulder);
      // Feathery fronds (5) fanning upward
      const frondMats = [makeMat(0x2E7D32), makeMat(0x558B2F), makeMat(0x4CAF50)];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const mat = frondMats[i % 3];
        const lean = 0.28;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.38, 4), mat);
        stem.position.set(Math.cos(a) * 0.1, 0.76, Math.sin(a) * 0.1);
        stem.rotation.z = Math.cos(a) * lean;
        stem.rotation.x = Math.sin(a) * lean;
        stem.castShadow = true;
        group.add(stem);
        const leaflet = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat);
        leaflet.position.set(Math.cos(a) * 0.18, 0.96, Math.sin(a) * 0.18);
        leaflet.scale.set(0.55, 1.5, 0.55);
        group.add(leaflet);
      }
      // Centre tuft
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), frondMats[1]);
      tuft.position.y = 0.62;
      tuft.scale.set(1.1, 0.85, 1.1);
      group.add(tuft);
      break;
    }

    case 'lettuce': {
      const lOuter = makeMat(0x7CB342);
      const lMid   = makeMat(0x8DB83A);
      const lInner = makeMat(0xAED581);
      // Outer ring — 8 wide leaves lying nearly flat
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.30, 7, 5), lOuter);
        leaf.position.set(Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08);
        leaf.scale.set(0.72, 0.95, 0.11);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 1.05;
        leaf.castShadow = true;
        group.add(leaf);
      }
      // Mid ring — 6 leaves cupping upward
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5), lMid);
        leaf.position.set(Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05);
        leaf.scale.set(0.60, 0.85, 0.12);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 0.55;
        group.add(leaf);
      }
      // Inner ring — 5 upright leaves forming the head
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.52;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), lInner);
        leaf.position.set(Math.cos(a) * 0.03, 0.12, Math.sin(a) * 0.03);
        leaf.scale.set(0.44, 0.72, 0.13);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 0.15;
        group.add(leaf);
      }
      break;
    }

    case 'tomato': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), makeMat(veg.color));
      body.position.y = 0.3;
      body.scale.set(1, 0.88, 1);
      body.castShadow = true;
      group.add(body);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), makeMat(veg.stemColor));
      stem.position.y = 0.62;
      group.add(stem);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 5), makeMat(veg.stemColor));
        const a = (i / 5) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.12, 0.59, Math.sin(a) * 0.12);
        leaf.rotation.z = 0.55;
        leaf.rotation.y = a;
        group.add(leaf);
      }
      break;
    }

    case 'potato': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), makeMat(veg.color));
      body.position.y = 0.22;
      body.scale.set(1.2, 0.82, 1);
      body.castShadow = true;
      group.add(body);
      for (let i = 0; i < 4; i++) {
        const bump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), makeMat(veg.stemColor));
        const a = (i / 4) * Math.PI * 2;
        bump.position.set(Math.cos(a) * 0.21, 0.22, Math.sin(a) * 0.21);
        group.add(bump);
      }
      break;
    }

    case 'pumpkin': {
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), makeMat(veg.color));
      center.position.y = 0.28;
      center.scale.set(1, 0.72, 1);
      center.castShadow = true;
      group.add(center);
      for (let i = 0; i < 6; i++) {
        const rib = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), makeMat(veg.color));
        const a = (i / 6) * Math.PI * 2;
        rib.position.set(Math.cos(a) * 0.14, 0.28, Math.sin(a) * 0.14);
        rib.scale.set(0.8, 0.72, 0.8);
        group.add(rib);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 6), makeMat(veg.stemColor));
      stem.position.y = 0.58;
      group.add(stem);
      break;
    }
  }

  return group;
}

function createTomatoPlantMesh() {
  const g = new THREE.Group();
  const stemMat = makeMat(0x33691E);
  const leafA   = makeMat(0x558B2F);
  const leafB   = makeMat(0x7CB342);

  // Main stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.65, 5), stemMat);
  stem.position.y = 0.325;
  stem.castShadow = true;
  g.add(stem);

  // Leaf pairs at three heights along the stem
  [0.18, 0.37, 0.55].forEach((y, i) => {
    [-1, 1].forEach(side => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), i % 2 === 0 ? leafA : leafB);
      leaf.position.set(side * 0.18, y, 0);
      leaf.scale.set(1.0, 0.22, 0.6);
      leaf.rotation.z = side * 0.28;
      leaf.castShadow = true;
      g.add(leaf);
    });
  });

  // Bushy top
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), leafB);
    top.position.set(Math.cos(a) * 0.09, 0.68, Math.sin(a) * 0.09);
    top.scale.set(0.9, 0.32, 0.7);
    g.add(top);
  }

  return g;
}

function createCarrotTopMesh() {
  const g = new THREE.Group();
  const mat1 = makeMat(0x2E7D32);
  const mat2 = makeMat(0x558B2F);
  const mat3 = makeMat(0x4CAF50);
  const mats = [mat1, mat2, mat3];

  // 6 feathery fronds fanning outward from the soil
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const mat = mats[i % 3];
    const lean = 0.3;
    // Frond stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.42, 4), mat);
    stem.position.set(Math.cos(a) * 0.11, 0.22, Math.sin(a) * 0.11);
    stem.rotation.z = Math.cos(a) * lean;
    stem.rotation.x = Math.sin(a) * lean;
    stem.castShadow = true;
    g.add(stem);
    // Leaflet tip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.052, 5, 4), mat);
    tip.position.set(Math.cos(a) * 0.17, 0.44, Math.sin(a) * 0.17);
    tip.scale.set(0.55, 1.5, 0.55);
    g.add(tip);
  }
  // Small centre tuft at soil level
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), mat2);
  tuft.position.y = 0.07;
  tuft.scale.set(1.05, 0.85, 1.05);
  g.add(tuft);

  return g;
}

function setVegetableReady(group, isReady) {
  group.traverse(child => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(isReady ? 0x224422 : 0x000000);
    }
  });
}

// ── Herbs ─────────────────────────────────────────────────────────────────────

const HERBS = {
  basil:    { name: 'Basil',    emoji: '🌿', growTime: 20, cost: 5,  points: 18,  stemColor: 0x2E7D32, leafColor: 0x43A047 },
  mint:     { name: 'Mint',     emoji: '🍃', growTime: 30, cost: 8,  points: 25,  stemColor: 0x00897B, leafColor: 0x26A69A },
  thyme:    { name: 'Thyme',    emoji: '🌱', growTime: 40, cost: 12, points: 40,  stemColor: 0x558B2F, leafColor: 0x7CB342 },
  rosemary: { name: 'Rosemary', emoji: '🪴', growTime: 65, cost: 20, points: 70,  stemColor: 0x4E7A40, leafColor: 0x7B9E6B },
  lavender: { name: 'Lavender', emoji: '💜', growTime: 90, cost: 30, points: 100, stemColor: 0x6A9955, leafColor: 0x9575CD },
};

function createHerbPlantMesh(type) {
  const h = HERBS[type];
  const g = new THREE.Group();
  const stemMat = new THREE.MeshLambertMaterial({ color: h.stemColor });
  const leafMat = new THREE.MeshLambertMaterial({ color: h.leafColor });

  switch (type) {
    case 'basil': {
      // Bushy rosette of broad leaves
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const r = 0.09;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.10, 4), stemMat);
        stem.position.set(Math.cos(a)*r, 0.05, Math.sin(a)*r*0.7);
        stem.rotation.z = Math.cos(a) * 0.18;
        g.add(stem);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), leafMat);
        leaf.position.set(Math.cos(a)*r*1.2, 0.13, Math.sin(a)*r*0.8);
        leaf.scale.set(1.0, 0.42, 0.78);
        g.add(leaf);
      }
      const topBud = new THREE.Mesh(new THREE.SphereGeometry(0.050, 5, 4), stemMat);
      topBud.position.y = 0.18;
      topBud.scale.set(1.0, 0.70, 1.0);
      g.add(topBud);
      break;
    }
    case 'mint': {
      // Wide oval leaves on short stems
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.2;
        const r = i === 0 ? 0.02 : 0.10;
        const ht = 0.10 + (i % 3) * 0.04;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, ht, 4), stemMat);
        stem.position.set(Math.cos(a)*r, ht/2, Math.sin(a)*r*0.7);
        stem.rotation.z = Math.cos(a) * 0.20;
        g.add(stem);
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.072, 6, 4), leafMat);
        leaf.position.set(Math.cos(a)*r*1.15, ht + 0.03, Math.sin(a)*r*0.75);
        leaf.scale.set(1.0, 0.38, 0.80);
        g.add(leaf);
      }
      break;
    }
    case 'thyme': {
      // Dense low mound of fine stems
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i < 2 ? 0.03 : 0.12;
        const ht = 0.08 + (i % 4) * 0.03;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.010, ht, 4), stemMat);
        stem.position.set(Math.cos(a)*r, ht/2, Math.sin(a)*r*0.7);
        stem.rotation.z = Math.cos(a) * 0.12;
        g.add(stem);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), leafMat);
        tip.position.set(Math.cos(a)*r, ht + 0.02, Math.sin(a)*r*0.7);
        g.add(tip);
      }
      break;
    }
    case 'rosemary': {
      // Upright bush with needle-pair leaves
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = i < 2 ? 0.03 : 0.11;
        const ht = 0.16 + (i % 4) * 0.04;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, ht, 4), stemMat);
        stem.position.set(Math.cos(a)*r, ht/2, Math.sin(a)*r*0.65);
        stem.rotation.z = Math.cos(a) * 0.10;
        g.add(stem);
        for (let j = 1; j <= 3; j++) {
          const ny = (j / 4) * ht;
          [-1, 1].forEach(side => {
            const nd = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.007, 0.009), leafMat);
            nd.position.set(
              Math.cos(a)*r + Math.cos(a + side*Math.PI/2)*0.022,
              ny,
              Math.sin(a)*r*0.65
            );
            nd.rotation.y = a;
            g.add(nd);
          });
        }
      }
      break;
    }
    case 'lavender': {
      // Slender stalks with purple flower spikes
      const stalkMat = new THREE.MeshLambertMaterial({ color: 0x7CAD5A });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = i < 2 ? 0.025 : 0.10;
        const ht = 0.18 + (i % 3) * 0.05;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.010, ht, 4), stalkMat);
        stalk.position.set(Math.cos(a)*r, ht/2, Math.sin(a)*r*0.7);
        stalk.rotation.z = Math.cos(a) * 0.10;
        g.add(stalk);
        const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.09, 6), leafMat);
        spike.position.set(Math.cos(a)*r, ht + 0.045, Math.sin(a)*r*0.7);
        spike.rotation.z = Math.cos(a) * 0.10;
        g.add(spike);
      }
      break;
    }
  }
  return g;
}
