import test from 'node:test';
import assert from 'node:assert/strict';
import { skillKey, skillPoints, sanitizeCustomSkills, skillNameTaken, uniqueSkillName, addCustomSkill, removeCustomSkill, MAX_CUSTOM_SKILLS } from './custom.js';
import { newCharacter, calculate, validateCharacter, SKILLS } from '../rules.js';

const FIXED = SKILLS.map(([n]) => n);
const A = '123e4567-e89b-12d3-a456-426614174000';
const B = '123e4567-e89b-12d3-a456-426614174001';

test('custo da perícia personalizada é igual ao das outras: 1 ponto por degrau', () => {
  assert.deepEqual([4, 6, 8, 10, 12].map(skillPoints), [1, 2, 3, 4, 5]);
  const c = { ...newCharacter(), race: 'Outra raça', skills: {} };
  const before = calculate(c).skillCost;
  const withSkill = addCustomSkill(c, { id: A, name: 'Alquimia', die: 8 }, FIXED);
  assert.equal(calculate(withSkill).skillCost, before + 3, 'd8 custa 3 pontos');
});

test('nomes: sem acento e maiúsculas, não repete perícia do livro nem outra personalizada', () => {
  assert.equal(skillKey('  FURTIVIDADE '), skillKey('furtividade'));
  assert.equal(skillKey('Intimidação'), skillKey('intimidacao'));
  const c = { ...newCharacter(), customSkills: [{ id: 'cs-' + A, name: 'Alquimia' }] };
  assert.equal(skillNameTaken('lutar', c, FIXED), true);
  assert.equal(skillNameTaken('ALQUIMIA', c, FIXED), true);
  assert.equal(skillNameTaken('Cartografia', c, FIXED), false);
  assert.equal(uniqueSkillName('Alquimia', c, FIXED), 'Alquimia (2)');
  assert.equal(uniqueSkillName('Lutar', c, FIXED), 'Lutar (2)');
});

test('a ficha mantém a perícia personalizada com o dado e descarta lixo', () => {
  const raw = { ...newCharacter(),
    customSkills: [{ id: 'cs-' + A, name: 'Alquimia' }, { id: 'cs-' + B, name: 'lutar' }, { id: 'ruim', name: 'X' }, { id: 'cs-' + A, name: 'Alquimia' }],
    skills: { Alquimia: 8, lutar: 6, Inventada: 12, Lutar: 4 } };
  const v = validateCharacter(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(v.customSkills, [{ id: 'cs-' + A, name: 'Alquimia' }], 'repetida, igual a do livro e sem id válido saem');
  assert.deepEqual(v.skills, { Lutar: 4, Alquimia: 8 }, 'só perícias do livro e personalizadas aprovadas guardam dado');
  assert.deepEqual(sanitizeCustomSkills('nada', FIXED), []);
});

test('entregar a mesma aprovação duas vezes não duplica; nome ocupado vira "(2)"; remover limpa o dado', () => {
  let c = { ...newCharacter(), skills: { } };
  c = addCustomSkill(c, { id: A, name: 'Alquimia', die: 6 }, FIXED);
  const again = addCustomSkill(c, { id: A, name: 'Alquimia', die: 6 }, FIXED);
  assert.equal(again.customSkills.length, 1);
  const clash = addCustomSkill(c, { id: B, name: 'alquimia', die: 4 }, FIXED);
  assert.deepEqual(clash.customSkills.map(s => s.name), ['Alquimia', 'alquimia (2)']);
  assert.equal(clash.skills['alquimia (2)'], 4);
  const gone = removeCustomSkill(c, 'cs-' + A);
  assert.deepEqual(gone.customSkills, []);
  assert.equal('Alquimia' in gone.skills, false);
});

test('há um limite de perícias personalizadas por ficha', () => {
  let c = { ...newCharacter(), skills: {} };
  for (let i = 0; i < MAX_CUSTOM_SKILLS + 3; i += 1) {
    c = addCustomSkill(c, { id: `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, '0')}`, name: `Perícia ${i}`, die: 4 }, FIXED);
  }
  assert.equal(c.customSkills.length, MAX_CUSTOM_SKILLS);
});
