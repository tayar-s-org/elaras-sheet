import React, { useId } from 'react';
import Modal from './Modal.jsx';

export default function ConfirmModal({ title, text, danger, actionLabel = 'Continuar', cancelLabel = 'Cancelar', onCancel, onAccept }) {
  const titleId = useId();
  const textId = useId();

  return <Modal role="alertdialog" onClose={onCancel} aria-labelledby={titleId}
    aria-describedby={text ? textId : undefined} dismissOnBackdrop={false}>
    <div className="confirmation-panel">
      <h2 id={titleId}>{title}</h2>
      {text && <p id={textId}>{text}</p>}
      <div className="confirmation-actions">
        <button type="button" className="outline" data-modal-focus onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={danger ? 'danger-solid' : 'primary'} onClick={onAccept}>{actionLabel}</button>
      </div>
    </div>
  </Modal>;
}
