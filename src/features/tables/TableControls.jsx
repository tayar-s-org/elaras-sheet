import React, { useEffect, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { navigate } from '../../lib/router.js';
import { listMine } from '../../lib/cloud.js';
import { clearLastRoom } from '../../lib/lastRoom.js';
import DeleteTableDialog from './DeleteTableDialog.jsx';
import {
  updateTable, deleteTable, decideMember, leaveTable, setMemberCharacter,
  getInviteCode, rotateInvite, inviteLink, STATUS_LABEL,
} from '../../lib/tables.js';

// Escolha da ficha que representa a pessoa nesta mesa (vale para jogadores e para o mestre que quer jogar).
function CharacterPicker({ table, me, reload, run }) {
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { listMine().then(setAll).catch(e => { setAll([]); setError(e.message || 'Não foi possível carregar suas fichas.'); }); }, [table.id]);
  // Só entram as fichas desta mesa ou as antigas, sem mesa (que passam a ser desta). As de outra mesa aparecem desativadas, para explicar a ausência.
  const usable = (all || []).filter(c => !c.table_id || c.table_id === table.id);
  const elsewhere = (all || []).filter(c => c.table_id && c.table_id !== table.id);
  return <>
    <label className="field"><span>Sua ficha nesta mesa</span>
      <select value={me.character_id || ''} onChange={e => run(async () => { await setMemberCharacter(table.id, e.target.value || null); await reload(); })}>
        <option value="">Nenhuma</option>
        {usable.map(c => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}
        {elsewhere.map(c => <option key={c.id} value={c.id} disabled>{c.name || 'Sem nome'} (criada para a mesa {c.tables?.name || 'outra mesa'})</option>)}
      </select></label>
    {error && <p role="alert" className="muted">{error}</p>}
    {all && !usable.length && !error && <p className="muted">
      {all.length ? 'Suas fichas foram criadas para outras mesas e não podem ser usadas aqui. Crie uma ficha nova para esta mesa na tela de fichas.'
        : 'Você ainda não tem fichas salvas na sua conta. Crie uma ficha e aguarde o salvamento automático; ela aparece aqui.'}
    </p>}
  </>;
}

export function JoinApprovals({ table, members, reload, run }) {
  const pending = members.filter(m => m.status === 'pending');
  const decide = (userId, status) => run(async () => { await decideMember(table.id, userId, status); await reload(); });
  return <section className="item-card" aria-label="Pedidos de entrada">
    <h3>Pedidos de entrada ({pending.length})</h3>
    {!pending.length && <p className="muted">Nenhum pedido pendente.</p>}
    {pending.map(m => <div className="row" key={m.user_id}>
      <span><strong>{m.profiles?.display_name}</strong>{m.message ? ` — “${m.message}”` : ''}</span>
      <span>
        <button className="primary" onClick={() => decide(m.user_id, 'approved')}>Aprovar</button>{' '}
        <button className="outline" onClick={() => decide(m.user_id, 'rejected')}>Recusar</button>
      </span>
    </div>)}
  </section>;
}

function GmPanel({ table, me, members, reload, run, showJoinApprovals }) {
  const askConfirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { getInviteCode(table.id).then(setCode).catch(() => {}); }, [table.id]);
  const players = members.filter(m => m.role === 'player' && m.status === 'approved');
  const patch = changes => run(async () => { await updateTable(table.id, changes); await reload(); });
  const decide = (userId, status) => run(async () => { await decideMember(table.id, userId, status); await reload(); });
  return <>
    <section className="item-card">
      <h3>Administração da mesa</h3>
      <p className="muted">Gerencie o acesso e os convites aqui. Na sala, use o tabuleiro para preparar e jogar com criaturas.</p>
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
    {showJoinApprovals && <JoinApprovals table={table} members={members} reload={reload} run={run} />}
    <section className="item-card">
      <h3>Jogadores ({players.length}/{table.max_players})</h3>
      {!players.length && <p className="muted">Ainda não há jogadores aprovados.</p>}
      {players.map(m => <div className="row" key={m.user_id}>
        <span>{m.profiles?.display_name}</span>
        <button className="text-button danger" onClick={async () => await askConfirm({ title: 'Expulsar participante?', text: `Remover ${m.profiles?.display_name} da mesa?`, actionLabel: 'Expulsar', danger: true }) && decide(m.user_id, 'kicked')}>Expulsar</button>
      </div>)}
    </section>
    {me?.status === 'approved' && <section className="item-card">
      <h3>Sua ficha como jogador</h3>
      <p className="muted">Escolha uma ficha sua para jogar nesta mesa além de mestrar. Na sala, ela ganha token no tabuleiro e rolagens com os atributos da ficha.</p>
      <CharacterPicker table={table} me={me} reload={reload} run={run} />
    </section>}
    <section className="danger-zone" aria-label="Zona de perigo">
      <h3>Zona de perigo</h3>
      <p>Apagar a mesa remove tabuleiro, chat, rotinas e tudo o que ela guarda, para todos os jogadores. Antes de apagar, o app pede para você digitar o nome da mesa.</p>
      <div><button type="button" className="outline danger" onClick={() => setDeleting(true)}>Apagar esta mesa…</button></div>
    </section>
    {deleting && <DeleteTableDialog table={table} onCancel={() => setDeleting(false)}
      onConfirm={async () => { await deleteTable(table.id); clearLastRoom(table.id); navigate('/mesas'); }} />}
  </>;
}

function PlayerPanel({ table, me, members, reload, run }) {
  const askConfirm = useConfirm();
  const roster = members.filter(m => m.status === 'approved');
  return <>
    {me.status === 'approved' && <>
      <CharacterPicker table={table} me={me} reload={reload} run={run} />
      <section className="item-card"><h3>Participantes</h3>
        {roster.map(m => <div className="row" key={m.user_id}><span>{m.profiles?.display_name}</span><span className="muted">{m.role === 'gm' ? 'Mestre' : 'Jogador'}</span></div>)}
      </section>
    </>}
    <button className="text-button danger" onClick={async () => await askConfirm({ title: 'Sair da mesa?', text: 'Sair desta mesa?', actionLabel: 'Sair da mesa', danger: true }) && run(async () => { await leaveTable(table.id); clearLastRoom(table.id); navigate('/mesas'); })}>Sair da mesa</button>
  </>;
}


// Controles da mesa (mestre ou jogador); usados na pagina da mesa e na aba "Mesa" da sala.
export default function TableControls({ table, me, members, reload, run, isGm, showJoinApprovals = true }) {
  if (isGm) return <GmPanel showJoinApprovals={showJoinApprovals} table={table} me={me} members={members} reload={reload} run={run} />;
  if (me) return <PlayerPanel table={table} me={me} members={members} reload={reload} run={run} />;
  return null;
}
