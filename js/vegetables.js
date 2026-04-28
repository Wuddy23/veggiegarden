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
      const lHeart = makeMat(0xC5E1A5);
      // Outer ring — 8 wide leaves lying nearly flat like the photo,
      // bases at centre, spreading broadly outward across the soil
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), lOuter);
        leaf.position.set(Math.cos(a) * 0.06, 0.02, Math.sin(a) * 0.06);
        leaf.scale.set(0.68, 0.88, 0.11); // wide, long, very thin
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 1.05; // ~60° from upright → mostly flat
        leaf.castShadow = true;
        group.add(leaf);
      }
      // Mid ring — 6 leaves beginning to cup upward
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), lMid);
        leaf.position.set(Math.cos(a) * 0.04, 0.06, Math.sin(a) * 0.04);
        leaf.scale.set(0.54, 0.78, 0.12);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 0.55; // moderately cupped
        group.add(leaf);
      }
      // Inner ring — 5 leaves standing upright, forming the tight head
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.52;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), lInner);
        leaf.position.set(Math.cos(a) * 0.025, 0.1, Math.sin(a) * 0.025);
        leaf.scale.set(0.38, 0.65, 0.13);
        leaf.rotation.order = 'YXZ';
        leaf.rotation.y = a;
        leaf.rotation.x = 0.15; // nearly upright
        group.add(leaf);
      }
      // Tight pale heart at centre
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), lHeart);
      heart.position.y = 0.24;
      heart.scale.set(0.78, 0.95, 0.78);
      group.add(heart);
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
