// Criaturas do mestre no tabuleiro: token com vida. Ficam na coluna `meta` do token: { creature: true, hp, maxHp }.
// Criatura com "vida oculta" ({ ..., hideHp: true }) tem vida normal para o mestre; os jogadores não veem barra nem números.
// (Criaturas antigas "sem vida" — { creature: true, noHp: true } — continuam sem barra nem controle até o mestre dar uma vida.)
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

export const newCreatureMeta = (hp, hideHp = false) => (hp === null || hp === undefined
  ? { creature: true, noHp: true }
  : { creature: true, hp, maxHp: hp, ...(hideHp ? { hideHp: true } : {}) });

// { hp, maxHp, ratio } de um token de criatura, ou null se não for criatura.
export function creatureOf(token) {
  const meta = token?.meta;
  if (!meta || meta.creature !== true) return null;
  if (meta.noHp === true) return { hp: 1, maxHp: 1, ratio: 1, noHp: true };
  const maxHp = clampInt(meta.maxHp, 1, MAX_HP, 1);
  const hp = clampInt(meta.hp, 0, maxHp, maxHp);
  return { hp, maxHp, ratio: hp / maxHp, ...(meta.hideHp === true ? { hideHp: true } : {}) };
}

// Mostra ou esconde a vida dos jogadores (o mestre sempre vê).
export function metaWithHideHp(token, hide) {
  const { hideHp: _old, ...rest } = token?.meta || {};
  return hide ? { ...rest, hideHp: true } : rest;
}
// A barra e os números de vida aparecem para este espectador? (sem vida ou vida oculta: só o mestre, e criatura antiga sem vida nunca)
export const hpVisible = (c, isGm) => Boolean(c) && !c.noHp && (isGm || !c.hideHp);

// Tira a vida da criatura (vira "sem vida", formato antigo); metaWithMaxHp a devolve.
export function metaWithoutHp(token) {
  const { hp: _hp, maxHp: _max, ...rest } = token?.meta || {};
  return { ...rest, creature: true, noHp: true };
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
  const { noHp: _noHp, ...rest } = token?.meta || {};
  return { ...rest, creature: true, maxHp: max, hp: Math.min(c && !c.noHp ? c.hp : max, max) };
}

// Meta da cópia de uma criatura: mesma vida máxima (e vida oculta), mas com a vida cheia.
export function metaForCopy(token) {
  const c = creatureOf(token);
  if (!c) return { ...(token?.meta || {}) };
  return c.noHp ? { creature: true, noHp: true } : newCreatureMeta(c.maxHp, c.hideHp === true);
}

// Nome único numa lista: "Goblin" -> "Goblin (2)" se já existir (sem diferenciar maiúsculas).
export function uniqueName(base, names) {
  const taken = new Set((names || []).map(n => String(n).trim().toLowerCase()));
  const clean = String(base || '').trim().slice(0, 60);
  if (!taken.has(clean.toLowerCase())) return clean;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`;
    const name = clean.slice(0, 60 - suffix.length) + suffix;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export const hpTone =ratio => (ratio <= 0 ? 'down' : ratio <= 0.25 ? 'bad' : ratio <= 0.5 ? 'warn' : 'ok');

// Texto para quem não é o mestre (os números ficam só com o mestre).
export const hpLabel = ratio => (ratio <= 0 ? 'Derrotada' : ratio <= 0.25 ? 'Quase derrotada' : ratio <= 0.5 ? 'Muito ferida' : ratio < 1 ? 'Ferida' : 'Ilesa');
