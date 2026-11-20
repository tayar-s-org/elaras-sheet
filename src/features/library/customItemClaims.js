import { claimCustomItems } from '../../lib/customItems.js';
import { ATTRIBUTES, SKILLS } from '../../rules.js';
import { customEntry, customId } from '../../market/custom.js';
import { addCustomEntries, discardItem } from '../../market/inventory.js';

const LISTS = { attributes: ATTRIBUTES, skills: SKILLS.map(([name]) => name) };
const plural = (list, one, many) => (list.length > 1 ? many : one);

// Itens customizados que o mestre aprovou entram na mochila da ficha; os que ele revogou saem.
// `myItems` é a lista do jogador, lida uma vez por ciclo (null se o recurso não existe). O item aprovado que não está na
// mochila (a aba que o recolheu fechou antes de salvar) volta, a menos que o jogador o tenha descartado.
export async function claimCustomItemsForSheet({ readSession, editCharacter, notify, isCurrent }, sheet, myItems) {
  const id = sheet.cloud.id;
  const rows = await claimCustomItems(id);
  const entries = rows.map(row => customEntry(row, LISTS)).filter(Boolean);
  if (entries.length && isCurrent()) {
    editCharacter(sheet.id, ch => addCustomEntries(ch, entries));
    notify(`✨ O mestre aprovou ${plural(entries, 'o item', 'os itens')} ${entries.map(e => e.custom.name).join(', ')}. ${plural(entries, 'Está', 'Estão')} na mochila de ${sheet.character.name || 'sua ficha'}.`);
  }
  const mine = myItems || [];
  const live = readSession().sheets.find(s => s.id === sheet.id)?.character;
  const have = new Set((live?.inventory || []).map(e => e.id));
  entries.forEach(e => have.add(e.id));
  const lost = mine.filter(r => r.status === 'approved' && r.character_id === id && !r.discarded_at && !have.has(customId(r.id)))
    .map(r => customEntry(r, LISTS)).filter(Boolean);
  if (lost.length && isCurrent()) {
    editCharacter(sheet.id, ch => addCustomEntries(ch, lost));
    notify(`✨ ${plural(lost, 'Item aprovado voltou', 'Itens aprovados voltaram')} para a mochila de ${sheet.character.name || 'sua ficha'}: ${lost.map(e => e.custom.name).join(', ')}.`);
  }
  const revoked = new Set(mine.filter(r => r.status === 'rejected').map(r => customId(r.id)));
  const gone = (sheet.character.inventory || []).filter(e => revoked.has(e.id));
  if (gone.length && isCurrent()) {
    editCharacter(sheet.id, ch => gone.reduce((acc, e) => discardItem(acc, e.id) || acc, ch));
    notify(`O mestre revogou ${plural(gone, 'o item', 'os itens')} ${gone.map(e => e.custom?.name || 'customizado').join(', ')}. ${plural(gone, 'Saiu', 'Saíram')} da mochila de ${sheet.character.name || 'sua ficha'}.`);
  }
}
