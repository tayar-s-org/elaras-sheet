import React, { useCallback, useEffect, useState } from 'react';
import { loginThen, navigate } from '../../lib/router.js';
import { createTable, myMemberships, listPublic, joinPublic, joinByCode, STATUS_LABEL, MEMBER_LABEL } from '../../lib/tables.js';
import JoinForm from './JoinForm.jsx';

function Tabs({ tab, setTab }) {
  const items = [['mine', 'Minhas mesas'], ['discover', 'Descobrir'], ['create', 'Criar mesa'], ['code', 'Tenho um código']];
  return <div className="tabs-row" role="tablist">
    {items.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'primary' : 'outline'} onClick={() => setTab(id)}>{label}</button>)}
  </div>;
}

function MineTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { myMemberships().then(setRows).catch(e => setError(e.message)); }, []);
  if (error) return <p role="alert" className="muted">{error}</p>;
  if (!rows) return <p className="muted">Carregando…</p>;
  if (!rows.length) return <p className="muted">Você ainda não participa de nenhuma mesa. Crie uma ou procure em Descobrir.</p>;
  return <div className="table-list">
    {rows.map(r => <button key={r.tables.id} className="table-card" onClick={() => navigate(r.status === 'approved' ? `/sala/${r.tables.id}` : `/mesa/${r.tables.id}`)}>
      <strong>{r.tables.name}</strong>
      <span className="muted">{r.role === 'gm' ? 'Você é o mestre' : MEMBER_LABEL[r.status]} · {STATUS_LABEL[r.tables.status]} · {r.tables.visibility === 'public' ? 'Pública' : 'Privada'}</span>
    </button>)}
  </div>;
}

function DiscoverTab() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState('');
  const load = useCallback(q => listPublic(q).then(setRows).catch(e => setError(e.message)), []);
  useEffect(() => { load(''); }, [load]);
  return <>
    <form className="row" onSubmit={e => { e.preventDefault(); load(search); }}>
      <input aria-label="Buscar mesas" placeholder="Buscar por nome ou descrição" value={search} onChange={e => setSearch(e.target.value)} />
      <button className="outline">Buscar</button>
    </form>
    {error && <p role="alert" className="muted">{error}</p>}
    {!rows ? <p className="muted">Carregando…</p> : !rows.length ? <p className="muted">Nenhuma mesa pública encontrada.</p> :
      <div className="table-list">{rows.map(t => <div className="table-card static" key={t.id}>
        <strong>{t.name}</strong>
        <span className="muted">Mestre {t.gm_name} · {STATUS_LABEL[t.status]} · {t.player_count}/{t.max_players} jogadores</span>
        {t.description && <p>{t.description}</p>}
        {joining === t.id
          ? <JoinForm onSubmit={async ({ message, characterId }) => { const status = await joinPublic(t.id, message, characterId); navigate(status === 'approved' ? `/sala/${t.id}` : `/mesa/${t.id}`); }} />
          : <button className="outline" onClick={() => setJoining(t.id)}>Pedir para entrar</button>}
      </div>)}</div>}
  </>;
}

function CreateTab() {
  const [form, setForm] = useState({ name: '', description: '', visibility: 'private', autoApprove: false, maxPlayers: 6 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { navigate(`/sala/${await createTable(form)}`); }
    catch (err) { setError(err.message); setBusy(false); }
  }
  return <form className="join-form" onSubmit={submit}>
    <label className="field"><span>Nome da mesa</span><input required maxLength={100} value={form.name} onChange={e => set('name', e.target.value)} /></label>
    <label className="field"><span>Descrição</span><textarea rows="3" maxLength={2000} value={form.description} onChange={e => set('description', e.target.value)} /></label>
    <label className="field"><span>Sistema</span><select disabled value="sw"><option value="sw">Savage Worlds (mesa Manrakora)</option></select></label>
    <label className="field"><span>Visibilidade</span>
      <select value={form.visibility} onChange={e => set('visibility', e.target.value)}>
        <option value="private">Privada (só por convite)</option>
        <option value="public">Pública (aparece em Descobrir)</option>
      </select></label>
    <label className="field"><span>Máximo de jogadores</span>
      <input type="number" min="1" max="20" value={form.maxPlayers} onChange={e => set('maxPlayers', Math.min(20, Math.max(1, Number(e.target.value) || 1)))} /></label>
    <label className="field"><span><input type="checkbox" checked={form.autoApprove} onChange={e => set('autoApprove', e.target.checked)} /> Aprovar pedidos automaticamente</span></label>
    <button className="primary" disabled={busy}>{busy ? 'Criando…' : 'Criar mesa'}</button>
    {error && <p role="alert" className="muted">{error}</p>}
  </form>;
}

function CodeTab() {
  const [code, setCode] = useState('');
  return <JoinForm submitLabel="Enviar pedido com o código" onSubmit={async ({ message, characterId }) => {
    navigate(`/mesa/${await joinByCode(code, message, characterId)}`);
  }}>
    <label className="field"><span>Código de convite</span>
      <input required maxLength={16} value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" /></label>
  </JoinForm>;
}

export default function TablesPage({ auth }) {
  const [tab, setTab] = useState('mine');
  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) return <main className="page">
    <h1>Mesas</h1>
    <p className="muted">Entre na sua conta para criar mesas e participar das de outros jogadores.</p>
    <button className="primary" onClick={() => loginThen('/mesas')}>Entrar</button>
  </main>;
  return <main className="page">
    <p className="eyebrow">JOGUE COM SEUS AMIGOS</p>
    <h1>Mesas</h1>
    <Tabs tab={tab} setTab={setTab} />
    {tab === 'mine' && <MineTab />}
    {tab === 'discover' && <DiscoverTab />}
    {tab === 'create' && <CreateTab />}
    {tab === 'code' && <CodeTab />}
  </main>;
}
