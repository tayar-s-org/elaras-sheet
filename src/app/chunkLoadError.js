// Mensagens de import() dinamico que falhou: o navegador muda o texto, e o Vite usa 'Unable to preload'.
const CHUNK_LOAD_MESSAGE = /dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed|Unable to preload/i;

export const isChunkLoadError = error => error?.name === 'ChunkLoadError' || CHUNK_LOAD_MESSAGE.test(error?.message || '');
