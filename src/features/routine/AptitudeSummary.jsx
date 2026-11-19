import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadCharacterAptitude, grantAptitude } from '../../lib/aptitude.js';
import { aptitudeBonus, accumulationCap, aptitudeSummary } from '../../rpg/aptitude.js';
import { fmt } from '../../rpg/describe.js';
import './routine.css';

// Aptidão de um personagem para mostrar na ficha, no resumo do token e nas telas do mestre.
// Devolve { allocation, received, distributed, available } ou null (sem migration 0026 ou sem permissão para ver).
export function useAptitudeFor({ characterId, tableId = null, enabled = true, refreshKey = 0 }) {
  const [apt, setApt] = useState(() => (enabled && characterId ? { loading: true } : null));
  useEffect(() => {
    let alive = true;
    if (!enabled || !characterId) { setApt(null); return undefined; }
    setApt(prev => prev || { loading: true });
    const pull = () => loadCharacterAptitude(characterId, tableId).then(a => { if (alive) setApt(a); }).catch(e => { if (alive) setApt({ error: e.message }); });
    pull();
    const timer = setInterval(pull, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, [characterId, tableId, enabled, refreshKey]);
  return apt;
}

const pct = b => `+${Math.round(b * 100)}%`;

// Lista só o que tem pontos: atributo ou perícia, pontos, bônus de XP/limite e o limite de acúmulo.
export default function AptitudeSummary({ apt, compact = false, always = false }) {
  if (apt?.loading) return always ? <p className="muted">Carregando a Aptidão…</p> : null;
  if (apt?.error) return always ? <p className="callout" role="alert">Não foi possível carregar a Aptidão desta ficha: {apt.error}</p> : null;
  if (!apt || (!apt.received && !Object.keys(apt.allocation || {}).length)) {
    return always ? <section className="apt-sum" aria-label="Aptidão">
      <p className="muted">Nenhum ponto de Aptidão recebido ainda. O mestre concede uma rolagem de 1d100 (o resultado são os pontos) e você os distribui entre seus atributos e perícias: +10% de XP e de limite de acúmulo por ponto em atributo, +5% por ponto em perícia, até +100%.</p>
    </section> : null;
  }
  const entries = Object.entries(apt.allocation || {}).map(([key, points]) => {
    const [kind, ...rest] = key.split(':');
    return { kind, name: rest.join(':'), points, bonus: aptitudeBonus(kind, points) };
  }).filter(e => e.points > 0).sort((a, b) => (a.kind === b.kind ? b.points - a.points : a.kind === 'attribute' ? -1 : 1));
  const s = aptitudeSummary([{ roll: apt.received }], apt.allocation);
  return <section className={`apt-sum${compact ? ' compact' : ''}`} aria-label="Aptidão">
    {!always && <h5>Aptidão</h5>}
    <p className="muted">Recebidos {s.received} · distribuídos {s.distributed} · <b className={s.available > 0 ? 'apt-free' : ''}>disponíveis {s.available}</b></p>
    {entries.length ? <ul>
      {entries.map(e => <li key={`${e.kind}${e.name}`}>
        <b>{e.name}</b> <small>({e.kind === 'attribute' ? 'atributo' : 'perícia'})</small> · {e.points} pt · XP {pct(e.bonus)} · limite {pct(e.bonus)} ({fmt(accumulationCap(e.kind, e.points))})
        {e.bonus >= 1 ? <small> · máximo</small> : null}
      </li>)}
    </ul> : <p className="muted">Nenhum ponto distribuído ainda.</p>}
  </section>;
}

// Botão do mestre no cartão do personagem (aba Grupo): concede uma rolagem de Aptidão (1d100, sorteada no servidor).
export function AptitudeGrant({ tableId, characterId, name }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const requestId = useRef(globalThis.crypto.randomUUID()); // o mesmo id até dar certo: clique duplo não sorteia duas vezes
  const give = useCallback(async () => {
    setBusy(true); setError('');
    try { setResult(await grantAptitude(tableId, characterId, requestId.current)); requestId.current = globalThis.crypto.randomUUID(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [tableId, characterId]);
  return <div className="apt-grant">
    <button type="button" className="outline" disabled={busy} onClick={give} title="Sorteia 1d100: o resultado é a quantidade de pontos de Aptidão que o personagem recebe">
      {busy ? 'Rolando…' : 'Conceder Aptidão (1d100)'}
    </button>
    {result && <p className="rq-result ok" role="status"><b>{name || 'Personagem'}: 1d100 = {result.roll}</b> · {result.received} ponto(s) recebido(s) no total.</p>}
    {error && <p role="alert" className="muted">{error}</p>}
  </div>;
}
