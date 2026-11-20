// Busca de texto no livro. O texto das páginas é normalizado (sem acento, minúsculo) uma única vez, ao montar o índice.
export const normalize = value => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const EXCERPT_LEAD = 65;
const EXCERPT_LENGTH = 180;

export const buildBookIndex = pages => pages.map(page => ({ page: page.page, text: page.text, folded: normalize(page.text) }));

export function searchBookIndex(index, query) {
  const needle = normalize(query.trim());
  if (!needle) return [];
  const hits = [];
  for (const entry of index) {
    const at = entry.folded.indexOf(needle);
    if (at < 0) continue;
    const from = Math.max(0, at - EXCERPT_LEAD);
    hits.push({ page: entry.page, excerpt: entry.text.slice(from, from + EXCERPT_LENGTH) });
  }
  return hits;
}
