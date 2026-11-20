import { useEffect, useState } from 'react';

// Tamanho útil da janela (sem a barra de rolagem): é a referência do "right/bottom" de um elemento fixo.
export const readViewport = () => ({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight });

export function useViewport() {
  const [vp, setVp] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setVp(readViewport());
    onResize();
    window.addEventListener('resize', onResize);
    // a barra de rolagem aparece/some quando a página carrega ou muda: isso muda a largura útil sem disparar "resize"
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    observer?.observe(document.documentElement);
    return () => { window.removeEventListener('resize', onResize); observer?.disconnect(); };
  }, []);
  return vp;
}
