import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TOPICS, STARTER_QUESTIONS } from './topics.js';
import './assistant.css';

// A foto do assistente é o rosto do personagem do site (a mesma do logo). Para usar outra imagem quadrada,
// coloque em public/assets/ e troque o caminho aqui.
const AVATAR = `${import.meta.env.BASE_URL}assets/logo.png`;
const NAME = 'Arquivista';
const HIDDEN_KEY = 'elara-assistant-hidden';
const TOTAL_PAGES = 218;
const LIST_PREVIEW = 24;

// Posição do botão (arrastável): distância, em px, até a borda direita e a inferior da janela. Sem valor salvo, vale o canto padrão do CSS.
const POS_KEY = 'elara-assistant-pos';
const FAB_SIZE = 62;
const EDGE = 8;
const SHEET_MAX = 520; // abaixo disso o chat vira uma folha na base da tela e só o botão é arrastável
// Tamanho útil da janela (sem a barra de rolagem): é a referência do "right/bottom" de um elemento fixo.
const viewport = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const clampPos = p => ({ right: clamp(p.right, EDGE, viewport().w - FAB_SIZE - EDGE), bottom: clamp(p.bottom, EDGE, viewport().h - FAB_SIZE - EDGE) });
const readPos = () => {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY));
    return p && Number.isFinite(p.right) && Number.isFinite(p.bottom) ? clampPos(p) : null;
  } catch { return null; }
};
const savePos = p => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* sem storage: vale só nesta sessão */ } };

// O chat fica ancorado ao botão: abre para o lado (cima/baixo, esquerda/direita) onde há mais espaço na tela.
function panelStyle(pos, vp) {
  if (vp.w <= SHEET_MAX) return undefined;
  const a = pos || { right: 16, bottom: 16 };
  const width = Math.min(392, vp.w - 24);
  const above = vp.h - a.bottom - FAB_SIZE;
  const below = a.bottom;
  const style = { width };
  if (above >= 360 || above >= below) {
    style.bottom = a.bottom + FAB_SIZE + 12; style.top = 'auto';
    style.height = Math.max(240, Math.min(640, above - 12 - EDGE));
  } else {
    style.top = vp.h - a.bottom + 12; style.bottom = 'auto';
    style.height = Math.max(240, Math.min(640, below - 12 - EDGE));
  }
  if (a.right + FAB_SIZE / 2 < vp.w / 2) { style.right = clamp(a.right, EDGE, vp.w - width - EDGE); style.left = 'auto'; }
  else { style.left = clamp(vp.w - a.right - FAB_SIZE, EDGE, vp.w - width - EDGE); style.right = 'auto'; }
  return style;
}

const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; } };
const saveHidden = value => { try { localStorage.setItem(HIDDEN_KEY, value ? '1' : '0'); } catch { /* sem storage: vale só nesta sessão */ } };
const pageImage = page => `${import.meta.env.BASE_URL}assets/book/${page}.webp`;

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

function PageViewer({ page, onClose, onGo }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [page]);
  return (
    <div className="as-viewer" role="dialog" aria-modal="true" aria-label={`Página ${page} do livro`} onClick={onClose}>
      <div className="as-viewer-box" onClick={e => e.stopPropagation()}>
        <header>
          <strong>Página {Math.max(1, page - 2)} do livro</strong>
          <span>PDF {page} de {TOTAL_PAGES}</span>
          <button type="button" className="as-icon" aria-label="Fechar a página" onClick={onClose}>×</button>
        </header>
        <div className="as-viewer-scroll">
          {failed ? <p role="alert">Não foi possível carregar a imagem da página.</p> : <img src={pageImage(page)} alt={`Página ${page} do PDF do livro`} onError={() => setFailed(true)} />}
        </div>
        <footer>
          <button type="button" className="outline" disabled={page <= 1} onClick={() => onGo(page - 1)}>← Anterior</button>
          <button type="button" className="outline" disabled={page >= TOTAL_PAGES} onClick={() => onGo(page + 1)}>Próxima →</button>
        </footer>
      </div>
    </div>
  );
}

const welcome = () => ({
  id: 0, role: 'bot', source: [], chips: STARTER_QUESTIONS.map(q => ({ label: q, question: q })),
  blocks: [
    { type: 'text', text: 'Oi! **Pergunte o que quiser** sobre as regras: poderes, vantagens, perícias, combate, equipamentos ou criaturas.' },
    { type: 'text', text: 'Eu respondo **só com o que está no livro** e digo de qual página tirei (se o seu mestre mudou alguma regra, vale a palavra dele). Para ver tudo, toque em **Ver todas as perguntas**.' },
    { type: 'text', text: 'Comece por aqui:' },
  ],
});

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const [messages, setMessages] = useState(() => [welcome()]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [viewer, setViewer] = useState(null);
  const counter = useRef(1);
  const last = useRef(null);
  const brain = useRef(null);
  const log = useRef(null);
  const inputRef = useRef(null);
  const fab = useRef(null);
  const botStart = useRef(null);

  const push = useCallback(message => setMessages(prev => [...prev, { id: counter.current++, ...message }]), []);

  const ask = useCallback(async (question, shown) => {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setShowAll(false);
    push({ role: 'user', text: shown || q });
    setInput('');
    setBusy(true);
    const started = Date.now();
    try {
      if (!brain.current) brain.current = await (await import('./brain.js')).loadBrain();
      const result = brain.current.ask(q, { last: last.current });
      if (result?.entity) last.current = result.entity.id;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 380 - (Date.now() - started)))); // dá tempo de ler que está "procurando"
      // Sem resposta no livro: oferece os assuntos da árvore em vez de deixar o usuário num beco sem saída.
      const lost = ['none', 'clarify'].includes(result.kind);
      const topicChips = TOPICS.slice(0, 6).map(t => ({ label: `${t.icon} ${t.label}`, question: `__topic:${t.id}` }));
      const chips = lost ? [...(result.chips || []), ...topicChips] : result.chips;
      push({ role: 'bot', blocks: result.blocks, source: result.source, chips, reply: true });
    } catch {
      push({ role: 'bot', blocks: [{ type: 'text', text: 'Não consegui abrir o livro agora. Verifique a conexão e tente de novo.' }], source: [], chips: [], reply: true });
    } finally {
      setBusy(false);
    }
  }, [busy, push]);

  const openTopic = useCallback(topic => {
    setShowAll(false);
    push({ role: 'user', text: `${topic.icon} ${topic.label}` });
    push({ role: 'bot', source: [], reply: true, blocks: [{ type: 'text', text: `Sobre **${topic.label}**, o que você quer saber?` }], chips: topic.questions.map(q => ({ label: q, question: q })) });
  }, [push]);

  // Chips especiais "__topic:id" voltam para o nível 1 da árvore.
  const onAsk = useCallback(question => {
    const topic = String(question).startsWith('__topic:') && TOPICS.find(t => `__topic:${t.id}` === question);
    if (topic) openTopic(topic); else ask(question);
  }, [ask, openTopic]);

  // Novas mensagens: respostas do assistente começam a ser lidas do topo; as do usuário rolam até o fim.
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'bot' && lastMsg.reply && botStart.current) el.scrollTo({ top: Math.max(0, botStart.current.offsetTop - 6), behavior: 'smooth' });
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return undefined;
    if (!window.matchMedia?.('(pointer: coarse)').matches) setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = event => {
      if (event.key !== 'Escape') return;
      if (viewer) setViewer(null); else if (showAll) setShowAll(false); else { setOpen(false); fab.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, viewer, showAll]);

  // Arrastar: o botão (sempre) e o topo do chat (em telas largas) movem o assistente. Um toque sem mover continua abrindo/fechando.
  const [pos, setPos] = useState(readPos);
  const [vp, setVp] = useState(() => ({ w: viewport().w, h: viewport().h }));
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const justDragged = useRef(false);
  useEffect(() => {
    const onResize = () => { setVp({ w: viewport().w, h: viewport().h }); setPos(p => (p ? clampPos(p) : p)); };
    onResize();
    window.addEventListener('resize', onResize);
    // a barra de rolagem aparece/some quando a página carrega ou muda: isso muda a largura útil sem disparar "resize"
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(document.documentElement);
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect(); };
  }, []);
  const beginDrag = event => {
    if (event.button > 0) return;
    if (event.currentTarget !== fab.current && event.target.closest('button, a, input')) return;
    const rect = fab.current?.getBoundingClientRect();
    const start = pos || (rect ? { right: viewport().w - rect.right, bottom: viewport().h - rect.bottom } : { right: 16, bottom: 16 });
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start, moved: false, last: null };
    justDragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveDrag = event => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x, dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    d.last = clampPos({ right: d.start.right - dx, bottom: d.start.bottom - dy });
    setPos(d.last);
  };
  const endDrag = event => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    justDragged.current = true; // o "click" que vem logo depois do arrasto não deve abrir nem fechar o chat
    setDragging(false);
    if (d.last) savePos(d.last);
  };
  const dragProps = { onPointerDown: beginDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };
  // Teclado: Shift + setas movem o botão.
  const nudge = event => {
    const step = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[event.key];
    if (!event.shiftKey || !step) return;
    event.preventDefault();
    const rect = fab.current.getBoundingClientRect();
    const next = clampPos({ right: (pos?.right ?? viewport().w - rect.right) - step[0], bottom: (pos?.bottom ?? viewport().h - rect.bottom) - step[1] });
    setPos(next);
    savePos(next);
  };

  const hide = () => { setOpen(false); setHidden(true); saveHidden(true); };
  const restore = () => { setHidden(false); saveHidden(false); setOpen(true); };

  if (hidden) {
    return <button type="button" className="as-restore" onClick={restore} aria-label="Mostrar o assistente do livro"><img src={AVATAR} alt="" width="22" height="22" /><span>Assistente</span></button>;
  }

  const lastBotIndex = messages.reduce((acc, m, i) => (m.role === 'bot' ? i : acc), -1);
  return (
    <>
      {open && (
        <section className="as-panel" role="dialog" aria-label={`Assistente: ${NAME}`} style={panelStyle(pos, vp)}>
          <header className={`as-head${vp.w > SHEET_MAX ? ' is-movable' : ''}${dragging ? ' is-dragging' : ''}`} title={vp.w > SHEET_MAX ? 'Arraste para mover' : undefined} {...(vp.w > SHEET_MAX ? dragProps : {})}>
            <img src={AVATAR} alt="" width="40" height="40" />
            <div><strong>{NAME}</strong><small>Responde só com o livro</small></div>
            <button type="button" className="as-text-btn" onClick={hide}>Ocultar botão</button>
            <button type="button" className="as-icon" aria-label="Fechar o assistente" onClick={() => { setOpen(false); fab.current?.focus(); }}>×</button>
          </header>
          <div className="as-log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((m, i) => (
              <div key={m.id} ref={i === lastBotIndex ? botStart : undefined}><Message message={m} onAsk={onAsk} onOpenPage={setViewer} /></div>
            ))}
            {busy && <Typing />}
          </div>
          {showAll && (
            <div className="as-all" role="region" aria-label="Todas as perguntas">
              <div className="as-all-head"><strong>Todas as perguntas</strong><button type="button" className="as-icon" aria-label="Fechar a lista" onClick={() => setShowAll(false)}>×</button></div>
              {TOPICS.map(t => (
                <details key={t.id}>
                  <summary><span aria-hidden="true">{t.icon}</span> {t.label}</summary>
                  <ul>{t.questions.map(q => <li key={q}><button type="button" onClick={() => ask(q)}>{q}</button></li>)}</ul>
                </details>
              ))}
            </div>
          )}
          <div className="as-foot">
            <button type="button" className="as-all-btn" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? 'Fechar a lista' : 'Ver todas as perguntas'}</button>
            <div className="as-topics" role="group" aria-label="Assuntos">
              {TOPICS.map(t => <button key={t.id} type="button" className="as-chip" onClick={() => openTopic(t)}>{t.label}</button>)}
            </div>
            <form className="as-form" onSubmit={e => { e.preventDefault(); ask(input); }}>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte ao Arquivista…" aria-label="Sua pergunta" maxLength={200} autoComplete="off" enterKeyHint="send" />
              <button type="submit" className="as-send" disabled={busy || !input.trim()}>Enviar</button>
            </form>
          </div>
        </section>
      )}
      {viewer && <PageViewer page={viewer} onClose={() => setViewer(null)} onGo={setViewer} />}
      <button ref={fab} type="button" className={`as-fab${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`} style={pos ? { right: pos.right, bottom: pos.bottom } : undefined} title="Clique para abrir; arraste para mover" aria-expanded={open}
        aria-label={open ? 'Fechar o assistente do livro' : 'Abrir o assistente do livro'} aria-keyshortcuts="Shift+ArrowKeys" {...dragProps} onKeyDown={nudge}
        onClick={() => { if (justDragged.current) { justDragged.current = false; return; } setOpen(v => !v); }}>
        <img src={AVATAR} alt="" width="58" height="58" />
      </button>
    </>
  );
}
