import { daysToCheck } from './clock.js';

// Validação obrigatória antes de avançar o tempo.
// Cada personagem da mesa precisa ter, em TODOS os dias desde o atual até o dia de destino (inclusive), uma rotina
// atribuída e aprovada pelo mestre. Não existe dia vazio tratado como descanso nem exceção automática.
//
//   characters:  [{ characterId, userId, name }]  personagens aprovados na mesa
//   assignments: { [characterId]: { [dayNo]: routineId } }
//   routines:    { [routineId]: { status: 'draft'|'pending'|'approved', review_note?, character_id?, name? } }
//
// Cada dia de cada personagem cai em exatamente um destes estados:
//   ok        rotina aprovada
//   empty     nenhuma rotina atribuída (ou a rotina foi apagada)
//   pending   rotina enviada, aguardando o mestre
//   rejected  rotina devolvida pelo mestre (rascunho com nota)
//   draft     rotina voltou a rascunho (editada depois da aprovação) e não foi reenviada
// Uma rotina de outro personagem atribuída ao dia também conta como vazio (não se mistura personagens).
export function dayState(routine, characterId) {
  if (!routine) return 'empty';
  if (routine.character_id && characterId && routine.character_id !== characterId) return 'empty';
  if (routine.status === 'approved') return 'ok';
  if (routine.status === 'pending') return 'pending';
  return routine.review_note ? 'rejected' : 'draft';
}

export function checkAdvance({ characters, assignments, routines, fromTick, hours }) {
  const days = daysToCheck(fromTick, hours);
  const players = characters.map(ch => {
    const mine = assignments?.[ch.characterId] || {};
    const out = { characterId: ch.characterId, userId: ch.userId, name: ch.name, empty: [], pending: [], rejected: [], draft: [], ok: [] };
    for (const dayNo of days) {
      const id = mine[dayNo];
      const routine = id ? routines?.[id] : null;
      const state = dayState(routine, ch.characterId);
      if (state === 'ok') out.ok.push(dayNo);
      else if (state === 'empty') out.empty.push(dayNo);
      else out[state].push({ dayNo, routineId: id, name: routine?.name || '', note: routine?.review_note || '' });
    }
    out.complete = out.ok.length === days.length;
    return out;
  });
  const issues = players.filter(p => !p.complete);
  return {
    ok: issues.length === 0,
    days,
    players,
    summary: {
      characters: players.length,
      days: days.length,
      complete: players.length - issues.length,
      withIssues: issues.length,
      pendingRoutines: players.reduce((n, p) => n + p.pending.length, 0),
    },
  };
}
