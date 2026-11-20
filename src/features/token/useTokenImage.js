import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenSourceUrl, tokenUrl } from '../../lib/tokens.js';
import { createQueryGate } from '../../lib/queryGate.js';
import { usesLegacyImage, canFallBackToLegacy } from './tokenImageLoad.js';

async function decodeImage(url) {
  if (!url) throw new Error('Imagem indisponível.');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

// Imagem-base do token: carrega a fonte original salva (ou a imagem antiga já com moldura) e aceita uma nova escolhida pelo usuário.
// Só a carga mais recente pode gravar o resultado.
// Se a fonte original falha e há `fallbackPath`, passa a usar a imagem antiga e avisa por `onFallback` (o design vira o da imagem antiga).
export default function useTokenImage({ sourcePath, initialLegacyPath, fallbackPath, onFallback, onFailed }) {
  const [image, setImage] = useState(null);
  const [legacyPath, setLegacyPath] = useState(initialLegacyPath);
  const [usingFallback, setUsingFallback] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [imageState, setImageState] = useState(sourcePath || initialLegacyPath ? 'loading' : 'ready');
  const [gate] = useState(createQueryGate);
  const handlers = useRef({ onFallback, onFailed });
  useEffect(() => { handlers.current = { onFallback, onFailed }; }); // chamadas com a versão mais recente, sem refazer a carga a cada render

  useEffect(() => {
    if (!sourcePath && !legacyPath) return undefined;
    const isCurrent = gate.begin();
    (async () => {
      let img;
      try {
        img = await decodeImage(usesLegacyImage({ sourcePath, usingFallback }) ? tokenUrl(legacyPath) : await tokenSourceUrl(sourcePath));
      } catch (error) {
        if (!canFallBackToLegacy({ sourcePath, usingFallback, fallbackPath }) || !isCurrent()) throw error;
        setLegacyPath(fallbackPath);
        setUsingFallback(true);
        handlers.current.onFallback();
        return;
      }
      if (isCurrent()) { setImage(img); setImageState('ready'); }
    })().catch(() => {
      if (isCurrent()) { setImageState('failed'); handlers.current.onFailed(); }
    });
    return () => gate.invalidate();
  }, [sourcePath, legacyPath, fallbackPath, usingFallback, gate]);

  // Lê um arquivo escolhido pelo usuário e o põe no lugar da imagem atual. `onLoaded` roda quando a nova imagem entra.
  const replaceWithFile = useCallback((file, { onLoaded, onFailed: onReadFailed }) => {
    const isCurrent = gate.begin();
    setImageState('loading');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!isCurrent()) return;
      setImage(img); setSourceFile(file); setImageState('ready'); onLoaded();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (!isCurrent()) return;
      setImageState('failed'); onReadFailed();
    };
    img.src = url;
  }, [gate]);

  return { image, imageState, legacyPath, usingFallback, sourceFile, replaceWithFile };
}
