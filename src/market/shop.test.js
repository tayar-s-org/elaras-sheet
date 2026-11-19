import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shopEntry, priceText, canAfford, parsePrice, saleOptions, visibleListings, MAX_PRICE } from './shop.js';
import { resolveItem } from './items.js';
import { validateCharacter, newCharacter } from '../rules.js';

const listing = { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Anel da Sorte', weight: '0.10', effects: [{ kind: 'attribute', target: 'Força', bonus: 1 }], description: 'brilha' };

test('o anúncio vira uma entrada de mochila custom que a ficha entende e mantém', () => {
  const entry = shopEntry(listing);
  assert.equal(entry.id, `custom-${listing.id}`);
  const item = resolveItem(entry);
  assert.equal(item.name, 'Anel da Sorte');
  assert.equal(item.isCustom, true);
  const c = validateCharacter({ ...newCharacter(), inventory: [{ ...entry, qty: 2 }] }); // a ficha não descarta o item comprado
  assert.equal(c.inventory.length, 1);
  assert.equal(c.inventory[0].qty, 2);
  assert.equal(c.inventory[0].custom.name, 'Anel da Sorte');
});

test('preço com o símbolo da moeda e conferência de saldo', () => {
  assert.equal(priceText(1500, { symbol: '🪙' }), '🪙 1.500');
  assert.equal(priceText(10, null), '10');
  assert.equal(priceText(10, { symbol: '@euro' }), '¤ 10'); // moeda com imagem: em texto vira ¤
  assert.equal(canAfford(10, 10), true);
  assert.equal(canAfford(9, 10), false);
  assert.equal(canAfford(30, 10, 3), true);
  assert.equal(canAfford(29, 10, 3), false);
  assert.equal(canAfford(undefined, 10), false);
});

test('preço digitado: inteiro de 1 a 999.999.999', () => {
  assert.deepEqual(parsePrice('25'), { ok: true, price: 25 });
  assert.deepEqual(parsePrice(' 7,9 '), { ok: true, price: 7 });
  assert.equal(parsePrice('0').ok, false);
  assert.equal(parsePrice('').ok, false);
  assert.equal(parsePrice('abc').ok, false);
  assert.equal(parsePrice(String(MAX_PRICE + 1)).ok, false);
  assert.equal(parsePrice(String(MAX_PRICE)).ok, true);
});

test('opções de venda do formulário do mestre', () => {
  const cur = [{ id: 'c1', name: 'Ouro' }, { id: 'c2', name: 'Prata' }];
  assert.deepEqual(saleOptions({ sell: false }, cur), { ok: true, sell: false });
  assert.deepEqual(saleOptions({ sell: true, currencyId: 'c2', price: '5' }, cur), { ok: true, sell: true, currencyId: 'c2', price: 5 });
  assert.equal(saleOptions({ sell: true, currencyId: 'zz', price: '5' }, cur).currencyId, 'c1'); // moeda inexistente: cai na primeira
  assert.match(saleOptions({ sell: true, currencyId: 'c1', price: '5' }, []).error, /Crie uma moeda/);
  assert.equal(saleOptions({ sell: true, currencyId: 'c1', price: '0' }, cur).ok, false);
});

test('o jogador só vê anúncios ativos; o mestre vê todos', () => {
  const shop = [{ id: 'a', active: true }, { id: 'b', active: false }];
  assert.deepEqual(visibleListings(shop, false).map(l => l.id), ['a']);
  assert.deepEqual(visibleListings(shop, true).map(l => l.id), ['a', 'b']);
  assert.deepEqual(visibleListings(undefined, false), []);
});

test('a migração 0041 existe, é do mestre/dono e não reescreve funções em uso', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0041_master_shop.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.table_shop_items/);
  assert.match(sql, /foreign key \(table_id, currency_id\) references public\.table_currencies/);
  assert.match(sql, /on delete restrict/);
  assert.match(sql, /shop_items_select[^;]*is_gm\(table_id\) or \(active and public\.is_member\(table_id\)\)/s);
  assert.match(sql, /owns_character\(p_character\)/); // comprar só para o próprio personagem
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update/);
  for (const fn of ['gm_shop_upsert', 'gm_shop_delete', 'shop_buy']) assert.match(sql, new RegExp(`public\\.${fn}\\([^)]*\\)[^;]*to authenticated`, 's'), fn);
  assert.doesNotMatch(sql, /create or replace function public\.(grant_money|grant_xp|gm_give_item|gm_adjust_money|gm_wallet_adjust|gm_delete_currency)\(/);
});
