// Transforma o resultado gravado pelo servidor na lista de dados 3D a animar, e fornece um sorteio
// deterministico (semente = id da rolagem) para que todos os jogadores vejam o mesmo movimento.

export const MAX_ANIMATED = 12;

function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function seededRandom(seed) {
  let a = fnv1a(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// d100 usa dois d10: dezenas (00..90) e unidades (0..9); 00 + 0 vale 100.
export function splitD100(value) {
  const v = value % 100;
  const tens = Math.floor(v / 10);
  const units = v % 10;
  return { tens: tens === 0 ? 10 : tens, units: units === 0 ? 10 : units };
}

// Cada item: { sides (4..20), value (1..sides), kind, role }. Retorna null se houver dados demais para animar.
export function planDice(roll) {
  const r = roll?.result;
  if (!r) return null;
  const raw = [];
  if (r.kind === 'trait') {
    r.traitRolls.forEach(value => raw.push({ sides: r.die, value, role: 'trait' }));
    if (r.wild && r.wildRolls) r.wildRolls.forEach(value => raw.push({ sides: 6, value, role: 'wild' }));
  } else if (r.kind === 'dice') {
    r.attempts.forEach((attempt, index) => attempt.groups.forEach(g => g.dice.forEach(chain => chain.forEach(value => {
      raw.push({ sides: g.sides, value, role: index === r.chosen ? 'normal' : 'discarded' });
    }))));
  } else return null;
  const dice = [];
  for (const d of raw) {
    if (d.sides === 100) {
      const { tens, units } = splitD100(d.value);
      dice.push({ ...d, sides: 10, value: tens, kind: 'tens' }, { ...d, sides: 10, value: units, kind: 'units' });
    } else dice.push({ ...d, kind: `d${d.sides}` });
  }
  return dice.length && dice.length <= MAX_ANIMATED ? dice : null;
}

// Texto que fica escrito na face.
export function faceLabel(kind, value) {
  if (kind === 'tens') return value % 10 === 0 ? '00' : String((value % 10) * 10);
  if (kind === 'units') return String(value % 10);
  return String(value);
}
