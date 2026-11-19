// Carrega o livro (o mesmo book.json do leitor) e monta o assistente. Só acontece na primeira pergunta; o resto do app
// não paga por isso. Sem API: tudo roda no navegador.
import catalog from '../catalog.json';
import { buildKnowledge } from './knowledge.js';
import { createAssistant } from './engine.js';

let loading = null;
export function loadBrain() {
  if (!loading) {
    loading = fetch(`${import.meta.env.BASE_URL}assets/book.json`)
      .then(response => { if (!response.ok) throw new Error('livro indisponível'); return response.json(); })
      .then(book => createAssistant(buildKnowledge(book.pages, catalog)))
      .catch(error => { loading = null; throw error; }); // tenta de novo na próxima pergunta
  }
  return loading;
}
