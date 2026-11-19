import React, { useEffect, useState } from 'react';
import { loadCreatureDetails } from '../../lib/board.js';
import { rollDice } from '../../lib/room.js';
import { parseFormula } from '../../diceRoll.js';

export default function CreatureSheetPeek({ token, tableId, room, closed, onEdit, revision }) {
  const [sheet, setSheet] = useState(undefined);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setSheet(undefined);
    setError('');
    loadCreatureDetails(token.id)
      .then(details => { if (active) setSheet(details.sheet || null); })
      .catch(err => { if (active) { setSheet(null); setError(err.message); } });
    return () => { active = false; };
  }, [token.id, revision]);

  async function roll(label, formula) {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const row = await rollDice(tableId, parseFormula(formula), { label: `${token.name} · ${label}`, visibility: 'gm' });
      room.addRoll(row);
      setResult(`${label}: ${row.total}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const rollButton = (label, formula, caption) => formula && <button type="button" className="outline" disabled={closed || busy}
    onClick={() => roll(label, formula)}>{caption} ({formula})</button>;
  return <details className="token-set">
    <summary>Ficha rápida · só o mestre</summary>
    <div className="token-controls">
      {sheet === undefined && <p role="status">Carregando ficha…</p>}
      {sheet === null && !error && <p className="muted">Nenhuma ficha rápida preenchida.</p>}
      {sheet && <>
        {(sheet.parry || sheet.toughness) && <p>Aparar: {sheet.parry || '—'} · Resistência: {sheet.toughness || '—'}</p>}
        <div className="tabs-row">
          {Object.entries(sheet.attributes || {}).map(([name, formula]) => <React.Fragment key={name}>
            {rollButton(name, formula, name)}
          </React.Fragment>)}
        </div>
        {(sheet.skills || []).map((skill, index) => <div key={index}>{rollButton(skill.name, skill.formula, skill.name) || skill.name}</div>)}
        {(sheet.attacks || []).map((attack, index) => <div key={index} className="tabs-row">
          <strong>{attack.name}</strong>
          {rollButton(attack.name, attack.attack, 'Ataque')}
          {rollButton(`${attack.name} · dano`, attack.damage, 'Dano')}
        </div>)}
        {sheet.notes && <p className="creature-sheet-notes">{sheet.notes}</p>}
        {result && <p role="status">{result}</p>}
      </>}
      {error && <p role="alert">{error}</p>}
      {!closed && <button type="button" className="outline" onClick={onEdit}>Editar criatura e ficha</button>}
    </div>
  </details>;
}
