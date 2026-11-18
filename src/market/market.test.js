import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ITEMS, CATEGORIES, itemById, inventoryEffects } from './items.js';
import { buyItem, sellItem, toggleEquip, sellPrice } from './inventory.js';
import { newCharacter, calculate, validateCharacter } from '../rules.js';

const find = name => MARKET_ITEMS.find(i => i.name === name);

test('catálogo: ids únicos, categorias válidas e preços positivos', () => {
  assert.equal(new Set(MARKET_ITEMS.map(i => i.id)).size, MARKET_ITEMS.length);
  const categories = new Set(CATEGORIES.map(c => c.id));
  for (const item of MARKET_ITEMS) {
    assert.ok(categories.has(item.category), item.name);
    assert.ok(item.cost > 0, item.name);
    assert.ok(item.weight >= 0, item.name);
  }
  assert.ok(MARKET_ITEMS.length > 150);
  assert.equal(find('Couro').armor, 1);
  assert.equal(find('Rapieira').cost, 150);
});

test('comprar desconta o dinheiro, junta quantidades e recusa sem saldo', () => {
  const c = newCharacter(); // $500
  const dagger = find('Adaga');
  const bought = buyItem(c, dagger.id, 2);
  assert.equal(bought.money, 450);
  assert.deepEqual(bought.inventory, [{ id: dagger.id, qty: 2, equipped: false }]);
  assert.equal(buyItem(bought, dagger.id, 1).inventory[0].qty, 3);
  assert.equal(buyItem(c, find('Machado Grande').id, 1).money, 0, 'gasta exatamente o saldo ($500)');
  assert.equal(buyItem(c, find('Machado Grande').id, 2), null, 'dois custam mais que o saldo');
  assert.equal(buyItem(c, find('Katana').id, 1), null, 'katana ($1000) passa do saldo');
  assert.equal(buyItem(c, 'item-que-nao-existe', 1), null);
});

test('vender devolve metade do preço e remove da mochila ao acabar', () => {
  const sword = find('Espada Longa'); // $300
  let c = buyItem(newCharacter(), sword.id, 1);
  assert.equal(c.money, 200);
  assert.equal(sellPrice(sword, 1), 150);
  c = sellItem(c, sword.id, 1);
  assert.equal(c.money, 350);
  assert.deepEqual(c.inventory, []);
});

test('equipar troca o item do mesmo espaço e soma ao Aparar e à Resistência', () => {
  let c = { ...newCharacter(), money: 5000 };
  for (const name of ['Couro', 'Cota de Malha (Camisão)', 'Meio Elmo', 'Rapieira', 'Broquel (escudo pequeno)']) c = buyItem(c, find(name).id, 1);
  const base = calculate(c);
  c = toggleEquip(c, find('Couro').id);
  assert.equal(calculate(c).toughness, base.toughness + 1);
  c = toggleEquip(c, find('Cota de Malha (Camisão)').id); // troca o couro
  assert.equal(calculate(c).toughness, base.toughness + 2);
  assert.equal(c.inventory.find(e => e.id === find('Couro').id).equipped, false);
  c = toggleEquip(c, find('Meio Elmo').id);
  assert.equal(calculate(c).toughness, base.toughness + 5, 'torso e cabeça somam');
  c = toggleEquip(c, find('Rapieira').id);
  c = toggleEquip(c, find('Broquel (escudo pequeno)').id);
  assert.equal(calculate(c).parry, base.parry + 2, 'rapieira +1 e broquel +1');
  c = toggleEquip(c, find('Cota de Malha (Camisão)').id); // desequipa
  assert.equal(calculate(c).toughness, base.toughness + 3);
});

test('peso acima de 2,5 × Força tira Movimentação', () => {
  const c = { ...newCharacter(), money: 99999 }; // Força d4 → carga 10 kg
  const withArmor = buyItem(c, find('Cota de Malha (Camisão)').id, 1); // 12,5 kg
  const fx = inventoryEffects(withArmor.inventory, 4);
  assert.equal(fx.capacity, 10);
  assert.equal(fx.overload, 1);
  assert.equal(calculate(withArmor).movement, Math.max(1, calculate(c).movement - 1));
  assert.equal(inventoryEffects(withArmor.inventory, 8).overload, 0);
});

test('a ficha valida a mochila: ids inexistentes saem e há um equipado por espaço', () => {
  const a = find('Couro'), b = find('Cota de Malha (Camisão)');
  const c = { ...newCharacter(), inventory: [
    { id: a.id, qty: 1, equipped: true }, { id: b.id, qty: 500, equipped: true },
    { id: 'fantasma', qty: 1, equipped: true }, { id: find('Cavalo').id, qty: 1, equipped: true },
  ] };
  const v = validateCharacter(JSON.parse(JSON.stringify(c)));
  assert.equal(v.inventory.length, 3);
  assert.deepEqual(v.inventory.map(e => e.equipped), [true, false, false]);
  assert.equal(v.inventory[1].qty, 1, 'quantidade inválida volta para 1');
  assert.ok(itemById.has(v.inventory[0].id));
});

test('texto do equipamento junta os itens da mochila e as anotações antigas', async () => {
  const { equipmentText } = await import('./inventory.js');
  let c = { ...newCharacter(), equipment: 'Mapa antigo' };
  assert.equal(equipmentText(c), 'Mapa antigo');
  c = buyItem(c, find('Adaga').id, 2);
  c = toggleEquip(c, find('Adaga').id);
  assert.equal(equipmentText(c), 'Adaga ×2 (equipado)\nMapa antigo');
});
