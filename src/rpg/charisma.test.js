import test from 'node:test';
import assert from 'node:assert/strict';
import { newCharacter, calculate } from '../rules.js';
import { applyRace } from '../templates.js';
import { charismaBreakdown, charismaTitle, signed } from './charisma.js';

const withAdv = (c, ...names) => ({ ...c, advantages: names.map(name => ({ name })) });
const withHind = (c, ...list) => ({ ...c, hindrances: list.map(([name, severity]) => ({ name, severity })) });

test('ficha em branco tem Carisma 0 e nada condicional', () => {
  const b = charismaBreakdown(newCharacter());
  assert.equal(b.total, 0);
  assert.deepEqual(b.conditional, []);
  assert.equal(calculate(newCharacter()).charismaTotal, 0);
});

test('vantagens somam; Muito Atraente substitui Atraente', () => {
  assert.equal(charismaBreakdown(withAdv(newCharacter(), 'Atraente', 'Carismático')).total, 4);
  assert.equal(charismaBreakdown(withAdv(newCharacter(), 'Atraente', 'Muito Atraente')).total, 4);
  assert.equal(charismaBreakdown(withAdv(newCharacter(), 'Nobre')).total, 2);
});

test('vantagem repetida na ficha conta uma vez', () => {
  assert.equal(charismaBreakdown(withAdv(newCharacter(), 'Atraente', 'Atraente')).total, 2);
});

test('complicações subtraem; as situacionais ficam à parte', () => {
  const b = charismaBreakdown(withHind(newCharacter(), ['Feio', 'Menor'], ['Sanguinário', 'Maior'], ['Um Olho Só', 'Maior']));
  assert.equal(b.total, -2, 'só Feio vale sempre');
  assert.deepEqual(b.conditional.map(e => [e.name, e.value]), [['Sanguinário', -4], ['Um Olho Só', -1]]);
});

test('Hábito conta só na gravidade Menor', () => {
  assert.equal(charismaBreakdown(withHind(newCharacter(), ['Hábito', 'Menor'])).total, -1);
  assert.equal(charismaBreakdown(withHind(newCharacter(), ['Hábito', 'Maior'])).total, 0);
});

test('nomes sem acento ou com outra caixa também valem', () => {
  assert.equal(charismaBreakdown(withAdv(newCharacter(), 'carismatico')).total, 2);
});

test('raça: Sáurio −2 sempre; Meio-elfo −2 só diante de outras raças; Rakashano só condicional', () => {
  let b = charismaBreakdown(applyRace(newCharacter(), 'Sáurio'));
  assert.equal(b.total, -2);
  b = charismaBreakdown(applyRace(newCharacter(), 'Meio-elfo'));
  assert.equal(b.total, 0);
  assert.deepEqual(b.conditional.map(e => e.value), [-2]);
  b = charismaBreakdown(applyRace(newCharacter(), 'Rakashano'));
  assert.equal(b.total, 0);
  assert.deepEqual(b.conditional.map(e => e.value), [-4, -4]);
});

test('o total soma raça, vantagens e complicações', () => {
  const c = withHind(withAdv(applyRace(newCharacter(), 'Sáurio'), 'Atraente'), ['Feio', 'Menor']);
  assert.equal(calculate(c).charismaTotal, -2);
  assert.equal(calculate(c).charisma, -2, 'charisma continua sendo só o racial');
});

test('formatação do valor e da dica', () => {
  assert.deepEqual([signed(2), signed(-2), signed(0)], ['+2', '−2', '0']);
  assert.equal(charismaTitle(charismaBreakdown(newCharacter())), 'Nada altera o Carisma');
  assert.match(charismaTitle(charismaBreakdown(withAdv(newCharacter(), 'Atraente'))), /Vantagem Atraente \+2/);
});
