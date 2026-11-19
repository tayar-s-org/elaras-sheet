import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceLevel, incapacitation, steppedDie, effectiveMovement, effectLines, stageLabel, causeLine } from './incapacitation.js';

const max = { life: 8, stamina: 8 };
const at = (life, stamina, faint) => incapacitation({ life, stamina, faint }, max);

test('nível de cada reserva: metade conta, 25% exato ainda não é "abaixo de 25%"', () => {
  assert.equal(resourceLevel(8, 8), 0);
  assert.equal(resourceLevel(5, 8), 0);   // 62,5%
  assert.equal(resourceLevel(4, 8), 1);   // exatamente a metade
  assert.equal(resourceLevel(3, 8), 1);
  assert.equal(resourceLevel(2, 8), 1);   // exatamente 25%: ainda não é menos de 25%
  assert.equal(resourceLevel(1, 8), 2);
  assert.equal(resourceLevel(0, 8), 2);
  assert.equal(resourceLevel(5, 10), 1);  // metade de 10
  assert.equal(resourceLevel(2, 10), 2);  // 20%
  assert.equal(resourceLevel(0, 0), 0);
});

test('as incapacitações somam entre Vida e Stamina', () => {
  assert.equal(at(8, 8).total, 0);
  assert.equal(at(4, 8).total, 1);        // só a vida na metade
  assert.equal(at(8, 4).total, 1);
  assert.equal(at(4, 4).total, 2);        // 1 em cada = incapacitação 2
  assert.equal(at(1, 8).total, 2);        // vida abaixo de 25% = estágio 2
  assert.equal(at(1, 4).total, 3);        // já no estágio 2 e sofre outra
  assert.equal(at(4, 1).total, 3);
  assert.equal(at(1, 1).total, 4);        // as duas reservas gerando estágio 2
  assert.deepEqual(at(1, 4).levels, { life: 2, stamina: 1 });
});

test('efeitos por estágio: dados 0,1,1,2,2 e movimento 0,0,2,2,6', () => {
  const rows = [[8, 8], [4, 8], [4, 4], [1, 4], [1, 1]];
  assert.deepEqual(rows.map(([l, s]) => at(l, s).dieSteps), [0, 1, 1, 2, 2]);
  assert.deepEqual(rows.map(([l, s]) => at(l, s).movePenalty), [0, 0, 2, 2, 6]);
});

test('incapacitação 5: só desmaia no estágio 4 e quando o mestre marca', () => {
  assert.equal(at(1, 1).stage, 4);
  assert.equal(at(1, 1, { fainted: true, hours: 3 }).stage, 5);
  assert.equal(at(1, 1, { fainted: true }).fainted, true);
  assert.equal(at(1, 1, { hours: 3 }).fainted, false);
  assert.equal(at(1, 1, { hours: 3 }).faintHours, 3);
  assert.equal(at(1, 4, { fainted: true }).fainted, false);   // sem estágio 4, marca antiga é ignorada
  assert.equal(at(1, 1, { hours: 0 }).faintHours, null);
  assert.equal(at(8, 8).faintHours, null);
});

test('valor atual ausente conta como cheio e valores fora da faixa são limitados', () => {
  assert.equal(incapacitation({}, max).total, 0);
  assert.equal(incapacitation({ life: -5, stamina: 99 }, max).levels.life, 2);
  assert.equal(incapacitation({ life: -5, stamina: 99 }, max).levels.stamina, 0);
});

test('o d4 é o menor dado possível: nem atributos nem perícias descem dele', () => {
  assert.deepEqual(steppedDie(8, 1), { die: 6, bonus: 0 });
  assert.deepEqual(steppedDie(8, 2), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(12, 2), { die: 8, bonus: 0 });
  assert.deepEqual(steppedDie(6, 2), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(4, 1), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(4, 2), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(8, 0), { die: 8, bonus: 0 });
  assert.deepEqual(steppedDie(4, 1, 'skill'), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(4, 2, 'skill'), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(6, 1, 'skill'), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(6, 2, 'skill'), { die: 4, bonus: 0 });   // d6 → d4 e para aí
  assert.deepEqual(steppedDie(8, 2, 'skill'), { die: 4, bonus: 0 });
  assert.deepEqual(steppedDie(0, 0, 'skill'), { die: 4, bonus: -2 });   // sem treino: d4−2
  assert.deepEqual(steppedDie(12, 1, 'skill', 2), { die: 12, bonus: 1 });   // d12+2 → d12+1
  assert.deepEqual(steppedDie(12, 2, 'skill', 2), { die: 12, bonus: 0 });   // d12+2 → d12
  assert.deepEqual(steppedDie(12, 2, 'skill', 3), { die: 12, bonus: 1 });
  assert.deepEqual(steppedDie(12, 2, 'attribute', 1), { die: 10, bonus: 0 }); // d12+1 → d12 → d10
  assert.deepEqual(steppedDie(12, 1, 'attribute', 0), { die: 10, bonus: 0 });
  assert.deepEqual(steppedDie(12, 0, 'attribute', 4), { die: 12, bonus: 4 });
  assert.deepEqual(steppedDie(8, 1, 'attribute', 5), { die: 6, bonus: 0 }, 'bônus só existe com dado-base d12');
  assert.deepEqual(steppedDie(0, 1, 'skill'), { die: 4, bonus: -2 });   // sem treino não piora com a incapacitação
});

test('movimentação nunca fica abaixo de 1', () => {
  assert.equal(effectiveMovement(5, 2), 3);
  assert.equal(effectiveMovement(5, 6), 1);
  assert.equal(effectiveMovement(2, 2), 1);
  assert.equal(effectiveMovement(1, 0), 1);
});

test('textos de estágio, efeitos e causa', () => {
  assert.equal(stageLabel(at(8, 8)), 'Sem incapacitação');
  assert.equal(stageLabel(at(4, 4)), 'Incapacitação 2');
  assert.equal(stageLabel(at(1, 1, { fainted: true })), 'Incapacitação 5 · Desmaiado');
  assert.deepEqual(effectLines(at(8, 8)), []);
  assert.deepEqual(effectLines(at(4, 8)), ['−1 estágio em todos os dados (nunca abaixo de d4)']);
  assert.equal(effectLines(at(1, 4)).length, 2);
  assert.match(effectLines(at(1, 4))[0], /−2 estágios/);
  assert.match(effectLines(at(1, 1, { fainted: true })).join('|'), /−6 de Movimentação.*Desmaiado/);
  assert.equal(causeLine(at(4, 1)), 'Vida na metade · Stamina abaixo de 25%');
});
