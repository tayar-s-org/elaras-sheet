import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { loadRequests } from '../../lib/requests.js';
import { RequestCard } from './Requests.jsx';
import './routine.css';

const POLL_MS = 15000;

// Solicitações dos jogadores (trabalhos e melhorias de feitiço) para o mestre, agrupadas por personagem.
// Devolve { list, pending, available, refresh }; list é null enquanto carrega ou se a migration 0025 não foi rodada.
export function useRequests(tableId, enabled) {
  const [list, setList] = useState(null);
  const refresh = useCallback(() => loadRequests(tableId).then(setList).catch(() => {}), [tableId]);
  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);
  return { list, pending: list ? list.filter(r => r.status === 'pending') : [], available: list !== null, refresh };
}

export default function RequestApprovals({ requests, members, characters, closed }) {
  const [error, setError] = useState('');
  const [show, setShow] = useState('pending');
  const items = useMemo(() => (requests.list || []).filter(r => (show === 'pending' ? r.status === 'pending' : r.status !== 'pending')), [requests.list, show]);
  if (!requests.available) return null;
  const byChar = {};
  for (const r of items) (byChar[r.character_id] ||= []).push(r);
  const who = id => {
    const m = members.find(x => x.character_id === id);
    return `${characters[id]?.name || 'Personagem'}${m?.profiles?.display_name ? ` (${m.profiles.display_name})` : ''}`;
  };
  return <div className="approvals">
    <h3>Solicitações dos jogadores ({requests.pending.length} aguardando)</h3>
    <div className="tabs-row" role="tablist" aria-label="Filtro">
      <button type="button" role="tab" aria-selected={show === 'pending'} className={show === 'pending' ? 'primary' : 'outline'} onClick={() => setShow('pending')}>Aguardando</button>
      <button type="button" role="tab" aria-selected={show === 'decided'} className={show === 'decided' ? 'primary' : 'outline'} onClick={() => setShow('decided')}>Já decididas</button>
    </div>
    {error && <p role="alert" className="callout">{error}</p>}
    {!items.length ? <p className="muted">{show === 'pending' ? 'Nenhuma solicitação esperando. Quando um jogador sugerir um trabalho ou uma melhoria de feitiço, ela aparece aqui.' : 'Nenhuma solicitação decidida ainda.'}</p>
      : Object.entries(byChar).map(([id, list]) => <section key={id} className="rq-group">
        <h4>{who(id)}</h4>
        <div className="rq-list">
          {list.map(r => {
            const spellName = characters[id]?.data?.powers?.find?.(p => p.id === r.spell_id)?.name || 'feitiço';
            return <RequestCard key={r.id} r={r} isGm owner={false} closed={closed} spellName={spellName} refresh={requests.refresh} onError={setError} />;
          })}
        </div>
      </section>)}
  </div>;
}
