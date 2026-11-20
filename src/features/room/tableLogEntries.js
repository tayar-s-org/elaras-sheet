export const LOG_LIMIT = 80;

// Avisos de XP e dinheiro que o app antigo postava no chat: agora ficam na aba propria.
const OLD_REWARD_LINE = /^(✨ O mestre concedeu \+\d+ XP a |💰 O mestre deu \$|💸 O mestre removeu \$)/;

const newestFirst = (a, b) => Date.parse(b.at) - Date.parse(a.at) || String(b.key).localeCompare(String(a.key));

// Mensagens e rolagens chegam em ordem crescente de id: so as ultimas `limit` de cada lista podem aparecer, entao so elas
// entram na ordenacao (o historico inteiro nunca e ordenado). Mais recente primeiro.
export function latestDiceEntries(messages, rolls, hidden, limit = LOG_LIMIT) {
  const shownMessages = messages.filter(m => !OLD_REWARD_LINE.test(m.body || '')).slice(-limit);
  const shownRolls = rolls.filter(r => !hidden?.has(r.id)).slice(-limit);
  return [
    ...shownMessages.map(m => ({ key: `m${m.id}`, at: m.created_at, type: 'msg', m })),
    ...shownRolls.map(r => ({ key: `r${r.id}`, at: r.created_at, type: 'roll', r })),
  ].sort(newestFirst).slice(0, limit);
}

// O historico de vida/stamina/mana ja vem em ordem crescente de id: basta pegar o fim e inverter.
// Jogadores não veem as mudanças de mana dos outros (só as da própria ficha); o mestre vê tudo.
export function latestVitalEntries(stateLog, { isGm, characterId }, limit = LOG_LIMIT) {
  return (stateLog || [])
    .filter(v => isGm || v.resource !== 'mana' || v.character_id === characterId)
    .slice(-limit)
    .reverse();
}
