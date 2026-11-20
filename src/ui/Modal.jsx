import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ children, onClose, busy = false, dismissOnBackdrop = true, className, ...labels }) {
  const dialogRef = useRef(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector('[data-modal-focus]')?.focus();
    return () => dialog.close();
  }, []);

  return createPortal(<dialog
    {...labels}
    ref={dialogRef}
    className={className ? `modal-backdrop ${className}` : 'modal-backdrop'}
    onCancel={event => {
      event.preventDefault();
      event.stopPropagation();
      if (!busy) onClose();
    }}
    onMouseDown={event => {
      if (dismissOnBackdrop && !busy && event.target === event.currentTarget) onClose();
    }}
  >
    {children}
  </dialog>, document.body);
}
