import * as THREE from 'three';

// Partículas calculadas íntegramente en el shader: al emitir solo se escriben los datos iniciales.
export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.p0 = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.meta = new Float32Array(max * 4); // nacimiento, vida, tamaño, gravedad
    this.col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.meta[i * 4] = -100;
    g.setAttribute('position', new THREE.BufferAttribute(this.p0, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(this.vel, 3));
    g.setAttribute('aMeta', new THREE.BufferAttribute(this.meta, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
    this.geo = g;
    this.uniforms = { uTime: { value: 0 }, uScale: { value: 300 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; uniform float uScale; attribute vec3 aVel; attribute vec4 aMeta; attribute vec3 aColor;
        varying vec3 vC; varying float vA;
        void main(){
          float age = uTime - aMeta.x;
          float life = aMeta.y;
          float k = clamp(age / life, 0.0, 1.0);
          float alive = step(0.0, age) * step(age, life);
          vec3 p = position + aVel * age * (1.0 - 0.35 * k) + vec3(0.0, -aMeta.w * age * age * 0.5, 0.0);
          p.y = max(p.y, 0.03);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(alive * aMeta.z * uScale * (1.0 - k * 0.6) / -mv.z, 90.0);
          vC = aColor; vA = alive * (1.0 - k * k) * smoothstep(1.2, 3.5, -mv.z);
        }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vC * (0.6 + core * 1.4), core * vA); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(pos, { count = 30, colors = ['#ffffff'], speed = 3, up = 2, life = 0.9, size = 0.22, gravity = 6, spread = 1 } = {}) {
    const t = this.uniforms.uTime.value;
    const cs = colors.map((c) => new THREE.Color(c));
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      this.p0.set([pos.x + (Math.random() - 0.5) * 0.2 * spread, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * 0.2 * spread], i * 3);
      this.vel.set([Math.cos(a) * v * spread, up * (0.4 + Math.random()), Math.sin(a) * v * spread], i * 3);
      this.meta.set([t, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), gravity], i * 4);
      const c = cs[n % cs.length];
      this.col.set([c.r, c.g, c.b], i * 3);
    }
    for (const k of ['position', 'aVel', 'aMeta', 'aColor']) this.geo.attributes[k].needsUpdate = true;
  }

  update(t, pixelScale) {
    this.uniforms.uTime.value = t;
    this.uniforms.uScale.value = pixelScale;
  }
}

// Ondas de impacto: anillos con shader que se expanden y se desvanecen.
export class Shockwaves {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.geo = new THREE.PlaneGeometry(1, 1);
  }

  spawn(pos, { color = '#ffffff', size = 3, life = 0.6, y = 0.04 } = {}) {
    let w = this.pool.find((p) => !p.active);
    if (!w) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uK: { value: 0 }, uColor: { value: new THREE.Color() } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
        fragmentShader: `uniform float uK; uniform vec3 uColor; varying vec2 vUv;
          void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(0.12, 0.0, abs(r - uK)) ;
          float fill = smoothstep(uK, 0.0, r) * 0.15; float a = (ring + fill) * (1.0 - uK);
          gl_FragColor = vec4(uColor * 1.6, a); }`,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 4;
      w = { mesh, mat, active: false };
      this.pool.push(w);
      this.scene.add(mesh);
    }
    w.active = true;
    w.t = 0;
    w.life = life;
    w.mesh.visible = true;
    w.mesh.position.set(pos.x, y, pos.z);
    w.mesh.scale.setScalar(size);
    w.mat.uniforms.uColor.value.set(color);
  }

  update(dt) {
    for (const w of this.pool) {
      if (!w.active) continue;
      w.t += dt;
      const k = Math.min(1, w.t / w.life);
      w.mat.uniforms.uK.value = 1 - Math.pow(1 - k, 2.2);
      if (k >= 1) {
        w.active = false;
        w.mesh.visible = false;
      }
    }
  }

  clear() {
    this.pool.forEach((w) => ((w.active = false), (w.mesh.visible = false)));
  }
}

// Pase final: viñeta, aberración cromática y desaturación para la muerte, destello y tone mapping.
export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    const isWebGL2 = renderer.capabilities.isWebGL2 !== false;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: isWebGL2 ? 4 : 0,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.uniforms = {
      tScene: { value: this.target.texture },
      uDeath: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color('#ffffff') },
      uAspect: { value: 1 },
      uTime: { value: 0 },
    };
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D tScene; uniform float uDeath; uniform float uFlash; uniform vec3 uFlashColor; uniform float uAspect; uniform float uTime;
        varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5;
          float d = length(c * vec2(uAspect, 1.0));
          vec2 off = c * (0.0012 + uDeath * 0.02);
          vec3 col;
          col.r = texture2D(tScene, vUv + off).r;
          col.g = texture2D(tScene, vUv).g;
          col.b = texture2D(tScene, vUv - off).b;
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(lum) * vec3(1.05, 0.95, 0.9), uDeath * 0.6);
          col *= 1.0 - smoothstep(0.45, 1.25, d) * (0.45 + uDeath * 0.4);
          col += uFlashColor * uFlash * (1.0 - d * 0.6);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mat.toneMapped = true;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  setSize(w, h, dpr) {
    this.target.setSize(Math.floor(w * dpr), Math.floor(h * dpr));
    this.uniforms.uAspect.value = w / h;
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
