import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFileError, MAX_IMAGE_BYTES } from './tokenImageFile.js';

test('aceita PNG, JPEG, WebP e GIF dentro do limite', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) assert.equal(imageFileError({ type, size: 1000 }), '');
  assert.equal(imageFileError({ type: 'image/png', size: MAX_IMAGE_BYTES }), '');
});

test('recusa outros formatos e arquivos acima de 8 MB', () => {
  assert.match(imageFileError({ type: 'image/svg+xml', size: 10 }), /PNG, JPEG, WebP ou GIF/);
  assert.match(imageFileError({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }), /8 MB/);
});
