import React, { useEffect, useState } from 'react';
import { navigate } from '../../lib/router.js';
import { listMine } from '../../lib/cloud.js';
import { clearLastRoom } from '../../lib/lastRoom.js';
import {
  updateTable, deleteTable, decideMember, leaveTable, setMemberCharacter,
  getInviteCode, rotateInvite, inviteLink, STATUS_LABEL,
} from '../../lib/tables.js';

// Escolha da ficha que representa a pessoa nesta mesa (vale para jogadores e para o mestre que quer jogar).
function CharacterPicker({ table, me, reload, run }) {
  const [characters, setCharacters] = useState([]);
  useEffect(() => { listMine().then(setCharacters).catch(() => {}); }, []);
  return <label className="field"><span>Sua ficha nesta mesa</span>
    <select value={me.character_id || ''} onChange={e => run(async () => { await setMemberCharacter(table.id, e.target.value || null); await reload(); })}>
      <option value="">Nenhuma</option>
      {characters.map(c => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
    </select></label>;
}

function GmPanel({ table, me, members, reload, run }) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { getInviteCode(table.id).then(setCode).catch(() => {}); }, [table.id]);
  const pending = members.filter(m => m.status === 'pending');
  const players = members.filter(m => m.role === 'player' && m.status === 'approved');
  const patch = changes => run(async () => { await updateTable(table.id, changes); await reload(); });
  const decide = (userId, status) => run(async () => { await decideMember(table.id, userId, status); await reload(); });
  return <>
    {me?.status === 'approved' && <section className="item-card">
      <h3>Jogar também</h3>
      <p className="muted">Escolha uma ficha sua para jogar nesta mesa além de mestrar. Na sala, ela ganha token no tabuleiro e rolagens com os atributos da ficha.</p>
      <CharacterPicker table={table} me={me} reload={reload} run={run} />
    </section>}
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
    <button className="text-button danger" onClick={() => window.confirm('Apagar esta mesa e todos os vínculos? Isso não pode ser desfeito.') && run(async () => { await deleteTable(table.id); clearLastRoom(table.id); navigate('/mesas'); })}>Apagar mesa</button>
  </>;
}

function PlayerPanel({ table, me, members, reload, run }) {
  const roster = members.filter(m => m.status === 'approved');
  return <>
    {me.status === 'pending' && <div className="callout"><b>Aguardando aprovação do mestre</b><p>Você será avisado aqui quando o pedido for decidido.</p></div>}
    {me.status === 'approved' && <>
      <CharacterPicker table={table} me={me} reload={reload} run={run} />
      <section className="item-card"><h3>Participantes</h3>
        {roster.map(m => <div className="row" key={m.user_id}><span>{m.profiles?.display_name}</span><span className="muted">{m.role === 'gm' ? 'Mestre' : 'Jogador'}</span></div>)}
      </section>
    </>}
    <button className="text-button danger" onClick={() => window.confirm('Sair desta mesa?') && run(async () => { await leaveTable(table.id); clearLastRoom(table.id); navigate('/mesas'); })}>Sair da mesa</button>
  </>;
}


// Controles da mesa (mestre ou jogador); usados na pagina da mesa e na aba "Mesa" da sala.
export default function TableControls({ table, me, members, reload, run, isGm }) {
  if (isGm) return <GmPanel table={table} me={me} members={members} reload={reload} run={run} />;
  if (me) return <PlayerPanel table={table} me={me} members={members} reload={reload} run={run} />;
  return null;
}
