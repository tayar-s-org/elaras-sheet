import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE, FAB_SIZE, clampFabPosition, panelLayout } from './panelGeometry.js';

// Retângulo que o painel flutuante ocupa na janela, a partir do estilo calculado.
function panelRect(style, vp) {
  const top = style.top === 'auto' ? vp.h - style.bottom - style.height : style.top;
  const left = style.left === 'auto' ? vp.w - style.right - style.width : style.left;
  return { top, bottom: top + style.height, left, right: left + style.width };
}

test('janela baixa (800x400, botão em bottom:169): o painel inteiro continua visível e fica compacto', () => {
  const vp = { w: 800, h: 400 };
  const { style, compact } = panelLayout({ right: 16, bottom: 169 }, vp);
  const rect = panelRect(style, vp);
  assert.ok(rect.top >= 0 && rect.bottom <= vp.h, `vertical ${rect.top}..${rect.bottom}`);
  assert.ok(rect.left >= 0 && rect.right <= vp.w);
  assert.equal(compact, true);
  assert.ok(style.zIndex > 40, 'quando cobre o botão, fica por cima dele');
});

test('o painel nunca sai da janela, em qualquer posição do botão e tamanho de janela', () => {
  for (const vp of [{ w: 800, h: 400 }, { w: 1024, h: 500 }, { w: 1280, h: 800 }, { w: 1920, h: 1080 }, { w: 700, h: 360 }]) {
    for (let bottom = EDGE; bottom <= vp.h - FAB_SIZE - EDGE; bottom += 23) {
      for (const right of [EDGE, 16, vp.w / 2, vp.w - FAB_SIZE - EDGE]) {
        const rect = panelRect(panelLayout({ right, bottom }, vp).style, vp);
        assert.ok(rect.top >= 0 && rect.bottom <= vp.h, `${vp.w}x${vp.h} bottom:${bottom} -> ${rect.top}..${rect.bottom}`);
        assert.ok(rect.left >= 0 && rect.right <= vp.w, `${vp.w}x${vp.h} right:${right} -> ${rect.left}..${rect.right}`);
      }
    }
  }
});

test('janela confortável mantém o painel ancorado acima do botão, sem compactar nem cobri-lo', () => {
  const vp = { w: 1280, h: 800 };
  const { style, compact } = panelLayout(null, vp);
  assert.equal(compact, false);
  assert.equal(style.height, 640);
  assert.equal(style.bottom, 16 + FAB_SIZE + 12);
  assert.equal(style.zIndex, undefined);
});

test('botão no alto da janela abre o painel para baixo', () => {
  const vp = { w: 1280, h: 900 };
  const { style } = panelLayout({ right: 16, bottom: 900 - FAB_SIZE - EDGE }, vp);
  assert.equal(style.bottom, 'auto');
  assert.ok(panelRect(style, vp).bottom <= vp.h);
});

test('telas estreitas usam a folha da base; folha só compacta em janela muito baixa', () => {
  assert.deepEqual(panelLayout(null, { w: 390, h: 800 }), { style: undefined, compact: false });
  assert.equal(panelLayout(null, { w: 480, h: 360 }).compact, true);
});

test('a posição do botão é presa à janela', () => {
  const vp = { w: 800, h: 400 };
  assert.deepEqual(clampFabPosition({ right: -50, bottom: 9999 }, vp), { right: EDGE, bottom: vp.h - FAB_SIZE - EDGE });
});

// Altura que cabeçalho e rodapé compacto (sem a faixa de assuntos) tomam do painel.
const COMPACT_CHROME_HEIGHT = 64 + 120;
const MIN_MESSAGE_AREA = 120;

test('em janela baixa, ainda sobra área útil para as mensagens entre cabeçalho e rodapé', () => {
  for (const vp of [{ w: 800, h: 400 }, { w: 1024, h: 420 }, { w: 700, h: 380 }]) {
    for (let bottom = EDGE; bottom <= vp.h - FAB_SIZE - EDGE; bottom += 17) {
      const { style } = panelLayout({ right: 16, bottom }, vp);
      assert.ok(style.height - COMPACT_CHROME_HEIGHT >= MIN_MESSAGE_AREA, `${vp.w}x${vp.h} bottom:${bottom} altura ${style.height}`);
    }
  }
  const sheet = panelLayout(null, { w: 480, h: 420 });
  assert.equal(sheet.compact, true);
});

test('janela minúscula (80px de altura) ainda mantém o painel dentro da janela', () => {
  const vp = { w: 800, h: 80 };
  const rect = panelRect(panelLayout({ right: EDGE, bottom: EDGE }, vp).style, vp);
  assert.ok(rect.top >= 0 && rect.bottom <= vp.h);
});
