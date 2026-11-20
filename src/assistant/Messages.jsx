import React, { useEffect, useRef, useState } from 'react';
import { AVATAR } from './branding.js';

const LIST_PREVIEW = 24;

// **negrito** → <strong>; nada mais é interpretado (o texto do livro nunca vira HTML).
function Rich({ text }) {
  return <>{String(text).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}</>;
}

function Paragraphs({ text }) {
  return String(text).split('\n\n').map((p, i) => <p key={i}>{p}</p>);
}

function Quote({ block }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <figure className="as-quote">
      {block.label && <figcaption>{block.label}</figcaption>}
      <div><Paragraphs text={expanded && block.full ? block.full : block.text} /></div>
      {block.full && <button type="button" className="as-more" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? 'Mostrar menos' : 'Ler o trecho completo'}</button>}
    </figure>
  );
}

function ChipList({ items, onAsk, limit }) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? items.slice(0, limit) : items;
  return (
    <div className="as-chips">
      {shown.map(item => <button key={`${item.label}-${item.question}`} type="button" className="as-chip" onClick={() => onAsk(item.question, item.label)}>{item.label}</button>)}
      {limit && items.length > limit && <button type="button" className="as-chip as-chip-more" onClick={() => setAll(v => !v)}>{all ? 'Mostrar menos' : `Mostrar todos (${items.length})`}</button>}
    </div>
  );
}

function Blocks({ blocks, onAsk }) {
  return blocks.map((block, i) => {
    if (block.type === 'text') return <p key={i} className={block.text === '—' ? 'as-sep' : undefined}><Rich text={block.text} /></p>;
    if (block.type === 'facts') return <dl key={i} className="as-facts">{block.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
    if (block.type === 'quote') return <Quote key={i} block={block} />;
    if (block.type === 'list') return <ChipList key={i} items={block.items} onAsk={onAsk} limit={LIST_PREVIEW} />;
    return null;
  });
}

function Message({ message, onAsk, onOpenPage }) {
  if (message.role === 'user') return <div className="as-row as-user"><div className="as-bubble">{message.text}</div></div>;
  return (
    <div className="as-row as-bot">
      <img className="as-mini" src={AVATAR} alt="" width="34" height="34" />
      <div className="as-bubble">
        <Blocks blocks={message.blocks} onAsk={onAsk} />
        {message.source?.length > 0 && (
          <p className="as-source">
            <span aria-hidden="true">📖</span> Livro, {message.source.slice(0, 3).map((s, i) => (
              <React.Fragment key={s.page}>{i > 0 && ', '}<button type="button" className="as-page" title={`Abrir a página ${s.page} do PDF`} onClick={() => onOpenPage(s.page)}>pág. {s.printed}</button></React.Fragment>
            ))}
          </p>
        )}
        {message.chips?.length > 0 && <ChipList items={message.chips} onAsk={onAsk} />}
      </div>
    </div>
  );
}

function Typing() {
  return <div className="as-row as-bot" role="status" aria-label="O arquivista está procurando no livro"><img className="as-mini" src={AVATAR} alt="" width="34" height="34" /><div className="as-bubble as-typing"><i /><i /><i /></div></div>;
}

export function ChatLog({ messages, busy, onAsk, onOpenPage }) {
  const log = useRef(null);
  const botStart = useRef(null);
  const lastBotIndex = messages.reduce((acc, m, i) => (m.role === 'bot' ? i : acc), -1);

  // Novas mensagens: respostas do assistente começam a ser lidas do topo; as do usuário rolam até o fim.
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'bot' && lastMsg.reply && botStart.current) el.scrollTo({ top: Math.max(0, botStart.current.offsetTop - 6), behavior: 'smooth' });
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  return (
    <div className="as-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
      {messages.map((m, i) => (
        <div key={m.id} ref={i === lastBotIndex ? botStart : undefined}><Message message={m} onAsk={onAsk} onOpenPage={onOpenPage} /></div>
      ))}
      {busy && <Typing />}
    </div>
  );
}
