import React, { useCallback, useEffect, useState } from 'react';
import { loadRoutineList } from '../../lib/training.js';
import TrainingModal from './TrainingModal.jsx';

const POLL_MS = 15000;

// Botão "Rotina de Treino" com aviso: o mestre vê quantas rotinas aguardam aprovação; o jogador vê o estado das dele.
export default function TrainingButton({ tableId, me, isGm, members, characters, closed }) {
  const [open, setOpen] = useState(false);
  const [startView, setStartView] = useState(null);
  const [list, setList] = useState(null);
  const refresh = useCallback(() => loadRoutineList(tableId).then(setList).catch(() => {}), [tableId]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => { if (!open) refresh(); }, [open, refresh]);

  const pending = list && isGm ? list.filter(r => r.status === 'pending').length : 0;
  const mine = list ? list.filter(r => r.user_id === me) : [];
  const minePending = mine.filter(r => r.status === 'pending').length;
  const mineApproved = mine.filter(r => r.status === 'approved').length;
  let badge = null;
  if (isGm && pending > 0) badge = <span className="tr-badge pending">{pending} pendente{pending > 1 ? 's' : ''}</span>;
  else if (!isGm && minePending > 0) badge = <span className="tr-badge pending">{minePending} pendente{minePending > 1 ? 's' : ''}</span>;
  else if (!isGm && mineApproved > 0) badge = <span className="tr-badge approved">{mineApproved} aprovada{mineApproved > 1 ? 's' : ''}</span>;

  return <>
    <button type="button" className="outline side-training" onClick={() => { setStartView(null); setOpen(true); }}>Rotina de Treino {badge}</button>
    <button type="button" className="outline side-training" onClick={() => { setStartView('history'); setOpen(true); }}>{isGm ? 'Treinamentos dos jogadores' : 'Ver Meus Treinamentos'}</button>
    {open && <TrainingModal tableId={tableId} me={me} isGm={isGm} initialView={startView} members={members} characters={characters} closed={closed} onClose={() => setOpen(false)} />}
  </>;
}
