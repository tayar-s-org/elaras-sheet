import test from 'node:test';
import assert from 'node:assert/strict';
import { usesLegacyImage, canFallBackToLegacy } from './tokenImageLoad.js';

test('usa a imagem antiga sem fonte original ou depois do fallback', () => {
  assert.equal(usesLegacyImage({ sourcePath: '', usingFallback: false }), true);
  assert.equal(usesLegacyImage({ sourcePath: 'a/b', usingFallback: true }), true);
  assert.equal(usesLegacyImage({ sourcePath: 'a/b', usingFallback: false }), false);
});

test('só cai para a imagem antiga uma vez, quando havia fonte e existe imagem antiga', () => {
  assert.equal(canFallBackToLegacy({ sourcePath: 'a/b', usingFallback: false, fallbackPath: 'x.png' }), true);
  assert.equal(canFallBackToLegacy({ sourcePath: 'a/b', usingFallback: true, fallbackPath: 'x.png' }), false);
  assert.equal(canFallBackToLegacy({ sourcePath: '', usingFallback: false, fallbackPath: 'x.png' }), false);
  assert.equal(canFallBackToLegacy({ sourcePath: 'a/b', usingFallback: false, fallbackPath: '' }), false);
});
