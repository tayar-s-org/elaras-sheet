import { readDie, stepUp } from './dice.js';

// XP de treino e evolução.
//  - Cada alvo (perícia, atributo ou feitiço) tem DOIS acumuladores independentes: normal e focado.
//  - Cada acumulador guarda: available (XP que ainda pode ser gasta, limitada ao teto), earned_total (tudo que já
//    foi conquistado, só cresce), spent_total (já gasta em evoluções) e discarded_total (excedente perdido pelo teto).
//    Invariante: earned_total = available + spent_total + discarded_total.

export const MODALITIES = ['normal', 'focused'];
export const MODALITY_LABEL = { normal: 'Normal', focused: 'Focado' };
export const BASE_XP_CAP = 5000;
export const XP_PER_STEP = 100;

// Teto-base de XP acumulada (5.000). A Aptidão aumenta o teto por alvo (src/rpg/aptitude.js: accumulationCap) e o servidor
// aplica a mesma fórmula ao gravar o XP; Grau de Cultivo (ainda não existe) entrará como outro modificador.
export function xpCap(_ctx = {}, modifiers = []) {
  return modifiers.reduce((cap, mod) => (typeof mod === 'function' ? mod(cap, _ctx) : cap), BASE_XP_CAP);
}

export const emptyPool = () => ({ available: 0, earned_total: 0, spent_total: 0, discarded_total: 0 });

// Soma XP num acumulador respeitando o teto. Devolve um acumulador novo e quanto foi descartado.
export function addXp(pool, amount, cap = BASE_XP_CAP) {
  const p = { ...emptyPool(), ...pool };
  const gain = Math.max(0, Number(amount) || 0);
  const kept = Math.max(0, Math.min(gain, cap - p.available));
  return {
    pool: { available: p.available + kept, earned_total: p.earned_total + gain, spent_total: p.spent_total, discarded_total: p.discarded_total + (gain - kept) },
    kept,
    discarded: gain - kept,
  };
}

// XP para o próximo passo: d4→…→d12→d12+1 custam 100 cada; depois d12+2 = 200, d12+3 = 300, d12+4 = 400…
export function evolutionCost({ die, bonus = 0 }) {
  return die >= 12 ? XP_PER_STEP * (bonus + 1) : XP_PER_STEP;
}

// Gasta XP de um acumulador numa evolução. Nunca mexe em earned_total.
export function spendXp(pool, cost) {
  const p = { ...emptyPool(), ...pool };
  if (!(cost > 0) || p.available < cost) return null;
  return { ...p, available: p.available - cost, spent_total: p.spent_total + cost };
}

// Aplica uma evolução à ficha: um passo no dado (ou +1 de bônus acima de d12) e anota o passo para o orçamento de criação.
// kind: 'skill' | 'attribute'. Devolve uma ficha nova.
export function applyEvolution(c, kind, name) {
  const group = kind === 'skill' ? 'skills' : 'attributes';
  const next = stepUp(readDie(c, kind, name));
  const evolved = { skills: { ...(c.evolved?.skills || {}) }, attributes: { ...(c.evolved?.attributes || {}) } };
  const bonuses = { skills: { ...(c.bonuses?.skills || {}) }, attributes: { ...(c.bonuses?.attributes || {}) } };
  const before = readDie(c, kind, name);
  if (next.die === before.die) bonuses[group][name] = next.bonus; // acima de d12: só o bônus sobe
  else evolved[group][name] = (evolved[group][name] || 0) + 1;     // passo de dado: custaria pontos de criação, então fica anotado
  return { ...c, [group]: { ...c[group], [name]: next.die }, bonuses, evolved };
}
