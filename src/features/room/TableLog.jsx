import React, { useEffect, useMemo, useRef } from 'react';
import { describeRoll } from '../../diceRoll.js';
import './tablelog.css';

const time = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const LIMIT = 80;

// Registro da mesa sob o tabuleiro: mensagens do chat e rolagens em ordem de chegada.
export default function TableLog({ messages, rolls, hidden, members, me }) {
  const boxRef = useRef(null);
  const names = useMemo(() => Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador'])), [members]);
  const entries = useMemo(() => {
    const list = [
      ...messages.map(m => ({ key: `m${m.id}`, at: m.created_at, type: 'msg', m })),
      ...rolls.filter(r => !hidden?.has(r.id)).map(r => ({ key: `r${r.id}`, at: r.created_at, type: 'roll', r })),
    ];
    return list.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(-LIMIT);
  }, [messages, rolls, hidden]);
  const lastKey = entries[entries.length - 1]?.key;
  // Rola so o proprio quadro (scrollIntoView arrastaria a pagina inteira).
  useEffect(() => { const el = boxRef.current; if (el) el.scrollTop = el.scrollHeight; }, [lastKey]);

  return <section className="table-log" aria-label="Registro da mesa">
    <div className="table-log-box" ref={boxRef} role="log" aria-live="polite">
      {!entries.length && <p className="muted">Nada por aqui ainda. Mensagens e rolagens da mesa aparecem neste registro.</p>}
      {entries.map(e => {
        if (e.type === 'msg') {
          const m = e.m;
          return <p key={e.key} className={`log-line${m.kind === 'whisper' ? ' whisper' : ''}${m.user_id === me ? ' mine' : ''}`}>
            <span className="log-time">{time(m.created_at)}</span>
            <strong>{names[m.user_id] || 'Jogador'}</strong>
            {m.kind === 'whisper' && <em> (sussurro para {m.to_user === me ? 'você' : names[m.to_user] || 'alguém'})</em>}
            <span>: {m.body}</span>
          </p>;
        }
        const r = e.r;
        const d = describeRoll(r);
        return <p key={e.key} className={`log-line log-roll ${d.tone}`}>
          <span className="log-time">{time(r.created_at)}</span>
          <strong>{names[r.user_id] || 'Jogador'}</strong>
          <span> rolou {r.label ? `${r.label} · ` : ''}{d.title}{r.visibility === 'gm' ? ' (só mestre)' : ''} → </span>
          <b className="log-total">{d.total}</b>
          {d.outcome && <span className="log-outcome"> {d.outcome}</span>}
          <span className="log-detail"> · {d.detail}</span>
        </p>;
      })}
    </div>
  </section>;
}
