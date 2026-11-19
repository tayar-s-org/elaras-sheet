import React from "react";
import { cloudConfigured } from "../../lib/supabase.js";
import { navigate, loginThen } from "../../lib/router.js";
import { getLastRoom } from "../../lib/lastRoom.js";

const current = (route, name) => (name === "home" ? route === "/"
  : name === "sheets" ? route === "/fichas"
    : /^\/(mesas|mesa\/|sala\/|convite\/)/.test(route)) ? "page" : undefined;

export default function TopBar({ theme, setTheme, route = "/", auth, onSignOut }) {
  const name = auth?.profile?.display_name || auth?.user?.email || "";
  const lastRoom = auth?.user && !route.startsWith("/sala/") ? getLastRoom(auth.user.id) : null;
  return (
    <header className="topbar">
      <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
        <img className="brand-logo" src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" width="60" height="60" />
        <span>
          <b>Ascensia</b> <span className="brand-sub">RPG</span>
        </span>
      </a>
      <nav className="nav-links" aria-label="Principal">
        <button aria-current={current(route, "home")} onClick={() => navigate("/")}>Início</button>
        <button aria-current={current(route, "sheets")} onClick={() => navigate("/fichas")}>Fichas</button>
        {cloudConfigured && <button aria-current={current(route, "tables")} onClick={() => navigate("/mesas")}>Mesas</button>}
        {lastRoom && <button className="resume" title="Voltar à sala em que você estava jogando" onClick={() => navigate(`/sala/${lastRoom.id}`)}>↩ {lastRoom.name || "Voltar à mesa"}</button>}
      </nav>
      <div className="top-actions">
        <button className="outline theme-toggle" aria-label="Alternar modo escuro" aria-pressed={theme === "dark"} onClick={() => setTheme(value => value === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Modo claro" : "Modo escuro"}
        </button>
        {cloudConfigured && !auth?.loading && (auth?.user
          ? <>
            <span className="user-chip" title={auth.user.email}><span className="avatar" aria-hidden="true">{name.trim()[0]?.toUpperCase() || "?"}</span><span className="user-name">{name}</span></span>
            <button className="quiet" onClick={onSignOut}>Sair</button>
          </>
          : route !== "/entrar" && <button className="primary" onClick={() => loginThen(route === "/" ? "/" : route)}>Entrar</button>)}
      </div>
    </header>
  );
}
