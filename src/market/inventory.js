import { itemById, resolveItem, unitFills, roundFill } from './items.js';
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

// Motivo curto pelo qual a compra não pode acontecer (vazio = pode). Confere antes do débito: o limite da pilha
// nunca pode cortar a entrega depois de cobrar.
export function buyBlockedReason(c, item, qty = 1) {
  if (item.cost * qty > normalizeMoney(c.money)) return 'Sem dinheiro';
  const inBag = c.inventory.find(e => e.id === item.id)?.qty ?? 0;
  return inBag + qty > MAX_QTY ? `Mochila cheia (${MAX_QTY})` : '';
}

// Compra: desconta o dinheiro e põe na mochila. Devolve null se o item não existe, falta dinheiro ou passa do limite da pilha.
export function buyItem(c, id, qty = 1) {
  const item = itemById.get(id);
  if (!item || qty < 1 || buyBlockedReason(c, item, qty)) return null;
  const money = normalizeMoney(c.money);
  const total = item.cost * qty;
  const inventory = c.inventory.some(e => e.id === id)
    ? c.inventory.map(e => (e.id === id ? resized(e, item, e.qty + qty) : e))
    : [...c.inventory, resized({ id, qty: 0, equipped: false }, item, qty)];
  return { ...c, money: money - total, inventory };
}

// Entrada com nova quantidade; recipientes de líquido mantêm um nível por unidade (unidade nova vem vazia, a que sai é a última).
const resized = (entry, item, qty, fills) => {
  const next = { ...entry, qty };
  if (item?.liquid) next.fills = unitFills({ qty, fills: fills || unitFills(entry, item) }, item);
  return next;
};

// Venda: devolve metade do preço por unidade. Se acabar a quantidade, o item sai da mochila.
export function sellItem(c, id, qty = 1) {
  const entry = c.inventory.find(e => e.id === id);
  const item = resolveItem(entry);
  if (!item || item.isCustom || !entry || qty < 1) return null; // item customizado não tem preço: só pode ser descartado
  const sold = Math.min(qty, entry.qty);
  const money = Math.min(MAX_MONEY, normalizeMoney(c.money) + sellPrice(item, sold));
  const inventory = entry.qty - sold > 0
    ? c.inventory.map(e => (e.id === id ? resized(e, item, e.qty - sold) : e))
    : c.inventory.filter(e => e.id !== id);
  return { ...c, money, inventory };
}

// Usar/gastar unidades (o jogador só consegue DIMINUIR a quantidade; mais unidades só vêm de compra, troca ou mestre).
// index: qual unidade sai (nos recipientes de líquido sai também o nível dela); sem index sai a última.
// A última unidade de um item customizado não sai por aqui (use "Descartar", que avisa o servidor). Devolve null se inválido.
export function consumeItem(c, id, n = 1, index = null) {
  const entry = c.inventory.find(e => e.id === id);
  const item = resolveItem(entry);
  n = Number(n);
  if (!entry || !item || !Number.isInteger(n) || n < 1 || n > entry.qty) return null;
  if (index != null && (n !== 1 || !(index >= 0 && index < entry.qty))) return null;
  const left = entry.qty - n;
  if (left < 1) return item.isCustom ? null : { ...c, inventory: c.inventory.filter(e => e.id !== id) };
  let fills;
  if (item.liquid) {
    fills = unitFills(entry, item);
    fills.splice(index == null ? entry.qty - n : index, n);
  }
  return { ...c, inventory: c.inventory.map(e => (e.id === id ? resized(e, item, left, fills) : e)) };
}

// Nível (litros) de uma unidade de recipiente de líquido: de 0 até a capacidade, em passos de 0,05 L.
export function setFill(c, id, index, litres) {
  const entry = c.inventory.find(e => e.id === id);
  const item = resolveItem(entry);
  if (!item?.liquid || !(index >= 0 && index < entry.qty) || !Number.isFinite(Number(litres))) return null;
  const fills = unitFills(entry, item);
  fills[index] = roundFill(litres, item.liquid.capacity);
  return { ...c, inventory: c.inventory.map(e => (e.id === id ? { ...e, fills } : e)) };
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
