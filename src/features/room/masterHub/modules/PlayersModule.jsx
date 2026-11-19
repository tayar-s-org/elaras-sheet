import React from 'react';
import { tokenUrl } from '../../../../lib/tokens.js';
import { formatMoney } from '../../../../money.js';
import { conditionsOf } from '../../../../tokenState.js';
import BoardSheetPanel from '../../boardSheet/BoardSheetPanel.jsx';
import ActiveConditions from '../../../sheet/ActiveConditions.jsx';

// Jogadores: lista da campanha com o essencial de cada ficha e, ao escolher um, a ficha real (os mesmos módulos da ficha, via painel
// do tabuleiro). Alterações administrativas (dinheiro, XP, itens, condições) são feitas nos outros módulos, por RPC do mestre.
export default function PlayersModule({ ctx }) {
  const { players, states, characters, selectedPlayer, setSelectedPlayer, tableId, sheets, auth, closed } = ctx;
  if (!players.length) return <p className="muted">Nenhum jogador com ficha vinculada à mesa ainda.</p>;
  const current = players.find(p => p.id === selectedPlayer) || null;
  return <div className="mh-players">
    {current
      ? <div className="tabs-row mh-player-tabs" role="tablist" aria-label="Jogadores da campanha">
        {players.map(p => <button key={p.id} type="button" role="tab" aria-selected={p.id === current.id} className={p.id === current.id ? 'primary' : 'outline'}
          title={`${p.name} · ${p.playerName || 'Jogador'}`} onClick={() => setSelectedPlayer(p.id)}>{p.name.split(/\s+/)[0]}</button>)}
        <button type="button" className="text-button" onClick={() => setSelectedPlayer(null)}>Ver todos</button>
      </div>
      : <ul className="mh-player-list" aria-label="Jogadores da campanha">
        {players.map(p => {
          const src = tokenUrl(p.data?.tokenImage);
          const conds = conditionsOf(states[p.id]);
          return <li key={p.id}>
            <button type="button" className="mh-player" onClick={() => setSelectedPlayer(p.id)}>
              {src ? <img className="mh-portrait" src={src} alt="" /> : <span className="mh-portrait" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>}
              <span className="mh-player-main">
                <b>{p.name}</b>
                <small>{p.playerName || 'Jogador'} · Nível {p.level} · {p.xp} XP</small>
                <small>Dinheiro <span className="money-coin" aria-hidden="true">$</span> {formatMoney(p.money)}{p.free != null ? ` · ${p.free} ${p.free === 1 ? 'ponto livre' : 'pontos livres'}` : ''}</small>
              </span>
            </button>
            <ActiveConditions conditions={conds} compact />
          </li>;
        })}
      </ul>}
    {current
      ? <BoardSheetPanel embedded onOpenShop={ctx.openItemsShop} sel={{ character_id: current.id }} myCharacter={null} isGm characters={characters} tableId={tableId} sheets={sheets} auth={auth} closed={closed} states={states} />
      : <p className="muted">Escolha um jogador para abrir a ficha dele sem sair do mapa.</p>}
  </div>;
}
