import test from 'node:test';
import assert from 'node:assert/strict';
import { soundFileError, soundName, applySoundEvent, SOUND_MAX_BYTES } from './soundpad.js';

test('som: aceita MP3/M4A/MP4 até 5 MB', () => {
  assert.equal(soundFileError({ type: 'audio/mpeg', size: 1000 }), null);
  assert.equal(soundFileError({ type: 'audio/mpeg', size: SOUND_MAX_BYTES }), null);
  assert.match(soundFileError({ type: 'audio/mpeg', size: SOUND_MAX_BYTES + 1 }), /5 MB/);
  assert.match(soundFileError({ type: 'audio/wav', size: 10 }), /MP3/);
  assert.ok(soundFileError(null));
});

test('nome do botão vem do arquivo', () => {
  assert.equal(soundName('porta_rangendo.mp3'), 'porta rangendo');
  assert.equal(soundName('Trovão-forte.m4a'), 'Trovão forte');
  assert.equal(soundName(''), 'Som');
  assert.equal(soundName('x'.repeat(100) + '.mp3').length, 40);
});

test('eventos de reprodução mantêm a lista de sons ativos', () => {
  let a = applySoundEvent([], { id: 'a', action: 'play' });
  a = applySoundEvent(a, { id: 'b', action: 'play' });
  a = applySoundEvent(a, { id: 'a', action: 'play' });
  assert.deepEqual(a, ['a', 'b']);
  assert.deepEqual(applySoundEvent(a, { id: 'a', action: 'stop' }), ['b']);
  assert.deepEqual(applySoundEvent(a, { action: 'stopAll' }), []);
  assert.deepEqual(applySoundEvent(a, { action: 'x' }), ['a', 'b']);
  assert.deepEqual(applySoundEvent(a, null), ['a', 'b']);
});
