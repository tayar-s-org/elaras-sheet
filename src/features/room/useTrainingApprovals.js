import { useCallback, useEffect, useState } from 'react';
import { loadRoutineList } from '../../lib/training.js';

const POLL_MS = 15000;

// Rotinas de treino da mesa aguardando aprovação (só para o mestre). Cada item: { id, user_id, name, status }.
// Atualiza sozinho de tempos em tempos.
export function useTrainingApprovals(tableId, enabled) {
  const [list, setList] = useState(null); // null = migration pendente ou ainda carregando
  const refresh = useCallback(() => loadRoutineList(tableId).then(setList).catch(() => {}), [tableId]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  const pending = list ? list.filter(r => r.status === 'pending') : [];
  const approved = list ? list.filter(r => r.status === 'approved') : [];
  return { pending, approved, available: list !== null, refresh };
}
