// Criaturas do mestre no tabuleiro: token com vida. Ficam na coluna `meta` do token: { creature: true, hp, maxHp }.
// Moldura e cor são únicas para todas as criaturas (o mestre só escolhe nome, foto e vida).

export const CREATURE_FRAME = 'blood';
export const CREATURE_COLOR = '#b3382c';
export const CREATURE_BG = '#2a1414';
export const MAX_HP = 9999;

const clampInt = (value, min, max, fallback) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Vida digitada: inteiro de 1 a 9999, ou null se inválida.
export const parseHp = value => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_HP ? n : null;
};

export const newCreatureMeta = hp => ({ creature: true, hp, maxHp: hp });

// { hp, maxHp, ratio } de um token de criatura, ou null se não for criatura.
export function creatureOf(token) {
  const meta = token?.meta;
  if (!meta || meta.creature !== true) return null;
  const maxHp = clampInt(meta.maxHp, 1, MAX_HP, 1);
  const hp = clampInt(meta.hp, 0, maxHp, maxHp);
  return { hp, maxHp, ratio: hp / maxHp };
}

// Novo meta com a vida atual alterada (limitada de 0 até a vida máxima).
export function metaWithHp(token, hp) {
  const c = creatureOf(token) || { maxHp: MAX_HP };
  return { ...(token?.meta || {}), creature: true, maxHp: c.maxHp, hp: clampInt(hp, 0, c.maxHp, c.maxHp) };
}

// Novo meta com outra vida máxima; a vida atual nunca passa da nova máxima.
export function metaWithMaxHp(token, maxHp) {
  const c = creatureOf(token);
  const max = clampInt(maxHp, 1, MAX_HP, c?.maxHp || 1);
  return { ...(token?.meta || {}), creature: true, maxHp: max, hp: Math.min(c ? c.hp : max, max) };
}

export const hpTone = ratio => (ratio <= 0 ? 'down' : ratio <= 0.25 ? 'bad' : ratio <= 0.5 ? 'warn' : 'ok');

// Texto para quem não é o mestre (os números ficam só com o mestre).
export const hpLabel = ratio => (ratio <= 0 ? 'Derrotada' : ratio <= 0.25 ? 'Quase derrotada' : ratio <= 0.5 ? 'Muito ferida' : ratio < 1 ? 'Ferida' : 'Ilesa');
