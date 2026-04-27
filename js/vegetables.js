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
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 8), makeMat(veg.color));
      body.position.y = 0.25;
      body.rotation.z = Math.PI;
      body.castShadow = true;
      group.add(body);
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), makeMat(veg.stemColor));
        const a = (i / 3) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 0.09, 0.6, Math.sin(a) * 0.09);
        leaf.scale.set(0.6, 1.6, 0.6);
        leaf.castShadow = true;
        group.add(leaf);
      }
      break;
    }

    case 'lettuce': {
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.28 - i * 0.03, 8, 6),
          makeMat(i % 2 === 0 ? veg.color : veg.stemColor)
        );
        leaf.position.y = i * 0.08;
        leaf.scale.set(1, 0.38 - i * 0.04, 1);
        leaf.castShadow = true;
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

function setVegetableReady(group, isReady) {
  group.traverse(child => {
    if (child.isMesh && child.material) {
      child.material.emissive.setHex(isReady ? 0x224422 : 0x000000);
    }
  });
}
