// Por que o livro não abriu: cada causa pede uma orientação diferente para quem perguntou.
export const BOOK_FAILURE = Object.freeze({
  NOT_INSTALLED: 'not-installed',
  SESSION_EXPIRED: 'session-expired',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
});

export class BookLoadError extends Error {
  constructor(reason) {
    super(`livro indisponível: ${reason}`);
    this.reason = reason;
  }
}

export function failureForStatus(status) {
  if (status === 404 || status === 410) return BOOK_FAILURE.NOT_INSTALLED;
  if (status === 401) return BOOK_FAILURE.SESSION_EXPIRED;
  if (status === 403) return BOOK_FAILURE.DENIED;
  return BOOK_FAILURE.UNAVAILABLE;
}

// Baixa o book.json classificando cada falha. Resposta 200 que não é JSON (página de erro do site, portal de Wi-Fi)
// conta como indisponível: o arquivo existe no pedido, mas não chegou o livro.
export async function fetchBookJson(url, fetchFn = fetch) {
  const response = await fetchFn(url).catch(() => { throw new BookLoadError(BOOK_FAILURE.UNAVAILABLE); });
  if (!response.ok) throw new BookLoadError(failureForStatus(response.status));
  return response.json().catch(() => { throw new BookLoadError(BOOK_FAILURE.UNAVAILABLE); });
}

const MESSAGES = {
  [BOOK_FAILURE.NOT_INSTALLED]: 'O livro não está instalado nesta versão do site. Avise o mestre para publicar o arquivo do livro.',
  [BOOK_FAILURE.SESSION_EXPIRED]: 'Sua sessão expirou. Entre de novo e repita a pergunta.',
  [BOOK_FAILURE.DENIED]: 'Você não tem permissão para abrir o livro.',
  [BOOK_FAILURE.UNAVAILABLE]: 'Não consegui abrir o livro agora. Verifique a conexão e tente de novo.',
};
const UNEXPECTED_MESSAGE = 'Algo deu errado ao responder. Tente de novo.';

export const bookFailureMessage = error => MESSAGES[error?.reason] ?? UNEXPECTED_MESSAGE;
