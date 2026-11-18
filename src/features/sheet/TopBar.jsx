import React from "react";
import { cloudConfigured } from "../../lib/supabase.js";
import { navigate } from "../../lib/router.js";

const current = (route, name) => (name === "home" ? route === "/"
  : name === "sheets" ? route === "/fichas"
    : /^\/(mesas|mesa\/|sala\/|convite\/)/.test(route)) ? "page" : undefined;

export default function TopBar({ theme, setTheme, file, loadPdf, save, route = "/" }) {
  const onSheets = route === "/fichas";
  return (
    <header className="topbar">
      <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
        <span className="brand-mark">✦</span>
        <span>
          Crônicas de
          <br />
          <b>Manrakora</b>
        </span>
      </a>
      <nav className="nav-links" aria-label="Principal">
        <button aria-current={current(route, "home")} onClick={() => navigate("/")}>Início</button>
        <button aria-current={current(route, "sheets")} onClick={() => navigate("/fichas")}>Fichas</button>
        {cloudConfigured && <button aria-current={current(route, "tables")} onClick={() => navigate("/mesas")}>Mesas</button>}
      </nav>
      <div className="top-actions">
        <button className="outline theme-toggle" aria-label="Alternar modo escuro" aria-pressed={theme === "dark"} onClick={() => setTheme(value => value === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
        {onSheets && <>
          <button className="quiet" onClick={() => file.current.click()}>Abrir PDF</button>
          <button className="primary" onClick={() => save()}>Salvar PDF <span aria-hidden="true">↗</span></button>
        </>}
      </div>
      <input ref={file} type="file" accept="application/pdf,.pdf" multiple hidden onChange={loadPdf} />
    </header>
  );
}
