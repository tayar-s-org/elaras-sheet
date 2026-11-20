import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_ITEMS, CATEGORIES, itemById, inventoryEffects } from './items.js';
import { buyItem, buyBlockedReason, sellItem, toggleEquip, sellPrice, MAX_QTY } from './inventory.js';
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

test('comprar no limite da pilha recusa antes de cobrar', () => {
  const dagger = find('Adaga');
  const full = { ...newCharacter(), money: 500, inventory: [{ id: dagger.id, qty: MAX_QTY, equipped: false }] };
  assert.equal(buyItem(full, dagger.id, 1), null, 'não cobra nem entrega');
  assert.equal(buyBlockedReason(full, dagger), `Mochila cheia (${MAX_QTY})`);
  const almostFull = { ...full, inventory: [{ id: dagger.id, qty: MAX_QTY - 1, equipped: false }] };
  assert.equal(buyBlockedReason(almostFull, dagger), '');
  const bought = buyItem(almostFull, dagger.id, 1);
  assert.equal(bought.inventory[0].qty, MAX_QTY);
  assert.equal(bought.money, 500 - dagger.cost);
  assert.equal(buyBlockedReason({ ...full, money: 0, inventory: [] }, dagger), 'Sem dinheiro');
});

test('comprar várias unidades perto do limite só passa se todas couberem', () => {
  const dagger = find('Adaga');
  const c = { ...newCharacter(), money: 500, inventory: [{ id: dagger.id, qty: MAX_QTY - 3, equipped: false }] };
  assert.equal(buyBlockedReason(c, dagger, 3), '');
  assert.equal(buyItem(c, dagger.id, 3).inventory[0].qty, MAX_QTY);
  assert.equal(buyBlockedReason(c, dagger, 4), `Mochila cheia (${MAX_QTY})`);
  assert.equal(buyItem(c, dagger.id, 4), null, 'nada é cobrado nem entregue pela metade');
  assert.equal(buyItem({ ...c, inventory: [] }, dagger.id, MAX_QTY + 1), null, 'primeira compra também respeita o limite');
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

const LISTS = { attributes: ['Agilidade', 'Força'], skills: ['Furtividade', 'Lutar'] };
const CUSTOM_ROW = { id: '123e4567-e89b-12d3-a456-426614174000', name: ' Anel do lobo ', weight: 0.2, description: 'Brilha à noite',
  effects: [{ kind: 'attribute', target: 'Força', bonus: 2 }, { kind: 'skill', target: 'Furtividade', bonus: 1 }, { kind: 'derived', target: 'parry', bonus: 1 },
    { kind: 'derived', target: 'mana', bonus: 5 }, { kind: 'skill', target: 'Inventada', bonus: 3 }, { kind: 'attribute', target: 'Força', bonus: 99 }] };

test('item custom: sanitiza nome, peso e efeitos (descarta alvos e bônus inválidos)', async () => {
  const { sanitizeCustom, customEntry, describeEffect } = await import('./custom.js');
  const item = sanitizeCustom(CUSTOM_ROW, LISTS);
  assert.equal(item.name, 'Anel do lobo');
  assert.equal(item.effects.length, 4, 'perícia inventada e bônus +99 caem');
  assert.equal(sanitizeCustom({ name: '   ' }, LISTS), null);
  assert.equal(sanitizeCustom({ name: 'x', weight: 9999 }, LISTS).weight, 500);
  assert.equal(customEntry(CUSTOM_ROW, LISTS).id, 'custom-123e4567-e89b-12d3-a456-426614174000');
  assert.equal(describeEffect({ kind: 'skill', target: 'Furtividade', bonus: 1 }), '+1 nas rolagens de Furtividade');
  assert.equal(describeEffect({ kind: 'derived', target: 'parry', bonus: -2 }), '−2 em Aparar');
});

test('item custom equipado soma bônus de rolagem e valores derivados; vários ao mesmo tempo', async () => {
  const { customEntry } = await import('./custom.js');
  const { addCustomEntries, discardItem } = await import('./inventory.js');
  const lists = { attributes: ['Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor'], skills: ['Furtividade'] };
  let c = { ...newCharacter(), race: 'Outra raça' };
  const base = calculate(c);
  const entry = customEntry(CUSTOM_ROW, lists);
  c = addCustomEntries(c, [entry, entry]);
  assert.equal(c.inventory.length, 1, 'o mesmo item não entra duas vezes');
  assert.equal(calculate(c).parry, base.parry, 'na mochila, sem equipar, não soma');
  c = toggleEquip(c, entry.id);
  const d = calculate(c);
  assert.equal(d.parry, base.parry + 1);
  assert.equal(d.mana, base.mana + 5);
  assert.deepEqual(d.inventory.rollBonus, { attribute: { Força: 2 }, skill: { Furtividade: 1 } });
  assert.equal(sellItem(c, entry.id, 1), null, 'item custom não se vende');
  assert.deepEqual(discardItem(c, entry.id).inventory, []);
});

test('a ficha mantém item custom válido e descarta o forjado', () => {
  const good = { id: 'custom-123e4567-e89b-12d3-a456-426614174000', qty: 1, equipped: true, custom: { name: 'Amuleto', weight: 1, description: '', effects: [{ kind: 'derived', target: 'armor', bonus: 2 }] } };
  const badId = { ...good, id: 'custom-abc' };
  const noName = { ...good, id: 'custom-123e4567-e89b-12d3-a456-426614174001', custom: { name: '', weight: 1, effects: [] } };
  const v = validateCharacter(JSON.parse(JSON.stringify({ ...newCharacter(), inventory: [good, badId, noName] })));
  assert.equal(v.inventory.length, 1);
  assert.equal(calculate(v).toughness, calculate({ ...v, inventory: [] }).toughness + 2);
});

test('item custom pode ter dano de arma, sem contar nos efeitos e sem mexer nos números da ficha', async () => {
  const { sanitizeCustom, cleanDamage, damageOf, describeEffect } = await import('./custom.js');
  const { resolveItem, inventoryEffects } = await import('./items.js');
  assert.equal(cleanDamage('  For+d6 '), 'For+d6');
  assert.equal(cleanDamage('2d6+1'), '2d6+1');
  assert.equal(cleanDamage('<script>'), '');
  assert.equal(cleanDamage('x'.repeat(40)), '');
  const raw = { name: 'Espada flamejante', weight: 3, effects: [
    { kind: 'damage', target: 'For+d8+2', bonus: 0 }, { kind: 'damage', target: 'segundo', bonus: 0 },
    ...Array.from({ length: 5 }, () => ({ kind: 'derived', target: 'parry', bonus: 1 })) ] };
  const item = sanitizeCustom(raw, { attributes: [], skills: [] });
  assert.equal(damageOf(item), 'For+d8+2');
  assert.equal(item.effects.filter(e => e.kind === 'damage').length, 1, 'só um dano por item');
  assert.equal(item.effects.length, 6, 'o dano não conta nos 5 efeitos');
  assert.equal(describeEffect(item.effects[0]), 'Dano For+d8+2');
  const entry = { id: 'custom-123e4567-e89b-12d3-a456-426614174000', custom: item, qty: 1, equipped: true };
  assert.equal(resolveItem(entry).damage, 'For+d8+2');
  const fx = inventoryEffects([entry], 8);
  assert.equal(fx.parry, 5, 'o dano é informativo; só os 5 bônus de Aparar somam');
});
