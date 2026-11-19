import React from 'react';
import { ATTRIBUTES } from '../../rules.js';

export default function CreatureSheetFields({ value, onChange }) {
  const patch = fields => onChange({ ...value, ...fields });
  function rows(key, title, fields) {
    const entries = value[key] || [];
    return <fieldset className="token-set">
      <legend>{title}</legend>
      {entries.map((entry, index) => <div className="form-grid compact" key={index}>
        {fields.map(([field, label, placeholder]) => <label className="field" key={field}>
          <span>{label} {index + 1}</span>
          <input value={entry[field] || ''} maxLength={field === 'name' ? 60 : 80} placeholder={placeholder}
            onChange={event => patch({ [key]: entries.map((row, i) => i === index ? { ...row, [field]: event.target.value } : row) })} />
        </label>)}
        <button type="button" className="text-button danger" onClick={() => patch({ [key]: entries.filter((_, i) => i !== index) })}>Remover {title.toLowerCase()} {index + 1}</button>
      </div>)}
      <button type="button" className="outline" disabled={entries.length >= 20} onClick={() => patch({ [key]: [...entries, {}] })}>Adicionar {title.toLowerCase()}</button>
    </fieldset>;
  }
  return <details className="token-set">
    <summary>Ficha rápida · só o mestre</summary>
    <div className="token-controls">
      <p className="muted">Preencha somente o que for usar. Ex.: 1d8+2 ou 1d6! para um dado explosivo.</p>
      <div className="form-grid compact">
        {ATTRIBUTES.map(attr => <label className="field" key={attr}><span>{attr}</span>
          <input maxLength={80} placeholder="1d6" value={value.attributes?.[attr] || ''}
            onChange={event => patch({ attributes: { ...value.attributes, [attr]: event.target.value } })} />
        </label>)}
        {[['parry', 'Aparar'], ['toughness', 'Resistência']].map(([field, label]) => <label className="field" key={field}>
          <span>{label}</span><input maxLength={12} value={value[field] || ''} onChange={event => patch({ [field]: event.target.value })} />
        </label>)}
      </div>
      {rows('skills', 'Perícia', [['name', 'Nome', 'Lutar'], ['formula', 'Rolagem', '1d8+1']])}
      {rows('attacks', 'Ataque', [['name', 'Nome', 'Mordida'], ['attack', 'Ataque', '1d8'], ['damage', 'Dano', '2d6+2']])}
      <label className="field"><span>Notas</span><textarea maxLength={2000} value={value.notes || ''} onChange={event => patch({ notes: event.target.value })} /></label>
    </div>
  </details>;
}
