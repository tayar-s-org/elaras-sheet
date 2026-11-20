// Vocabulário de blocos que a tela do chat sabe desenhar (texto, fatos, citação, lista) e utilidades para montá-los.
import { leadSentences } from './text.js';
import { printedPage } from './knowledge.js';

export const bold = text => `**${text}**`;
export const src = (page, label) => ({ page, printed: printedPage(page), label });
export const text = value => ({ type: 'text', text: value });
export const facts = rows => ({ type: 'facts', rows: rows.filter(r => r[1]) });
export const quote = (body, { label = '', full = '' } = {}) => ({ type: 'quote', text: body, label, full: full && full !== body ? full : '' });
export const list = (items, title = '') => ({ type: 'list', title, items });
export const chip = (label, question) => ({ label, question });
export const stripBullet = p => p.replace(/^•\s*/, '');
export const DICE = /\d+d\d+(?:\s*[+-]\s*\d+)?/gi;

export function lead(paras, limit = 520) {
  const parts = [];
  let size = 0;
  for (const p of paras.map(stripBullet)) {
    if (size && size + p.length > limit) break;
    parts.push(p);
    size += p.length;
    if (size >= limit) break;
  }
  const joined = parts.join('\n\n');
  return joined.length > limit * 1.5 ? leadSentences(joined, limit) : joined;
}
export const fullText = paras => paras.map(stripBullet).join('\n\n');
