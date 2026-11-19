import React, { useEffect, useId, useState } from 'react';
import { MASTER_MODULES } from './core.js';
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
  const [version, setVersion] = useState(null); // null: verificando · 0: falta a migração 0040 · 1: Central · 2: Central + Loja do Mestre
  const ready = version === null ? null : version >= 1;
  const regionId = useId();

  useEffect(() => {
    let alive = true;
    masterHubVersion().then(v => { if (alive) setVersion(v); });
    return () => { alive = false; };
  }, [open]); // reconfere ao abrir um módulo (se a rede tinha falhado antes)
  useEffect(() => {
    if (open) { setShown(open); return undefined; }
    const timer = setTimeout(() => setShown(null), 260);
    return () => clearTimeout(timer);
  }, [open]);
  const toggleMin = () => setMinimized(prev => { const next = !prev; try { localStorage.setItem(MIN_KEY, next ? '1' : '0'); } catch { /* sem storage */ } return next; });

  const module = MASTER_MODULES.find(m => m.key === (open || shown));
  const Body = module && MODULE_COMPONENTS[module.key];
  const ctx = { ...props, players, selectedPlayer, setSelectedPlayer, extras, shopReady: version >= 2 };
  const blocked = module?.needsHub && ready !== true;
  const pick = key => setOpen(prev => (prev === key ? null : key));

  if (minimized) {
    return <section className="master-hub mini" aria-label="Central do Mestre">
      <div className="mh-mini"><span>Central do Mestre · <b>{campaign.name}</b></span>
        <button type="button" className="outline" aria-expanded="false" onClick={toggleMin}>Maximizar</button></div>
    </section>;
  }
  return <section className="master-hub" aria-label="Central do Mestre">
    <div className="mh-top">
      <div className="mh-id-wrap">
        <div className="mh-id">
          <span className="mh-crest" aria-hidden="true">♛</span>
          <div className="mh-id-text">
            <p className="eyebrow">CENTRAL DO MESTRE</p>
            <h3>{campaign.name}</h3>
            <p>Mestre: {campaign.gmName || '—'}{campaign.clock ? ` · ${campaign.clock}` : ''}</p>
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
        {MASTER_MODULES.map((m, i) => <button key={m.key} type="button" className={`bsp-tab mh-tab${open === m.key ? ' active' : ''}`}
          aria-expanded={open === m.key} aria-controls={regionId} onClick={() => pick(m.key)}>
          <span className="bsp-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{m.label}
        </button>)}
      </div>
    </div>
    <div className={`bsp-region${open ? ' open' : ''}`} id={regionId} role="region" aria-label={module ? `Módulo ${module.label}` : 'Módulo da Central'} inert={!open}>
      <div className="bsp-clip">
        <div className="bsp-body mh-body">
          {module && (blocked
            ? <p className="callout" role={ready === false ? 'alert' : 'status'}>{ready === false
              ? 'Falta aplicar a migração 0040 (Central do Mestre) no Supabase. Este módulo fica disponível depois dela.'
              : 'Verificando a conexão com o servidor…'}</p>
            : Body && <Body key={module.key} ctx={ctx} />)}
        </div>
      </div>
    </div>
  </section>;
}
