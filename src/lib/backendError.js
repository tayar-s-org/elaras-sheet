// Classifica falhas do Supabase para que cada chamador trate cada caso do seu jeito, em vez de tratar tudo como
// "recurso ou migration ausente".
export const FAILURE = Object.freeze({
  notInstalled: 'not-installed',     // tabela, coluna ou função ainda não existe no banco
  unavailable: 'unavailable',        // sem rede, timeout ou servidor fora do ar
  sessionExpired: 'session-expired', // precisa entrar de novo
  denied: 'denied',                  // a conta não tem permissão
  rejected: 'rejected',              // o servidor recusou por uma regra de negócio (a mensagem já vem em português)
});

// Códigos do PostgREST/Postgres: função, tabela ou coluna inexistente.
const NOT_INSTALLED_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42883', '42P01', '42703']);
const SESSION_EXPIRED_CODES = new Set(['PGRST301', 'PGRST303']);
// As mensagens abaixo também cobrem erros já reescritos por módulos que perdem o código original (money.js, xp.js).
const NOT_INSTALLED_TEXT = /schema cache|could not find the|does not exist|falta (rodar|aplicar) a migration/i;
const SESSION_EXPIRED_TEXT = /jwt (expired|invalid)|invalid jwt|not authenticated/i;
const DENIED_TEXT = /permission denied|row-level security|insufficient privilege/i;
const UNAVAILABLE_TEXT = /failed to fetch|networkerror|load failed|network request failed|timeout|timed out/i;

export function failureKind(error) {
  if (error instanceof BackendError) return error.kind;
  const code = String(error?.code || '');
  const text = String(error?.message || '');
  const status = Number(error?.status) || 0;
  if (NOT_INSTALLED_CODES.has(code) || NOT_INSTALLED_TEXT.test(text)) return FAILURE.notInstalled;
  if (SESSION_EXPIRED_CODES.has(code) || status === 401 || SESSION_EXPIRED_TEXT.test(text)) return FAILURE.sessionExpired;
  if (code === '42501' || status === 403 || DENIED_TEXT.test(text)) return FAILURE.denied;
  if (status >= 500 || UNAVAILABLE_TEXT.test(text)) return FAILURE.unavailable;
  return FAILURE.rejected;
}

const MESSAGES = {
  [FAILURE.notInstalled]: 'Este recurso ainda não está instalado no servidor.',
  [FAILURE.unavailable]: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
  [FAILURE.sessionExpired]: 'Sua sessão expirou. Entre novamente.',
  [FAILURE.denied]: 'Você não tem permissão para fazer isso.',
};

export class BackendError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.name = 'BackendError';
    this.kind = kind;
    this.cause = cause;
  }
}

export const sessionExpiredError = () => new BackendError(FAILURE.sessionExpired, MESSAGES[FAILURE.sessionExpired]);

// Erro tipado para mostrar ao usuário: regras de negócio mantêm a mensagem do servidor; os demais casos têm texto próprio.
export function toBackendError(error, fallback) {
  const kind = failureKind(error);
  return new BackendError(kind, MESSAGES[kind] || error?.message || fallback, error);
}

// Falhas que se repetem em todas as consultas do ciclo (rede fora, sessão vencida): não adianta tentar as demais.
export const failsWholeCycle = error => [FAILURE.unavailable, FAILURE.sessionExpired].includes(failureKind(error));

// Leitura de recurso opcional: null significa "ainda não instalado"; indisponibilidade, sessão vencida e permissão negada viram erro tipado.
export function dataOrNullIfNotInstalled({ data, error }, fallback) {
  if (!error) return data;
  if (failureKind(error) === FAILURE.notInstalled) return null;
  throw toBackendError(error, fallback);
}
