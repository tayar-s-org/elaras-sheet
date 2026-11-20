// Junta as concessoes de XP e de dinheiro num so registro, da mais recente para a mais antiga.
// Dinheiro negativo e remocao. Linhas sem data valida ficam por ultimo.
// custom: linhas do histórico administrativo das categorias wallet/experience (moeda e experiência personalizadas); mudança nula é ignorada.
export function customRewards(rows) {
  return (rows || []).map(r => {
    const delta = (Number(r.after?.amount) || 0) - (Number(r.before?.amount) || 0);
    return { id: r.id, character_id: r.character_id, created_at: r.created_at, granted_by: r.actor_id, claimed_at: r.created_at, note: r.note || '',
      amount: delta, total: Number(r.after?.amount) || 0, set: r.kind === 'set', label: r.after?.name || r.before?.name || '',
      icon: r.category === 'wallet' ? r.after?.symbol || r.before?.symbol : r.after?.icon || r.before?.icon, group: r.category };
  }).filter(r => r.amount !== 0);
}

export function mergeRewards(xp, money, limit = 80, custom = null) {
  const time = r => { const t = Date.parse(r.created_at); return Number.isFinite(t) ? t : 0; };
  const list = [
    ...(xp || []).map(r => ({ ...r, key: `x${r.id}`, kind: 'xp' })),
    ...(money || []).map(r => ({ ...r, key: `d${r.id}`, kind: 'money' })),
    ...customRewards(custom).map(r => ({ ...r, key: `c${r.id}`, kind: r.group })),
  ];
  return list.sort((a, b) => time(b) - time(a) || String(b.key).localeCompare(String(a.key))).slice(0, limit);
}

// Texto da quantia: "+50 XP", "+$1.200", "−$300".
export function rewardAmount(entry, formatMoney) {
  const n = Number(entry.amount) || 0;
  if (entry.kind === 'xp') return `${n < 0 ? '−' : '+'}${Math.abs(n)} XP`;
  if (entry.kind === 'wallet' || entry.kind === 'experience') return `${n < 0 ? '−' : '+'}${formatMoney(Math.abs(n))}`; // a moeda/experiência aparece ao lado, com ícone e nome
  return `${n < 0 ? '−' : '+'}$${formatMoney(Math.abs(n))}`;
}
