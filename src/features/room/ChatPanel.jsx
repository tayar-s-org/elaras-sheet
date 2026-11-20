import React, { useState } from 'react';
import { sendMessage } from '../../lib/room.js';
import { useStickyScroll } from './useStickyScroll.js';
import './roompanels.css';

const time = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const initial = name => (name || '?').trim()[0]?.toUpperCase() || '?';
const GROUP_MS = 5 * 60 * 1000; // mensagens seguidas da mesma pessoa dentro de 5 min ficam agrupadas

// Chat geral da mesa: todos veem tudo.
export default function ChatPanel({ tableId, me, members, messages, addMessage, disabled }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { ref: logRef, onScroll, hasNew, scrollToEnd } = useStickyScroll(messages.at(-1)?.id);
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));

  async function submit(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try { const sent = await sendMessage(tableId, text); scrollToEnd(); addMessage(sent); setBody(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const onKeyDown = e => { if (e.key === 'Enter' && !e.shiftKey) submit(e); };

  return <div className="chat2">
    <div className="chat2-stage">
    <div className="chat2-log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chat da mesa">
      {!messages.length && <div className="chat2-empty"><span aria-hidden="true">💬</span><p>Nenhuma mensagem ainda.<br />Diga olá para a mesa!</p></div>}
      {messages.map((m, i) => {
        const mine = m.user_id === me;
        const prev = messages[i - 1];
        const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at) - new Date(prev.created_at) < GROUP_MS;
        return <div key={m.id} className={`chat2-msg${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
          {!mine && (grouped ? <span className="chat2-avatar ghost" /> : <span className="chat2-avatar" aria-hidden="true">{initial(names[m.user_id])}</span>)}
          <div className="chat2-bubble">
            {!grouped && <div className="chat2-meta">{!mine && <strong>{names[m.user_id] || 'Jogador'}</strong>}<span>{time(m.created_at)}</span></div>}
            <p>{m.kind === 'whisper' && <em className="chat2-whisper">sussurro · </em>}{m.body}</p>
          </div>
        </div>;
      })}
    </div>
    {hasNew && <button type="button" className="chat2-new primary" onClick={scrollToEnd}>Novas mensagens ↓</button>}
    </div>
    <form className="chat2-form" onSubmit={submit}>
      <textarea aria-label="Mensagem" rows={1} maxLength={2000} value={body} disabled={disabled}
        placeholder={disabled ? 'Mesa encerrada' : 'Escreva uma mensagem… (Enter envia)'} onChange={e => setBody(e.target.value)} onKeyDown={onKeyDown} />
      <button className="primary" disabled={disabled || busy || !body.trim()}>Enviar</button>
    </form>
    {error && <p role="alert" className="chat2-error">{error}</p>}
  </div>;
}
