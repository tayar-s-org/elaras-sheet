import React from 'react';
import { imageIconUrl, iconText, isImageIcon } from './experienceIcons.js';

// Ícone de um tipo de experiência (ou o símbolo de uma moeda): imagem embutida quando a chave é de imagem, senão o texto/emoji.
export default function ExperienceIcon({ icon }) {
  const url = imageIconUrl(icon);
  return url ? <img className="xp-icon" src={url} alt="" width="20" height="20" /> : <span aria-hidden="true">{iconText(icon)}</span>;
}

// Texto com chaves de imagem ("Colocou à venda: Anel (10 @euro)"): cada chave vira a imagem da moeda/experiência.
export function RichIcons({ text }) {
  return String(text ?? '').split(/(@[a-z]{2,7})/).map((part, i) => (isImageIcon(part) ? <ExperienceIcon key={i} icon={part} /> : part));
}

// Selo de carteira/experiência de um personagem (ver experienceChips/walletChips em core.js).
// compact: só o símbolo e o valor (o nome fica no título ao passar o mouse e para leitores de tela).
export function HoldingChip({ h, className = 'bsp-holding', compact = false }) {
  if (compact) return <span className={className} title={`${h.title}: ${h.amount}`} aria-label={`${h.title}: ${h.amount}`}><ExperienceIcon icon={h.icon} /> {h.amount}</span>;
  return <span className={className} title={h.title}><ExperienceIcon icon={h.icon} /> {h.label}</span>;
}

// Moedas e experiências em GRUPOS separados (cada um com o seu rótulo), para não aparecerem misturados.
// compact: cada selo só com o ícone e o valor. Não mostra o grupo que está vazio.
export function HoldingGroups({ wallet = [], experience = [], compact = false, chipClass = 'bsp-holding' }) {
  if (!wallet.length && !experience.length) return null;
  const group = (label, list) => list.length > 0 && <div className="holding-group" role="group" aria-label={label}>
    <small className="holding-label">{label}</small>
    <div className="holding-chips">{list.map(h => <HoldingChip key={h.key} h={h} compact={compact} className={chipClass} />)}</div>
  </div>;
  return <div className="holding-groups">{group('Moedas', wallet)}{group('Experiências', experience)}</div>;
}
