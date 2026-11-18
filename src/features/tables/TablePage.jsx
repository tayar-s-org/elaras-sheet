import React, { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../lib/router.js';
import { getTable, getMembers, STATUS_LABEL } from '../../lib/tables.js';
import TableControls from './TableControls.jsx';

export default function TablePage({ auth, id }) {
  const [table, setTable] = useState(undefined);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    const t = await getTable(id);
    setTable(t);
    if (t) setMembers(await getMembers(id));
  }, [id]);
  useEffect(() => { if (auth.user) reload().catch(e => { setError(e.message); setTable(null); }); }, [auth.user, reload]);
  const run = async fn => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };

  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) return <main className="page"><p className="muted">Entre para ver esta mesa.</p><button className="primary" onClick={() => navigate('/entrar')}>Entrar</button></main>;
  if (table === undefined) return <main className="page"><p className="muted">Carregando…</p></main>;
  if (!table) return <main className="page"><p className="muted">Mesa não encontrada ou sem acesso.</p><button className="outline" onClick={() => navigate('/mesas')}>← Mesas</button></main>;

  const me = members.find(m => m.user_id === auth.user.id);
  const isGm = table.owner_id === auth.user.id;
  return <main className="page">
    <button className="text-button" onClick={() => navigate('/mesas')}>← Mesas</button>
    <p className="eyebrow">{isGm ? 'VOCÊ É O MESTRE' : `MESTRE: ${table.profiles?.display_name}`}</p>
    <h1>{table.name}</h1>
    <p className="muted">{STATUS_LABEL[table.status]} · {table.visibility === 'public' ? 'Pública' : 'Privada'} · Savage Worlds</p>
    {table.description && <p>{table.description}</p>}
    {error && <p role="alert" className="muted">{error}</p>}
    {(isGm || me?.status === 'approved') && <button className="primary" onClick={() => navigate(`/sala/${id}`)}>Entrar na sala</button>}
    {isGm || me ? <TableControls table={table} me={me} members={members} reload={reload} run={run} isGm={isGm} />
      : <p className="muted">Você não participa desta mesa. Use Descobrir ou um código de convite para pedir entrada.</p>}
  </main>;
}
