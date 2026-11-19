import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal.jsx';

const ConfirmContext = createContext(null);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const pending = useRef(null);
  const sequence = useRef(0);

  const ask = useCallback(options => {
    if (pending.current) return Promise.resolve(false);
    return new Promise(resolve => {
      pending.current = resolve;
      setRequest({ id: ++sequence.current, options });
    });
  }, []);

  function answer(accepted) {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }

  useLayoutEffect(() => () => {
    pending.current?.(false);
    pending.current = null;
  }, []);

  return <ConfirmContext.Provider value={ask}>
    {children}
    {request && <ConfirmModal key={request.id} {...request.options} onCancel={() => answer(false)} onAccept={() => answer(true)} />}
  </ConfirmContext.Provider>;
}
