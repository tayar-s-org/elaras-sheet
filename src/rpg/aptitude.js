import { BASE_XP_CAP } from './progression.js';

// Aptidão: talento natural. O mestre concede uma rolagem de 1d100 (o resultado são os pontos), o jogador distribui os
// pontos entre os atributos e perícias da ficha e cada ponto dá bônus de XP e de limite de acúmulo SÓ àquele alvo.
//   atributo: +10% por ponto · perícia: +5% por ponto · máximo de +100% por alvo (vale para XP e para o limite)
// Feitiços não têm Aptidão. O servidor aplica as mesmas fórmulas (aptitude_pct em 0026) ao gravar o XP.

export const APTITUDE_STEP = { attribute: 0.1, skill: 0.05 };
export const APTITUDE_MAX_BONUS = 1; // +100%
export const ROLL_SIDES = 100;
export const MAX_POINTS_PER_TARGET = 1000;

export const aptitudeKey = (kind, name) => `${kind}:${name}`;

// Pontos de Aptidão de um alvo na distribuição ({ "attribute:Força": 5, "skill:Conjurar": 3 }).
export const pointsOf = (allocation, kind, name) => Math.max(0, Math.trunc(Number(allocation?.[aptitudeKey(kind, name)]) || 0));

// Bônus (0 a 1) de um alvo. Pontos acima do necessário para 100% continuam registrados, mas não rendem mais.
export function aptitudeBonus(kind, points) {
  const step = APTITUDE_STEP[kind];
  if (!step) return 0; // feitiços e qualquer outro tipo: sem Aptidão
  const p = Math.max(0, Math.trunc(Number(points) || 0));
  return Math.min(APTITUDE_MAX_BONUS, Math.round(p * step * 1000) / 1000);
}
export const aptitudeBonusOf = (allocation, kind, name) => aptitudeBonus(kind, pointsOf(allocation, kind, name));

// XP final de um ganho: ganho-base × (1 + bônus), aplicado uma única vez por evento e só ao alvo direto.
export const xpWithAptitude = (base, kind, points) => Math.round(Number(base) * (1 + aptitudeBonus(kind, points)) * 1e6) / 1e6;

// Limite de acúmulo de um alvo: limite-base × (1 + bônus). `modifiers` aceita outros efeitos futuros.
export const accumulationCap = (kind, points, base = BASE_XP_CAP) => Math.round(base * (1 + aptitudeBonus(kind, points)));

// Pontos necessários para chegar a +100% (10 em atributos, 20 em perícias).
export const pointsForMax = kind => Math.ceil(APTITUDE_MAX_BONUS / APTITUDE_STEP[kind]);

// Resumo: recebidos (soma das rolagens), distribuídos e disponíveis.
export function aptitudeSummary(grants, allocation) {
  const received = (grants || []).reduce((s, g) => s + (Number(g.roll) || 0), 0);
  const distributed = Object.values(allocation || {}).reduce((s, v) => s + Math.max(0, Math.trunc(Number(v) || 0)), 0);
  return { received, distributed, available: received - distributed };
}

// Valida uma distribuição contra a ficha e o total recebido. Devolve uma lista de problemas (vazia = válida).
// sheet = { attributes: [nomes], skills: [nomes que a ficha possui] }.
export function validateAllocation(allocation, received, sheet) {
  const problems = [];
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) return ['Distribuição inválida.'];
  let total = 0;
  for (const [key, raw] of Object.entries(allocation)) {
    const [kind, ...rest] = key.split(':');
    const name = rest.join(':');
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0) { problems.push(`Valor inválido em ${name || key}.`); continue; }
    if (v > MAX_POINTS_PER_TARGET) problems.push(`${name}: máximo de ${MAX_POINTS_PER_TARGET} pontos.`);
    const exists = kind === 'attribute' ? sheet.attributes.includes(name) : kind === 'skill' ? sheet.skills.includes(name) : false;
    if (!exists && v > 0) problems.push(`${name || key} não existe na ficha deste personagem.`);
    total += v;
  }
  if (total > received) problems.push(`Você distribuiu ${total} pontos, mas só recebeu ${received}.`);
  return problems;
}

// Distribuição limpa: só chaves com pontos, inteiros.
export function cleanAllocation(allocation) {
  const out = {};
  for (const [k, v] of Object.entries(allocation || {})) { const n = Math.trunc(Number(v) || 0); if (n > 0) out[k] = n; }
  return out;
}
