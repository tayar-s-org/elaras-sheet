// Malha 3D de um dado com os numeros desenhados em um atlas de textura (so no navegador).
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, Vector3 } from 'three';
import { faceLabel } from './plan.js';

const CELL = 200;
const COLS = 5;

export const DIE_COLORS = {
  d4: '#c0392b', d6: '#5a3fcf', d8: '#1f7a4d', d10: '#2f7fd0', d12: '#a86a12', d20: '#b3267a',
  tens: '#2f7fd0', units: '#1b5e99', trait: '#5a3fcf', wild: '#d9a21b',
};
// Escala visual para que todos pareçam de tamanho parecido na mesa.
const SCALE = { 4: 1.2, 6: 0.82, 8: 0.95, 10: 1.0, 12: 0.95, 20: 1.05 };

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };

function distanceToEdges(points, cx, cy) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / (dx * dx + dy * dy)));
    min = Math.min(min, Math.hypot(cx - (a.x + t * dx), cy - (a.y + t * dy)));
  }
  return min;
}

function drawNumber(ctx, text, x, y, size, color, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `700 ${size}px "Alegreya Sans", "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, size * 0.04);
  // 6 e 9 (e 60/90) ganham um traco embaixo para nao serem confundidos.
  if (['6', '9', '60', '90'].includes(text)) ctx.fillRect(-size * 0.28 * text.length * 0.7, size * 0.46, size * 0.56 * text.length * 0.7, Math.max(3, size * 0.06));
  ctx.restore();
}

export function makeDieMesh(def, { kind, color, opacity = 1, value }) {
  const N = def.faces.length;
  const rows = Math.ceil(N / COLS);
  const W = COLS * CELL;
  const H = rows * CELL;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const textColor = isLight(color) ? '#1e1c29' : '#ffffff';
  const positions = [];
  const normals = [];
  const uvs = [];

  def.faces.forEach((face, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = col * CELL + CELL / 2;
    const cy = row * CELL + CELL / 2;
    const u = face.verts[0].clone().sub(face.center).normalize();
    const w = new Vector3().crossVectors(face.normal, u);
    const flat = face.verts.map(p => { const d = p.clone().sub(face.center); return { x: d.dot(u), y: d.dot(w) }; });
    const s = (CELL / 2 * 0.94) / Math.max(...flat.map(p => Math.hypot(p.x, p.y)));
    const px = flat.map(p => ({ x: cx + p.x * s, y: cy - p.y * s }));

    ctx.save();
    ctx.beginPath();
    ctx.rect(col * CELL, row * CELL, CELL, CELL);
    ctx.clip();
    ctx.fillStyle = shade(color, -0.12);
    ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    const gradient = ctx.createRadialGradient(cx, cy, 5, cx, cy, CELL * 0.6);
    gradient.addColorStop(0, shade(color, 0.07));
    gradient.addColorStop(1, shade(color, -0.04));
    ctx.beginPath();
    px.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = shade(color, -0.3);
    ctx.stroke();

    if (face.labels) {
      // d4: numero de cada vertice, com a ponta do algarismo apontada para o vertice.
      face.verts.forEach((v, k) => {
        const p = px[k];
        const nx = cx + (p.x - cx) * 0.6;
        const ny = cy + (p.y - cy) * 0.6;
        drawNumber(ctx, String(face.labels[k]), nx, ny, CELL * 0.2, textColor, Math.atan2(p.y - cy, p.x - cx) + Math.PI / 2);
      });
    } else {
      const label = faceLabel(kind, face.value);
      const centerX = px.reduce((a, p) => a + p.x, 0) / px.length;
      const centerY = px.reduce((a, p) => a + p.y, 0) / px.length;
      const room = distanceToEdges(px, centerX, centerY);
      const size = Math.min(CELL * 0.5, room * (label.length > 1 ? 1.15 : 1.5));
      drawNumber(ctx, label, centerX, centerY, size, textColor);
    }
    ctx.restore();

    for (let k = 1; k < face.verts.length - 1; k++) {
      for (const idx of [0, k, k + 1]) {
        const p = face.verts[idx];
        positions.push(p.x, p.y, p.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        uvs.push(px[idx].x / W, 1 - px[idx].y / H);
      }
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.38, metalness: 0.12, transparent: opacity < 1, opacity });
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  const scale = SCALE[def.sides] || 1;
  mesh.scale.setScalar(scale);
  mesh.userData = { scale, value, dispose: () => { geometry.dispose(); material.dispose(); texture.dispose(); } };
  return mesh;
}
