import test from 'node:test';
import assert from 'node:assert/strict';
import { powerDamage, normalizePowerName } from './powerDamage.js';
import { BOOK_POWERS } from './data/bookPowers.js';
import { newCharacter, validateCharacter } from './rules.js';

test('dano dos poderes que causam dano vem da descrição do livro', () => {
  assert.equal(powerDamage('Raio'), '2d6 por raio (3d6 por 2 pontos de poder)');
  assert.equal(powerDamage('Explosão'), '2d6 (3d6 pelo dobro de pontos de poder)');
  assert.equal(powerDamage('Rajada'), '2d10');
  assert.match(powerDamage('Campo de dano'), /^2d6 \(2d8 com ampliação\)/);
  assert.match(powerDamage('Ferir'), /\+2 no dano da arma/);
  assert.equal(powerDamage('EXPLOSÃO'), powerDamage('explosao'), 'sem acento e sem diferença de caixa');
});

test('poderes sem dano dizem "Sem dano" (com o efeito numérico quando houver)', () => {
  assert.equal(powerDamage('Cura'), 'Sem dano');
  assert.equal(powerDamage('Invisibilidade'), 'Sem dano');
  assert.match(powerDamage('Golpear'), /^Sem dano \(arremessa/);
  assert.match(powerDamage('Drenar pontos de poder'), /1d6\+1/);
});

test('tabela do livro: os 50 poderes têm custo, dano, distância e duração', () => {
  const names = Object.keys(BOOK_POWERS);
  assert.equal(names.length, 50);
  for (const n of names) {
    const p = BOOK_POWERS[n];
    assert.ok(p.cost && p.damage && p.range && p.duration, n);
  }
  assert.equal(BOOK_POWERS[normalizePowerName('Raio')].range, '12/24/48');
  assert.equal(BOOK_POWERS[normalizePowerName('Cura')].duration, 'Instantânea');
});

test('a ficha preenche dano, distância e duração vazios de um poder do livro, sem sobrescrever o que o jogador escreveu', () => {
  const c = newCharacter();
  c.powers = [
    { name: 'Raio', description: '', cost: '1' },
    { name: 'Explosão', description: '', cost: '2', damage: '4d6 (minha regra)' },
    { name: 'Poder que eu inventei', description: '', cost: '' },
  ];
  const v = validateCharacter(c);
  assert.equal(v.powers[0].damage, '2d6 por raio (3d6 por 2 pontos de poder)');
  assert.equal(v.powers[0].range, '12/24/48');
  assert.equal(v.powers[0].duration, 'Instantânea');
  assert.equal(v.powers[1].damage, '4d6 (minha regra)', 'o texto do jogador prevalece');
  assert.equal(v.powers[1].range, '24/48/96');
  assert.deepEqual([v.powers[2].damage, v.powers[2].range, v.powers[2].duration], ['', '', ''], 'poder fora do livro não é inventado');
});

test('nomes um pouco diferentes do livro também acham o poder certo', async () => {
  const { findBookPowerKey } = await import('./data/matchBookPower.js');
  assert.equal(findBookPowerKey('Deflexão (RANGED)', '2'), 'deflexao', 'texto entre parênteses é ignorado');
  assert.equal(findBookPowerKey('Detectar arcano', '2'), 'detectar/ocultar arcano', 'nome com barra vale por partes');
  assert.equal(findBookPowerKey('Ocultar arcano'), 'detectar/ocultar arcano');
  assert.equal(findBookPowerKey('Raios Multiplos', '1 por projétil'), 'raio', 'nome parecido com o mesmo custo');
  assert.equal(findBookPowerKey('Raios Multiplos', '7'), null, 'custo diferente: não confunde com o livro');
  assert.equal(findBookPowerKey('Cura das trevas', '9'), null, 'magia inventada não vira poder do livro');
  assert.equal(findBookPowerKey('Cura maior', '10/20'), 'cura maior', 'o nome mais específico ganha');
  assert.equal(findBookPowerKey('Cura', '3'), 'cura');
  assert.equal(findBookPowerKey('Aumentar característica', '2'), 'aumentar/reduzir característica'.normalize('NFD').replace(/[̀-ͯ]/g, ''));
});

test('a ficha preenche as magias renomeadas da imagem (Raios Múltiplos, Deflexão (RANGED), Detectar arcano)', () => {
  const c = newCharacter();
  c.powers = [
    { name: 'Raios Multiplos', description: '', cost: '1 por projétil' },
    { name: 'Deflexão (RANGED)', description: '', cost: '2' },
    { name: 'Detectar arcano', description: '', cost: '2' },
  ];
  const v = validateCharacter(c);
  assert.equal(v.powers[0].damage, '2d6 por raio (3d6 por 2 pontos de poder)');
  assert.equal(v.powers[0].range, '12/24/48');
  assert.equal(v.powers[1].range, 'Toque');
  assert.equal(v.powers[1].duration, '3 (1/rodada)');
  assert.equal(v.powers[2].range, 'Visão');
  assert.equal(v.powers[2].damage, 'Sem dano');
});
