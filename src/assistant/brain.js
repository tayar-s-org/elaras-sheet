// Carrega o livro (o mesmo book.json do leitor) e monta o assistente. Só acontece na primeira pergunta; o resto do app
// não paga por isso. Sem API: tudo roda no navegador.
import catalog from '../catalog.json';
import { buildKnowledge } from './knowledge.js';
import { createAssistant } from './engine.js';
import { BOOK_FAILURE, BookLoadError, failureForStatus } from './bookAccess.js';

async function fetchBook() {
  const response = await fetch(`${import.meta.env.BASE_URL}assets/book.json`).catch(() => { throw new BookLoadError(BOOK_FAILURE.UNAVAILABLE); });
  if (!response.ok) throw new BookLoadError(failureForStatus(response.status));
  return response.json();
}

let loading = null;
export function loadBrain() {
  if (!loading) {
    loading = fetchBook()
      .then(book => createAssistant(buildKnowledge(book.pages, catalog)))
      .catch(error => { loading = null; throw error; }); // tenta de novo na próxima pergunta
  }
  return loading;
}
