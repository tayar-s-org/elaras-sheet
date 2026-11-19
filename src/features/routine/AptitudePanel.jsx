import React, { useMemo, useRef, useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { grantAptitude, saveAptitude } from '../../lib/aptitude.js';
import {
  aptitudeBonus, accumulationCap, aptitudeSummary, validateAllocation, cleanAllocation, aptitudeKey, pointsOf, pointsForMax, APTITUDE_STEP,
} from '../../rpg/aptitude.js';
import { ATTRIBUTES, SKILLS } from '../../rules.js';
import { fmt } from '../../rpg/describe.js';
import './routine.css';

const pct = b => `${Math.round(b * 100)}%`;
const dateText = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const uuid = () => globalThis.crypto.randomUUID();

function Row({ kind, name, points, locked, editable, available, onStep, onType, accumulated }) {
  const bonus = aptitudeBonus(kind, points);
  const cap = accumulationCap(kind, points);
  const maxed = points >= pointsForMax(kind);
  const over = accumulated > cap;
  return <tr className={points ? 'on' : ''}>
    <th scope="row">{name}</th>
    <td className="ap-ctl">
      {editable ? <>
        <button type="button" className="outline" aria-label={`Tirar um ponto de ${name}`} disabled={points <= locked} title={locked ? `${locked} ponto(s) já confirmado(s) não podem ser removidos` : ''} onClick={() => onStep(-1)}>−</button>
        <input type="number" min={locked} max="1000" value={points} aria-label={`Pontos de Aptidão em ${name}`} onChange={e => onType(Math.trunc(Number(e.target.value) || 0))} />
        <button type="button" className="outline" aria-label={`Dar um ponto a ${name}`} disabled={available <= 0} onClick={() => onStep(1)}>+</button>
      </> : <b>{points}</b>}
      {locked > 0 && <small className="muted ap-lock" title="Pontos confirmados são permanentes"> 🔒 {locked}</small>}
    </td>
    <td data-label="Bônus de XP" className={bonus ? 'pos' : ''}>{bonus ? `+${pct(bonus)}` : '0%'}{maxed && points > 0 ? <small title="Limite de +100% atingido: pontos extras não rendem mais"> máx.</small> : null}</td>
    <td data-label="Bônus no limite" className={bonus ? 'pos' : ''}>{bonus ? `+${pct(bonus)}` : '0%'}</td>
    <td data-label="Limite de acúmulo">{fmt(cap)} XP{over ? <small className="neg" title="A XP disponível já está acima deste limite: nada é apagado, só novos ganhos ficam bloqueados"> acima do limite</small> : null}</td>
  </tr>;
}

// Aptidão do personagem: o jogador distribui os pontos recebidos e o mestre concede novas rolagens de 1d100.
export default function AptitudePanel({ tableId, characterId, owner, isGm, closed, character, aptitude, progress, refresh }) {
  const askConfirm = useConfirm();
  const grants = aptitude?.grants?.[characterId] || [];
  const saved = aptitude?.allocation?.[characterId] || {};
  const log = aptitude?.log?.[characterId] || [];
  const [draft, setDraft] = useState(null); // distribuição em edição (null = igual à confirmada)
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [roll, setRoll] = useState(null);
  const requestId = useRef(uuid()); // mantido até a concessão dar certo: repetir o clique não sorteia de novo

  const sheet = useMemo(() => ({
    attributes: ATTRIBUTES,
    skills: SKILLS.map(([n]) => n).filter(n => (character?.skills?.[n] || 0) > 0),
  }), [character]);
  const current = draft || saved;
  const summary = aptitudeSummary(grants, current);
  const confirmed = aptitudeSummary(grants, saved);
  const problems = validateAllocation(current, summary.received, sheet, saved);
  const dirty = JSON.stringify(cleanAllocation(current)) !== JSON.stringify(cleanAllocation(saved));
  const accumulatedOf = (kind, name) => Math.max(0, ...(progress || []).filter(p => p.kind === kind && p.name === name).map(p => p.available));

  // Muda os pontos de um alvo a partir do rascunho mais recente (cliques rápidos não se perdem). `compute` recebe o valor atual.
  const setPoints = (kind, name, compute) => setDraft(prev => {
    const base = prev || saved;
    const key = aptitudeKey(kind, name);
    let value = compute(pointsOf(base, kind, name));
    value = Math.max(value, pointsOf(saved, kind, name)); // pontos já confirmados são permanentes
    const next = { ...base, [key]: value };
    if (!value) delete next[key];
    // nunca passa do que foi recebido: um número digitado alto é cortado ao que sobra
    const others = Object.entries(next).filter(([k]) => k !== key).reduce((s, [, v]) => s + v, 0);
    const limited = Math.max(0, Math.min(value, summary.received - others));
    if (limited !== value) { if (limited) next[key] = limited; else delete next[key]; }
    return next;
  });

  const run = async fn => { setBusy(true); setMessage(''); try { await fn(); await refresh?.(); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };
  const confirm = async () => {
    const accepted = await askConfirm({
      title: 'Confirmar distribuição?',
      text: 'Os pontos confirmados são permanentes e ficam vinculados aos atributos e perícias escolhidos.',
      actionLabel: 'Confirmar distribuição',
    });
    if (!accepted) return;
    return run(async () => {
      const r = await saveAptitude(tableId, characterId, cleanAllocation(current));
      setDraft(null);
      setMessage(`Distribuição confirmada: ${r.distributed} ponto(s) distribuído(s), ${r.available} disponível(is).`);
    });
  };
  const grant = () => run(async () => {
    const r = await grantAptitude(tableId, characterId, requestId.current);
    setRoll(r);
    requestId.current = uuid();
  });

  // Enquanto os dados não chegaram (ou se falharam) não mostra zeros nem "ainda não recebeu": isso parecia ausência de pontos.
  if (!aptitude) return <p className="muted" role="status">Carregando a Aptidão…</p>;
  if (aptitude.error) return <p className="callout" role="alert">Não foi possível carregar a Aptidão: {aptitude.error}</p>;
  return <div className="ap">
    <section className="ap-summary" aria-label="Aptidão do personagem">
      <h4>Aptidão do personagem</h4>
      <div className="ap-numbers">
        <div><b>{summary.received}</b><span>Total recebido</span></div>
        <div><b>{summary.distributed}</b><span>Distribuídos</span></div>
        <div className={summary.available < 0 ? 'bad' : ''}><b>{summary.available}</b><span>Disponíveis</span></div>
      </div>
      {summary.received === 0 && <p className="muted">Este personagem ainda não recebeu Aptidão. Só o mestre pode conceder uma rolagem de 1d100.</p>}
      {owner && confirmed.available > 0 && !draft && <p className="callout" role="status">Você tem <b>{confirmed.available}</b> ponto(s) de Aptidão para distribuir.</p>}
      <p className="muted ap-rule">Cada ponto em um atributo dá +10% de XP e +10% no limite de acúmulo dele; em uma perícia, +5% e +5%. O máximo é +100% por atributo ou perícia (10 pontos em um atributo, 20 em uma perícia). A Aptidão vale só para o alvo em que foi distribuída e só para a XP ganha daqui para frente. Os pontos que você confirma são permanentes: não podem ser removidos nem passados para outro alvo; só dá para acrescentar os que ainda estão disponíveis.</p>
    </section>

    {isGm && <section className="ap-gm" aria-label="Conceder Aptidão">
      <h4>Conceder Aptidão (mestre)</h4>
      <p className="muted">Sorteia 1d100 no servidor: o resultado é a quantidade de pontos que o personagem recebe.</p>
      <button type="button" className="primary" disabled={busy || closed} onClick={grant}>{busy ? 'Rolando…' : 'Conceder rolagem de Aptidão (1d100)'}</button>
      {roll && <p className="rq-result ok" role="status"><b>1d100 = {roll.roll}</b>{roll.fresh ? '' : ' (esta rolagem já tinha sido registrada)'} · o personagem agora tem {roll.received} ponto(s) recebido(s) no total.</p>}
    </section>}

    {message && <p role="status" className="callout">{message}</p>}
    {problems.length > 0 && owner && <ul className="tr-warnings" role="alert">{problems.map(p => <li key={p}>{p}</li>)}</ul>}

    {[['attribute', 'Atributos', ATTRIBUTES], ['skill', 'Perícias', sheet.skills]].map(([kind, title, names]) => <section key={kind} aria-label={title}>
      <h4>{title} <small className="muted">+{Math.round(APTITUDE_STEP[kind] * 100)}% por ponto</small></h4>
      {!names.length ? <p className="muted">Nenhuma perícia treinada na ficha. Só se distribui Aptidão em perícias que a ficha possui.</p> : <div className="th-scroll">
        <table className="ap-table">
          <thead><tr><th>{kind === 'attribute' ? 'Atributo' : 'Perícia'}</th><th>Aptidão</th><th>Bônus de XP</th><th>Bônus no limite</th><th>Limite de acúmulo</th></tr></thead>
          <tbody>{names.map(n => <Row key={n} kind={kind} name={n} points={pointsOf(current, kind, n)} locked={pointsOf(saved, kind, n)} editable={owner && !closed} available={summary.available}
            onStep={d => setPoints(kind, n, v => v + d)} onType={v => setPoints(kind, n, () => v)} accumulated={accumulatedOf(kind, n)} />)}</tbody>
        </table>
      </div>}
    </section>)}

    {owner && !closed && <div className="ap-actions">
      <button type="button" className="primary" disabled={busy || !dirty || problems.length > 0} onClick={confirm}>Confirmar distribuição</button>
      <button type="button" className="outline" disabled={busy || !dirty} onClick={() => setDraft(null)}>Desfazer alterações</button>
      {dirty && <span className="muted">Alterações ainda não confirmadas. Os pontos só passam a valer ao confirmar.</span>}
    </div>}

    <section aria-label="Histórico de Aptidão">
      <h4>Rolagens concedidas ({grants.length})</h4>
      {!grants.length ? <p className="muted">Nenhuma rolagem ainda.</p> : <ul className="th-list">
        {grants.map(g => <li key={g.id}>{dateText(g.created_at)} · 1d100 = <b>{g.roll}</b> → +{g.roll} ponto(s) · concedido pelo mestre</li>)}
      </ul>}
      {log.length > 0 && <details><summary>Alterações na distribuição ({log.length})</summary>
        <ul className="th-list">{log.map(l => {
          const total = Object.values(l.after_alloc || {}).reduce((s, v) => s + v, 0);
          const keys = [...new Set([...Object.keys(l.before_alloc || {}), ...Object.keys(l.after_alloc || {})])].filter(k => (l.before_alloc?.[k] || 0) !== (l.after_alloc?.[k] || 0));
          return <li key={l.id}>{dateText(l.created_at)} · {total} de {l.points_received} distribuídos · {keys.map(k => `${k.split(':').slice(1).join(':')}: ${l.before_alloc?.[k] || 0} → ${l.after_alloc?.[k] || 0}`).join('; ') || 'sem mudança de valores'}</li>;
        })}</ul>
      </details>}
    </section>
  </div>;
}
