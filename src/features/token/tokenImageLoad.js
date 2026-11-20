// A imagem antiga (já com moldura) é a que vale quando não há fonte original salva ou quando a fonte já falhou.
export const usesLegacyImage = ({ sourcePath, usingFallback }) => usingFallback || !sourcePath;

// Se a fonte original não carrega, troca para a imagem antiga uma única vez (e só se existir uma).
export const canFallBackToLegacy = ({ sourcePath, usingFallback, fallbackPath }) => Boolean(sourcePath) && !usingFallback && Boolean(fallbackPath);
