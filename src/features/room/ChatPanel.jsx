import React, { useEffect, useRef, useState } from 'react';
import { sendMessage } from '../../lib/room.js';

const time = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function ChatPanel({ tableId, me, members, messages, addMessage, disabled }) {
  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const names = Object.fromEntries(members.map(m => [m.user_id, m.profiles?.display_name || 'Jogador']));
  const others = members.filter(m => m.status === 'approved' && m.user_id !== me);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length]);
  async function submit(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError('');
    try { addMessage(await sendMessage(tableId, text, to || null)); setBody(''); }
    catch (err) { setError(err.message); }
  }
  return <div className="chat">
    <div className="chat-log" role="log" aria-live="polite">
      {!messages.length && <p className="muted">Nenhuma mensagem ainda. Diga olá!</p>}
      {messages.map(m => <p key={m.id} className={`chat-line${m.kind === 'whisper' ? ' whisper' : ''}${m.user_id === me ? ' mine' : ''}`}>
        <span className="chat-meta">{time(m.created_at)} · <strong>{names[m.user_id] || 'Jogador'}</strong>
          {m.kind === 'whisper' && <em> (sussurro para {m.to_user === me ? 'você' : names[m.to_user] || 'alguém'})</em>}</span>
        <span className="chat-body">{m.body}</span>
      </p>)}
      <div ref={endRef} />
    </div>
    <form className="chat-form" onSubmit={submit}>
      <select aria-label="Destinatário" value={to} onChange={e => setTo(e.target.value)} disabled={disabled}>
        <option value="">Para todos</option>
        {others.map(m => <option key={m.user_id} value={m.user_id}>Sussurrar para {m.profiles?.display_name}</option>)}
      </select>
      <input aria-label="Mensagem" maxLength={2000} value={body} disabled={disabled}
        placeholder={disabled ? 'Mesa encerrada' : 'Escreva uma mensagem'} onChange={e => setBody(e.target.value)} />
      <button className="primary" disabled={disabled || !body.trim()}>Enviar</button>
    </form>
    {error && <p role="alert" className="muted">{error}</p>}
  </div>;
}
