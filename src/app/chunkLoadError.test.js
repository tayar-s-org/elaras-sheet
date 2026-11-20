import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError } from './chunkLoadError.js';

test('reconhece falha ao baixar um pedaço do app nos principais navegadores', () => {
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/RoomPage-1.js')), true);
  assert.equal(isChunkLoadError(new TypeError('error loading dynamically imported module')), true);
  assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isChunkLoadError(new Error('Unable to preload CSS for /assets/a.css')), true);
  assert.equal(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' })), true);
});

test('erros comuns de renderização não são tratados como falha de carregamento', () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')")), false);
  assert.equal(isChunkLoadError(null), false);
});
