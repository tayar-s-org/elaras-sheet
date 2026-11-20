import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_END_PX = 48;

export const isNearEnd = ({ scrollTop, clientHeight, scrollHeight }, threshold = NEAR_END_PX) =>
  scrollHeight - scrollTop - clientHeight <= threshold;

// Mantem o quadro rolado ao fim enquanto a pessoa esta lendo o fim. Se ela subiu para ler o historico, nao rouba a
// rolagem: so avisa (hasNew) que chegou novidade. `newestKey` muda quando chega um item novo.
export function useStickyScroll(newestKey) {
  const ref = useRef(null);
  const following = useRef(true);
  const [hasNew, setHasNew] = useState(false);

  // Rola so o proprio quadro (scrollIntoView arrastaria a pagina inteira).
  const scrollToEnd = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    following.current = true;
    setHasNew(false);
  }, []);
  const onScroll = useCallback(() => {
    following.current = isNearEnd(ref.current);
    if (following.current) setHasNew(false);
  }, []);
  useEffect(() => {
    if (following.current) scrollToEnd();
    else setHasNew(true);
  }, [newestKey, scrollToEnd]);

  return { ref, onScroll, hasNew, scrollToEnd };
}
