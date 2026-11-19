import React from 'react';
import ExperienceIcon from './ExperienceIcon.jsx';

// Escolha de ícone: só as imagens do conjunto recebido (experiências ou moedas). Um registro antigo com outro símbolo continua como está
// até o mestre escolher uma imagem.
export default function IconPicker({ icons, value, onChange, label = 'Ícone' }) {
  return <div className="field mh-icon-field" role="group" aria-label={label}>
    <span>{label}</span>
    <div className="mh-icon-picker">
      {icons.map(i => <button key={i.key} type="button" className={`mh-icon-opt${value === i.key ? ' active' : ''}`} aria-pressed={value === i.key} title={i.label} aria-label={i.label} onClick={() => onChange(i.key)}>
        <ExperienceIcon icon={i.key} /></button>)}
    </div>
  </div>;
}
