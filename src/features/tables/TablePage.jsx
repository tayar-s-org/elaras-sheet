import React, { useCallback, useEffect, useState } from 'react';
import { loginThen, navigate } from '../../lib/router.js';
import { getTable, getMembers, STATUS_LABEL } from '../../lib/tables.js';
import TableControls from './TableControls.jsx';

export default function TablePage({ auth, id }) {
  const [table, setTable] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const myStatus = members.find(m => m.user_id === auth.user?.id)?.status;
  const reload = useCallback(async () => {
    const [nextTable, nextMembers] = await Promise.all([getTable(id), getMembers(id)]);
    setTable(nextTable);
    setMembers(nextMembers);
  }, [id]);
  useEffect(() => { if (auth.user) reload().catch(e => { setError(e.message); setTable(null); }); }, [auth.user, reload]);
  const run = async fn => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };

  async function checkStatus() {
    if (checking) return;
    setChecking(true);
    setChecked(false);
    await run(async () => { await reload(); setChecked(true); });
    setChecking(false);
  }

  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) return <main className="page"><p className="muted">Entre para ver esta mesa.</p><button className="primary" onClick={() => loginThen(`/mesa/${id}`)}>Entrar</button></main>;
  if (table === undefined) return <main className="page"><p className="muted">Carregando…</p></main>;
  if (!table) return <main className="page">
    <p className="muted">{myStatus === 'rejected' ? 'O mestre recusou o pedido de entrada.' : error || 'Mesa não encontrada ou sem acesso.'}</p>
    <button className="outline" onClick={() => navigate('/mesas')}>← Mesas</button>
  </main>;

  const me = members.find(m => m.user_id === auth.user.id);
  const isGm = table.owner_id === auth.user.id;
  return <main className="page">
    <button className="text-button" onClick={() => navigate('/mesas')}>← Mesas</button>
    <p className="eyebrow">{isGm ? 'VOCÊ É O MESTRE' : `MESTRE: ${table.profiles?.display_name}`}</p>
    <h1>{table.name}</h1>
    <p className="muted">{STATUS_LABEL[table.status]} · {table.visibility === 'public' ? 'Pública' : 'Privada'} · Savage Worlds</p>
    {table.description && <p>{table.description}</p>}
    {error && <p role="alert" className="muted">{error}</p>}
    {myStatus === 'pending' && <div className="callout">
      <h2>Aguardando aprovação do mestre</h2>
      <p>Você pode voltar a esta página por Mesas. Depois da aprovação, você poderá escolher sua ficha e entrar na sala.</p>
      <button type="button" className="outline" disabled={checking} onClick={checkStatus}>
        {checking ? 'Verificando…' : 'Verificar aprovação'}
      </button>
      <p role="status">{checked ? 'O pedido ainda está aguardando aprovação.' : ''}</p>
    </div>}
    {myStatus === 'rejected' && <p className="callout">O mestre recusou o pedido de entrada.</p>}
    {myStatus === 'approved' && !isGm && !me.character_id && <div className="callout">
      <p>Sua entrada foi aprovada. Escolha uma ficha abaixo ou crie uma para esta mesa em Fichas.</p>
      <button type="button" className="outline" onClick={() => navigate('/fichas')}>Abrir Fichas</button>
    </div>}
    {(isGm || me?.status === 'approved') && <button className="primary" onClick={() => navigate(`/sala/${id}`)}>Entrar na sala</button>}
    {isGm || me ? <TableControls table={table} me={me} members={members} reload={reload} run={run} isGm={isGm} />
      : <p className="muted">Você não participa desta mesa. Use Descobrir ou um código de convite para pedir entrada.</p>}
  </main>;
}
