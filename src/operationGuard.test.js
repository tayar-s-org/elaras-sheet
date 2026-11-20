import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationGuard } from './operationGuard.js';

test('o token vale até algo o invalidar', () => {
  const guard = createOperationGuard();
  assert.equal(guard.isCurrent(guard.begin('a')), true);
});

test('uma nova operação da mesma chave invalida a anterior, sem afetar outras chaves', () => {
  const guard = createOperationGuard();
  const first = guard.begin('a');
  const other = guard.begin('b');
  const second = guard.begin('a');
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(guard.isCurrent(other), true);
});

test('cancel invalida só a chave pedida', () => {
  const guard = createOperationGuard();
  const a = guard.begin('a');
  const b = guard.begin('b');
  guard.cancel('a');
  assert.equal(guard.isCurrent(a), false);
  assert.equal(guard.isCurrent(b), true);
});

test('cancelAll invalida tudo, mas operações novas voltam a valer', () => {
  const guard = createOperationGuard();
  const a = guard.begin('a');
  const b = guard.begin('b');
  guard.cancelAll();
  assert.equal(guard.isCurrent(a), false);
  assert.equal(guard.isCurrent(b), false);
  assert.equal(guard.isCurrent(guard.begin('a')), true);
});

test('operação pendente depois de await respeita o cancelamento', async () => {
  const guard = createOperationGuard();
  const played = [];
  const play = async id => {
    const token = guard.begin(id);
    await new Promise(r => setTimeout(r, 5));
    if (guard.isCurrent(token)) played.push(id);
  };
  const first = play('x');
  const second = play('x'); // plays concorrentes do mesmo som: só o último toca
  const third = play('y');
  guard.cancel('y');
  await Promise.all([first, second, third]);
  assert.deepEqual(played, ['x']);
});
