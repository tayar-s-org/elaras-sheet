import React, { useCallback, useEffect, useState } from 'react';
import { loadRoutineStatuses } from '../../lib/training.js';
import TrainingModal from './TrainingModal.jsx';

const POLL_MS = 15000;

// Botão "Rotina de Treino" com aviso: o mestre vê quantas rotinas aguardam aprovação; o jogador vê o estado da dele.
export default function TrainingButton({ tableId, me, isGm, members, characters, closed }) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState(null);
  const refresh = useCallback(() => loadRoutineStatuses(tableId).then(setStatuses).catch(() => {}), [tableId]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => { if (!open) refresh(); }, [open, refresh]);

  const pending = statuses ? Object.entries(statuses).filter(([uid, s]) => s === 'pending' && (isGm ? uid !== me : false)).length : 0;
  const mine = statuses?.[me];
  let badge = null;
  if (isGm && pending > 0) badge = <span className="tr-badge pending">{pending} pendente{pending > 1 ? 's' : ''}</span>;
  else if (!isGm && mine === 'pending') badge = <span className="tr-badge pending">Pendente</span>;
  else if (!isGm && mine === 'approved') badge = <span className="tr-badge approved">Aprovada</span>;

  return <>
    <button type="button" className="outline side-training" onClick={() => setOpen(true)}>Rotina de Treino {badge}</button>
    {open && <TrainingModal tableId={tableId} me={me} isGm={isGm} members={members} characters={characters} closed={closed} onClose={() => setOpen(false)} />}
  </>;
}
