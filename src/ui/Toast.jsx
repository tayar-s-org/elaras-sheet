import React from "react";

export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Fechar aviso" onClick={() => onClose()}>
            ×
          </button>
        </div>
  );
}
