import { calculate, validateCharacter } from '../../rules.js';

export const RESOURCES = [['life', 'Vida'], ['stamina', 'Stamina'], ['mana', 'Mana']];

export function safeMaxima(data) {
  try { const d = calculate(validateCharacter(data)); return { life: d.life, stamina: d.stamina, mana: d.mana }; }
  catch { return { life: 0, stamina: 0, mana: 0 }; }
}

// Niveis de incapacitacao (Vida/Stamina) e exaustao (Mana) conforme as regras da mesa.
export const level = (cur, max, mana) => {
  if (max <= 0) return 0;
  if (mana) return cur <= max * 0.1 ? 3 : cur < max * 0.25 ? 2 : cur <= max / 2 ? 1 : 0;
  return cur < max * 0.25 ? 2 : cur <= max / 2 ? 1 : 0;
};
export const LEVEL_TEXT = { normal: ['OK', 'Incapacitação 1', 'Incapacitação 2'], mana: ['OK', 'Exaustão 1', 'Exaustão 2', 'Exaustão 3'] };

// Valor atual de um recurso (sem estado salvo, o personagem esta com tudo cheio).
export const currentValue = (state, max, k) => Math.min(max[k], Math.max(0, Number.isFinite(state?.[k]) ? state[k] : max[k]));
