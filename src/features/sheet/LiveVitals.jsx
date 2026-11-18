import React, { useEffect, useState } from 'react';
import { loadCharacterState } from '../../lib/room.js';
import { incapacitation, effectiveMovement } from '../../incapacitation.js';
import VitalBars from '../room/VitalBars.jsx';
import IncapPanel from '../room/IncapPanel.jsx';

// Vida, stamina e mana atuais da ficha na mesa dela, com as mesmas faixas e a Incapacitação mostradas no token.
// O mestre ajusta os contadores na sala; aqui a ficha só acompanha (consulta a cada 5 s).
export default function LiveVitals({ d, tableId, cloudId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => loadCharacterState(tableId, cloudId)
      .then(next => alive && setState(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))).catch(() => {});
    setState(null);
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [tableId, cloudId]);

  const max = { life: d.life, stamina: d.stamina, mana: d.mana };
  const inc = incapacitation(state, max);
  return <div className="live-vitals">
    <VitalBars state={state} max={max} />
    <IncapPanel state={state} max={max} baseMovement={d.movement} compact />
    <div className="peek-stats">
      {[['Movimento', effectiveMovement(d.movement, inc.movePenalty)], ['Aparar', d.parry], ['Resistência', d.toughness]].map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}
    </div>
  </div>;
}
