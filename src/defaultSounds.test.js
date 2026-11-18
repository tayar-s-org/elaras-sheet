import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DEFAULT_SOUNDS, isBuiltinSound } from './defaultSounds.js';

test('sons padrão: ids únicos, nomes preenchidos e arquivos existem', () => {
  assert.ok(DEFAULT_SOUNDS.length >= 14);
  assert.equal(new Set(DEFAULT_SOUNDS.map(s => s.id)).size, DEFAULT_SOUNDS.length);
  for (const s of DEFAULT_SOUNDS) {
    assert.ok(s.name.trim(), s.id);
    assert.ok(isBuiltinSound(s.id));
    assert.ok(existsSync(new URL(`../public/sounds/${s.file}`, import.meta.url)), s.file);
  }
  assert.equal(isBuiltinSound('3f2a-uuid'), false);
});
