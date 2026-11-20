export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Mensagem de erro para um arquivo que não serve como imagem de token; vazio se estiver tudo certo.
export function imageFileError(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPEG, WebP ou GIF.';
  if (file.size > MAX_IMAGE_BYTES) return 'A imagem passa de 8 MB.';
  return '';
}
