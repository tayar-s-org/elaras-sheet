import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter } from '../../rules.js';
import { editSheet } from '../../sheets.js';
import { readDie } from '../../rpg/dice.js';
import { recordAppliedBenefits } from '../../rpg/benefitLedger.js';
import { deliverBenefits } from './deliverBenefits.js';
import { applyBenefits, confirmableBenefits, unappliedBenefits } from './pendingBenefits.js';
import { BENEFIT_RULES } from './benefitRules.js';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const CLOUD_ID = id(900);
const evolution = (n, name = 'Lutar') => ({ id: id(n), character_id: CLOUD_ID, kind: 'skill', name });
const noPending = { evolutions: [], spellUpgrades: [], customSkills: [] };

// Sessão de uma ficha na nuvem; `base` é o que a nuvem guardou da última vez.
function fixture({ character = { ...newCharacter(), skills: { Lutar: 6 } }, saved = character } = {}) {
  const state = { session: { activeId: 'a', sheets: [{ id: 'a', character, cloud: { id: CLOUD_ID, revision: 1, base: JSON.stringify(saved) } }] }, notices: [], confirmed: [] };
  const ctx = {
    readSession: () => state.session,
    editCharacter: (sheetId, edit) => { state.session = editSheet(state.session, sheetId, edit); },
    notify: message => state.notices.push(message),
    confirm: async ids => { state.confirmed.push(ids); },
    isCurrent: () => true,
  };
  return { state, ctx };
}
const persist = state => { const [sheet] = state.session.sheets; sheet.cloud.base = JSON.stringify(sheet.character); };

test('applying twice with the same ids changes the sheet only once', () => {
  const base = { ...newCharacter(), skills: { Lutar: 6 } };
  const once = applyBenefits(base, BENEFIT_RULES.evolutions, [evolution(1)]);
  const twice = applyBenefits(once, BENEFIT_RULES.evolutions, [evolution(1)]);
  assert.equal(readDie(once, 'skill', 'Lutar').die, 8);
  assert.deepEqual(twice, once);
  assert.deepEqual(unappliedBenefits(once, [evolution(1), evolution(2)]).map(b => b.id), [id(2)]);
});

test('phase 1 applies and notifies but does not confirm before the sheet is saved', async () => {
  const { state, ctx } = fixture();
  await deliverBenefits(ctx, 'a', { ...noPending, evolutions: [evolution(1)] });
  assert.equal(readDie(state.session.sheets[0].character, 'skill', 'Lutar').die, 8);
  assert.equal(state.notices.length, 1);
  assert.deepEqual(state.confirmed, []);
});

test('phase 2 confirms by id once the saved copy has the ledger, without applying again', async () => {
  const { state, ctx } = fixture();
  const pending = { ...noPending, evolutions: [evolution(1)] };
  await deliverBenefits(ctx, 'a', pending);
  persist(state);
  await deliverBenefits(ctx, 'a', pending);
  assert.equal(readDie(state.session.sheets[0].character, 'skill', 'Lutar').die, 8);
  assert.equal(state.notices.length, 1);
  assert.deepEqual(state.confirmed, [{ evolutions: [id(1)], spellUpgrades: [], customSkills: [] }]);
});

test('a lost confirmation is retried without a second application (other device or reload)', async () => {
  const applied = recordAppliedBenefits({ ...newCharacter(), skills: { Lutar: 8 } }, [id(1)]);
  const { state, ctx } = fixture({ character: applied });
  await deliverBenefits(ctx, 'a', { ...noPending, evolutions: [evolution(1)] });
  assert.equal(readDie(state.session.sheets[0].character, 'skill', 'Lutar').die, 8);
  assert.deepEqual(state.notices, []);
  assert.equal(state.confirmed.length, 1);
});

test('only the benefits of this sheet are applied and a new one is applied next to an old one', async () => {
  const done = recordAppliedBenefits({ ...newCharacter(), skills: { Lutar: 8 } }, [id(1)]);
  const { state, ctx } = fixture({ character: done });
  const foreign = { ...evolution(3), character_id: id(901) };
  await deliverBenefits(ctx, 'a', { ...noPending, evolutions: [evolution(1), evolution(2), foreign] });
  assert.equal(readDie(state.session.sheets[0].character, 'skill', 'Lutar').die, 10);
  assert.deepEqual(state.session.sheets[0].character.appliedBenefits, [id(1), id(2)]);
});

test('spell upgrades and custom skills follow the same two-phase rule', async () => {
  const character = { ...newCharacter(), powers: [{ id: 'p0-x', name: 'Raio', upgrades: [] }] };
  const { state, ctx } = fixture({ character });
  const pending = {
    evolutions: [],
    spellUpgrades: [{ id: id(5), character_id: CLOUD_ID, spell_id: 'p0-x', n: 1, description: 'Mais forte', at: '2026-11-20' }],
    customSkills: [{ id: id(6), character_id: CLOUD_ID, name: 'Alquimia', die: 6, attribute: 'Astúcia' }],
  };
  await deliverBenefits(ctx, 'a', pending);
  const sheet = state.session.sheets[0].character;
  assert.equal(sheet.powers[0].upgrades.length, 1);
  assert.equal(sheet.customSkills[0].name, 'Alquimia');
  assert.equal(state.notices.length, 2);
  persist(state);
  await deliverBenefits(ctx, 'a', pending);
  assert.deepEqual(state.confirmed, [{ evolutions: [], spellUpgrades: [id(5)], customSkills: [id(6)] }]);
  assert.equal(state.session.sheets[0].character.powers[0].upgrades.length, 1);
});

test('nothing is confirmed when the saved copy cannot be read', () => {
  assert.deepEqual(confirmableBenefits([evolution(1)], 'not json'), []);
  assert.deepEqual(confirmableBenefits([evolution(1)], JSON.stringify({})), []);
});
