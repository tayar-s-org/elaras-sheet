// Dinheiro da ficha. Toda ficha nova começa com 500; o mestre pode adicionar dinheiro aos jogadores da mesa.

export const START_MONEY = 500;
export const MAX_MONEY = 999999999;

// Ficha antiga (sem o campo) conta como 500; valor inválido ou negativo vira 0; nunca passa do limite.
export function normalizeMoney(raw) {
  if (raw === undefined || raw === null || raw === '') return START_MONEY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_MONEY, Math.trunc(n));
}

export const addMoney = (current, gained) => Math.min(MAX_MONEY, normalizeMoney(current) + Math.max(0, Math.trunc(Number(gained)) || 0));

export const formatMoney = value => normalizeMoney(value).toLocaleString('pt-BR');
