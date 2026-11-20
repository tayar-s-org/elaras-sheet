import test from 'node:test';
import assert from 'node:assert/strict';
import { attributesLine, skillsLine } from './pdf.js';
import { newCharacter } from './rules.js';

test('PDF imprime o bônus de d12+N em atributos e perícias', () => {
  const c = newCharacter();
  c.attributes.Astúcia = 12;
  c.bonuses.attributes.Astúcia = 2;
  c.skills = { Atirar: 12, Furtividade: 8, Jogar: 0 };
  c.bonuses.skills.Atirar = 3;
  assert.match(attributesLine(c), /Astúcia d12\+2/);
  assert.match(attributesLine(c), /Agilidade d4/);
  assert.equal(skillsLine(c), 'Atirar d12+3 | Furtividade d8');
});
