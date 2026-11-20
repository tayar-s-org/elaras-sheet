import { astuciaDiceFor, STUDY_HOURS_PER_DIE } from './activities.js';

// Estudo Mágico: tentativa de aprimorar um feitiço. As regras abaixo espelham o servidor (attempt_spell_upgrade), que é
// quem de fato rola e decide; aqui servem para mostrar dificuldade, Pity e dados na tela e para os testes.

export const ATTEMPT_DICE = 16;
export const MAX_IMPROVEMENTS = 10;
export const MAX_PITY = 5;
export const PITY_REDUCTION = 0.1; // cada ponto de Pity reduz 10% da dificuldade da próxima tentativa
export const PITY_MIN_SHARE = 0.5; // falha com pelo menos 50% do valor da tabela dá 1 ponto de Pity

// Dificuldade da 1ª à 10ª melhoria do feitiço.
export const DIFFICULTY = [150, 225, 340, 510, 760, 1140, 1710, 2565, 3845, 5770];

// COBRANÇA DO XP DA MELHORIA — DECISÃO PENDENTE (o mestre define o custo, mas quando cobrar ainda não foi escolhido):
//   'none'            hoje: o custo é guardado e exibido, nada é debitado
//   'on_attempt'      cobrar ao iniciar a tentativa (gasta mesmo se falhar)
//   'on_success'      cobrar só no sucesso
//   'reserve_refund'  reservar na tentativa, devolver na falha e cobrar de fato no sucesso
export const UPGRADE_XP_CHARGE = 'none';

// Dificuldade de uma tentativa: valor da tabela pela quantidade de melhorias já feitas, menos 10% por ponto de Pity.
export function attemptDifficulty(improvements, pity = 0) {
  const base = DIFFICULTY[improvements];
  if (base === undefined) return null;
  const p = Math.min(MAX_PITY, Math.max(0, pity));
  return { base, effective: base * (1 - PITY_REDUCTION * p), pity: p };
}

// Resultado de uma tentativa a partir da soma dos dados. Sucesso exige soma MAIOR que a dificuldade.
export function judgeAttempt(total, improvements, pity = 0) {
  const d = attemptDifficulty(improvements, pity);
  if (!d) return null;
  if (total > d.effective) return { success: true, pityAfter: 0, ...d };
  const earnsPity = total >= d.base * PITY_MIN_SHARE;
  return { success: false, pityAfter: earnsPity ? Math.min(MAX_PITY, d.pity + 1) : d.pity, ...d };
}

// Dados de Astúcia: ganhos (1 a cada 25 h, sem teto), gastos (16 por tentativa) e disponíveis.
export function astuciaDice(studyHours, spent = 0) {
  const earned = astuciaDiceFor(studyHours);
  const available = Math.max(0, earned - spent);
  return { earned, spent, available, canAttempt: available >= ATTEMPT_DICE, hoursToNext: STUDY_HOURS_PER_DIE - ((Number(studyHours) || 0) % STUDY_HOURS_PER_DIE) };
}
