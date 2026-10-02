import * as THREE from 'three';
import { toon } from './materials.js';
import { jerseyTexture } from './textures.js';

const GRAVITY = 16;

function buildFan(mode) {
  const g = new THREE.Group();
  const jersey = toon('#ffffff', { map: jerseyTexture(mode), roughness: 0.8, rimStrength: 0.3 });
  const skin = toon('#e2b08a', { roughness: 0.6, rimStrength: 0.25 });
  const hair = toon('#2b1d16', { roughness: 0.9, rimStrength: 0.1 });
  const pants = toon('#1d2330', { roughness: 0.9, rimStrength: 0.1 });
  const dark = new THREE.MeshBasicMaterial({ color: '#141018' });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.36, 4, 12), jersey);
  torso.position.y = 0.72;
  torso.castShadow = true;
  g.add(torso);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.25, 4, 10), pants);
  legs.position.y = 0.3;
  g.add(legs);
  const head = new THREE.Group();
  head.position.y = 1.22;
  g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), skin);
  skull.castShadow = true;
  head.add(skull);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
  hairM.position.y = 0.02;
  head.add(hairM);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), dark);
    e.position.set(sx * 0.08, 0.03, 0.2);
    head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark);
  mouth.scale.set(1, 0.6, 0.4);
  mouth.position.set(0, -0.09, 0.19);
  head.add(mouth);
  // Bufanda.
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 8, 18), toon(mode === 'boca' ? '#ffc928' : '#e1061e', { roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.02;
  g.add(scarf);
  const arms = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.3, 0.98, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 8), jersey);
    arm.position.y = -0.25;
    arm.castShadow = true;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), skin);
    hand.position.y = -0.5;
    pivot.add(hand);
    g.add(pivot);
    return pivot;
  });
  g.scale.setScalar(1.55);
  return { group: g, arms, head, mouth };
}

const OBJECTS = ['roll', 'chori', 'cup', 'hat'];

function buildObject(kind, mode) {
  const g = new THREE.Group();
  const team = mode === 'boca' ? ['#0b3d91', '#ffc928'] : ['#e1061e', '#ffffff'];
  let radius = 0.2;
  if (kind === 'roll') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.3, 18), toon('#fbfbf7', { roughness: 0.9 }));
    m.rotation.z = Math.PI / 2;
    g.add(m);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.305, 12), toon('#9a7b55', { roughness: 0.9 }));
    hole.rotation.z = Math.PI / 2;
    g.add(hole);
    radius = 0.17;
  } else if (kind === 'chori') {
    const bread = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 10), toon('#d9a35a', { roughness: 0.8 }));
    bread.rotation.z = Math.PI / 2;
    bread.scale.set(1, 1, 1.1);
    g.add(bread);
    const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 10), toon('#8a2a1c', { roughness: 0.5 }));
    sausage.rotation.z = Math.PI / 2;
    sausage.position.y = 0.07;
    g.add(sausage);
    radius = 0.13;
  } else if (kind === 'cup') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.3, 16), toon(team[0], { roughness: 0.4 }));
    g.add(c);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.08, 16), toon(team[1], { roughness: 0.4 }));
    g.add(band);
    radius = 0.15;
  } else {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.16, 16), toon(team[0], { roughness: 0.8 }));
    g.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 20), toon(team[1], { roughness: 0.8 }));
    brim.position.y = -0.07;
    g.add(brim);
    radius = 0.1;
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: g, radius };
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// Un hincha aparece en la primera fila, revolea el brazo y tira algo a la cancha.
export class Thrower {
  constructor(scene, mode, { spots, half, fx }) {
    this.scene = scene;
    this.mode = mode;
    this.spots = spots;
    this.half = half;
    this.fx = fx;
    this.fan = buildFan(mode);
    this.fan.group.visible = false;
    scene.add(this.fan.group);
    this.cooldown = 4 + Math.random() * 3;
    this.anim = null;
    this.objects = [];
    this.trail = this.buildTrail();
  }

  buildTrail() {
    const n = 18;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const alpha = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) alpha[i * 2] = alpha[i * 2 + 1] = 1 - i / n;
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const idx = [];
    for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
      fragmentShader: `uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0), vA * uOpacity * 0.9); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return { mesh, pos, n, history: [], mat };
  }

  start() {
    const spot = this.spots[Math.floor(Math.random() * this.spots.length)];
    const fan = this.fan.group;
    fan.position.copy(spot);
    fan.lookAt(0, spot.y, 0);
    fan.visible = true;
    const kind = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
    // Destino: un punto dentro de la cancha, del lado del hincha.
    const target = new THREE.Vector3(
      THREE.MathUtils.clamp(spot.x * 0.45 + (Math.random() - 0.5) * 6, -this.half.x + 0.5, this.half.x - 0.5),
      0,
      THREE.MathUtils.clamp(spot.z * 0.45 + (Math.random() - 0.5) * 6, -this.half.z + 0.5, this.half.z - 0.5),
    );
    this.anim = { t: 0, kind, target, thrown: false, base: spot.y };
  }

  release() {
    const a = this.anim;
    const obj = buildObject(a.kind, this.mode);
    const hand = new THREE.Vector3(0.3, 1.5, 0.3);
    this.fan.group.localToWorld(hand);
    obj.group.position.copy(hand);
    const T = 1.05;
    const vel = new THREE.Vector3(
      (a.target.x - hand.x) / T,
      (obj.radius - hand.y + 0.5 * GRAVITY * T * T) / T,
      (a.target.z - hand.z) / T,
    );
    this.objects.push({
      ...obj,
      vel,
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14),
      bounces: 0,
      age: 0,
      rest: 0,
      trail: a.kind === 'roll',
    });
    this.scene.add(obj.group);
    this.trail.history.length = 0;
    this.onRelease?.();
  }

  update(dt, { active, snakeHead, onBounce }) {
    const fan = this.fan;
    if (active && !this.anim) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.start();
        this.cooldown = 9 + Math.random() * 8;
      }
    }
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const t = a.t;
      // Línea de tiempo: sube (0-.4), alienta (.4-1.1), carga (1.1-1.5), lanza (1.5-1.65), festeja, baja.
      const rise = t < 0.4 ? easeOutBack(t / 0.4) : t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.4) : 1;
      fan.group.position.y = a.base - 1.6 + rise * 1.6;
      const [left, right] = fan.arms;
      if (t < 1.1) {
        left.rotation.x = right.rotation.x = Math.PI + Math.sin(t * 16) * 0.35;
        fan.head.rotation.z = Math.sin(t * 8) * 0.12;
      } else if (t < 1.5) {
        const k = (t - 1.1) / 0.4;
        right.rotation.x = Math.PI - k * 1.4;
        left.rotation.x = Math.PI * 0.5;
      } else if (t < 1.65) {
        const k = (t - 1.5) / 0.15;
        right.rotation.x = Math.PI - 1.4 + k * 3.2;
        if (!a.thrown && k > 0.5) {
          a.thrown = true;
          this.release();
        }
      } else {
        const k = Math.min(1, (t - 1.65) / 0.4);
        right.rotation.x = Math.PI + 1.8 - k * 1.8 + Math.sin(t * 14) * 0.3 * k;
        left.rotation.x = Math.PI + Math.sin(t * 14 + 1) * 0.3 * k;
        fan.group.position.y += Math.abs(Math.sin(t * 9)) * 0.15 * k * rise;
      }
      fan.mouth.scale.y = 0.6 + Math.abs(Math.sin(t * 12)) * 0.8;
      if (t > 3) {
        this.anim = null;
        fan.group.visible = false;
      }
    }

    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      o.age += dt;
      const p = o.group.position;
      if (o.rest === 0 || o.vel.lengthSq() > 0.01) {
        o.vel.y -= GRAVITY * dt;
        p.addScaledVector(o.vel, dt);
        o.group.rotation.x += o.spin.x * dt;
        o.group.rotation.y += o.spin.y * dt;
        o.group.rotation.z += o.spin.z * dt;
        if (p.y < o.radius) {
          p.y = o.radius;
          if (Math.abs(o.vel.y) > 1.2) {
            onBounce?.(p.clone(), o.bounces === 0 ? 1 : 0.5);
            o.bounces += 1;
          }
          o.vel.y = -o.vel.y * 0.42;
          o.vel.x *= 0.62;
          o.vel.z *= 0.62;
          o.spin.multiplyScalar(0.55);
          if (Math.abs(o.vel.y) < 0.6) {
            o.vel.y = 0;
            o.rest = 1;
          }
        }
        // Rebota contra los carteles.
        if (Math.abs(p.x) > this.half.x + 2.3 && p.x * o.vel.x > 0) o.vel.x *= -0.5;
        if (Math.abs(p.z) > this.half.z + 2.3 && p.z * o.vel.z > 0) o.vel.z *= -0.5;
      }
      if (o.rest) {
        o.vel.x *= Math.pow(0.05, dt);
        o.vel.z *= Math.pow(0.05, dt);
        o.spin.multiplyScalar(Math.pow(0.05, dt));
        // Settle: queda acostado.
        o.group.rotation.x += (Math.round(o.group.rotation.x / Math.PI) * Math.PI - o.group.rotation.x) * Math.min(1, dt * 6);
        o.group.rotation.z += (Math.round(o.group.rotation.z / (Math.PI / 2)) * (Math.PI / 2) - o.group.rotation.z) * Math.min(1, dt * 6);
      }
      // La víbora lo patea si pasa encima: nunca bloquea ni mata.
      if (snakeHead && o.rest) {
        const dx = p.x - snakeHead.x;
        const dz = p.z - snakeHead.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          o.vel.set((dx / (d || 1)) * 5, 3.5, (dz / (d || 1)) * 5);
          o.spin.set(Math.random() * 10, 5, Math.random() * 10);
          o.rest = 0;
        }
      }
      if (o.age > 7) {
        const s = Math.max(0, 1 - (o.age - 7) / 0.5);
        o.group.scale.setScalar(s);
        if (s <= 0) {
          this.scene.remove(o.group);
          o.group.traverse((m) => m.isMesh && (m.geometry.dispose(), m.material.dispose()));
          this.objects.splice(i, 1);
        }
      }
    }

    // Serpentina del rollo de papel.
    const roll = this.objects.find((o) => o.trail && o.age < 3);
    const tr = this.trail;
    if (roll) {
      tr.history.unshift(roll.group.position.clone());
      if (tr.history.length > tr.n) tr.history.pop();
      tr.mat.uniforms.uOpacity.value = Math.max(0, 1 - Math.max(0, roll.age - 2) );
      for (let i = 0; i < tr.n; i++) {
        const h = tr.history[Math.min(i, tr.history.length - 1)];
        const w = 0.09 * (1 - i / tr.n) + 0.02;
        tr.pos.set([h.x, h.y + w, h.z], i * 6);
        tr.pos.set([h.x, Math.max(0.02, h.y - w), h.z], i * 6 + 3);
      }
      tr.mesh.geometry.attributes.position.needsUpdate = true;
      tr.mesh.visible = true;
    } else {
      tr.mesh.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.fan.group, this.trail.mesh);
    for (const o of this.objects) this.scene.remove(o.group);
    this.objects = [];
  }
}
