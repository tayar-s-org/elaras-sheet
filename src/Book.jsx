import React, { useEffect, useMemo, useState } from 'react';
import { buildBookIndex, searchBookIndex } from './bookSearch.js';

export default function Book({ requestedPage }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(requestedPage || 1);
  const [mode, setMode] = useState('original');
  const [zoom, setZoom] = useState(100);
  const [fontSize, setFontSize] = useState(18);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}assets/book.json`, {signal:controller.signal})
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setBook).catch(e => {if (e.name !== 'AbortError') setError(true);});
    return () => controller.abort();
  }, []);
  useEffect(() => { if (requestedPage) setPage(requestedPage); }, [requestedPage]);
  const index = useMemo(() => (book ? buildBookIndex(book.pages) : []), [book]);
  const hits = useMemo(() => searchBookIndex(index, query), [index, query]);
  if (error) return <p role="alert">Não foi possível carregar o livro. Recarregue a página.</p>;
  if (!book) return <p role="status">Carregando livro…</p>;
  const current = book.pages[page - 1];
  const go = (n) => setPage(Math.max(1, Math.min(book.pages.length, n)));
  return <section className="book-reader">
    <h3>Livro completo</h3>
    <p className="muted">Todas as {book.pages.length} páginas do PDF. O modo original preserva imagens e tabelas. A numeração é a do arquivo; a página impressa pode ser diferente.</p>
    <label className="field"><span>Buscar no livro</span><input type="search" value={query} placeholder="Nome, regra ou expressão…" onChange={e => setQuery(e.target.value)} /></label>
    {query.trim() && <details className="book-search" open><summary>{hits.length} páginas encontradas</summary>
      <div className="book-results">{hits.map(p => <button key={p.page} onClick={() => go(p.page)} aria-pressed={page === p.page}>
        <b>Página {p.page}</b><p>{p.excerpt}</p>
      </button>)}</div>
      {!hits.length && <p>Nenhum resultado. Páginas compostas só por imagens podem ser consultadas no modo original.</p>}
    </details>}
    <div className="reader-toolbar">
      <div className="reader-navigation"><button className="outline" disabled={page === 1} onClick={() => go(page-1)}>← Anterior</button>
        <label>Página <select aria-label="Ir para página do livro" value={page} onChange={e => go(Number(e.target.value))}>{book.pages.map(p => <option key={p.page} value={p.page}>{p.page}</option>)}</select> de {book.pages.length}</label>
        <button className="outline" disabled={page === book.pages.length} onClick={() => go(page+1)}>Próxima →</button></div>
      <div className="reader-options"><label>Leitura <select value={mode} onChange={e => setMode(e.target.value)}><option value="original">Página original</option><option value="text">Texto ampliado</option></select></label>
        {mode === 'original' ? <label>Zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[100,125,150,200].map(v => <option key={v} value={v}>{v === 100 ? 'Ajustar à largura' : `${v}%`}</option>)}</select></label>
          : <label>Fonte <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>{[16,18,20,24].map(v => <option key={v} value={v}>{v}px</option>)}</select></label>}
      </div>
    </div>
    <h3>Página {page}</h3>
    {mode === 'original' ? <div className="original-page" key={page}><img style={{width:`${zoom}%`,maxWidth:'none'}} src={`${import.meta.env.BASE_URL}assets/book/${page}.webp`} alt={`Página ${page} do livro original. Use Texto ampliado para leitura textual quando disponível.`} /></div>
      : <article className="readable-page" style={{fontSize}}>{current.blocks.length ? current.blocks.map((text,i) => <p key={i}>{text}</p>) : <p>Esta página não possui texto extraível. Escolha “Página original” para ver seu conteúdo.</p>}</article>}
    <div className="reader-navigation reader-bottom"><button className="outline" disabled={page===1} onClick={() => go(page-1)}>← Anterior</button><span>{page} / {book.pages.length}</span><button className="outline" disabled={page===book.pages.length} onClick={() => go(page+1)}>Próxima →</button></div>
  </section>;
}
