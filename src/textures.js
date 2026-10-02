import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// Cancha: damero de corte de césped alineado a la grilla + líneas reglamentarias escaladas.
export function pitchTexture({ w, h, margin, theme }) {
  const ppu = 64;
  const W = (w + margin * 2) * ppu;
  const H = (h + margin * 2) * ppu;
  const [c, g] = canvas(W, H);
  g.fillStyle = theme.grassB;
  g.fillRect(0, 0, W, H);
  // Pista de atletismo del Monumental / borde de cemento.
  if (theme.track) {
    g.fillStyle = theme.track;
    g.fillRect(0, 0, W, H);
    g.fillStyle = theme.grassB;
    const t = 1.2 * ppu;
    g.fillRect(t, t, W - 2 * t, H - 2 * t);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      const o = (k * t) / 4;
      g.strokeRect(o, o, W - 2 * o, H - 2 * o);
    }
  }
  const ox = margin * ppu;
  const oz = margin * ppu;
  for (let z = -1; z <= h; z++) {
    for (let x = -1; x <= w; x++) {
      const stripe = Math.floor((z + 100) / 2) % 2 === 0;
      const check = (x + z + 100) % 2 === 0;
      g.fillStyle = stripe ? (check ? theme.grassA : theme.grassA2) : check ? theme.grassB : theme.grassB2;
      g.fillRect(ox + x * ppu, oz + z * ppu, ppu, ppu);
    }
  }
  // Ruido de pasto.
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    d[i] += n * 0.6;
    d[i + 1] += n;
    d[i + 2] += n * 0.4;
  }
  g.putImageData(img, 0, 0);

  const L = (v) => v * ppu;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 6;
  g.lineJoin = 'round';
  const x0 = ox;
  const z0 = oz;
  const pw = L(w);
  const ph = L(h);
  g.strokeRect(x0, z0, pw, ph);
  g.beginPath();
  g.moveTo(x0, z0 + ph / 2);
  g.lineTo(x0 + pw, z0 + ph / 2);
  g.stroke();
  const s = w / 68; // metros a celdas
  g.beginPath();
  g.arc(x0 + pw / 2, z0 + ph / 2, L(9.15 * s), 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(x0 + pw / 2, z0 + ph / 2, 7, 0, Math.PI * 2);
  g.fill();
  for (const end of [0, 1]) {
    const dir = end ? -1 : 1;
    const zl = end ? z0 + ph : z0;
    const paW = L(40.3 * s);
    const paD = L(16.5 * s);
    const gaW = L(18.3 * s);
    const gaD = L(5.5 * s);
    g.strokeRect(x0 + pw / 2 - paW / 2, end ? zl - paD : zl, paW, paD);
    g.strokeRect(x0 + pw / 2 - gaW / 2, end ? zl - gaD : zl, gaW, gaD);
    const spot = zl + dir * L(11 * s);
    g.beginPath();
    g.arc(x0 + pw / 2, spot, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    const a0 = end ? Math.PI + 0.93 : 0.93;
    g.arc(x0 + pw / 2, spot, L(9.15 * s), a0, a0 + Math.PI - 1.86);
    g.stroke();
    for (const side of [0, 1]) {
      g.beginPath();
      const cx = side ? x0 + pw : x0;
      const start = (end ? (side ? Math.PI : 1.5 * Math.PI) : side ? 0.5 * Math.PI : 0) ;
      g.arc(cx, zl, L(1 * s) + 8, start, start + Math.PI / 2);
      g.stroke();
    }
  }
  return tex(c, { aniso: 8 });
}

// Escamas para el cuerpo de la víbora: azul, panza amarilla y franja de camiseta.
export function bocaSkinTexture() {
  const [c, g] = canvas(512, 256);
  // u = largo (x), v = alrededor (y). v 0.25 = lomo, 0.75 = panza.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0a3a8c');
  grad.addColorStop(0.25, '#1550b8');
  grad.addColorStop(0.5, '#0a3a8c');
  grad.addColorStop(0.62, '#f2b705');
  grad.addColorStop(0.75, '#ffd94a');
  grad.addColorStop(0.88, '#f2b705');
  grad.addColorStop(1, '#0a3a8c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // Franja amarilla de la camiseta.
  g.fillStyle = '#ffc928';
  g.fillRect(212, 0, 88, 256);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(216, 0, 10, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(292, 0, 8, 256);
  // Escamas superpuestas.
  const sx = 32;
  const sy = 22;
  for (let row = 0; row < 256 / sy + 1; row++) {
    for (let col = -1; col < 512 / sx + 1; col++) {
      const x = col * sx + (row % 2 ? sx / 2 : 0);
      const y = row * sy;
      const belly = y > 150 && y < 230;
      g.beginPath();
      g.arc(x, y, belly ? 15 : 17, 0, Math.PI);
      g.strokeStyle = belly ? 'rgba(150,90,0,0.35)' : 'rgba(0,10,50,0.45)';
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.arc(x, y + 2, 9, 0.2, Math.PI - 0.2);
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 2;
      g.stroke();
    }
  }
  return tex(c, { repeat: true });
}

// Tela de camiseta blanca con banda roja en diagonal (envuelve el cuerpo en hélice).
export function riverSkinTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f7f4ef';
  g.fillRect(0, 0, 256, 256);
  g.save();
  g.beginPath();
  for (const off of [-256, 0, 256]) {
    g.moveTo(off + 0, 256);
    g.lineTo(off + 70, 256);
    g.lineTo(off + 326, 0);
    g.lineTo(off + 256, 0);
    g.closePath();
  }
  g.fillStyle = '#e1061e';
  g.fill();
  g.restore();
  // Trama de tela.
  g.globalAlpha = 0.08;
  for (let i = 0; i < 256; i += 3) {
    g.fillStyle = i % 6 ? '#000' : '#fff';
    g.fillRect(0, i, 256, 1);
    g.fillRect(i, 0, 1, 256);
  }
  g.globalAlpha = 1;
  // Ribete negro fino de la banda.
  g.strokeStyle = 'rgba(40,0,0,0.25)';
  g.lineWidth = 3;
  for (const off of [-256, 0, 256]) {
    g.beginPath();
    g.moveTo(off, 256);
    g.lineTo(off + 256, 0);
    g.moveTo(off + 70, 256);
    g.lineTo(off + 326, 0);
    g.stroke();
  }
  return tex(c, { repeat: true });
}

// Carteles LED alrededor de la cancha.
export function boardTexture(lines, colors) {
  const [c, g] = canvas(2048, 128);
  const seg = 2048 / lines.length;
  lines.forEach((text, i) => {
    const [bg, fg] = colors[i % colors.length];
    g.fillStyle = bg;
    g.fillRect(i * seg, 0, seg, 128);
    g.fillStyle = fg;
    g.font = '900 78px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, i * seg + seg / 2, 68, seg - 30);
  });
  // Rejilla de LED.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 128);
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 2048, 1);
  const t = tex(c, { repeat: true });
  return t;
}

export function bannerTexture(text, bg, fg, stripe) {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  if (stripe) {
    g.fillStyle = stripe;
    g.fillRect(0, 96, 1024, 64);
  }
  g.fillStyle = fg;
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 10;
  g.font = 'italic 900 150px ui-rounded, "SF Pro Rounded", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText(text, 512, 136, 980);
  g.fillText(text, 512, 136, 980);
  return tex(c);
}

export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false });
}

export function shadowBlobTexture() {
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false });
}

export function jerseyTexture(mode) {
  const [c, g] = canvas(128, 128);
  if (mode === 'boca') {
    g.fillStyle = '#0b3d91';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffc928';
    g.fillRect(0, 50, 128, 30);
  } else {
    g.fillStyle = '#f7f4ef';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e1061e';
    g.beginPath();
    g.moveTo(0, 100);
    g.lineTo(0, 128);
    g.lineTo(30, 128);
    g.lineTo(128, 28);
    g.lineTo(128, 0);
    g.lineTo(100, 0);
    g.closePath();
    g.fill();
  }
  return tex(c);
}
