import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter, validateCharacter } from '../rules.js';
import { sanitizeAppliedBenefits, recordAppliedBenefits, appliedBenefitIds, MAX_APPLIED_BENEFITS } from './benefitLedger.js';

const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('sanitize keeps unique benefit ids only', () => {
  assert.deepEqual(sanitizeAppliedBenefits([id(1), id(1), 'x', 7, null, id(2)]), [id(1), id(2)]);
  assert.deepEqual(sanitizeAppliedBenefits('nope'), []);
});

test('the ledger keeps the newest ids when it overflows', () => {
  const many = Array.from({ length: MAX_APPLIED_BENEFITS + 5 }, (_, n) => id(n + 1));
  const ledger = sanitizeAppliedBenefits(many);
  assert.equal(ledger.length, MAX_APPLIED_BENEFITS);
  assert.equal(ledger.at(-1), id(MAX_APPLIED_BENEFITS + 5));
});

test('recording is additive and does not mutate the sheet', () => {
  const sheet = newCharacter();
  const next = recordAppliedBenefits(recordAppliedBenefits(sheet, [id(1)]), [id(1), id(2)]);
  assert.deepEqual(next.appliedBenefits, [id(1), id(2)]);
  assert.equal(sheet.appliedBenefits, undefined);
  assert.deepEqual([...appliedBenefitIds(next)], [id(1), id(2)]);
});

// A ficha passa por validateCharacter ao salvar e ao carregar; sem manter o registro ali, ele se perderia e o benefício seria reaplicado.
test('validateCharacter keeps the ledger so it survives saving and loading', () => {
  const sheet = recordAppliedBenefits(newCharacter(), [id(1), id(2)]);
  assert.deepEqual(validateCharacter(sheet).appliedBenefits, [id(1), id(2)]);
});

test('a sheet without applied benefits keeps no ledger key (a blank sheet stays equal to a new one)', () => {
  assert.equal('appliedBenefits' in validateCharacter(newCharacter()), false);
});
