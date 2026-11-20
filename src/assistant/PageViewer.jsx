import React, { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';

const TOTAL_PAGES = 218;
const PRINTED_PAGE_OFFSET = 2; // o PDF tem 2 páginas a mais que o livro impresso
const pageImage = page => `${import.meta.env.BASE_URL}assets/book/${page}.webp`;

// A página do livro abre num modal de verdade: o foco fica preso nele, o resto da tela fica inerte e, ao fechar,
// o foco volta ao link "pág. N" que o abriu (e não ao campo do chat).
export default function PageViewer({ page, onClose, onGo }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [page]);
  return (
    <Modal onClose={onClose} aria-label={`Página ${page} do livro`}>
      <div className="as-viewer-box">
        <header>
          <strong>Página {Math.max(1, page - PRINTED_PAGE_OFFSET)} do livro</strong>
          <span>PDF {page} de {TOTAL_PAGES}</span>
          <button type="button" className="as-icon" aria-label="Fechar a página" data-modal-focus onClick={onClose}>×</button>
        </header>
        <div className="as-viewer-scroll">
          {failed ? <p role="alert">Não foi possível carregar a imagem da página.</p> : <img src={pageImage(page)} alt={`Página ${page} do PDF do livro`} onError={() => setFailed(true)} />}
        </div>
        <footer>
          <button type="button" className="outline" disabled={page <= 1} onClick={() => onGo(page - 1)}>← Anterior</button>
          <button type="button" className="outline" disabled={page >= TOTAL_PAGES} onClick={() => onGo(page + 1)}>Próxima →</button>
        </footer>
      </div>
    </Modal>
  );
}
