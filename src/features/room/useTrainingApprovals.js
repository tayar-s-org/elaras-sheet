import { useCallback, useEffect, useState } from 'react';
import { loadRoutineStatuses } from '../../lib/training.js';

const POLL_MS = 15000;

// Rotinas de treino da mesa aguardando aprovação (só para o mestre). Atualiza sozinho de tempos em tempos.
export function useTrainingApprovals(tableId, enabled) {
  const [statuses, setStatuses] = useState(null); // null = migration pendente ou ainda carregando
  const refresh = useCallback(() => loadRoutineStatuses(tableId).then(setStatuses).catch(() => {}), [tableId]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  const pending = statuses ? Object.entries(statuses).filter(([, s]) => s === 'pending').map(([uid]) => uid) : [];
  const approved = statuses ? Object.entries(statuses).filter(([, s]) => s === 'approved').map(([uid]) => uid) : [];
  return { pending, approved, available: statuses !== null, refresh };
}
