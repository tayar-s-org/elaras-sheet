import { parseHp } from '../../creature.js';
import { cleanCreatureSheet } from '../../tokenArtwork.js';

// Nome do PNG baixado: só letras e números, separados por hífen.
export const tokenFileName = label => `token-${(label || 'personagem').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'personagem'}.png`;

// O que o salvamento recebe além da imagem renderizada: a arte (para reeditar) e, em criatura, os dados dela.
// `usingFallback`: a imagem-fonte falhou e vale a imagem antiga, então a fonte não é regravada.
export function buildTokenPayload({ creature, artwork, usingFallback, form }) {
  const payload = { artwork: { ...artwork, sourcePath: usingFallback ? '' : artwork.sourcePath } };
  if (!creature) return payload;
  return { ...payload, name: form.name.trim(), hp: parseHp(form.hp), hideHp: form.hideHp, hideName: form.hideName, size: form.size, sheet: cleanCreatureSheet(form.sheet) };
}
