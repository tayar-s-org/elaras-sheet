// Carrega o livro (o mesmo book.json do leitor) e monta o assistente. Só acontece na primeira pergunta; o resto do app
// não paga por isso. Sem API: tudo roda no navegador.
import catalog from '../catalog.json';
import { buildKnowledge } from './knowledge.js';
import { createAssistant } from './engine.js';
import { fetchBookJson } from './bookAccess.js';

let loading = null;
export function loadBrain() {
  if (!loading) {
    loading = fetchBookJson(`${import.meta.env.BASE_URL}assets/book.json`)
      .then(book => createAssistant(buildKnowledge(book.pages, catalog)))
      .catch(error => { loading = null; throw error; }); // tenta de novo na próxima pergunta
  }
  return loading;
}
