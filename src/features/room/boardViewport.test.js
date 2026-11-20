import test from 'node:test';
import assert from 'node:assert/strict';
import { boardGeometry, centerViewOn, constrainView, fitWidth, keepIn, refitView, zoomAroundCenter, zoomAroundPoint } from './boardViewport.js';

const W = 2000, H = 1400;

test('boardGeometry usa o padrao 2000x1400 e escala o token pela grade', () => {
  const g = boardGeometry(null);
  assert.equal(g.W, 2000);
  assert.equal(g.H, 1400);
  assert.equal(g.tokenHalf({ size: 1 }), g.gsize * 1.25 / 2);
  assert.equal(boardGeometry({ settings: { tokenScale: 99 } }).tokenUnit({ size: 1 }), boardGeometry(null).gsize * 3);
});

test('keepIn mantem o token inteiro dentro do tabuleiro', () => {
  assert.equal(keepIn(-10, 30, 500), 30);
  assert.equal(keepIn(900, 30, 500), 470);
  assert.equal(keepIn(100, 30, 500), 100);
  assert.equal(keepIn(100, 300, 500), 250);
});

test('constrainView limita o zoom e centraliza o que cabe inteiro', () => {
  const ratio = 0.6;
  assert.equal(fitWidth(W, H, ratio), 2333.3333333333335);
  const zoomedOut = constrainView({ x: 5, y: 5, w: 99999 }, W, H, ratio);
  assert.equal(zoomedOut.w, fitWidth(W, H, ratio));
  assert.equal(zoomedOut.x, (W - zoomedOut.w) / 2);
  assert.equal(constrainView({ x: -50, y: 9999, w: 500 }, W, H, ratio).x, 0);
  assert.equal(constrainView({ x: 0, y: 9999, w: 500 }, W, H, ratio).y, H - 300);
  assert.equal(constrainView(null, W, H, ratio), null);
});

test('zoomAroundPoint mantem o ponto sob o cursor no mesmo lugar da tela', () => {
  const view = { x: 100, y: 100, w: 1000 };
  const point = { x: 400, y: 300 };
  const next = zoomAroundPoint(view, point, 0.5, W, H, 0.6);
  assert.equal(next.w, 500);
  assert.equal((point.x - next.x) / next.w, (point.x - view.x) / view.w);
});

test('zoomAroundCenter e centerViewOn preservam o centro e a largura pedidos', () => {
  const next = zoomAroundCenter({ x: 0, y: 0, w: 1000 }, 0.5, W, H, 0.6);
  assert.deepEqual(next, { w: 500, x: 250, y: 150 });
  assert.deepEqual(centerViewOn({ x: 0, y: 0, w: 800 }, { x: 1000, y: 700 }, W, 0.5), { w: 800, x: 600, y: 500 });
  assert.equal(centerViewOn(null, { x: 0, y: 0 }, W, 0.5).w, W);
});

test('refitView mantem o centro ao mudar a proporcao do SVG', () => {
  const view = { x: 400, y: 300, w: 1000 };
  const next = refitView(view, W, H, 0.6, 0.6);
  assert.deepEqual(next, view);
});
