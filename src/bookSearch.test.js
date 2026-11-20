import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBookIndex, searchBookIndex, normalize } from './bookSearch.js';

// Comportamento anterior do leitor (Book.jsx), copiado para garantir que a busca otimizada acha e recorta igual.
function legacySearch(pages, query) {
  if (!query.trim()) return [];
  return pages
    .filter(p => normalize(p.text).includes(normalize(query.trim())))
    .map(p => {
      const from = Math.max(0, normalize(p.text).indexOf(normalize(query.trim())) - 65);
      return { page: p.page, excerpt: p.text.slice(from, from + 180) };
    });
}

const samplePages = [
  { page: 1, text: 'Capítulo um: A Ação começa. Poderes e Perícias.' },
  { page: 2, text: 'Ferimentos, Abalado e Incapacitado. AÇÃO é tudo.' },
  { page: 3, text: '' },
  { page: 4, text: 'x'.repeat(300) + ' Armadura Pesada ' + 'y'.repeat(300) },
];

test('busca indexada devolve as mesmas páginas e trechos que a busca anterior (dados de exemplo)', () => {
  const index = buildBookIndex(samplePages);
  for (const query of ['acao', 'AÇÃO', '  ação  ', 'pericias', 'armadura pesada', 'inexistente', '', '   ', 'Abalado e inc']) {
    assert.deepEqual(searchBookIndex(index, query), legacySearch(samplePages, query), `consulta "${query}"`);
  }
});

test('busca indexada devolve o mesmo que a busca anterior no livro real', () => {
  const { pages } = JSON.parse(readFileSync(new URL('../public/assets/book.json', import.meta.url), 'utf8'));
  const index = buildBookIndex(pages);
  for (const query of ['aparar', 'Pontos de Poder', 'Ação', 'ferimento', 'zzzz', 'dano']) {
    assert.deepEqual(searchBookIndex(index, query), legacySearch(pages, query), `consulta "${query}"`);
  }
});

test('o índice guarda o texto normalizado uma vez, e o trecho vem do texto original com acentos', () => {
  const [entry] = buildBookIndex([{ page: 7, text: 'Ação Rápida' }]);
  assert.equal(entry.folded, 'acao rapida');
  assert.equal(searchBookIndex([entry], 'rapida')[0].excerpt, 'Ação Rápida');
});
