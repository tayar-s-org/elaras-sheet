import React from 'react';
import Modal from '../../ui/Modal.jsx';
import { calculate, validateCharacter } from '../../rules.js';
import { SheetOverview } from '../sheet/SheetModules.jsx';
import { useAptitudeFor } from '../routine/AptitudeSummary.jsx';

// "Ver ficha": mostra a ficha do personagem (só leitura) por cima da sala, sem sair da mesa.
export default function SheetViewModal({ data, owner, tableId, characterId, onClose }) {
  const apt = useAptitudeFor({ characterId, tableId, enabled: Boolean(characterId) });
  let c, d;
  try { c = validateCharacter(data); d = calculate(c); } catch { c = null; }
  return <Modal onClose={onClose} aria-labelledby="view-sheet-title">
    <div className="mod-editor">
      <header className="mod-editor-head">
        <h2 id="view-sheet-title">Ficha de {c?.name || 'personagem'}{owner ? <small className="view-owner"> · {owner}</small> : null}</h2>
        <button type="button" className="primary" onClick={onClose}>Fechar</button>
      </header>
      <div className="mod-editor-body">{c ? <SheetOverview c={c} d={d} apt={apt || { allocation: {}, received: 0, distributed: 0, available: 0 }} /> : <p className="muted">Não foi possível ler esta ficha.</p>}</div>
    </div>
  </Modal>;
}
