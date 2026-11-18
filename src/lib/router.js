import { useEffect, useState } from 'react';

// Roteamento por hash: o GitHub Pages nao tem fallback de SPA.
const read = () => (window.location.hash.replace(/^#/, '') || '/');
export function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
export const navigate = path => { window.location.hash = path; };

// Vai para o login e volta para `next` depois de entrar.
export function loginThen(next = '/') {
  try { sessionStorage.setItem('elara-next', next); } catch { /* sem storage: volta ao inicio */ }
  navigate('/entrar');
}
