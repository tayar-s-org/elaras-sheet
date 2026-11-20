import test from 'node:test';
import assert from 'node:assert/strict';
import { draggedOffset, wheelZoom, offsetToPercent, offsetFromPercent, ZOOM_MIN, ZOOM_MAX } from './tokenFraming.js';

test('arrastar move a imagem proporcionalmente e nunca passa de -1 a 1', () => {
  assert.equal(draggedOffset(0, 32, 320), 0.1);
  assert.equal(draggedOffset(0.9, 100, 320), 1);
  assert.equal(draggedOffset(-0.9, -100, 320), -1);
});

test('a roda aproxima ou afasta dentro dos limites do zoom', () => {
  assert.ok(wheelZoom(1, -1) > 1);
  assert.ok(wheelZoom(1, 1) < 1);
  assert.equal(wheelZoom(ZOOM_MAX, -1), ZOOM_MAX);
  assert.equal(wheelZoom(ZOOM_MIN, 1), ZOOM_MIN);
});

test('campos de posição (teclado) convertem porcentagem inteira de e para o deslocamento', () => {
  assert.equal(offsetToPercent(0.256), 26);
  assert.equal(offsetToPercent(-3), -100);
  assert.equal(offsetFromPercent('25'), 0.25);
  assert.equal(offsetFromPercent(250), 1);
  assert.equal(offsetFromPercent(-250), -1);
});
