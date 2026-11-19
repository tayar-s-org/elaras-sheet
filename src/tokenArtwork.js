import { parseFormula } from './diceRoll.js';

export const CREATURE_SIZES = [[0.5, 'Pequeno'], [1, 'Médio'], [2, 'Grande'], [3, 'Enorme']];
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const bounded = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function tokenArtwork(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const design = raw.design || {};
  const color = (value, fallback) => HEX_COLOR.test(value) ? value : fallback;
  const sourcePath = text(raw.sourcePath, 100);
  const legacyPath = text(raw.legacyPath, 100);
  return {
    sourcePath: /^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(sourcePath) ? sourcePath : '',
    legacyPath: /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/.test(legacyPath) ? legacyPath : '',
    design: {
      shape: ['circle', 'rounded', 'hex', 'shield'].includes(design.shape) ? design.shape : 'circle',
      frame: ['gold', 'silver', 'bronze', 'arcane', 'blood', 'forest', 'ink', 'none', 'creature', 'custom'].includes(design.frame) ? design.frame : 'gold',
      frameColor: color(design.frameColor, '#d9a21b'), bg: color(design.bg, '#2a2a35'),
      frameWidth: bounded(design.frameWidth, 3, 16, 7),
      legacyBase: Boolean(design.legacyBase), double: Boolean(design.double), shine: Boolean(design.shine), flip: Boolean(design.flip),
      initials: text(design.initials, 2), zoom: bounded(design.zoom, 0.3, 4, 1),
      rotate: bounded(design.rotate, -180, 180, 0), x: bounded(design.x, -1, 1, 0), y: bounded(design.y, -1, 1, 0),
    },
  };
}

export function cleanCreatureSheet(sheet) {
  if (!sheet) return null;
  const roll = value => {
    const formula = text(value, 80);
    if (formula) parseFormula(formula);
    return formula;
  };
  const rows = list => Array.isArray(list) ? list.slice(0, 20) : [];
  const attributes = Object.fromEntries(Object.entries(sheet.attributes || {}).slice(0, 5)
    .map(([name, formula]) => [text(name, 30), roll(formula)]).filter(([, formula]) => formula));
  const skills = rows(sheet.skills).map(row => ({ name: text(row.name, 60), formula: roll(row.formula) })).filter(row => row.name || row.formula);
  const attacks = rows(sheet.attacks).map(row => ({ name: text(row.name, 60), attack: roll(row.attack), damage: roll(row.damage) })).filter(row => row.name || row.attack || row.damage);
  if ([...skills, ...attacks].some(row => !row.name)) throw new Error('Dê um nome a cada perícia ou ataque.');
  const parry = text(sheet.parry, 12), toughness = text(sheet.toughness, 12), notes = text(sheet.notes, 2000);
  if (!Object.keys(attributes).length && !skills.length && !attacks.length && !parry && !toughness && !notes) return null;
  return { attributes, skills, attacks, parry, toughness, notes };
}
