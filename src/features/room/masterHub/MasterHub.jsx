import React, { useEffect, useId, useRef, useState } from 'react';
import { MASTER_MODULES, MODULE_GROUPS } from './core.js';
import { MODULE_COMPONENTS } from './modules.jsx';
import { useHubPlayers } from './ui.jsx';
import { masterHubVersion } from '../../../lib/masterHub.js';
import { conditionsOf } from '../../../tokenState.js';
import ActiveConditions from '../../sheet/ActiveConditions.jsx';
import './masterHub.css';

const MIN_KEY = 'elara-master-hub-min';
const loadMin = () => { try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; } };

// Central do Mestre: identidade da campanha + botões de módulos que abrem um de cada vez (mesmo comportamento do painel da ficha).
// É uma camada sobre os sistemas do RPG: cada módulo usa as fontes de dados e as ferramentas que já existem (src/features/room/masterHub/README.md).
// props: tableId, closed, members, characters, states, board, tokens, pad, tools, sheets, auth, extras, campaign { name, gmName, clock }
export default function MasterHub(props) {
  const { members, characters, states, campaign, extras } = props;
  const players = useHubPlayers(members, characters);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [open, setOpen] = useState(null);
  const [shown, setShown] = useState(null);
  const [minimized, setMinimized] = useState(loadMin);
  const [version, setVersion] = useState(null); // null: verificando · 0: falta a migração 0040 · 1: Central · 2: Central + Loja do Mestre · 3: + preço em $ (0043)
  const ready = version === null ? null : version >= 1;
  const regionId = useId();
  const [entry, setEntry] = useState(null); // pedido de abrir um módulo já numa seção (ex.: Itens › Loja do Mestre)
  const [recheck, setRecheck] = useState(0); // "Tentar de novo" quando a verificação falhou por falta de rede
  const [offline, setOffline] = useState(false);
  const bodyRef = useRef(null);
  const firstRun = useRef(true);

  useEffect(() => {
    let alive = true;
    setOffline(false);
    masterHubVersion(recheck > 0).then(v => { if (alive) { setVersion(v); setOffline(v === null); } });
    return () => { alive = false; };
  }, [open, recheck]); // reconfere ao abrir um módulo (se a rede tinha falhado antes)
  // Ao abrir um módulo o foco vai para a região dele (leitor de tela anuncia "Módulo X"); no primeiro render não mexe no foco.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    if (open) bodyRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (open) { setShown(open); return undefined; }
    const timer = setTimeout(() => setShown(null), 260);
    return () => clearTimeout(timer);
  }, [open]);
  const toggleMin = () => setMinimized(prev => { const next = !prev; try { localStorage.setItem(MIN_KEY, next ? '1' : '0'); } catch { /* sem storage */ } return next; });

  const module = MASTER_MODULES.find(m => m.key === (open || shown));
  const Body = module && MODULE_COMPONENTS[module.key];
  const openItemsShop = () => { setEntry({ view: 'shop' }); setOpen('items'); };
  const ctx = { ...props, players, selectedPlayer, setSelectedPlayer, extras, shopReady: version >= 2, moneyShop: version >= 3, entry, openItemsShop };
  const blocked = module?.needsHub && ready !== true;
  const pick = key => setOpen(prev => (prev === key ? null : key));

  if (minimized) {
    return <section className="master-hub mini" aria-label="Central do Mestre">
      <div className="mh-mini"><span>Central do Mestre · <b>{campaign.name}</b></span>
        <button type="button" className="outline" aria-expanded="false" onClick={toggleMin}>Maximizar</button></div>
    </section>;
  }
  return <section className="master-hub" id="room-master-hub" aria-label="Central do Mestre" tabIndex={-1}>
    <div className="mh-top">
      <div className="mh-id-wrap">
        <div className="mh-id">
          <span className="mh-crest" aria-hidden="true">♛</span>
          <div className="mh-id-text">
            <h3>Central do Mestre</h3>
            <p>{campaign.name}{campaign.gmName ? ` · Mestre: ${campaign.gmName}` : ''}{campaign.clock ? ` · ${campaign.clock}` : ''}</p>
            <ul className="mh-chips" aria-label="Jogadores participantes">
              {players.map(p => <li key={p.id}>
                <button type="button" className="mh-chip" title={`${p.name} · ${p.playerName || 'Jogador'} — abrir a ficha`} onClick={() => { setSelectedPlayer(p.id); setOpen('players'); }}>
                  {p.name.split(/\s+/)[0]}{conditionsOf(states[p.id]).length ? <ActiveConditions conditions={conditionsOf(states[p.id])} compact /> : null}
                </button>
              </li>)}
              {!players.length && <li className="muted">Sem jogadores com ficha.</li>}
            </ul>
          </div>
        </div>
        <button type="button" className="bsp-min" aria-expanded="true" aria-label="Minimizar a Central do Mestre" title="Minimizar a Central do Mestre" onClick={toggleMin}>−</button>
      </div>
      <div className="mh-modules" role="group" aria-label="Módulos da Central">
        {MODULE_GROUPS.map(([g, label]) => <div key={g} className={`mh-group mh-group-${g}`} role="group" aria-label={label}>
          {MASTER_MODULES.filter(m => m.group === g).map(m => <button key={m.key} type="button" className={`bsp-tab mh-tab mh-tab-${g}${open === m.key ? ' active' : ''}`}
            aria-expanded={open === m.key} aria-controls={regionId} onClick={() => pick(m.key)}>{m.label}</button>)}
        </div>)}
      </div>
    </div>
    <div className={`bsp-region${open ? ' open' : ''}`} id={regionId} role="region" aria-label={module ? `Módulo ${module.label}` : 'Módulo da Central'} inert={!open}>
      <div className="bsp-clip">
        <div className="bsp-body mh-body" ref={bodyRef} tabIndex={-1}>
          {module && (blocked
            ? (offline
              ? <div className="callout mh-empty" role="alert"><p>Sem conexão com o servidor. Nada foi alterado. Confira a internet e tente de novo.</p>
                <button type="button" className="outline" onClick={() => setRecheck(n => n + 1)}>Tentar de novo</button></div>
              : <p className="callout" role={ready === false ? 'alert' : 'status'}>{ready === false
                ? 'Atualização do banco pendente: este módulo precisa da atualização 0040 (Central do Mestre). Aplique-a no Supabase e recarregue a página.'
                : 'Verificando a conexão com o servidor…'}</p>)
            : Body && <Body key={module.key} ctx={ctx} />)}
        </div>
      </div>
    </div>
  </section>;
}
