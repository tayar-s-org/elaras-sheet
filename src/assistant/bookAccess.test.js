import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_FAILURE, BookLoadError, failureForStatus, bookFailureMessage } from './bookAccess.js';

test('cada status do livro vira uma causa diferente', () => {
  assert.equal(failureForStatus(404), BOOK_FAILURE.NOT_INSTALLED);
  assert.equal(failureForStatus(410), BOOK_FAILURE.NOT_INSTALLED);
  assert.equal(failureForStatus(401), BOOK_FAILURE.SESSION_EXPIRED);
  assert.equal(failureForStatus(403), BOOK_FAILURE.DENIED);
  assert.equal(failureForStatus(500), BOOK_FAILURE.UNAVAILABLE);
  assert.equal(failureForStatus(503), BOOK_FAILURE.UNAVAILABLE);
});

test('as mensagens ao usuário distinguem as causas e não confundem com erro inesperado', () => {
  const messages = Object.values(BOOK_FAILURE).map(reason => bookFailureMessage(new BookLoadError(reason)));
  assert.equal(new Set(messages).size, messages.length);
  assert.match(bookFailureMessage(new BookLoadError(BOOK_FAILURE.NOT_INSTALLED)), /não está instalado/);
  assert.match(bookFailureMessage(new BookLoadError(BOOK_FAILURE.SESSION_EXPIRED)), /sessão expirou/);
  assert.match(bookFailureMessage(new BookLoadError(BOOK_FAILURE.DENIED)), /permissão/);
  assert.match(bookFailureMessage(new TypeError('x is undefined')), /Algo deu errado/);
});
