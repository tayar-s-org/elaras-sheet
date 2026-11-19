import React, { useEffect, useState } from 'react';
import { loadCreatureDetails } from '../../lib/board.js';
import { rollDice } from '../../lib/room.js';
import { parseFormula } from '../../diceRoll.js';

export default function CreatureSheetPeek({ token, tableId, room, closed, onEdit, revision }) {
  const [sheet, setSheet] = useState(undefined);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    let active = true;
    setSheet(undefined);
    setLoadError('');
    loadCreatureDetails(token.id)
      .then(details => { if (active) setSheet(details.sheet || null); })
      .catch(err => { if (active) { setSheet(null); setLoadError(err.message); } });
    return () => { active = false; };
  }, [token.id, revision]);

  async function roll(key, label, formula) {
    if (busy || closed) return;
    setBusy(true);
    setFeedback({ key, text: 'Rolando…' });
    try {
      const row = await rollDice(tableId, parseFormula(formula), { label: `${token.name} · ${label}`, visibility: 'gm' });
      room.addRoll(row);
      setFeedback({ key, text: `${row.total} · só o mestre` });
    } catch (err) {
      setFeedback({ key, text: err.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  const rollButton = (key, label, formula, caption, accessible = `Rolar ${label}`) => formula && <div className="creature-roll-action">
    <button type="button" className="outline" aria-label={`${accessible} (${formula})`} disabled={closed || busy}
      onClick={() => roll(key, label, formula)}>{caption} ({formula})</button>
    {feedback?.key === key && <small role={feedback.error ? 'alert' : 'status'}>{feedback.text}</small>}
  </div>;
  return <section className="creature-sheet" aria-label="Ficha rápida">
    <div className="creature-sheet-heading"><strong>Ficha rápida</strong><small className="muted">Rolagens só para o mestre</small></div>
    {sheet === undefined && <p role="status">Carregando ficha…</p>}
    {sheet === null && !loadError && <p className="muted">Nenhuma ficha rápida preenchida.</p>}
    {sheet && <>
      {(sheet.parry || sheet.toughness) && <dl className="creature-defenses">
        <div><dt>Aparar</dt><dd>{sheet.parry || '—'}</dd></div>
        <div><dt>Resistência</dt><dd>{sheet.toughness || '—'}</dd></div>
      </dl>}
      {(sheet.attacks || []).map((attack, index) => <div key={index} className="creature-attack">
        <strong>{attack.name}</strong>
        <div className="tabs-row">
          {rollButton(`attack-${index}`, attack.name, attack.attack, 'Ataque', `Rolar ataque de ${attack.name}`)}
          {rollButton(`damage-${index}`, `${attack.name} · dano`, attack.damage, 'Dano', `Rolar dano de ${attack.name}`)}
        </div>
      </div>)}
      {(!sheet.attacks?.length) && <p className="muted">Nenhum ataque cadastrado.</p>}
      {(Object.keys(sheet.attributes || {}).length > 0 || sheet.skills?.length > 0 || sheet.notes) && <details>
        <summary>Atributos, perícias e notas</summary>
        <div className="tabs-row">
          {Object.entries(sheet.attributes || {}).map(([name, formula]) => <React.Fragment key={name}>
            {rollButton(`attr-${name}`, name, formula, name)}
          </React.Fragment>)}
        </div>
        {(sheet.skills || []).map((skill, index) => <div key={index}>{rollButton(`skill-${index}`, skill.name, skill.formula, skill.name) || skill.name}</div>)}
        {sheet.notes && <p className="creature-sheet-notes">{sheet.notes}</p>}
      </details>}
    </>}
    {loadError && <p role="alert">{loadError}</p>}
    {editError && <p role="alert">{editError}</p>}
    {!closed && <button type="button" className="text-button" disabled={editing} onClick={async () => {
      setEditing(true);
      setEditError('');
      try { await onEdit(); } catch (err) { setEditError(err.message); } finally { setEditing(false); }
    }}>{editing ? 'Abrindo editor…' : 'Editar criatura e ficha'}</button>}
  </section>;
}
