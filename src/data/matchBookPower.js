import { BOOK_POWERS } from './bookPowers.js';
import { normalizePowerName } from '../powerDamage.js';

// Acha o poder do livro de uma magia da ficha mesmo quando o nome foi mudado um pouco:
//  1) nome igual ao do livro (sem acento, caixa ou texto entre parênteses): "Deflexão (RANGED)" → Deflexão;
//  2) nomes do livro com barra valem por partes: "Detectar arcano" → "Detectar/ocultar arcano";
//  3) nome parecido ("Raios Múltiplos") só vale se o custo de mana for o mesmo do livro, para não confundir uma magia
//     inventada ("Cura das trevas") com um poder do livro.
const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
const clean = name => normalizePowerName(name).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stem = t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const tokens = text => text.split(/[ /]+/).filter(t => t && !STOP.has(t)).map(stem);
const costKey = c => String(c || '').toLowerCase().replace(/\s+/g, '');

// "detectar/ocultar arcano" → ["detectar arcano", "ocultar arcano"]
function expand(key) {
  return key.split(' ').reduce((acc, word) => acc.flatMap(prefix => word.split('/').map(part => (prefix ? `${prefix} ${part}` : part))), ['']);
}
const ALIASES = Object.keys(BOOK_POWERS).flatMap(key => [...new Set([key, ...expand(key)])].map(alias => ({ alias, key, tokens: tokens(alias) })));
const EXACT = new Map(ALIASES.map(a => [a.alias, a.key]));

export function findBookPowerKey(name, cost = '') {
  const c = clean(name);
  if (!c) return null;
  if (EXACT.has(c)) return EXACT.get(c);
  if (!String(cost || '').trim()) return null;
  const mine = new Set(tokens(c));
  let best = null;
  for (const a of ALIASES) {
    if (!a.tokens.length || !a.tokens.every(t => mine.has(t))) continue;
    if (costKey(BOOK_POWERS[a.key].cost) !== costKey(cost)) continue;
    if (!best || a.tokens.length > best.tokens.length) best = a;
  }
  return best ? best.key : null;
}

export const bookFacts = (name, cost) => { const k = findBookPowerKey(name, cost); return k ? BOOK_POWERS[k] : null; };
