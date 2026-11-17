import React from "react";
import { cloudConfigured } from "../../lib/supabase.js";
import { navigate } from "../../lib/router.js";

export default function TopBar({ theme, setTheme, file, loadPdf, save, setTab, route = "/" }) {
  return (
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab(0);
          }}
        >
          <span className="brand-mark">✦</span>
          <span>
            Crônicas de
            <br />
            <b>Manrakora</b>
          </span>
        </a>
        <div className="top-actions">
          {cloudConfigured && <>
            <button className={route === "/" ? "quiet selected" : "quiet"} onClick={() => navigate("/")}>Fichas</button>
            <button className={route.startsWith("/mesa") ? "quiet selected" : "quiet"} onClick={() => navigate("/mesas")}>Mesas</button>
          </>}
          <button className="outline theme-toggle" aria-label="Modo escuro" aria-pressed={theme === 'dark'} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </button>
          <button className="quiet" onClick={() => file.current.click()}>
            Abrir PDF
          </button>
          <button className="primary" onClick={() => save()}>
            Salvar PDF <span aria-hidden="true">↗</span>
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={loadPdf}
        />
      </header>
  );
}
