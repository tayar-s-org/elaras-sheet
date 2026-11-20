import React, { useMemo, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { SKILLS } from '../../rules.js';
import {
  createRequest, editRequest, deleteRequest, decideRequest, attemptUpgrade, REQUEST_STATUS, REQUEST_KIND,
} from '../../lib/requests.js';
import { astuciaDice, attemptDifficulty, ATTEMPT_DICE, MAX_IMPROVEMENTS, UPGRADE_XP_CHARGE } from '../../rpg/magicStudy.js';
import { fmt } from '../../rpg/describe.js';
import { jobTotals } from '../../rpg/work.js';
import './routine.css';

const SKILL_NAMES = SKILLS.map(([n]) => n);
const TIER_LABEL = ['Horas 1 a 4', 'Horas 5 a 8', 'Horas 9 a 12'];
const num = v => (v === '' || v === null || v === undefined ? 0 : Number(v));

function XpCostNote({ cost }) {
  if (cost === null || cost === undefined || cost === '') return <span className="muted">Custo de XP: o mestre ainda não definiu.</span>;
  return <span>Custo de XP definido pelo mestre: <b>{fmt(cost)}</b>{UPGRADE_XP_CHARGE === 'none' ? <small className="muted"> (por enquanto só informativo: nada é debitado; quando cobrar ainda será decidido)</small> : null}</span>;
}

// Formulário do mestre para decidir uma solicitação. Em trabalhos mostra a prévia do custo e dos ganhos antes de aprovar.
function DecideForm({ r, busy, onDecide }) {
  const initial = r.kind === 'work'
    ? { name: r.config?.name || r.title || '', description: r.config?.description || r.body, staminaTiers: r.config?.staminaTiers || [0, 0, 0], manaTiers: r.config?.manaTiers || [0, 0, 0], pay: r.config?.pay ?? 0, xp: r.config?.xp ?? 0, xpSkill: r.config?.xpSkill || '' }
    : { description: r.config?.description || r.body, xp_cost: r.config?.xp_cost ?? '' };
  const [cfg, setCfg] = useState(initial);
  const [note, setNote] = useState(r.gm_note || '');
  const set = patch => setCfg(c => ({ ...c, ...patch }));
  const tier = (key, i, v) => set({ [key]: cfg[key].map((x, j) => (j === i ? v : x)) });
  const clean = () => (r.kind === 'work'
    ? { ...cfg, staminaTiers: cfg.staminaTiers.map(num), manaTiers: cfg.manaTiers.map(num), pay: num(cfg.pay), xp: num(cfg.xp) }
    : { ...cfg, xp_cost: cfg.xp_cost === '' ? 0 : num(cfg.xp_cost) });
  const totals = r.kind === 'work' ? [4, 8, 12].map(h => ({ h, ...jobTotals(clean(), h) })) : null;
  return <div className="rq-decide">
    {r.kind === 'work' ? <>
      <label className="field"><span>Nome do trabalho</span><input value={cfg.name} maxLength={60} onChange={e => set({ name: e.target.value })} /></label>
      <label className="field"><span>Descrição</span><textarea rows={2} maxLength={1000} value={cfg.description} onChange={e => set({ description: e.target.value })} /></label>
      <div className="rq-tiers">
        {TIER_LABEL.map((label, i) => <fieldset key={label}><legend>{label}</legend>
          <label className="field"><span>Estamina/h</span><input type="number" min="0" max="50" value={cfg.staminaTiers[i]} onChange={e => tier('staminaTiers', i, e.target.value)} /></label>
          <label className="field"><span>Mana/h</span><input type="number" min="0" max="50" value={cfg.manaTiers[i]} onChange={e => tier('manaTiers', i, e.target.value)} /></label>
        </fieldset>)}
      </div>
      <div className="rq-row">
        <label className="field"><span>Pagamento por hora</span><input type="number" min="0" max="4000" value={cfg.pay} onChange={e => set({ pay: e.target.value })} /></label>
        <label className="field"><span>XP por hora</span><input type="number" min="0" max="10" step="0.25" value={cfg.xp} onChange={e => set({ xp: e.target.value })} /></label>
        <label className="field"><span>Perícia que recebe o XP</span>
          <select value={cfg.xpSkill} onChange={e => set({ xpSkill: e.target.value })}><option value="">—</option>{SKILL_NAMES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      <table className="rq-preview"><caption>Prévia do que o jogador gasta e ganha (o limite é de 12 horas por dia)</caption>
        <thead><tr><th>Horas</th><th>Estamina</th><th>Mana</th><th>Pagamento</th><th>XP</th></tr></thead>
        <tbody>{totals.map(t => <tr key={t.h}><td>{t.h}h</td><td>−{fmt(t.stamina)}</td><td>−{fmt(t.mana)}</td><td>${fmt(t.pay)}</td><td>+{fmt(t.xp)}{cfg.xpSkill ? ` ${cfg.xpSkill}` : ''}</td></tr>)}</tbody>
      </table>
    </> : <>
      <label className="field"><span>O que muda no feitiço (vai para a ficha e o token quando conquistado)</span><textarea rows={3} maxLength={2000} value={cfg.description} onChange={e => set({ description: e.target.value })} /></label>
      <label className="field"><span>Custo de XP da melhoria (definido por você)</span><input type="number" min="0" value={cfg.xp_cost} onChange={e => set({ xp_cost: e.target.value })} placeholder="Deixe em branco se não houver" /></label>
      <p className="muted rq-hint">O custo fica registrado e visível ao jogador. A regra de quando ele é cobrado ainda não foi definida, então nada é debitado por enquanto.</p>
    </>}
    <label className="field"><span>Nota para o jogador (obrigatória ao rejeitar ou pedir alterações)</span><input value={note} maxLength={500} onChange={e => setNote(e.target.value)} /></label>
    <div className="rq-actions">
      <button type="button" className="primary" disabled={busy} onClick={() => onDecide('approved', { config: clean(), note: '' })}>{r.status === 'approved' ? 'Salvar configuração' : 'Aprovar'}</button>
      <button type="button" className="outline" disabled={busy || !note.trim()} onClick={() => onDecide('changes', { note })}>Pedir alterações</button>
      <button type="button" className="outline" disabled={busy || !note.trim()} onClick={() => onDecide('rejected', { note })}>Rejeitar</button>
    </div>
  </div>;
}

function JobSummary({ cfg }) {
  const tiers = TIER_LABEL.map((l, i) => `${l}: −${fmt(num(cfg.staminaTiers?.[i]))} estamina, −${fmt(num(cfg.manaTiers?.[i]))} mana`);
  return <ul className="rq-summary">
    {tiers.map(t => <li key={t}>{t}</li>)}
    <li>Pagamento: <b>${fmt(num(cfg.pay))}</b> por hora · XP: <b>+{fmt(num(cfg.xp))}</b>{cfg.xpSkill ? ` em ${cfg.xpSkill}` : ''} por hora</li>
  </ul>;
}

function AttemptPanel({ r, training, spellProgress, spellName, onDone }) {
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const dice = astuciaDice(training?.study_hours || 0, training?.astucia_dice_spent || 0);
  const sp = spellProgress?.[r.spell_id] || { pity: 0, improvements: 0 };
  const diff = attemptDifficulty(sp.improvements, sp.pity);
  const go = async () => {
    if (!(await askConfirm({ title: 'Tentar aprimoramento?', text: `Tentar aprimorar ${spellName}? A tentativa gasta ${ATTEMPT_DICE} dados de Astúcia, dê certo ou não.`, actionLabel: 'Tentar aprimorar' }))) return;
    setBusy(true); setError('');
    try { setResult(await attemptUpgrade(r.id)); onDone?.(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="rq-attempt">
    <p><b>Dados de Astúcia:</b> {dice.available} disponíveis ({dice.earned} ganhos, {dice.spent} gastos) · faltam {fmt(dice.hoursToNext)} h de Estudo para o próximo</p>
    <p><b>Melhorias do feitiço:</b> {sp.improvements}/{MAX_IMPROVEMENTS} · <b>Pity:</b> {sp.pity}/5{sp.pity ? ` (dificuldade −${sp.pity * 10}%)` : ''}</p>
    {diff ? <p><b>Dificuldade desta tentativa:</b> {fmt(diff.effective)}{diff.pity ? ` (tabela: ${diff.base})` : ''} · a soma de {ATTEMPT_DICE} dados precisa ser maior que isso</p> : <p className="muted">Este feitiço já tem o máximo de melhorias.</p>}
    <p><XpCostNote cost={r.config?.xp_cost} /></p>
    <button type="button" className="primary" disabled={busy || !dice.canAttempt || !diff} title={dice.canAttempt ? '' : `São necessários ${ATTEMPT_DICE} dados de Astúcia`} onClick={go}>{busy ? 'Rolando…' : 'Tentar Aprimorar Feitiço'}</button>
    {!dice.canAttempt && <span className="muted"> Você precisa de {ATTEMPT_DICE} dados de Astúcia disponíveis.</span>}
    {error && <p role="alert" className="muted">{error}</p>}
    {result && <div className={`rq-result ${result.success ? 'ok' : 'bad'}`} role="status">
      <b>{result.success ? 'Sucesso! O feitiço foi aprimorado.' : 'Não foi dessa vez.'}</b>
      <p>{ATTEMPT_DICE}d{result.die}{result.bonus ? `+${result.bonus}` : ''} = <b>{result.total}</b> contra {fmt(result.requiredEffective)}{result.pityBefore ? ` (tabela ${result.requiredBase})` : ''}. Pity: {result.pityBefore} → {result.pityAfter}.</p>
      <p className="muted rq-rolls">Dados: {result.rolls.join(', ')}</p>
    </div>}
  </div>;
}

export function RequestCard({ r, isGm, owner, closed, who, spellName, training, spellProgress, refresh, onError }) {
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: r.title, body: r.body });
  const run = async fn => { setBusy(true); onError?.(''); try { await fn(); await refresh?.(); } catch (e) { onError?.(e.message); } finally { setBusy(false); } };
  const canEditText = owner && !closed && r.status !== 'done';
  return <article className={`rq-card st-${r.status}`}>
    <header>
      <h4>{r.kind === 'work' ? (r.config?.name || r.title || 'Trabalho') : `Melhoria: ${spellName}`}</h4>
      <span className={`rq-status st-${r.status}`}>{REQUEST_STATUS[r.status]}</span>
      <span className="muted">{REQUEST_KIND[r.kind]}{who ? ` · ${who}` : ''}</span>
    </header>
    {editing ? <div className="rq-edit">
      {r.kind === 'work' && <label className="field"><span>Título</span><input value={draft.title} maxLength={80} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} /></label>}
      <label className="field"><span>Sugestão</span><textarea rows={3} maxLength={2000} value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} /></label>
      <div className="rq-actions">
        <button type="button" className="primary" disabled={busy || !draft.body.trim()} onClick={() => run(async () => { await editRequest(r.id, draft); setEditing(false); })}>Salvar e reenviar</button>
        <button type="button" className="outline" onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    </div> : <p className="rq-body">{r.body}</p>}
    {r.gm_note && (r.status === 'changes' || r.status === 'rejected') && <p className="callout" role="note"><b>Mestre:</b> {r.gm_note}</p>}
    {r.status === 'approved' && r.kind === 'work' && <JobSummary cfg={r.config} />}
    {r.kind === 'spell_study' && r.status !== 'done' && r.config?.description && r.status === 'approved' && <p className="muted rq-desc">Aprovado como: {r.config.description}</p>}
    {r.kind === 'spell_study' && r.status === 'done' && <p className="muted">Melhoria conquistada: {r.config?.description || r.body}</p>}
    {r.kind === 'spell_study' && r.status === 'approved' && owner && !closed && <AttemptPanel r={r} training={training} spellProgress={spellProgress} spellName={spellName} onDone={refresh} />}
    {r.kind === 'spell_study' && r.status === 'approved' && !owner && <p><XpCostNote cost={r.config?.xp_cost} /></p>}
    {isGm && !closed && r.status !== 'done' && <details className="rq-gm" open={r.status === 'pending'}><summary>{r.status === 'approved' ? 'Ajustar configuração' : 'Decidir'}</summary><DecideForm r={r} busy={busy} onDecide={(status, o) => run(() => decideRequest(r.id, status, o))} /></details>}
    {canEditText && !editing && <div className="rq-actions">
      {r.status !== 'approved' || r.kind === 'work' ? <button type="button" className="outline" onClick={() => { setDraft({ title: r.title, body: r.body }); setEditing(true); }}>Editar sugestão</button> : null}
      <button type="button" className="text-button danger" disabled={busy} onClick={async () => { if (await askConfirm({ title: 'Apagar sugestão?', text: 'Apagar esta sugestão?', actionLabel: 'Apagar sugestão', danger: true })) run(() => deleteRequest(r.id)); }}>Apagar</button>
    </div>}
  </article>;
}

function NewRequest({ tableId, characterId, stats, onCreated, onError }) {
  const [kind, setKind] = useState('work');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spell, setSpell] = useState('');
  const [busy, setBusy] = useState(false);
  const trained = stats.spells.filter(s => stats.trainedSpells.includes(s.id));
  const ready = body.trim() && (kind === 'work' ? title.trim() : spell);
  const send = async () => {
    setBusy(true); onError('');
    try { await createRequest(tableId, characterId, { kind, title, body, spellId: kind === 'spell_study' ? spell : null }); setTitle(''); setBody(''); onCreated(); } catch (e) { onError(e.message); } finally { setBusy(false); }
  };
  return <section className="rq-new" aria-label="Nova sugestão">
    <h4>Enviar sugestão ao mestre</h4>
    <div className="tabs-row" role="tablist" aria-label="Tipo de sugestão">
      <button type="button" role="tab" aria-selected={kind === 'work'} className={kind === 'work' ? 'primary' : 'outline'} onClick={() => setKind('work')}>Trabalho</button>
      <button type="button" role="tab" aria-selected={kind === 'spell_study'} className={kind === 'spell_study' ? 'primary' : 'outline'} onClick={() => setKind('spell_study')}>Melhoria de feitiço</button>
    </div>
    {kind === 'work'
      ? <label className="field"><span>Que trabalho? (ex.: ferreiro, mercenário, cozinheiro)</span><input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
      : <label className="field"><span>Feitiço (só os que já passaram pelo treinamento)</span>
        <select value={spell} onChange={e => setSpell(e.target.value)}><option value="">Escolha…</option>{trained.map(s => <option key={s.id} value={s.id}>{s.name || 'Sem nome'}</option>)}</select></label>}
    <label className="field"><span>{kind === 'work' ? 'Descreva o trabalho' : 'O que você quer modificar? (ex.: atingir mais inimigos, +1d4 de dano, mais alcance, efeito secundário)'}</span>
      <textarea rows={3} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} /></label>
    <button type="button" className="primary" disabled={busy || !ready} onClick={send}>{busy ? 'Enviando…' : 'Enviar ao mestre'}</button>
    {kind === 'spell_study' && !trained.length && <p className="muted">Nenhum feitiço treinado ainda. Treine um feitiço na rotina primeiro.</p>}
  </section>;
}

// Aba "Solicitações" de um personagem: o dono envia e acompanha sugestões; o mestre decide.
export default function RequestsPanel({ tableId, characterId, owner, isGm, closed, requests, stats, training, spellProgress, refresh }) {
  const [error, setError] = useState('');
  const mine = useMemo(() => requests.filter(r => r.character_id === characterId), [requests, characterId]);
  const nameOf = id => stats.spells.find(s => s.id === id)?.name || 'feitiço';
  return <div className="rq-panel">
    {error && <p role="alert" className="callout">{error}</p>}
    {owner && !closed && <NewRequest tableId={tableId} characterId={characterId} stats={stats} onCreated={refresh} onError={setError} />}
    <h4>Sugestões ({mine.length})</h4>
    {!mine.length ? <p className="muted">Nenhuma sugestão ainda.</p> : <div className="rq-list">
      {mine.map(r => <RequestCard key={r.id} r={r} isGm={isGm} owner={owner} closed={closed} spellName={nameOf(r.spell_id)} training={training} spellProgress={spellProgress} refresh={refresh} onError={setError} />)}
    </div>}
  </div>;
}
