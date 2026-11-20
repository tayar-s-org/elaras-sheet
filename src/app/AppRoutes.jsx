import React, { lazy, Suspense } from 'react';
import { cloudConfigured } from '../lib/supabase.js';
import { navigate, loginThen } from '../lib/router.js';

// Cada rota carrega sob demanda: quem abre o site so baixa a pagina que usa.
const AuthPage = lazy(() => import('../features/auth/AuthPage.jsx'));
const TablesPage = lazy(() => import('../features/tables/TablesPage.jsx'));
const TablePage = lazy(() => import('../features/tables/TablePage.jsx'));
const InvitePage = lazy(() => import('../features/tables/InvitePage.jsx'));
const RoomPage = lazy(() => import('../features/room/RoomPage.jsx'));
const HomePage = lazy(() => import('../features/home/HomePage.jsx'));
const SheetWorkspace = lazy(() => import('./SheetWorkspace.jsx'));

const LoadingPage = () => <main className="page"><p className="muted" role="status">Carregando…</p></main>;

function SheetsLocked({ auth }) {
  return <main className="page">
    <p className="eyebrow">SUAS FICHAS</p>
    <h1>Entre para criar suas fichas</h1>
    <p className="muted">{auth.loading ? "Verificando sessão…" : "Cada ficha pertence à sua conta e fica salva na nuvem, para você abrir em qualquer aparelho e levar às suas mesas."}</p>
    {!auth.loading && <div className="cta-row"><button className="primary" onClick={() => loginThen("/fichas")}>Entrar ou criar conta</button><button className="outline" onClick={() => navigate("/")}>Voltar ao início</button></div>}
  </main>;
}

function pageFor({ route, auth, sheets, workspace }) {
  if (route === "/fichas") return cloudConfigured && !auth.user ? <SheetsLocked auth={auth} /> : <SheetWorkspace key={auth.user?.id} auth={auth} sheets={sheets} {...workspace} />;
  if (route === "/entrar") return <AuthPage auth={auth} />;
  if (route === "/mesas") return <TablesPage auth={auth} />;
  if (route.startsWith("/mesa/")) return <TablePage key={route} auth={auth} id={route.slice(6)} />;
  if (route.startsWith("/sala/")) return <RoomPage auth={auth} id={route.slice(6)} sheets={sheets} />;
  if (route.startsWith("/convite/")) return <InvitePage auth={auth} code={route.slice(9)} />;
  return <HomePage auth={auth} />;
}

// `sheets` = { session, setSession, setConfirm, setToast } (contrato da sala); `workspace` = { autosave, sync, storageError } (so a ficha).
export default function AppRoutes(props) {
  return <Suspense fallback={<LoadingPage />}>{pageFor(props)}</Suspense>;
}
