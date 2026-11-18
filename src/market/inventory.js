import { itemById } from './items.js';
import { normalizeMoney, MAX_MONEY } from '../money.js';

export const SELL_RATE = 0.5; // vender de volta devolve metade do preço
export const MAX_QTY = 99;

// Texto do equipamento da ficha (PDF e visão do mestre): itens da mochila e, se houver, anotações antigas.
export function equipmentText(c) {
  const lines = c.inventory.flatMap(e => {
    const item = itemById.get(e.id);
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
  const item = itemById.get(id);
  const entry = c.inventory.find(e => e.id === id);
  if (!item || !entry || qty < 1) return null;
  const sold = Math.min(qty, entry.qty);
  const money = Math.min(MAX_MONEY, normalizeMoney(c.money) + sellPrice(item, sold));
  const inventory = entry.qty - sold > 0
    ? c.inventory.map(e => (e.id === id ? { ...e, qty: e.qty - sold } : e))
    : c.inventory.filter(e => e.id !== id);
  return { ...c, money, inventory };
}

// Equipar/desequipar: um item por espaço (equipar outro no mesmo espaço troca o anterior).
export function toggleEquip(c, id) {
  const item = itemById.get(id);
  const entry = c.inventory.find(e => e.id === id);
  if (!item || !item.slot || !entry) return null;
  const inventory = c.inventory.map(e => {
    if (e.id === id) return { ...e, equipped: !e.equipped };
    const other = itemById.get(e.id);
    return !entry.equipped && other?.slot === item.slot ? { ...e, equipped: false } : e;
  });
  return { ...c, inventory };
}
