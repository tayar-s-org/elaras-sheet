import { itemById, resolveItem } from './items.js';
import { normalizeMoney, MAX_MONEY } from '../money.js';

export const SELL_RATE = 0.5; // vender de volta devolve metade do preço
export const MAX_QTY = 99;

// Texto do equipamento da ficha (PDF e visão do mestre): itens da mochila e, se houver, anotações antigas.
export function equipmentText(c) {
  const lines = c.inventory.flatMap(e => {
    const item = resolveItem(e);
    return item ? [`${item.name}${e.qty > 1 ? ` ×${e.qty}` : ''}${e.equipped ? ' (equipado)' : ''}`] : [];
  });
  return [...lines, (c.equipment || '').trim()].filter(Boolean).join('\n');
}

export const sellPrice = (item, qty = 1) => Math.floor(item.cost * qty * SELL_RATE);

// Compra: desconta o dinheiro e põe na mochila. Devolve null se o item não existe ou falta dinheiro.
export function buyItem(c, id, qty = 1) {
  const item = itemById.get(id);
  const money = normalizeMoney(c.money);
  const total = item ? item.cost * qty : 0;
  if (!item || qty < 1 || total > money) return null;
  const inventory = c.inventory.some(e => e.id === id)
    ? c.inventory.map(e => (e.id === id ? { ...e, qty: Math.min(MAX_QTY, e.qty + qty) } : e))
    : [...c.inventory, { id, qty, equipped: false }];
  return { ...c, money: money - total, inventory };
}

// Venda: devolve metade do preço por unidade. Se acabar a quantidade, o item sai da mochila.
export function sellItem(c, id, qty = 1) {
  const entry = c.inventory.find(e => e.id === id);
  const item = resolveItem(entry);
  if (!item || item.isCustom || !entry || qty < 1) return null; // item customizado não tem preço: só pode ser descartado
  const sold = Math.min(qty, entry.qty);
  const money = Math.min(MAX_MONEY, normalizeMoney(c.money) + sellPrice(item, sold));
  const inventory = entry.qty - sold > 0
    ? c.inventory.map(e => (e.id === id ? { ...e, qty: e.qty - sold } : e))
    : c.inventory.filter(e => e.id !== id);
  return { ...c, money, inventory };
}

// Equipar/desequipar: um item por espaço (equipar outro no mesmo espaço troca o anterior).
export function toggleEquip(c, id) {
  const entry = c.inventory.find(e => e.id === id);
  const item = resolveItem(entry);
  if (!item || !item.slot || !entry) return null;
  const inventory = c.inventory.map(e => {
    if (e.id === id) return { ...e, equipped: !e.equipped };
    // Itens customizados (anéis, amuletos…) não disputam espaço: dá para usar vários ao mesmo tempo.
    const other = resolveItem(e);
    return !entry.equipped && !item.isCustom && other?.slot === item.slot ? { ...e, equipped: false } : e;
  });
  return { ...c, inventory };
}

// Descartar: tira o item da mochila sem devolver dinheiro (único jeito de se livrar de um item customizado).
export function discardItem(c, id) {
  if (!c.inventory.some(e => e.id === id)) return null;
  return { ...c, inventory: c.inventory.filter(e => e.id !== id) };
}

// Adiciona itens customizados aprovados na mochila (ignora os que já estão lá).
export function addCustomEntries(c, entries) {
  const have = new Set(c.inventory.map(e => e.id));
  const fresh = entries.filter(e => e && !have.has(e.id) && have.add(e.id));
  return fresh.length ? { ...c, inventory: [...c.inventory, ...fresh] } : c;
}
