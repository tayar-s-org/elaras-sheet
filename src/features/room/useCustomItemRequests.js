import { useCallback, useEffect, useState } from 'react';
import { listTableCustomItems } from '../../lib/customItems.js';

// Pedidos de itens customizados da mesa (só o mestre enxerga todos). Atualiza a cada 8 s.
export function useCustomItemRequests(tableId, enabled) {
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');
  // Se a consulta falha (rede, sessão), mantém a lista anterior e expõe `error`; o próximo ciclo ou `refresh` tenta de novo.
  const refresh = useCallback(async () => {
    try {
      const list = await listTableCustomItems(tableId);
      setError('');
      if (list === null) { setAvailable(false); return; }
      setAvailable(true);
      setItems(list);
    } catch (e) { setError(e.message); }
  }, [tableId]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  return { items, available, error, refresh, pending: items.filter(i => i.status === 'pending').length };
}
