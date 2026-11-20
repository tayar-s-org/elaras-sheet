import { useCallback, useEffect, useRef, useState } from 'react';
import { tokenSourceUrl, tokenUrl } from '../../lib/tokens.js';

async function decodeImage(url) {
  if (!url) throw new Error('Imagem indisponível.');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

// Imagem-base do token: carrega a fonte original salva (ou a imagem antiga já com moldura) e aceita uma nova escolhida pelo usuário.
// Cada carga tem um número de pedido; só a mais recente pode gravar o resultado.
// Se a fonte original falha e há `fallbackPath`, passa a usar a imagem antiga e avisa por `onFallback` (o design vira o da imagem antiga).
// `onFallback` e `onFailed` precisam ter identidade estável.
export default function useTokenImage({ sourcePath, initialLegacyPath, fallbackPath, onFallback, onFailed }) {
  const [image, setImage] = useState(null);
  const [legacyPath, setLegacyPath] = useState(initialLegacyPath);
  const [usingFallback, setUsingFallback] = useState(false);
  const [sourceFile, setSourceFile] = useState(null);
  const [imageState, setImageState] = useState(sourcePath || initialLegacyPath ? 'loading' : 'ready');
  const generation = useRef(0);

  useEffect(() => {
    if (!sourcePath && !legacyPath) return undefined;
    const request = ++generation.current;
    const isCurrent = () => generation.current === request;
    (async () => {
      let img;
      try {
        img = await decodeImage(usingFallback || !sourcePath ? tokenUrl(legacyPath) : await tokenSourceUrl(sourcePath));
      } catch (error) {
        if (!sourcePath || usingFallback || !fallbackPath || !isCurrent()) throw error;
        setLegacyPath(fallbackPath);
        setUsingFallback(true);
        onFallback();
        return;
      }
      if (isCurrent()) { setImage(img); setImageState('ready'); }
    })().catch(() => {
      if (isCurrent()) { setImageState('failed'); onFailed(); }
    });
    return () => { generation.current += 1; };
  }, [sourcePath, legacyPath, fallbackPath, usingFallback, onFallback, onFailed]);

  // Lê um arquivo escolhido pelo usuário e o põe no lugar da imagem atual. `onLoaded` roda quando a nova imagem entra.
  const replaceWithFile = useCallback((file, { onLoaded, onFailed: onReadFailed }) => {
    const request = ++generation.current;
    setImageState('loading');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (request !== generation.current) return;
      setImage(img); setSourceFile(file); setImageState('ready'); onLoaded();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (request !== generation.current) return;
      setImageState('failed'); onReadFailed();
    };
    img.src = url;
  }, []);

  return { image, imageState, legacyPath, usingFallback, sourceFile, replaceWithFile };
}
