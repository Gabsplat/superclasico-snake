import * as THREE from 'three';
import { toon } from './materials.js';
import { bocaSkinTexture, riverSkinTexture } from './textures.js';

const SUB = 5; // muestras por celda
const RAD = 14; // segmentos alrededor
const UP = new THREE.Vector3(0, 1, 0);

const sphere = new THREE.SphereGeometry(1, 24, 16);
const smallSphere = new THREE.SphereGeometry(1, 12, 10);

function part(geo, mat, pos, scale, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (Array.isArray(scale)) m.scale.set(...scale);
  else m.scale.setScalar(scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Ojo expresivo: blanco, pupila que mira, brillo, párpado (escala) y cruz para la muerte.
function makeEye(parent, pos, r, lidMat) {
  const g = new THREE.Group();
  g.position.set(...pos);
  parent.add(g);
  const white = toon('#ffffff', { roughness: 0.2, rimStrength: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: '#111018', roughness: 0.15 });
  const ball = part(smallSphere, white, [0, 0, 0], r, g);
  const pupilG = new THREE.Group();
  g.add(pupilG);
  const pupil = part(smallSphere, black, [0, 0, r * 0.72], [r * 0.5, r * 0.55, r * 0.35], pupilG);
  const shine = part(smallSphere, new THREE.MeshBasicMaterial({ color: '#ffffff' }), [r * 0.18, r * 0.2, r * 1.0], r * 0.16, pupilG);
  const lid = part(smallSphere, lidMat, [0, r * 0.15, 0], [r * 1.08, r * 1.08, r * 1.08], g);
  lid.scale.y = 0.01;
  lid.visible = false;
  const cross = new THREE.Group();
  const barGeo = new THREE.BoxGeometry(r * 1.3, r * 0.22, r * 0.2);
  for (const a of [0.78, -0.78]) {
    const b = new THREE.Mesh(barGeo, black);
    b.rotation.z = a;
    b.position.z = r * 0.95;
    cross.add(b);
  }
  cross.visible = false;
  g.add(cross);
  return {
    group: g,
    look(dirLocal) {
      // dirLocal: vector en el espacio de la cabeza, normalizado.
      const yaw = Math.atan2(dirLocal.x, Math.max(0.2, dirLocal.z));
      const pitch = Math.atan2(dirLocal.y, Math.hypot(dirLocal.x, dirLocal.z));
      pupilG.rotation.y += (THREE.MathUtils.clamp(yaw, -0.7, 0.7) - pupilG.rotation.y) * 0.2;
      pupilG.rotation.x += (THREE.MathUtils.clamp(-pitch, -0.4, 0.4) - pupilG.rotation.x) * 0.2;
    },
    blink(amount) {
      lid.visible = amount > 0.02;
      lid.scale.y = r * 1.08 * Math.max(0.01, amount);
    },
    setDead(dead) {
      cross.visible = dead;
      pupil.visible = shine.visible = !dead;
    },
  };
}

function buildBocaHead(skinTex) {
  const head = new THREE.Group();
  const blue = toon('#1550b8', { roughness: 0.35, map: null, rim: '#9cc4ff', rimStrength: 0.55 });
  const blueLight = toon('#2a6ad6', { roughness: 0.35, rim: '#9cc4ff', rimStrength: 0.5 });
  const yellow = toon('#ffc928', { roughness: 0.4, rim: '#fff2b0', rimStrength: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a0b10', roughness: 0.6 });
  const tongueMat = toon('#e3243b', { roughness: 0.3, rimStrength: 0.2 });

  part(sphere, blue, [0, 0.34, 0.08], [0.42, 0.32, 0.5], head);
  part(sphere, blueLight, [0, 0.33, 0.42], [0.31, 0.2, 0.32], head);
  part(sphere, yellow, [0, 0.6, 0.02], [0.1, 0.07, 0.42], head);
  part(sphere, yellow, [0, 0.47, -0.3], [0.2, 0.06, 0.12], head);
  for (const sx of [-1, 1]) part(smallSphere, dark, [sx * 0.08, 0.42, 0.72], [0.03, 0.025, 0.02], head);

  const jaw = new THREE.Group();
  jaw.position.set(0, 0.22, 0.0);
  head.add(jaw);
  part(sphere, yellow, [0, 0, 0.3], [0.33, 0.11, 0.42], jaw);
  part(sphere, dark, [0, 0.06, 0.32], [0.27, 0.05, 0.34], jaw);

  const tongue = new THREE.Group();
  tongue.position.set(0, 0.26, 0.62);
  head.add(tongue);
  const tg = new THREE.BoxGeometry(0.05, 0.02, 0.3);
  tg.translate(0, 0, 0.15);
  part(tg, tongueMat, [0, 0, 0], 1, tongue);
  const fork = new THREE.BoxGeometry(0.035, 0.02, 0.12);
  fork.translate(0, 0, 0.06);
  for (const a of [-0.45, 0.45]) {
    const f = part(fork, tongueMat, [0, 0, 0.29], 1, tongue);
    f.rotation.y = a;
  }
  tongue.scale.z = 0.01;

  // Cuello de camiseta.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 10, 28), yellow);
  collar.position.set(0, 0.3, -0.3);
  collar.castShadow = true;
  head.add(collar);

  const eyes = [makeEye(head, [-0.2, 0.55, 0.3], 0.15, blue), makeEye(head, [0.2, 0.55, 0.3], 0.15, blue)];
  const brows = [];
  for (const sx of [-1, 1]) {
    const b = part(new THREE.CapsuleGeometry(0.025, 0.14, 3, 6), dark, [sx * 0.2, 0.73, 0.32], 1, head);
    b.rotation.z = Math.PI / 2 + sx * 0.25;
    brows.push(b);
  }
  return { head, eyes, jaw, tongue, brows, mouthOpen: (o) => (jaw.rotation.x = o * 0.55) };
}

function buildRiverHead() {
  const head = new THREE.Group();
  const pink = toon('#ec7b8c', { roughness: 0.35, rim: '#ffd0d8', rimStrength: 0.6 });
  const pinkDark = toon('#d9607a', { roughness: 0.4, rim: '#ffc0cc', rimStrength: 0.4 });
  const white = toon('#fbfaf7', { roughness: 0.7, rimStrength: 0.3 });
  const red = toon('#e1061e', { roughness: 0.6, rimStrength: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a0d1a', roughness: 0.5 });

  part(sphere, pink, [0, 0.37, 0.16], [0.4, 0.37, 0.47], head);
  const corona = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 12, 32), pinkDark);
  corona.position.set(0, 0.34, -0.12);
  corona.scale.set(1.05, 1, 1);
  corona.castShadow = true;
  head.add(corona);
  // Vincha blanca con raya roja.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.14, 28, 1, true), white);
  band.rotation.x = Math.PI / 2;
  band.position.set(0, 0.3, -0.32);
  head.add(band);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.318, 0.022, 6, 32), red);
  stripe.position.set(0, 0.3, -0.32);
  head.add(stripe);

  const eyes = [makeEye(head, [-0.15, 0.56, 0.38], 0.125, pink), makeEye(head, [0.15, 0.56, 0.38], 0.125, pink)];
  const brows = [];
  for (const sx of [-1, 1]) {
    const b = part(new THREE.CapsuleGeometry(0.022, 0.12, 3, 6), dark, [sx * 0.16, 0.72, 0.38], 1, head);
    b.rotation.z = Math.PI / 2 + sx * 0.2;
    brows.push(b);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 16, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.42, 0.6);
  smile.rotation.x = -0.35;
  head.add(smile);
  const oMouth = part(smallSphere, dark, [0, 0.36, 0.6], [0.09, 0.08, 0.04], head);
  oMouth.visible = false;
  for (const sx of [-1, 1]) part(smallSphere, toon('#ff8fa3', { roughness: 0.6, rimStrength: 0 }), [sx * 0.29, 0.44, 0.42], [0.08, 0.05, 0.03], head);
  return {
    head,
    eyes,
    brows,
    mouthOpen(o) {
      oMouth.visible = o > 0.15;
      smile.visible = !oMouth.visible;
      oMouth.scale.y = 0.04 + o * 0.08;
    },
  };
}

function buildBalls() {
  const g = new THREE.Group();
  const skin = toon('#ee9a9c', { roughness: 0.45, rim: '#ffd6d8', rimStrength: 0.55 });
  const balls = [-1, 1].map((sx) => part(sphere, skin, [sx * 0.21, 0.3, -0.18], 0.3, g));
  // Pliegue central.
  part(smallSphere, toon('#d9797d', { roughness: 0.6, rimStrength: 0 }), [0, 0.3, -0.25], [0.04, 0.25, 0.2], g);
  return { group: g, balls };
}

export function createCharacter(mode, maxCells) {
  const isBoca = mode === 'boca';
  const group = new THREE.Group();
  const maxRings = maxCells * SUB + 4;
  const vCount = maxRings * (RAD + 1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const idx = new Uint32Array((maxRings - 1) * RAD * 6);
  let k = 0;
  for (let i = 0; i < maxRings - 1; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j;
      const b = a + RAD + 1;
      idx[k++] = a;
      idx[k++] = a + 1;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = a + 1;
      idx[k++] = b + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nAttr = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
  const uAttr = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pAttr);
  geo.setAttribute('normal', nAttr);
  geo.setAttribute('uv', uAttr);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  const skinTex = isBoca ? bocaSkinTexture() : riverSkinTexture();
  const bodyMat = isBoca
    ? toon('#ffffff', { map: skinTex, roughness: 0.32, rim: '#a8ccff', rimStrength: 0.5 })
    : toon('#ffffff', { map: skinTex, roughness: 0.75, rim: '#ffffff', rimStrength: 0.35 });
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true;
  body.frustumCulled = false;
  group.add(body);

  const H = isBoca ? buildBocaHead(skinTex) : buildRiverHead();
  group.add(H.head);
  const tail = isBoca ? null : buildBalls();
  if (tail) group.add(tail.group);

  // Estrellitas de mareo al morir.
  const dizzy = new THREE.Group();
  const starMat = new THREE.MeshBasicMaterial({ color: isBoca ? '#ffd94a' : '#ffffff' });
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.045 : 0.11;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ShapeGeometry(starShape);
  for (let i = 0; i < 3; i++) dizzy.add(new THREE.Mesh(starGeo, starMat));
  dizzy.visible = false;
  H.head.add(dizzy);

  // Estado reutilizable.
  const pts = [];
  const samples = [];
  const tangents = [];
  const sides = [];
  const dists = [];
  for (let i = 0; i < maxRings; i++) {
    samples.push(new THREE.Vector3());
    tangents.push(new THREE.Vector3());
    sides.push(new THREE.Vector3());
  }
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const headInv = new THREE.Matrix4();
  let blinkT = 2;
  let tongueT = 1.5;
  let squash = 0;
  let happy = 0;
  const bulges = [];
  const R = isBoca ? 0.29 : 0.3;
  const tileLen = isBoca ? 2.4 : 1.6;

  function radius(s, L) {
    let r = R;
    if (isBoca) {
      if (s < 0.7) r *= 0.9 + 0.1 * (s / 0.7);
      const d = Math.max(0, L - s);
      const f = Math.min(1, d / 3.2);
      r *= 0.1 + 0.9 * Math.sqrt(f);
    } else {
      const d = Math.max(0, L - s);
      if (d < 0.3) r *= 0.75 + 0.25 * (d / 0.3);
    }
    for (const b of bulges) {
      const x = s - b.s;
      r += 0.12 * Math.exp(-(x * x) / 0.12);
    }
    return r;
  }

  function catmull(p0, p1, p2, p3, t, out) {
    const t2 = t * t;
    const t3 = t2 * t;
    out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
    out.y = 0;
    return out;
  }

  return {
    group,
    head: H.head,
    eat() {
      happy = 1;
      bulges.push({ s: 0.2, born: 0 });
    },
    // points: Vector3[] cabeza→cola (coordenadas de mundo, y ignorada).
    update({ points, time, dt, look, dead = false, deadT = 0, moving = true, nearFood = 0 }) {
      const n = points.length;
      if (n < 2) return;
      // Densificar con Catmull-Rom.
      let m = 0;
      for (let i = 0; i < n - 1 && m < maxRings - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(n - 1, i + 2)];
        for (let s = 0; s < SUB && m < maxRings - 1; s++) catmull(p0, p1, p2, p3, s / SUB, samples[m++]);
      }
      samples[m++].copy(points[n - 1]).setY(0);
      // Largo acumulado.
      dists.length = m;
      dists[0] = 0;
      for (let i = 1; i < m; i++) dists[i] = dists[i - 1] + samples[i].distanceTo(samples[i - 1]);
      const L = dists[m - 1];
      // Avanzan las "tragadas".
      for (let i = bulges.length - 1; i >= 0; i--) {
        bulges[i].s += dt * 5.5;
        if (bulges[i].s > L + 0.5) bulges.splice(i, 1);
      }
      // Tangentes y ondulación lateral.
      for (let i = 0; i < m; i++) {
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(m - 1, i + 1)];
        tangents[i].subVectors(a, b).normalize();
        if (tangents[i].lengthSq() < 0.5) tangents[i].copy(i ? tangents[i - 1] : tmp.set(0, 0, -1));
        sides[i].crossVectors(tangents[i], UP).normalize();
      }
      const waveAmp = dead ? 0 : moving ? 0.075 : 0.035;
      for (let i = 0; i < m; i++) {
        const s = dists[i];
        const fade = Math.min(1, Math.max(0, (s - 0.5) / 1.5));
        const w = Math.sin(s * 2.1 - time * (moving ? 8 : 3)) * waveAmp * fade;
        samples[i].addScaledVector(sides[i], w);
      }
      // Construir anillos.
      for (let i = 0; i < m; i++) {
        const s = dists[i];
        const r = radius(s, L);
        const c = samples[i];
        const S = sides[i];
        const T = tangents[i];
        // U = S × T
        const ux = S.y * T.z - S.z * T.y;
        const uy = S.z * T.x - S.x * T.z;
        const uz = S.x * T.y - S.y * T.x;
        for (let j = 0; j <= RAD; j++) {
          const th = (j / RAD) * Math.PI * 2;
          const cs = Math.cos(th);
          const sn = Math.sin(th);
          const nx = S.x * cs + ux * sn;
          const ny = S.y * cs + uy * sn;
          const nz = S.z * cs + uz * sn;
          const o = (i * (RAD + 1) + j) * 3;
          const flat = ny < 0 ? 0.82 : 1; // panza apoyada
          pos[o] = c.x + nx * r;
          pos[o + 1] = r * 0.95 + ny * r * flat;
          pos[o + 2] = c.z + nz * r;
          nor[o] = nx;
          nor[o + 1] = ny;
          nor[o + 2] = nz;
          const u = (i * (RAD + 1) + j) * 2;
          uvs[u] = s / tileLen;
          uvs[u + 1] = 1 - j / RAD;
        }
      }
      const vUsed = m * (RAD + 1);
      for (const a of [pAttr, nAttr]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, vUsed * 3);
        a.needsUpdate = true;
      }
      uAttr.clearUpdateRanges();
      uAttr.addUpdateRange(0, vUsed * 2);
      uAttr.needsUpdate = true;
      geo.setDrawRange(0, (m - 1) * RAD * 6);

      // Cabeza.
      const T0 = tangents[0];
      const S0 = sides[0];
      // Base derecha (x = U × T) para que sea una rotación y no un reflejo.
      tmp.crossVectors(S0, T0);
      tmp2.crossVectors(tmp, T0);
      basis.makeBasis(tmp2, tmp, T0);
      H.head.quaternion.setFromRotationMatrix(basis);
      H.head.position.set(samples[0].x, 0, samples[0].z);
      happy = Math.max(0, happy - dt * 2.2);
      squash = dead ? Math.min(1, squash + dt * 10) : Math.max(0, squash - dt * 6);
      const bob = dead ? 0 : Math.sin(time * (moving ? 10 : 3)) * 0.03;
      const pop = 1 + Math.sin(happy * Math.PI) * 0.18;
      H.head.scale.set(pop * (1 + squash * 0.18), pop * (1 - squash * 0.12) + bob, pop * (1 - squash * 0.3));
      if (dead) H.head.position.addScaledVector(T0, -squash * 0.08);

      // Mirada hacia la comida y parpadeo.
      if (look) {
        headInv.copy(H.head.matrixWorld).invert();
        tmp2.copy(look).applyMatrix4(headInv).sub(tmp.set(0, 0.55, 0.3)).normalize();
        H.eyes.forEach((e) => e.look(tmp2));
      }
      blinkT -= dt;
      let blink = 0;
      if (blinkT < 0.14) blink = Math.sin((Math.max(0, blinkT) / 0.14) * Math.PI);
      if (blinkT < 0) blinkT = 1.8 + Math.random() * 3.2;
      H.eyes.forEach((e) => {
        e.blink(dead ? 0 : blink);
        e.setDead(dead);
      });
      H.brows.forEach((b, i) => {
        const sx = i ? 1 : -1;
        const target = dead ? -0.5 : happy > 0.1 ? 0.45 : nearFood > 0.5 ? 0.15 : 0.25;
        b.rotation.z = Math.PI / 2 - sx * target;
        b.position.y = (isBoca ? 0.73 : 0.72) + happy * 0.06;
      });
      H.mouthOpen(dead ? 0.9 : Math.max(nearFood, happy * 0.8));
      if (H.tongue) {
        tongueT -= dt;
        if (tongueT < 0) tongueT = 1.6 + Math.random() * 2.5;
        const flick = tongueT < 0.35 && !dead ? Math.sin((tongueT / 0.35) * Math.PI) : dead ? 0.8 : 0;
        H.tongue.scale.z = Math.max(0.01, flick);
        H.tongue.rotation.y = Math.sin(time * 30) * 0.15 * flick;
        H.tongue.rotation.x = dead ? 0.6 : 0;
      }
      dizzy.visible = dead && deadT > 0.25;
      if (dizzy.visible) {
        dizzy.children.forEach((st, i) => {
          const a = time * 4 + (i * Math.PI * 2) / 3;
          st.position.set(Math.cos(a) * 0.42, 0.95 + Math.sin(time * 6 + i) * 0.04, Math.sin(a) * 0.42);
          st.rotation.y = -a;
        });
      }

      // Cola: huevitos para River.
      if (tail) {
        const tl = m - 1;
        const T = tangents[tl];
        const S = sides[tl];
        tmp.crossVectors(S, T);
        tmp2.crossVectors(tmp, T);
        basis.makeBasis(tmp2, tmp, T);
        tail.group.quaternion.setFromRotationMatrix(basis);
        tail.group.position.set(samples[tl].x, 0, samples[tl].z);
        tail.balls.forEach((b, i) => {
          const j = moving && !dead ? Math.sin(time * 12 + i * 1.7) : Math.sin(time * 3 + i) * 0.3;
          b.scale.set(0.3 * (1 - j * 0.04), 0.3 * (1 + j * 0.06), 0.3);
          b.position.y = 0.3 + j * 0.02;
        });
      }
    },
    dispose() {
      geo.dispose();
      bodyMat.dispose();
      skinTex.dispose();
      group.traverse((o) => {
        if (o.isMesh && o !== body) {
          if (o.geometry !== sphere && o.geometry !== smallSphere) o.geometry.dispose();
          o.material.dispose?.();
        }
      });
    },
  };
}
