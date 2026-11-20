import React from 'react';
import { TOPICS } from './topics.js';

export function AllQuestions({ onAsk, onClose }) {
  return (
    <div className="as-all" role="region" aria-label="Todas as perguntas">
      <div className="as-all-head"><strong>Todas as perguntas</strong><button type="button" className="as-icon" aria-label="Fechar a lista" onClick={onClose}>×</button></div>
      {TOPICS.map(t => (
        <details key={t.id}>
          <summary><span aria-hidden="true">{t.icon}</span> {t.label}</summary>
          <ul>{t.questions.map(q => <li key={q}><button type="button" onClick={() => onAsk(q)}>{q}</button></li>)}</ul>
        </details>
      ))}
    </div>
  );
}

export function ChatFooter({ showAll, onToggleAll, onOpenTopic, input, onInput, busy, onSubmit, inputRef }) {
  return (
    <div className="as-foot">
      <button type="button" className="as-all-btn" aria-expanded={showAll} onClick={onToggleAll}>{showAll ? 'Fechar a lista' : 'Ver todas as perguntas'}</button>
      <div className="as-topics" role="group" aria-label="Assuntos">
        {TOPICS.map(t => <button key={t.id} type="button" className="as-chip" onClick={() => onOpenTopic(t)}>{t.label}</button>)}
      </div>
      <form className="as-form" onSubmit={e => { e.preventDefault(); onSubmit(input); }}>
        <input ref={inputRef} value={input} onChange={e => onInput(e.target.value)} placeholder="Pergunte ao Arquivista…" aria-label="Sua pergunta" maxLength={200} autoComplete="off" enterKeyHint="send" />
        <button type="submit" className="as-send" disabled={busy || !input.trim()}>Enviar</button>
      </form>
    </div>
  );
}
