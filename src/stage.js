import * as THREE from 'three';
import { pitchTexture, boardTexture, bannerTexture } from './textures.js';

export const MARGIN = 2.6;
const ROWS = 4;
const ROW_D = 1.0;
const ROW_H = 0.55;

const panoCache = new Map();
const loader = new THREE.TextureLoader();

function loadPano(url) {
  if (!panoCache.has(url)) {
    panoCache.set(
      url,
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.MirroredRepeatWrapping;
            t.anisotropy = 4;
            resolve(t);
          },
          undefined,
          reject,
        );
      }),
    );
  }
  return panoCache.get(url);
}

// Hinchada animada en GPU: cada instancia salta con su propia fase.
function crowdMaterial(color, uniforms) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uHype = uniforms.uHype;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPhase;
        uniform float uTime;
        uniform float uHype;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float jumpRate = 5.0 + fract(aPhase * 7.13) * 3.0;
        float jumping = step(0.45, fract(aPhase * 3.7)) + uHype;
        transformed.y += abs(sin(uTime * jumpRate + aPhase * 6.2831)) * 0.22 * min(jumping, 1.6);
        transformed.x += sin(uTime * 2.0 + aPhase * 9.0) * 0.03;`,
      );
  };
  return m;
}

export function buildStage(theme, { w, h, renderer }) {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uHype: { value: 0 } };
  const disposables = [];
  const track = (o) => (disposables.push(o), o);
  const halfW = w / 2;
  const halfH = h / 2;
  const bx = halfW + MARGIN;
  const bz = halfH + MARGIN;

  // Cielo.
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(120, 32, 16)),
    track(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(theme.skyTop) },
          horizon: { value: new THREE.Color(theme.skyHorizon) },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
          void main(){ float t = clamp(normalize(vP).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.7)), 1.0);
          #include <colorspace_fragment>
          }`,
      }),
    ),
  );
  sky.renderOrder = -10;
  group.add(sky);

  // Piso exterior.
  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(200, 200)),
    track(new THREE.MeshLambertMaterial({ color: theme.ground })),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  group.add(ground);

  // Cancha.
  const pitchTex = track(pitchTexture({ w, h, margin: MARGIN, theme }));
  pitchTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pitch = new THREE.Mesh(
    track(new THREE.PlaneGeometry(w + MARGIN * 2, h + MARGIN * 2)),
    track(new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, metalness: 0 })),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // Carteles LED.
  const boardTex = track(boardTexture(theme.boards, theme.boardColors));
  const boardMat = track(new THREE.MeshBasicMaterial({ map: boardTex }));
  const backMat = track(new THREE.MeshLambertMaterial({ color: '#1b1d22' }));
  const boardH = 0.75;
  const boards = [
    { len: bz * 2, x: -bx, z: 0, ry: Math.PI / 2 },
    { len: bz * 2, x: bx, z: 0, ry: -Math.PI / 2 },
    { len: bx * 2, x: 0, z: -bz, ry: 0 },
    { len: bx * 2, x: 0, z: bz, ry: Math.PI },
  ];
  for (const b of boards) {
    const g = track(new THREE.PlaneGeometry(b.len, boardH));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * b.len) / 18);
    const m = new THREE.Mesh(g, boardMat);
    m.position.set(b.x, boardH / 2 + 0.02, b.z);
    m.rotation.y = b.ry;
    group.add(m);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(b.len + 0.2, boardH + 0.1, 0.14)), backMat);
    back.position.copy(m.position);
    back.rotation.y = b.ry;
    back.translateZ(-0.08);
    back.castShadow = true;
    group.add(back);
  }

  // Tribunas escalonadas con hinchada.
  const standMats = theme.standColors.map((c) => track(new THREE.MeshLambertMaterial({ color: c })));
  const stepGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const fans = [];
  const sides = [
    { axis: 'x', sign: -1 },
    { axis: 'x', sign: 1 },
    { axis: 'z', sign: -1 },
    { axis: 'z', sign: 1 },
  ];
  const outerX = bx + 0.4 + ROWS * ROW_D;
  const outerZ = bz + 0.4 + ROWS * ROW_D;
  for (const s of sides) {
    for (let r = 0; r < ROWS; r++) {
      const inner = (s.axis === 'x' ? bx : bz) + 0.4 + r * ROW_D;
      const top = 0.75 + r * ROW_H;
      const span = s.axis === 'x' ? outerZ * 2 : bx * 2 + 0.8;
      const m = new THREE.Mesh(stepGeo, standMats[r % 2]);
      if (s.axis === 'x') {
        m.scale.set(ROW_D, top, span);
        m.position.set(s.sign * (inner + ROW_D / 2), top / 2, 0);
      } else {
        m.scale.set(span, top, ROW_D);
        m.position.set(0, top / 2, s.sign * (inner + ROW_D / 2));
      }
      m.receiveShadow = true;
      group.add(m);
      const spacing = 0.62;
      const count = Math.floor(span / spacing);
      for (let i = 0; i < count; i++) {
        if (Math.random() < 0.12) continue;
        const along = -span / 2 + (i + 0.5) * spacing + (Math.random() - 0.5) * 0.18;
        const across = s.sign * (inner + ROW_D * 0.55);
        fans.push({
          x: s.axis === 'x' ? across : along,
          z: s.axis === 'x' ? along : across,
          y: top,
          face: s.axis === 'x' ? (s.sign > 0 ? -Math.PI / 2 : Math.PI / 2) : s.sign > 0 ? Math.PI : 0,
        });
      }
    }
    // Pared trasera.
    const wall = new THREE.Mesh(stepGeo, backMat);
    const wh = 0.75 + ROWS * ROW_H + 0.5;
    if (s.axis === 'x') {
      wall.scale.set(0.4, wh, outerZ * 2 + 0.8);
      wall.position.set(s.sign * (outerX + 0.2), wh / 2, 0);
    } else {
      wall.scale.set(outerX * 2 + 0.8, wh, 0.4);
      wall.position.set(0, wh / 2, s.sign * (outerZ + 0.2));
    }
    group.add(wall);
  }

  const bodyGeo = track(new THREE.CapsuleGeometry(0.17, 0.32, 3, 8));
  bodyGeo.translate(0, 0.33, 0);
  const headGeo = track(new THREE.SphereGeometry(0.13, 10, 8));
  headGeo.translate(0, 0.78, 0);
  const phases = new Float32Array(fans.length);
  fans.forEach((_, i) => (phases[i] = Math.random()));
  bodyGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  headGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const bodies = new THREE.InstancedMesh(bodyGeo, track(crowdMaterial('#ffffff', uniforms)), fans.length);
  const heads = new THREE.InstancedMesh(headGeo, track(crowdMaterial('#ffffff', uniforms)), fans.length);
  const skins = ['#f1c9a5', '#d9a37e', '#a8714f', '#7a4a32', '#f6d7bd'].map((c) => new THREE.Color(c));
  const crowdColors = theme.crowd.map((c) => new THREE.Color(c));
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  fans.forEach((f, i) => {
    const sc = 0.9 + Math.random() * 0.25;
    q.setFromAxisAngle(up, f.face);
    mtx.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(sc, sc, sc));
    bodies.setMatrixAt(i, mtx);
    heads.setMatrixAt(i, mtx);
    bodies.setColorAt(i, crowdColors[Math.floor(Math.random() * crowdColors.length)]);
    heads.setColorAt(i, skins[Math.floor(Math.random() * skins.length)]);
  });
  bodies.frustumCulled = heads.frustumCulled = false;
  group.add(bodies, heads);

  // Banderas que flamean (shader de vértices).
  const flagMat = (map) =>
    track(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { map: { value: map }, uTime: uniforms.uTime },
        vertexShader: `uniform float uTime; varying vec2 vUv; varying float vShade;
          void main(){ vUv = uv; vec3 p = position; float w = sin(p.x * 1.3 + uTime * 3.0) * 0.12 + sin(p.x * 2.7 - uTime * 2.1) * 0.05;
          p.z += w * (0.4 + uv.y); vShade = 0.82 + w * 1.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vShade;
          void main(){ vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb * vShade, 1.0);
          #include <colorspace_fragment>
          }`,
      }),
    );
  const b1 = theme.banner;
  const flag1 = new THREE.Mesh(
    track(new THREE.PlaneGeometry(9, 2.2, 32, 4)),
    flagMat(track(bannerTexture(b1.text, b1.bg, b1.fg, b1.stripe))),
  );
  flag1.position.set(0, 1.9, -(bz + 0.4 + 2.3 * ROW_D));
  flag1.rotation.x = -0.75;
  group.add(flag1);
  const b2 = theme.banner2;
  const flag2 = new THREE.Mesh(
    track(new THREE.PlaneGeometry(8, 1.8, 32, 4)),
    flagMat(track(bannerTexture(b2.text, b2.bg, b2.fg, b2.stripe))),
  );
  flag2.position.set(bx + 0.4 + 2.6 * ROW_D, 2.0, 4);
  flag2.rotation.set(0, -Math.PI / 2, 0);
  flag2.rotateX(-0.75);
  group.add(flag2);

  // Arcos.
  const postMat = track(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  const netTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 5);
    return track(t);
  })();
  const netMat = track(
    new THREE.MeshLambertMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, opacity: 0.85 }),
  );
  const goalW = 2.8;
  const goalH = 1.05;
  const goalD = 1.0;
  for (const sgn of [-1, 1]) {
    const goal = new THREE.Group();
    const post = track(new THREE.CylinderGeometry(0.06, 0.06, goalH, 10));
    for (const px of [-goalW / 2, goalW / 2]) {
      const p = new THREE.Mesh(post, postMat);
      p.position.set(px, goalH / 2, 0);
      p.castShadow = true;
      goal.add(p);
    }
    const bar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.06, goalW + 0.12, 10)), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = goalH;
    bar.castShadow = true;
    goal.add(bar);
    const back = new THREE.Mesh(track(new THREE.PlaneGeometry(goalW, goalH)), netMat);
    back.position.set(0, goalH / 2, goalD);
    goal.add(back);
    const roof = new THREE.Mesh(track(new THREE.PlaneGeometry(goalW, goalD)), netMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, goalH, goalD / 2);
    goal.add(roof);
    for (const px of [-goalW / 2, goalW / 2]) {
      const side = new THREE.Mesh(track(new THREE.PlaneGeometry(goalD, goalH)), netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(px, goalH / 2, goalD / 2);
      goal.add(side);
    }
    goal.position.z = sgn * (halfH + 0.04);
    if (sgn < 0) goal.rotation.y = Math.PI;
    group.add(goal);
  }

  // Banderines de córner.
  const flags = [];
  const flagGeo = track(new THREE.BufferGeometry());
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.45, -0.14, 0, 0, -0.28, 0], 3));
  flagGeo.computeVertexNormals();
  const cornerMat = track(new THREE.MeshLambertMaterial({ color: theme.secondary === '#ffffff' ? theme.primary : theme.secondary, side: THREE.DoubleSide }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6)), postMat);
      pole.position.set(sx * halfW, 0.55, sz * halfH);
      pole.castShadow = true;
      group.add(pole);
      const f = new THREE.Mesh(flagGeo, cornerMat);
      f.position.set(sx * halfW, 1.08, sz * halfH);
      group.add(f);
      flags.push(f);
    }
  }

  // Torres de iluminación.
  const towerMat = track(new THREE.MeshLambertMaterial({ color: '#5b6068' }));
  const lampMat = track(new THREE.MeshBasicMaterial({ color: '#fffbe8' }));
  const towers = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const t = new THREE.Group();
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.25, 0.45, 22, 8)), towerMat);
      pole.position.y = 11;
      t.add(pole);
      const panel = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 2, 0.3)), towerMat);
      panel.position.y = 22.5;
      t.add(panel);
      const lamps = new THREE.Mesh(track(new THREE.PlaneGeometry(2.9, 1.7)), lampMat);
      lamps.position.set(0, 22.5, 0.16);
      t.add(lamps);
      t.position.set(sx * 19, 0, sz * 24);
      t.lookAt(0, 0, 0);
      group.add(t);
      towers.push(t);
    }
  }

  // Fondo fotográfico curvo (panorama real).
  const panoMat = track(
    new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, fog: false, toneMapped: false, transparent: true, opacity: 0 }),
  );
  const pano = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1, 13, 96, 1, true)), panoMat);
  pano.scale.set(20.5, 1, 25);
  pano.position.y = 6.5;
  pano.renderOrder = -5;
  group.add(pano);
  loadPano(theme.pano).then((t) => {
    const clone = t.clone();
    clone.needsUpdate = true;
    clone.repeat.set(2, 1 - theme.panoVMin);
    clone.offset.set(0.25, theme.panoVMin);
    clone.wrapS = THREE.MirroredRepeatWrapping;
    panoMat.map = clone;
    panoMat.needsUpdate = true;
    disposables.push(clone);
  });

  // Papelitos cayendo (GPU).
  const confettiCount = 420;
  const cGeo = new THREE.InstancedBufferGeometry();
  cGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  cGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(confettiCount * 4);
  const cols = new Float32Array(confettiCount * 3);
  const palette = theme.confetti.map((c) => new THREE.Color(c));
  for (let i = 0; i < confettiCount; i++) {
    seeds.set([(Math.random() - 0.5) * 34, (Math.random() - 0.5) * 42, Math.random(), Math.random()], i * 4);
    const c = palette[i % palette.length];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  cGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  cGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(cols, 3));
  cGeo.instanceCount = confettiCount;
  track(cGeo);
  const confetti = new THREE.Mesh(
    cGeo,
    track(
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uTime: uniforms.uTime, uRate: { value: 1 } },
        vertexShader: `attribute vec4 aSeed; attribute vec3 aColor; uniform float uTime; varying vec3 vC; varying float vS;
          mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c);}
          mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c);}
          void main(){
            float t = uTime * (0.08 + aSeed.w * 0.05) + aSeed.z;
            float y = 14.0 - fract(t) * 15.0;
            vec3 base = vec3(aSeed.x + sin(t * 9.0 + aSeed.z * 20.0) * 0.8, y, aSeed.y + cos(t * 7.0 + aSeed.w * 20.0) * 0.8);
            vec3 p = rotY(uTime * (1.0 + aSeed.w * 3.0) + aSeed.z * 30.0) * rotX(uTime * (2.0 + aSeed.z * 4.0)) * (position * vec3(0.11, 0.07, 1.0));
            vC = aColor; vS = 0.75 + 0.25 * sin(uTime * 6.0 + aSeed.z * 40.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(base + p, 1.0);
          }`,
        fragmentShader: `varying vec3 vC; varying float vS; void main(){ gl_FragColor = vec4(vC * vS, 1.0);
          #include <colorspace_fragment>
          }`,
      }),
    ),
  );
  confetti.frustumCulled = false;
  group.add(confetti);

  // Puntos desde donde un hincha puede tirar algo (primera fila).
  const throwSpots = [];
  for (let i = 0; i < 24; i++) {
    const side = sides[i % 4];
    const along = (Math.random() - 0.5) * (side.axis === 'x' ? bz * 1.5 : bx * 1.5);
    const across = side.sign * ((side.axis === 'x' ? bx : bz) + 0.4 + ROW_D * 0.5);
    throwSpots.push(
      side.axis === 'x' ? new THREE.Vector3(across, 0.75, along) : new THREE.Vector3(along, 0.75, across),
    );
  }

  return {
    group,
    uniforms,
    boardTex,
    throwSpots,
    bounds: { bx, bz, outerX, outerZ },
    update(t) {
      uniforms.uTime.value = t;
      if (panoMat.map && panoMat.opacity < 1) panoMat.opacity = Math.min(1, panoMat.opacity + 0.04);
      boardTex.offset.x = (t * 0.05) % 1;
      uniforms.uHype.value = Math.max(0, uniforms.uHype.value - 0.012);
      flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 3 + i) * 0.5));
    },
    hype(v = 1) {
      uniforms.uHype.value = Math.min(1.6, uniforms.uHype.value + v);
    },
    dispose() {
      disposables.forEach((d) => d.dispose && d.dispose());
      bodies.dispose();
      heads.dispose();
    },
    towers,
  };
}
