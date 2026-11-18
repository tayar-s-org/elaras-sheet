import { useCallback, useEffect, useState } from 'react';
import { listTableCustomSkills } from '../../lib/customSkills.js';

// Pedidos de perícia personalizada da mesa (só o mestre enxerga todos). Atualiza a cada 8 s.
export function useCustomSkillRequests(tableId, enabled) {
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState(true);
  const refresh = useCallback(async () => {
    const list = await listTableCustomSkills(tableId);
    if (list === null) { setAvailable(false); return; }
    setAvailable(true);
    setItems(list);
  }, [tableId]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  return { items, available, refresh, pending: items.filter(i => i.status === 'pending').length };
}
