import React, { useEffect, useRef, useState } from 'react';
import { AVATAR, NAME } from './branding.js';
import { isSheet, panelLayout } from './panelGeometry.js';
import { useViewport } from './useViewport.js';
import { useFabPosition } from './useFabPosition.js';
import { useConversation } from './useConversation.js';
import { ChatLog } from './Messages.jsx';
import { AllQuestions, ChatFooter } from './ChatControls.jsx';
import PageViewer from './PageViewer.jsx';
import './assistant.css';

const HIDDEN_KEY = 'elara-assistant-hidden';
const FOCUS_DELAY_MS = 80;

const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; } };
const saveHidden = value => { try { localStorage.setItem(HIDDEN_KEY, value ? '1' : '0'); } catch { /* sem storage: vale só nesta sessão */ } };

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(readHidden);
  const [viewer, setViewer] = useState(null);
  const inputRef = useRef(null);
  const vp = useViewport();
  const { fabRef, pos, dragging, dragProps, nudge, consumeDragClick } = useFabPosition(vp);
  const { messages, input, setInput, busy, showAll, setShowAll, ask, openTopic, onAsk } = useConversation();
  const { style: panelStyle, compact } = panelLayout(pos, vp);
  const movable = !isSheet(vp);

  const closePanel = () => setOpen(false);

  // Devolve o foco ao botão depois de fechar: em telas estreitas ele fica oculto enquanto o painel está aberto.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) fabRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // O foco inicial do chat só depende de abrir o painel: abrir/navegar uma página do livro não deve devolvê-lo ao campo coberto.
  useEffect(() => {
    if (!open || window.matchMedia?.('(pointer: coarse)').matches) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Com a página do livro aberta, o Esc é do modal.
  useEffect(() => {
    if (!open || viewer) return undefined;
    const onKey = event => {
      if (event.key !== 'Escape') return;
      if (showAll) setShowAll(false); else closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, viewer, showAll]);

  const hide = () => { setOpen(false); setHidden(true); saveHidden(true); };
  const restore = () => { setHidden(false); saveHidden(false); setOpen(true); };

  if (hidden) {
    return <button type="button" className="as-restore" onClick={restore} aria-label="Mostrar o assistente do livro"><img src={AVATAR} alt="" width="22" height="22" /><span>Assistente</span></button>;
  }

  return (
    <>
      {open && (
        <section className="as-panel" role="dialog" aria-label={`Assistente: ${NAME}`} data-compact={compact || undefined} style={panelStyle}>
          <header className={`as-head${movable ? ' is-movable' : ''}${dragging ? ' is-dragging' : ''}`} title={movable ? 'Arraste para mover' : undefined} {...(movable ? dragProps : {})}>
            <img src={AVATAR} alt="" width="40" height="40" />
            <div><strong>{NAME}</strong><small>Responde só com o livro</small></div>
            <button type="button" className="as-text-btn" onClick={hide}>Ocultar botão</button>
            <button type="button" className="as-icon" aria-label="Fechar o assistente" onClick={closePanel}>×</button>
          </header>
          <ChatLog inert={showAll} messages={messages} busy={busy} onAsk={onAsk} onOpenPage={setViewer} />
          {showAll && <AllQuestions onAsk={ask} onClose={() => setShowAll(false)} />}
          <ChatFooter showAll={showAll} onToggleAll={() => setShowAll(v => !v)} onOpenTopic={openTopic} input={input} onInput={setInput} busy={busy} onSubmit={ask} inputRef={inputRef} />
        </section>
      )}
      {viewer && <PageViewer page={viewer} onClose={() => setViewer(null)} onGo={setViewer} />}
      <button ref={fabRef} type="button" className={`as-fab${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`} style={pos ? { right: pos.right, bottom: pos.bottom } : undefined} title="Clique para abrir; arraste para mover" aria-expanded={open}
        aria-label={open ? 'Fechar o assistente do livro' : 'Abrir o assistente do livro'} aria-keyshortcuts="Shift+ArrowKeys" {...dragProps} onKeyDown={nudge}
        onClick={() => { if (!consumeDragClick()) setOpen(v => !v); }}>
        <img src={AVATAR} alt="" width="58" height="58" />
      </button>
    </>
  );
}
