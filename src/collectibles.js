import * as THREE from 'three';
import { toon } from './materials.js';
import { glowTexture, shadowBlobTexture } from './textures.js';

let shared = null;
function getShared() {
  if (shared) return shared;
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.17 : 0.38;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.ExtrudeGeometry(starShape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3 });
  star.center();
  const cupProfile = [
    [0, 0], [0.22, 0], [0.22, 0.05], [0.08, 0.1], [0.06, 0.28], [0.1, 0.34], [0.26, 0.48], [0.3, 0.7], [0.28, 0.72], [0.0, 0.62],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cup = new THREE.LatheGeometry(cupProfile, 28);
  const handle = new THREE.TorusGeometry(0.11, 0.03, 8, 16, Math.PI * 1.2);
  // Fantasmita: torso tipo campana con dobladillo ondulado (se anima en CPU).
  const ghostProfile = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    ghostProfile.push(new THREE.Vector2(Math.sin(a) * 0.32, 0.36 + Math.cos(a) * 0.34));
  }
  ghostProfile.push(new THREE.Vector2(0.34, 0.15), new THREE.Vector2(0.36, 0.0));
  const ghost = new THREE.LatheGeometry(ghostProfile.reverse(), 32);
  ghost.userData.base = ghost.attributes.position.array.slice();
  shared = {
    star,
    cup,
    handle,
    ghost,
    sphere: new THREE.SphereGeometry(1, 14, 10),
    gold: toon('#ffc21a', { roughness: 0.25, metalness: 0.65, rim: '#fff3b0', rimStrength: 0.8, emissive: '#ff9d00', emissiveIntensity: 0.35 }),
    ghostMat: Object.assign(toon('#ffffff', { roughness: 0.5, rim: '#bfe0ff', rimStrength: 0.9, emissive: '#d9ecff', emissiveIntensity: 0.25 }), {
      transparent: true,
      opacity: 0.93,
      side: THREE.DoubleSide,
    }),
    black: new THREE.MeshStandardMaterial({ color: '#141018', roughness: 0.3 }),
    pink: toon('#ff9fb2', { roughness: 0.6, rimStrength: 0 }),
    glow: glowTexture(),
    blob: shadowBlobTexture(),
  };
  return shared;
}

function buildStar(bonus) {
  const S = getShared();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  if (!bonus) {
    const m = new THREE.Mesh(S.star, S.gold);
    m.castShadow = true;
    inner.add(m);
    // Carita tímida.
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(S.sphere, S.black);
      e.scale.set(0.035, 0.05, 0.02);
      e.position.set(sx * 0.07, 0.03, 0.1);
      inner.add(e);
    }
  } else {
    const cup = new THREE.Mesh(S.cup, S.gold);
    cup.castShadow = true;
    cup.position.y = -0.36;
    inner.add(cup);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(S.handle, S.gold);
      h.position.set(sx * 0.3, 0.04, 0);
      h.rotation.z = sx > 0 ? -Math.PI * 0.6 : Math.PI * 0.4;
      inner.add(h);
    }
    inner.scale.setScalar(1.25);
  }
  return { group: g, inner, kind: bonus ? 'cup' : 'star' };
}

function buildGhost(bonus) {
  const S = getShared();
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const geo = S.ghost.clone();
  const body = new THREE.Mesh(geo, S.ghostMat);
  body.castShadow = true;
  body.position.y = -0.38;
  inner.add(body);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(S.sphere, S.black);
    e.scale.set(0.055, 0.085, 0.04);
    e.position.set(sx * 0.11, 0.1, 0.28);
    inner.add(e);
    const sh = new THREE.Mesh(S.sphere, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    sh.scale.setScalar(0.018);
    sh.position.set(sx * 0.11 + 0.015, 0.13, 0.32);
    inner.add(sh);
    const blush = new THREE.Mesh(S.sphere, S.pink);
    blush.scale.set(0.05, 0.025, 0.02);
    blush.position.set(sx * 0.2, 0.0, 0.26);
    inner.add(blush);
  }
  const mouth = new THREE.Mesh(S.sphere, S.black);
  mouth.scale.set(0.05, 0.06, 0.03);
  mouth.position.set(0, -0.04, 0.3);
  inner.add(mouth);
  const arms = [-1, 1].map((sx) => {
    const a = new THREE.Mesh(S.sphere, S.ghostMat);
    a.scale.set(0.12, 0.07, 0.07);
    a.position.set(sx * 0.36, -0.08, 0.02);
    inner.add(a);
    return a;
  });
  if (bonus) {
    // Corona dorada.
    const crown = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 16, 1, true), S.gold);
    crown.add(ring);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), S.gold);
      const a = (i / 5) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.17, 0.1, Math.sin(a) * 0.17);
      crown.add(sp);
    }
    crown.position.y = 0.33;
    crown.rotation.z = 0.2;
    inner.add(crown);
    inner.scale.setScalar(1.3);
  }
  return { group: g, inner, geo, arms, mouth, kind: 'ghost' };
}

export class Collectibles {
  constructor(mode, scene) {
    this.mode = mode;
    this.scene = scene;
    this.current = null;
    this.leaving = [];
  }

  build(bonus) {
    const S = getShared();
    const item = this.mode === 'boca' ? buildStar(bonus) : buildGhost(bonus);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: S.glow,
        color: this.mode === 'boca' ? '#ffcf40' : bonus ? '#ffd860' : '#bfe0ff',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.75,
      }),
    );
    glow.scale.setScalar(bonus ? 2.2 : 1.5);
    item.group.add(glow);
    item.glow = glow;
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: S.blob, transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    item.blob = blob;
    item.root = new THREE.Group();
    item.root.add(item.group, blob);
    item.phase = Math.random() * 10;
    item.age = 0;
    item.bonus = bonus;
    return item;
  }

  // food: {x,z,id,bonus} en mundo (x,z ya convertidos).
  set(food) {
    if (this.current && food && this.current.id === food.id) return;
    if (this.current) {
      this.current.leaveT = 0;
      this.current.fadeMats = [];
      this.current.group.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          this.current.fadeMats.push(o.material);
        }
      });
      this.leaving.push(this.current);
      this.current = null;
    }
    if (!food) return;
    const item = this.build(food.bonus);
    item.id = food.id;
    item.root.position.set(food.wx, 0, food.wz);
    this.scene.add(item.root);
    this.current = item;
  }

  get position() {
    return this.current ? this.current.root.position : null;
  }

  update(t, dt, headPos) {
    const all = this.current ? [this.current, ...this.leaving] : this.leaving;
    for (const it of all) {
      it.age += dt;
      const pop = it.leaveT !== undefined ? 0 : Math.min(1, it.age / 0.45);
      // Entrada elástica.
      const e = pop >= 1 ? 1 : 1 - Math.pow(2, -10 * pop) * Math.cos(pop * 12);
      let s = e;
      let y = 0.62 + Math.sin(t * 2.6 + it.phase) * 0.1;
      if (it.leaveT !== undefined) {
        it.leaveT += dt;
        const k = it.leaveT / 0.28;
        s = 1 + k * 0.9;
        y += k * 0.9;
        for (const mat of it.fadeMats) mat.opacity = Math.max(0, 1 - k);
        it.glow.material.opacity = Math.max(0, 0.75 * (1 - k));
        if (k >= 1) {
          this.scene.remove(it.root);
          it.geo?.dispose();
          it.fadeMats.forEach((mat) => mat.dispose());
          it.glow.material.dispose();
          this.leaving.splice(this.leaving.indexOf(it), 1);
          continue;
        }
      }
      it.group.scale.setScalar(s);
      it.group.position.y = y;
      it.blob.scale.setScalar(0.8 + (0.72 - y) * 0.6);
      it.glow.material.rotation = t * 0.3;
      if (it.leaveT === undefined) it.glow.material.opacity = 0.55 + Math.sin(t * 4 + it.phase) * 0.2;
      if (it.kind === 'star') {
        it.inner.rotation.y = t * 1.8 + it.phase;
        it.inner.rotation.z = Math.sin(t * 2 + it.phase) * 0.12;
      } else if (it.kind === 'cup') {
        it.inner.rotation.y = t * 1.2;
      } else {
        // Fantasmita: mira a la cabeza, flamea el dobladillo, saluda y hace "¡buu!".
        if (headPos) {
          const dx = headPos.x - it.root.position.x;
          const dz = headPos.z - it.root.position.z;
          const target = Math.atan2(dx, dz);
          let diff = target - it.inner.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          it.inner.rotation.y += diff * Math.min(1, dt * 4);
        }
        it.inner.rotation.z = Math.sin(t * 2.2 + it.phase) * 0.12;
        const base = getShared().ghost.userData.base;
        const p = it.geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const by = base[i * 3 + 1];
          if (by < 0.2) {
            const bx = base[i * 3];
            const bz = base[i * 3 + 2];
            const a = Math.atan2(bz, bx);
            p.setY(i, by + Math.sin(a * 7 + t * 7 + it.phase) * 0.045 * (1 - by / 0.2));
          }
        }
        p.needsUpdate = true;
        const boo = Math.max(0, Math.sin(t * 1.3 + it.phase) - 0.85) / 0.15;
        it.arms.forEach((a, i) => {
          a.position.y = -0.08 + Math.sin(t * 5 + i * Math.PI + it.phase) * 0.04 + boo * 0.12;
        });
        it.mouth.scale.y = 0.06 + boo * 0.05;
        it.inner.scale.setScalar((it.bonus ? 1.3 : 1) * (1 + boo * 0.12));
      }
    }
  }

  clear() {
    for (const it of [this.current, ...this.leaving]) {
      if (!it) continue;
      this.scene.remove(it.root);
      it.geo?.dispose();
    }
    this.current = null;
    this.leaving = [];
  }
}
