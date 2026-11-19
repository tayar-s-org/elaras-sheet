import React from "react";
import Modal from './Modal.jsx';

export default function ConfirmModal({ confirm, onClose }) {
  if (!confirm) return null;
  return (
        <Modal onClose={onClose} aria-labelledby="dialog-title" dismissOnBackdrop={false}>
          <div
            className="modal"
          >
            <h2 id="dialog-title">{confirm.title}</h2>
            <p>{confirm.text}</p>
            <div className="row">
              <button
                data-modal-focus
                className="quiet"
                onClick={() => onClose()}
              >
                Cancelar
              </button>
              <button
                className={confirm.danger ? "danger-solid" : "primary"}
                onClick={() => {
                  confirm.action();
                  onClose();
                }}
              >
                {confirm.actionLabel || "Continuar"}
              </button>
            </div>
          </div>
        </Modal>
  );
}
