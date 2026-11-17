import React, { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../lib/router.js';
import { listMine } from '../../lib/cloud.js';
import {
  getTable, getMembers, updateTable, deleteTable, decideMember, leaveTable, setMemberCharacter,
  getInviteCode, rotateInvite, inviteLink, STATUS_LABEL,
} from '../../lib/tables.js';

function GmPanel({ table, members, reload, run }) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { getInviteCode(table.id).then(setCode).catch(() => {}); }, [table.id]);
  const pending = members.filter(m => m.status === 'pending');
  const players = members.filter(m => m.role === 'player' && m.status === 'approved');
  const patch = changes => run(async () => { await updateTable(table.id, changes); await reload(); });
  const decide = (userId, status) => run(async () => { await decideMember(table.id, userId, status); await reload(); });
  return <>
    <section className="item-card">
      <h3>Controle da mesa</h3>
      <div className="form-grid">
        <label className="field"><span>Estado</span>
          <select value={table.status} onChange={e => patch({ status: e.target.value })}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="field"><span>Visibilidade</span>
          <select value={table.visibility} onChange={e => patch({ visibility: e.target.value })}>
            <option value="private">Privada</option><option value="public">Pública</option>
          </select></label>
        <label className="field"><span>Máximo de jogadores</span>
          <input type="number" min="1" max="20" defaultValue={table.max_players}
            onBlur={e => { const v = Math.min(20, Math.max(1, Number(e.target.value) || 1)); if (v !== table.max_players) patch({ max_players: v }); }} /></label>
        <label className="field"><span><input type="checkbox" checked={table.auto_approve} onChange={e => patch({ auto_approve: e.target.checked })} /> Aprovar automaticamente</span></label>
      </div>
      <div className="invite">
        <span className="muted">Convite:</span> <code>{code || '…'}</code>
        <button className="outline" disabled={!code} onClick={async () => { await navigator.clipboard?.writeText(inviteLink(code)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Link copiado' : 'Copiar link'}</button>
        <button className="outline" onClick={() => run(async () => setCode(await rotateInvite(table.id)))}>Gerar novo código</button>
      </div>
    </section>
    <section className="item-card">
      <h3>Pedidos de entrada ({pending.length})</h3>
      {!pending.length && <p className="muted">Nenhum pedido pendente.</p>}
      {pending.map(m => <div className="row" key={m.user_id}>
        <span><strong>{m.profiles?.display_name}</strong>{m.message ? ` — “${m.message}”` : ''}</span>
        <span>
          <button className="primary" onClick={() => decide(m.user_id, 'approved')}>Aprovar</button>{' '}
          <button className="outline" onClick={() => decide(m.user_id, 'rejected')}>Recusar</button>
        </span>
      </div>)}
    </section>
    <section className="item-card">
      <h3>Jogadores ({players.length}/{table.max_players})</h3>
      {!players.length && <p className="muted">Ainda não há jogadores aprovados.</p>}
      {players.map(m => <div className="row" key={m.user_id}>
        <span>{m.profiles?.display_name}</span>
        <button className="text-button danger" onClick={() => window.confirm(`Remover ${m.profiles?.display_name} da mesa?`) && decide(m.user_id, 'kicked')}>Expulsar</button>
      </div>)}
    </section>
    <button className="text-button danger" onClick={() => window.confirm('Apagar esta mesa e todos os vínculos? Isso não pode ser desfeito.') && run(async () => { await deleteTable(table.id); navigate('/mesas'); })}>Apagar mesa</button>
  </>;
}

function PlayerPanel({ table, me, members, reload, run }) {
  const [characters, setCharacters] = useState([]);
  useEffect(() => { listMine().then(setCharacters).catch(() => {}); }, []);
  const roster = members.filter(m => m.status === 'approved');
  return <>
    {me.status === 'pending' && <div className="callout"><b>Aguardando aprovação do mestre</b><p>Você será avisado aqui quando o pedido for decidido.</p></div>}
    {me.status === 'approved' && <>
      <label className="field"><span>Sua ficha nesta mesa</span>
        <select value={me.character_id || ''} onChange={e => run(async () => { await setMemberCharacter(table.id, e.target.value || null); await reload(); })}>
          <option value="">Nenhuma</option>
          {characters.map(c => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
        </select></label>
      <section className="item-card"><h3>Participantes</h3>
        {roster.map(m => <div className="row" key={m.user_id}><span>{m.profiles?.display_name}</span><span className="muted">{m.role === 'gm' ? 'Mestre' : 'Jogador'}</span></div>)}
      </section>
    </>}
    <button className="text-button danger" onClick={() => window.confirm('Sair desta mesa?') && run(async () => { await leaveTable(table.id); navigate('/mesas'); })}>Sair da mesa</button>
  </>;
}

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
    {isGm ? <GmPanel table={table} members={members} reload={reload} run={run} />
      : me ? <PlayerPanel table={table} me={me} members={members} reload={reload} run={run} />
        : <p className="muted">Você não participa desta mesa. Use Descobrir ou um código de convite para pedir entrada.</p>}
  </main>;
}
