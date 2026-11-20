import test from 'node:test';
import assert from 'node:assert/strict';
import { FAILURE, failureKind, toBackendError, BackendError, failsWholeCycle, dataOrNullIfNotInstalled } from './backendError.js';

test('capability not installed is recognised by code and by message', () => {
  assert.equal(failureKind({ code: 'PGRST202', message: 'x' }), FAILURE.notInstalled);
  assert.equal(failureKind({ code: '42P01', message: 'relation "t" does not exist' }), FAILURE.notInstalled);
  assert.equal(failureKind(new Error('Could not find the function public.f in the schema cache')), FAILURE.notInstalled);
  assert.equal(failureKind(new Error('Falta aplicar a migration 0012 (dinheiro) no Supabase.')), FAILURE.notInstalled);
});

test('network failures and server errors are unavailability, not a missing resource', () => {
  assert.equal(failureKind({ message: 'TypeError: Failed to fetch' }), FAILURE.unavailable);
  assert.equal(failureKind({ message: 'boom', status: 503 }), FAILURE.unavailable);
});

test('expired session and permission denied are told apart', () => {
  assert.equal(failureKind({ code: 'PGRST301', message: 'JWT expired' }), FAILURE.sessionExpired);
  assert.equal(failureKind({ message: 'x', status: 401 }), FAILURE.sessionExpired);
  assert.equal(failureKind({ code: '42501', message: 'permission denied for table t' }), FAILURE.denied);
  assert.equal(failureKind({ message: 'new row violates row-level security policy' }), FAILURE.denied);
});

test('business-rule errors keep the server message', () => {
  const error = toBackendError({ code: 'P0001', message: 'Ficha inválida.' }, 'fallback');
  assert.equal(error.kind, FAILURE.rejected);
  assert.equal(error.message, 'Ficha inválida.');
});

test('typed errors keep their kind and use a human message', () => {
  const error = toBackendError({ message: 'Failed to fetch' }, 'fallback');
  assert.ok(error instanceof BackendError);
  assert.match(error.message, /servidor/);
  assert.equal(failureKind(error), FAILURE.unavailable);
  assert.equal(failsWholeCycle(error), true);
  assert.equal(failsWholeCycle({ code: 'P0001', message: 'x' }), false);
});

test('optional reads return null only when the capability is missing', () => {
  assert.deepEqual(dataOrNullIfNotInstalled({ data: [1], error: null }, 'x'), [1]);
  assert.equal(dataOrNullIfNotInstalled({ data: null, error: { code: '42P01', message: 'does not exist' } }, 'x'), null);
  assert.throws(() => dataOrNullIfNotInstalled({ data: null, error: { message: 'Failed to fetch' } }, 'x'), error => error.kind === FAILURE.unavailable);
  assert.throws(() => dataOrNullIfNotInstalled({ data: null, error: { code: '42501', message: 'permission denied' } }, 'x'), error => error.kind === FAILURE.denied);
});
