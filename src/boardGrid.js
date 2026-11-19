const limit = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const phase = (n, size) => ((n % size) + size) % size;

export function boardGrid(raw = {}) {
  const size = limit(raw?.size, 20, 400, 70);
  const visible = raw?.visible !== false;
  return {
    size, visible,
    x: phase(limit(raw?.x, -12000, 12000, 0), size),
    y: phase(limit(raw?.y, -12000, 12000, 0), size),
    opacity: limit(raw?.opacity, 0.05, 1, 0.22),
    snap: typeof raw?.snap === 'boolean' ? raw.snap : visible,
  };
}

export function snapToGrid(value, size, offset = 0) {
  return offset + (Math.round((value - offset) / size - 0.5) + 0.5) * size;
}

export function snapInsideGrid(value, size, offset, half, extent) {
  if (extent <= half * 2) return extent / 2;
  const first = offset + (Math.ceil((half-offset)/size-0.5)+0.5)*size;
  const last = offset + (Math.floor((extent-half-offset)/size-0.5)+0.5)*size;
  if (first > last) return Math.min(extent-half,Math.max(half,value));
  return Math.min(last,Math.max(first,snapToGrid(value,size,offset)));
}

export function gridLines(extent, size, offset = 0) {
  const start = phase(offset, size);
  return Array.from({ length: Math.max(0, Math.floor((extent - start) / size) + 1) }, (_, i) => start + i * size);
}

export function fitCalibration(a, b, columns, rows) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) return null;
  const sx = Math.abs(b.x - a.x) / columns;
  const sy = Math.abs(b.y - a.y) / rows;
  const size = (sx + sy) / 2;
  if (!(size >= 20 && size <= 400) || !sx || !sy) return null;
  return { size, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), uneven: Math.abs(sx - sy) / size > 0.06 };
}

// Procura picos recorrentes de contraste distribuídos pelo eixo inteiro, evitando confundir textura ou uma borda isolada com grade.
function period(signal, min, max) {
  const n = signal.length;
  const average = signal.reduce((a,b) => a+b, 0) / n;
  const deviation = Math.sqrt(signal.reduce((sum,v) => sum + (v-average)**2, 0) / n);
  if (deviation < 2) return null;
  let best = null;
  for (let step = Math.max(4, Math.ceil(min)); step <= Math.min(Math.floor(max), n / 3); step++) {
    let product = 0, left = 0, right = 0;
    for (let i=0; i<n-step; i++) {
      const a=signal[i]-average, b=signal[i+step]-average;
      product += a*b; left += a*a; right += b*b;
    }
    const score = product / Math.sqrt(left*right);
    if (score >= 0.42 && (!best || score > best.score + 0.08)) best = { step, score };
  }
  if (!best) return null;
  const {step} = best;
  let chosen = null;
  for (let offset=0; offset<step; offset++) {
    let sum=0, count=0, hits=0;
    for (let i=offset; i<n; i+=step) {
      sum += signal[i]; count++;
      if (signal[i] > average + deviation * 0.65) hits++;
    }
    if (count >= 3 && hits/count >= 0.7 && (!chosen || sum/count > chosen.score)) chosen={ offset, score: sum/count };
  }
  return chosen && { size: step, offset: chosen.offset };
}

export function detectGrid({data, width, height}, boardWidth, boardHeight) {
  const x = new Float64Array(width), y = new Float64Array(height);
  const gray = i => data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
  for (let row=0; row<height; row++) {
    for (let col=0; col<width; col++) {
      const i=(row*width+col)*4;
      const value=gray(i);
      if (col) x[col]+=Math.abs(value-gray(i-4))/height;
      if (row) y[row]+=Math.abs(value-gray(i-width*4))/width;
    }
  }
  const dx=boardWidth/width, dy=boardHeight/height;
  const a=period(x,20/dx,400/dx), b=period(y,20/dy,400/dy);
  if (!a || !b) return null;
  const size=(a.size*dx+b.size*dy)/2;
  if (Math.abs(a.size*dx-b.size*dy)>size*0.06) return null;
  return { size, x:a.offset*dx, y:b.offset*dy };
}
