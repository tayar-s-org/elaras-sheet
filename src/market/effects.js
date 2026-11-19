import { describeEffect } from './custom.js';

const kg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// Efeitos de um item (do catálogo ou customizado) em linhas de texto para mostrar na ficha:
// dano, alcance, bônus de armadura e de Aparar, bônus de rolagem dos itens customizados e peso. `notes` é a descrição.
export function itemEffects(item) {
  if (!item) return { lines: [], notes: '' };
  const lines = [];
  if (item.damage) lines.push(`Dano ${item.damage}`);
  if (item.range) lines.push(`Alcance ${item.range}`);
  if (item.rof) lines.push(`Cadência ${item.rof}`);
  if (item.minStr) lines.push(`Força mínima ${item.minStr}`);
  if (item.effects?.armor) lines.push(`+${item.effects.armor} de Armadura`);
  if (item.effects?.parry) lines.push(`+${item.effects.parry} de Aparar`);
  for (const e of item.customEffects || []) { if (e.kind !== 'damage') lines.push(describeEffect(e)); }
  if (item.weight) lines.push(`Peso ${kg(item.weight)}`);
  return { lines, notes: item.notes || '' };
}
