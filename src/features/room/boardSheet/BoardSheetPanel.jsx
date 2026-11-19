import React, { useEffect, useId, useState } from 'react';
import { resolveSubject, modulesAvailable, MODULE_BUTTONS } from './boardSheetAccess.js';
import SheetIdentityCard from './SheetIdentityCard.jsx';
import ModuleContent from './ModuleContent.jsx';
import { conditionsOf } from '../../../tokenState.js';
import { useExtras } from '../masterHub/extras.jsx';
import { experienceChips, walletChips } from '../masterHub/core.js';
import './boardSheet.css';

const MIN_KEY = 'elara-board-sheet-min';
const loadMin = () => { try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; } };

// Experiências personalizadas aparecem para todos (como o XP); a carteira só para quem pode ver tudo (dono e mestre). Em grupos separados.
const walletOf = (extras, id, full) => (full ? walletChips(extras, id) : []);

// Painel da ficha no topo do tabuleiro: identidade sempre visível + módulos que abrem um de cada vez.
// Segue o token selecionado (sem seleção: a ficha de quem está jogando). Não guarda dados da ficha: lê/edita as mesmas fontes da ficha.
export default function BoardSheetPanel({ sel, myCharacter, isGm, characters, tableId, sheets, auth, closed = false, embedded = false, states = null, onOpenShop = null }) {
  const extras = useExtras();
  const subject = resolveSubject({ sel, myCharacter, isGm, characters, sessionSheets: sheets?.session?.sheets || [] });
  const available = modulesAvailable(subject);
  const [open, setOpen] = useState(null);   // chave do módulo aberto
  const [shown, setShown] = useState(null); // continua montado durante a animação de recolher
  const [minimized, setMinimized] = useState(loadMin); // o módulo todo recolhido numa barra; lembra a escolha
  const regionId = useId();
  const toggleMin = () => setMinimized(prev => { const next = !prev; try { localStorage.setItem(MIN_KEY, next ? '1' : '0'); } catch { /* sem storage */ } return next; });
  const current = available ? open : null;
  useEffect(() => {
    if (current) { setShown(current); return undefined; }
    const timer = setTimeout(() => setShown(null), 260);
    return () => clearTimeout(timer);
  }, [current]);
  const module = MODULE_BUTTONS.find(m => m.key === (current || shown));
  const title = !available ? (subject.kind === 'limited' ? 'Ficha privada' : 'Sem ficha para consultar') : '';

  // embedded: usado dentro da Central do Mestre (sem minimizar e sem mexer na preferência do painel da sala).
  if (minimized && !embedded) {
    const who = subject.data?.name || (subject.kind === 'creature' ? 'Token sem ficha' : subject.kind === 'none' ? 'Nenhum personagem' : 'Ficha');
    return <section className="board-sheet mini" aria-label="Ficha do personagem">
      <div className="bsp-mini"><span className="bsp-mini-name">Ficha · <b>{who}</b></span>
        <button type="button" className="outline" aria-expanded="false" onClick={toggleMin}>Maximizar</button></div>
    </section>;
  }
  return <section className={`board-sheet${embedded && current ? ' bsp-compact' : ''}`} aria-label="Ficha do personagem" id={embedded ? undefined : 'room-char-panel'}>
    <div className="bsp-top">
      <div className="bsp-id-wrap">
        <SheetIdentityCard data={subject.data} full={subject.full} kind={subject.kind} conditions={conditionsOf(states?.[subject.characterId])} wallet={subject.data ? walletOf(extras, subject.characterId, subject.full) : []} experience={subject.data ? experienceChips(extras, subject.characterId) : []} />
        {!embedded && <button type="button" className="bsp-min" aria-expanded="true" aria-label="Minimizar a ficha" title="Minimizar a ficha" onClick={toggleMin}>−</button>}
      </div>
      <div className="bsp-modules" role="group" aria-label="Módulos da ficha">
        {MODULE_BUTTONS.map((m, i) => <button key={m.key} type="button" disabled={!available} title={title || undefined}
          className={`bsp-tab${current === m.key ? ' active' : ''}`} aria-expanded={current === m.key} aria-controls={regionId}
          onClick={() => setOpen(prev => (prev === m.key ? null : m.key))}>
          <span className="bsp-num" aria-hidden="true">{m.key === 'aptitude' ? '✦' : String(i + 1).padStart(2, '0')}</span>{m.label}
        </button>)}
      </div>
    </div>
    <div className={`bsp-region${current ? ' open' : ''}`} id={regionId} role="region" aria-label={module ? `Módulo ${module.label}` : 'Módulo da ficha'} inert={!current}>
      <div className="bsp-clip">
        <div className="bsp-body">
          {module && available && <ModuleContent key={`${module.key}:${subject.characterId}`} module={module} subject={subject} sheets={sheets} auth={auth} tableId={tableId} closed={closed} onOpenShop={onOpenShop} />}
        </div>
      </div>
    </div>
  </section>;
}
