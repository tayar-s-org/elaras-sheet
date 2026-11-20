import test from 'node:test';
import assert from 'node:assert/strict';
import { latestDiceEntries, latestVitalEntries } from './tableLogEntries.js';

const msg = (id, at, body = 'oi') => ({ id, created_at: at, body });
const roll = (id, at) => ({ id, created_at: at });
const keys = list => list.map(e => e.key);

test('latestDiceEntries: mistura mensagens e rolagens, mais recente primeiro', () => {
  const out = latestDiceEntries(
    [msg(1, '2026-01-01T10:00:00Z'), msg(2, '2026-01-01T12:00:00Z')],
    [roll(1, '2026-01-01T11:00:00Z')],
    new Set(),
  );
  assert.deepEqual(keys(out), ['m2', 'r1', 'm1']);
});

test('latestDiceEntries: esconde rolagens em animacao e avisos antigos de recompensa', () => {
  const out = latestDiceEntries(
    [msg(1, '2026-01-01T10:00:00Z', '✨ O mestre concedeu +5 XP a Ana'), msg(2, '2026-01-01T10:01:00Z')],
    [roll(1, '2026-01-01T10:02:00Z'), roll(2, '2026-01-01T10:03:00Z')],
    new Set([2]),
  );
  assert.deepEqual(keys(out), ['r1', 'm2']);
});

test('latestDiceEntries: com historico enorme devolve so as ultimas entradas, sem ordenar tudo', () => {
  const at = i => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
  const messages = Array.from({ length: 5000 }, (_, i) => msg(i + 1, at(i)));
  const rolls = Array.from({ length: 5000 }, (_, i) => roll(i + 1, at(i)));
  const out = latestDiceEntries(messages, rolls, new Set(), 4);
  assert.deepEqual(keys(out), ['r5000', 'm5000', 'r4999', 'm4999']);
});

test('latestVitalEntries: mais recente primeiro; jogador nao ve a mana dos outros', () => {
  const log = [
    { id: 1, resource: 'life', character_id: 'a' },
    { id: 2, resource: 'mana', character_id: 'b' },
    { id: 3, resource: 'mana', character_id: 'me' },
    { id: 4, resource: 'stamina', character_id: 'b' },
  ];
  assert.deepEqual(latestVitalEntries(log, { isGm: false, characterId: 'me' }).map(v => v.id), [4, 3, 1]);
  assert.deepEqual(latestVitalEntries(log, { isGm: true, characterId: null }, 2).map(v => v.id), [4, 3]);
  assert.deepEqual(latestVitalEntries(null, { isGm: true }), []);
});
