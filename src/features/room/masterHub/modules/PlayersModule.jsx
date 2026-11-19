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
    <ul className="mh-player-list" aria-label="Jogadores da campanha">
      {players.map(p => {
        const src = tokenUrl(p.data?.tokenImage);
        const conds = conditionsOf(states[p.id]);
        return <li key={p.id}>
          <button type="button" className={`mh-player${current?.id === p.id ? ' active' : ''}`} aria-pressed={current?.id === p.id}
            onClick={() => setSelectedPlayer(current?.id === p.id ? null : p.id)}>
            {src ? <img className="mh-portrait" src={src} alt="" /> : <span className="mh-portrait" aria-hidden="true">{(p.name || '?').slice(0, 1).toUpperCase()}</span>}
            <span className="mh-player-main">
              <b>{p.name}</b>
              <small>{p.playerName || 'Jogador'} · Nível {p.level} · {p.xp} XP</small>
              <small><span className="money-coin" aria-hidden="true">$</span> {formatMoney(p.money)}{p.free != null ? ` · ${p.free} ponto(s) livre(s)` : ''}</small>
            </span>
          </button>
          <ActiveConditions conditions={conds} compact />
        </li>;
      })}
    </ul>
    {current
      ? <BoardSheetPanel embedded sel={{ character_id: current.id }} myCharacter={null} isGm characters={characters} tableId={tableId} sheets={sheets} auth={auth} closed={closed} states={states} />
      : <p className="muted">Escolha um jogador para abrir a ficha dele sem sair do mapa.</p>}
  </div>;
}
