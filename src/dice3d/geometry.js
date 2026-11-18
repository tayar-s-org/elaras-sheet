// Poliedros dos dados (raio circunscrito = 1) e a orientacao que deixa cada valor virado para cima.
// Matematica pura: roda no Node, entao os testes conferem que o valor sorteado e o valor visivel coincidem.
import { Vector3, Quaternion, BoxGeometry, TetrahedronGeometry, OctahedronGeometry, DodecahedronGeometry, IcosahedronGeometry } from 'three';

export const UP = new Vector3(0, 1, 0);
export const DIE_SIDES = [4, 6, 8, 10, 12, 20];

const key = v => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;

// Agrupa os triangulos coplanares da geometria do three em faces poligonais (pentagonos do d12, quadrados do d6...).
function groupsFromGeometry(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.getAttribute('position');
  const groups = [];
  for (let i = 0; i < pos.count; i += 3) {
    const tri = [0, 1, 2].map(k => new Vector3().fromBufferAttribute(pos, i + k));
    const n = new Vector3().crossVectors(tri[1].clone().sub(tri[0]), tri[2].clone().sub(tri[0])).normalize();
    let group = groups.find(x => x.n.dot(n) > 0.9999);
    if (!group) { group = { n, pts: new Map() }; groups.push(group); }
    tri.forEach(v => group.pts.set(key(v), v));
  }
  return groups.map(x => [...x.pts.values()]);
}

// Trapezoedro pentagonal (d10): 10 faces em pipa, planas pela escolha da altura dos polos.
function d10Groups() {
  const c = Math.cos(Math.PI / 5);
  const z0 = 0.12;
  const h = (z0 * (1 + c)) / (1 - c);
  const ring = Array.from({ length: 10 }, (_, i) => new Vector3(Math.cos((i * Math.PI) / 5), i % 2 ? -z0 : z0, Math.sin((i * Math.PI) / 5)));
  const R = i => ring[((i % 10) + 10) % 10];
  const top = new Vector3(0, h, 0);
  const bottom = new Vector3(0, -h, 0);
  const groups = [];
  for (let j = 0; j < 5; j++) groups.push([top, R(2 * j), R(2 * j + 1), R(2 * j + 2)].map(p => p.clone()));
  for (let j = 0; j < 5; j++) groups.push([bottom, R(2 * j + 1), R(2 * j + 2), R(2 * j + 3)].map(p => p.clone()));
  return groups;
}

function makeFace(points) {
  const c = points.reduce((s, p) => s.add(p), new Vector3()).multiplyScalar(1 / points.length);
  const n = new Vector3().crossVectors(points[1].clone().sub(points[0]), points[2].clone().sub(points[0])).normalize();
  if (n.dot(c) < 0) n.negate();
  const u = points[0].clone().sub(c).normalize();
  const w = new Vector3().crossVectors(n, u);
  const verts = points
    .map(p => { const d = p.clone().sub(c); return { p, a: Math.atan2(d.dot(w), d.dot(u)) }; })
    .sort((a, b) => a.a - b.a)
    .map(x => x.p);
  return { verts, center: c, normal: n, dist: c.dot(n), value: 0, labels: null };
}

function groupsFor(sides) {
  switch (sides) {
    case 4: return groupsFromGeometry(new TetrahedronGeometry(1));
    case 6: return groupsFromGeometry(new BoxGeometry(1, 1, 1));
    case 8: return groupsFromGeometry(new OctahedronGeometry(1));
    case 10: return d10Groups();
    case 12: return groupsFromGeometry(new DodecahedronGeometry(1));
    case 20: return groupsFromGeometry(new IcosahedronGeometry(1));
    default: throw new Error(`Dado d${sides} não tem modelo 3D.`);
  }
}

// Faces opostas somam (N+1): 1..N/2 de um lado, o complemento do outro.
function numberOpposites(faces) {
  const N = faces.length;
  let next = 1;
  faces.forEach((face, i) => {
    if (face.value) return;
    let opp = -1;
    let best = 2;
    faces.forEach((other, j) => { if (j !== i && !other.value) { const d = other.normal.dot(face.normal); if (d < best) { best = d; opp = j; } } });
    face.value = next;
    if (opp >= 0 && best < -0.99) faces[opp].value = N + 1 - next;
    next += 1;
  });
}

const cache = new Map();
export function dieDef(sides) {
  if (cache.has(sides)) return cache.get(sides);
  const groups = groupsFor(sides);
  const max = Math.max(...groups.flat().map(p => p.length()));
  groups.forEach(g => g.forEach(p => p.multiplyScalar(1 / max)));
  const faces = groups.map(makeFace);
  const def = { sides, faces, restY: Math.min(...faces.map(f => f.dist)), vertices: null };
  if (sides === 4) {
    // No d4 vale o numero do vertice de cima: cada face mostra os numeros dos seus tres vertices.
    const vertices = new Map();
    faces.forEach(f => f.verts.forEach(v => { if (!vertices.has(key(v))) vertices.set(key(v), { n: vertices.size + 1, dir: v.clone().normalize() }); }));
    faces.forEach(f => { f.labels = f.verts.map(v => vertices.get(key(v)).n); });
    def.vertices = [...vertices.values()];
  } else numberOpposites(faces);
  cache.set(sides, def);
  return def;
}

// Normal (no referencial do dado) que precisa ficar apontada para cima para mostrar `value`.
export function upNormal(def, value) {
  if (def.sides === 4) {
    const v = def.vertices.find(x => x.n === value);
    if (!v) throw new Error(`Valor ${value} inválido para d4.`);
    return v.dir;
  }
  const face = def.faces.find(f => f.value === value);
  if (!face) throw new Error(`Valor ${value} inválido para d${def.sides}.`);
  return face.normal;
}

export function alignQuaternion(def, value) {
  return new Quaternion().setFromUnitVectors(upNormal(def, value), UP);
}
