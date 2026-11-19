import React from 'react';

// Abas internas de um módulo: mostra UMA seção por vez (em vez de empilhar formulários e obrigar a rolar). tabs = [[chave, rótulo]].
export default function ModuleTabs({ tabs, value, onChange, label }) {
  return <div className="tabs-row mh-subtabs" role="tablist" aria-label={label}>
    {tabs.map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={value === key} className={value === key ? 'primary' : 'outline'} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}
