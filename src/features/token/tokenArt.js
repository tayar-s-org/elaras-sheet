// Desenho do token em canvas: retrato (com zoom/posição/rotação), forma, fundo e moldura.
// Usado tanto na pré-visualização quanto na exportação final (PNG com transparência).

export const SHAPES = [
  { id: 'circle', label: 'Círculo' },
  { id: 'rounded', label: 'Arredondado' },
  { id: 'hex', label: 'Hexágono' },
  { id: 'shield', label: 'Escudo' },
];

export const FRAMES = [
  { id: 'gold', label: 'Ouro', colors: ['#fff1a8', '#d9a21b', '#7a520b'] },
  { id: 'silver', label: 'Prata', colors: ['#ffffff', '#b8bcc8', '#5e6270'] },
  { id: 'bronze', label: 'Bronze', colors: ['#f0c9a0', '#b36a32', '#5a2f12'] },
  { id: 'arcane', label: 'Arcano', colors: ['#d6c8ff', '#7a4dff', '#2b1475'] },
  { id: 'blood', label: 'Sangue', colors: ['#ffb4a8', '#b3382c', '#4d0e08'] },
  { id: 'forest', label: 'Floresta', colors: ['#bff0cf', '#2e9e5b', '#0f4527'] },
  { id: 'ink', label: 'Tinta', colors: ['#6a6a78', '#2a2a33', '#000000'] },
  { id: 'none', label: 'Sem moldura', colors: null },
];

// Moldura em imagem (criaturas): PNG quadrado com transparência; o retrato fica no buraco central.
export const FRAME_IMAGE_HOLE = 0.3; // raio do buraco da moldura, em fração do lado do token
export const loadFrameImage = url => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Não foi possível carregar a moldura.'));
  img.src = url;
});

export const defaultDesign = () => ({
  shape: 'circle',
  frame: 'gold',
  frameWidth: 7, // % do raio ocupado pela moldura
  double: false,
  bg: '#2a2a35',
  zoom: 1,
  x: 0, // deslocamento do retrato em fração do tamanho do token
  y: 0,
  rotate: 0,
  flip: false,
  shine: true,
  initials: '',
});

// Acrescenta a forma (centro cx,cy; "raio" r) ao caminho corrente, sem chamar beginPath.
function addShape(ctx, shape, cx, cy, r) {
  if (shape === 'circle') {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.36);
  } else if (shape === 'hex') {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else { // shield
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy - r);
    ctx.lineTo(cx + r, cy + r * 0.1);
    ctx.quadraticCurveTo(cx + r, cy + r * 0.75, cx, cy + r);
    ctx.quadraticCurveTo(cx - r, cy + r * 0.75, cx - r, cy + r * 0.1);
    ctx.closePath();
  }
}
function shapePath(ctx, shape, cx, cy, r) {
  ctx.beginPath();
  addShape(ctx, shape, cx, cy, r);
}

function frameStyle(ctx, frame, size, color) {
  if (frame === 'custom') return color;
  const f = FRAMES.find(x => x.id === frame) || FRAMES[0];
  if (!f.colors) return null;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, f.colors[0]);
  g.addColorStop(0.5, f.colors[1]);
  g.addColorStop(1, f.colors[2]);
  return g;
}

// image: HTMLImageElement | ImageBitmap | null. Desenha num canvas quadrado de lado `size`.
export function drawToken(canvas, size, design, image) {
  const d = { ...defaultDesign(), ...design };
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const R = c - 2; // folga para o antisserrilhado da borda
  const imgFrame = d.frameImage || null;
  const shape = imgFrame ? 'circle' : d.shape;
  const fw = imgFrame || d.frame === 'none' ? 0 : Math.max(0.02, d.frameWidth / 100) * R;
  const inner = imgFrame ? size * FRAME_IMAGE_HOLE : R - fw;

  // Fundo + retrato recortados na forma interna.
  ctx.save();
  if (!d.legacyBase) {
    shapePath(ctx, shape, c, c, inner);
    ctx.clip();
    ctx.fillStyle = d.bg;
    ctx.fillRect(0, 0, size, size);
  }
  if (image) {
    ctx.save();
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const diameter = d.legacyBase ? size : inner * 2;
    const cover = Math.max(diameter / iw, diameter / ih) * d.zoom;
    ctx.translate(c + d.x * size, c + d.y * size);
    ctx.rotate((d.rotate * Math.PI) / 180);
    ctx.scale(d.flip ? -1 : 1, 1);
    ctx.drawImage(image, (-iw * cover) / 2, (-ih * cover) / 2, iw * cover, ih * cover);
    ctx.restore();
  } else if (d.initials) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${inner * 0.95}px "Alegreya SC", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.initials.slice(0, 2).toUpperCase(), c, c + inner * 0.06);
  }
  if (d.shine && !d.legacyBase) {
    const g = ctx.createRadialGradient(c - inner * 0.35, c - inner * 0.45, inner * 0.1, c, c, inner * 1.1);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();

  if (d.legacyBase) return;

  // Moldura em imagem: desenhada por cima do retrato, ocupando o token inteiro.
  if (imgFrame) {
    ctx.drawImage(imgFrame, 0, 0, size, size);
    return;
  }

  // Moldura: anel entre a forma externa e a interna (regra even-odd).
  const stroke = frameStyle(ctx, d.frame, size, d.frameColor);
  ctx.save();
  if (stroke) {
    ctx.fillStyle = stroke;
    ctx.beginPath();
    addShape(ctx, d.shape, c, c, R);
    addShape(ctx, d.shape, c, c, inner);
    ctx.fill('evenodd');
  }
  // Fio escuro nas bordas para destacar sobre qualquer mapa.
  ctx.lineWidth = Math.max(1.5, size * 0.006);
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  if (stroke) { shapePath(ctx, d.shape, c, c, R); ctx.stroke(); }
  shapePath(ctx, d.shape, c, c, inner);
  ctx.stroke();
  if (stroke && d.double && fw > 6) {
    shapePath(ctx, d.shape, c, c, R - fw * 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(1.5, fw * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

export const canvasToBlob = canvas => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'));
