import React from "react";

export default function ConfirmModal({ confirm, onClose }) {
  if (!confirm) return null;
  return (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <h2 id="dialog-title">{confirm.title}</h2>
            <p>{confirm.text}</p>
            <div className="row">
              <button
                autoFocus
                className="quiet"
                onClick={() => onClose()}
              >
                Cancelar
              </button>
              <button
                className="primary"
                onClick={() => {
                  confirm.action();
                  onClose();
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
  );
}
