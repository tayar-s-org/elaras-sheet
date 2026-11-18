// Junta as concessoes de XP e de dinheiro num so registro, da mais recente para a mais antiga.
// Dinheiro negativo e remocao. Linhas sem data valida ficam por ultimo.
export function mergeRewards(xp, money, limit = 80) {
  const time = r => { const t = Date.parse(r.created_at); return Number.isFinite(t) ? t : 0; };
  const list = [
    ...(xp || []).map(r => ({ ...r, key: `x${r.id}`, kind: 'xp' })),
    ...(money || []).map(r => ({ ...r, key: `d${r.id}`, kind: 'money' })),
  ];
  return list.sort((a, b) => time(b) - time(a) || String(b.key).localeCompare(String(a.key))).slice(0, limit);
}

// Texto da quantia: "+50 XP", "+$1.200", "−$300".
export function rewardAmount(entry, formatMoney) {
  const n = Number(entry.amount) || 0;
  if (entry.kind === 'xp') return `${n < 0 ? '−' : '+'}${Math.abs(n)} XP`;
  return `${n < 0 ? '−' : '+'}$${formatMoney(Math.abs(n))}`;
}
