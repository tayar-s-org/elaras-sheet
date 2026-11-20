import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTokenPayload, tokenFileName } from './tokenPayload.js';

const artwork = { sourcePath: 'src-path', legacyPath: 'old.png', sourceFile: null, design: { zoom: 1 } };
const form = { name: '  Goblin ', hp: '12', hideHp: true, hideName: false, size: 2, sheet: null };

test('nome do arquivo baixado só tem letras, números e hífens', () => {
  assert.equal(tokenFileName('Aria da Lua!'), 'token-aria-da-lua-.png');
  assert.equal(tokenFileName(''), 'token-personagem.png');
  assert.equal(tokenFileName('   '), 'token-personagem.png');
});

test('token comum guarda só a arte', () => {
  assert.deepEqual(buildTokenPayload({ creature: undefined, artwork, usingFallback: false, form }), { artwork });
});

test('criatura leva nome limpo, vida, ocultação, tamanho e ficha', () => {
  const payload = buildTokenPayload({ creature: {}, artwork, usingFallback: false, form });
  assert.deepEqual(payload, { artwork, name: 'Goblin', hp: 12, hideHp: true, hideName: false, size: 2, sheet: null });
});

test('com a imagem antiga em uso (fallback) a fonte original não é regravada', () => {
  const payload = buildTokenPayload({ creature: undefined, artwork, usingFallback: true, form });
  assert.equal(payload.artwork.sourcePath, '');
  assert.equal(payload.artwork.legacyPath, 'old.png');
});
