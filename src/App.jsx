import React, { useEffect, useRef, useState } from "react";
import { elaraCharacter, newCharacter, calculate } from "./rules.js";
import { SHEETS_STORAGE, LEGACY_STORAGE, restoreSheets, openSheet, editSheet, closeSheet, closeCloudTab, openCloudSheet, syncCloudSheets, sheetsLosingChanges, setSheetTable, applyTables } from "./sheets.js";
import { fetchCloudRows } from "./features/library/syncCloud.js";
import SheetTabs from "./SheetTabs.jsx";
import MasterView from "./MasterView.jsx";
import CloudSheets from "./features/library/CloudSheets.jsx";
import AuthPage from "./features/auth/AuthPage.jsx";
import { useAuth } from "./features/auth/useAuth.js";
import { useHashRoute, navigate, loginThen } from "./lib/router.js";
import { cloudConfigured, supabase } from "./lib/supabase.js";
import { useAutosave } from "./features/library/useAutosave.js";
import { useMoneyClaims } from "./features/library/useMoneyClaims.js";
import { useRewardSync } from "./features/library/useRewardSync.js";
import { useCustomItemClaims } from "./features/library/useCustomItemClaims.js";
import { useCustomSkillClaims } from "./features/library/useCustomSkillClaims.js";
import { useEvolutionClaims } from "./features/library/useEvolutionClaims.js";
import { useAptitudeNotice } from "./features/library/useAptitudeNotice.js";
import { listMine, getCharacter, deleteCharacter, bindCharacterTable } from "./lib/cloud.js";
import TableBinding from "./features/sheet/TableBinding.jsx";
import { claimXp } from "./lib/xp.js";
import TablesPage from "./features/tables/TablesPage.jsx";
import TablePage from "./features/tables/TablePage.jsx";
import InvitePage from "./features/tables/InvitePage.jsx";
import RoomPage from "./features/room/RoomPage.jsx";
import HomePage from "./features/home/HomePage.jsx";
import TopBar from "./features/sheet/TopBar.jsx";
import SheetSummary from "./features/sheet/SheetSummary.jsx";
import SheetModules from "./features/sheet/SheetModules.jsx";
import Toast from "./ui/Toast.jsx";
import ConfirmModal from "./ui/ConfirmModal.jsx";

const OWNER_KEY = "manrakora-sheets-owner";
export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('manrakora-theme', theme); } catch { /* Theme still works without storage. */ }
  }, [theme]);
  const [session, setSession] = useState(() => {
    try { return restoreSheets(localStorage); }
    catch { return restoreSheets({getItem:()=>null}); }
  });
  const activeId = session.activeId;
  const auth = useAuth();
  const route = useHashRoute();
  const autosave = useAutosave(session, setSession, Boolean(auth.user));
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const syncNow = async () => {
    setSyncing(true);
    setSyncNote('');
    try {
      const rows = await fetchCloudRows();
      const current = sessionRef.current;
      const conflicts = sheetsLosingChanges(current, rows);
      if (conflicts.length && !window.confirm('A nuvem tem versões mais novas. Carregar essas versões e guardar as alterações locais em abas de cópia?')) return;
      const result = syncCloudSheets(current, rows);
      for (const sheet of conflicts) {
        const copy = { ...sheet.character, name: sheet.character.name ? `${sheet.character.name.slice(0, 85)} (cópia local)` : 'Cópia local' };
        result.session = { ...openSheet(result.session, copy), activeId: result.session.activeId };
      }
      setSession(result.session);
      autosave.unblock();
      setSyncNote(conflicts.length ? 'Versões da nuvem carregadas. As alterações locais ficaram em abas de cópia.'
        : result.updated.length || result.added.length ? `Sincronizado: ${result.updated.length} atualizada(s), ${result.added.length} aberta(s).` : 'Tudo já está em dia com a nuvem.');
    } catch (e) { setSyncNote(`Não foi possível sincronizar: ${e.message}`); } finally { setSyncing(false); }
  };
  const c = session.sheets.find(s => s.id === activeId).character;
  const setC = value => setSession(prev => editSheet(prev, activeId, value));
  const [master, setMaster] = useState(false);
  const addCharacter = character => {setSession(prev => openSheet(prev, character));setMaster(false);setTab(0);};
  // Ficha em pagina unica: "setTab(n)" rola ate a secao n (a 6 e o livro, que abre quando pedido).
  const [editing, setEditing] = useState(null); // modulo aberto no editor completo
  useEffect(() => { setEditing(null); }, [activeId]);
  const goTo = i => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`sec-${i}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0 });
    });
  };
  // Chamado pelas secoes: 6 abre o livro; as demais rolam ate o modulo.
  const setTab = i => { if (i === 6) setEditing(6); else { setEditing(null); goTo(i); } };
  const [toast, setToast] = useState("");
  useMoneyClaims(session, setSession, auth.user, setToast);
  useRewardSync(session, setSession, auth.user, setToast);
  useCustomItemClaims(session, setSession, auth.user, setToast);
  useCustomSkillClaims(session, setSession, auth.user, setToast);
  useEvolutionClaims(session, setSession, auth.user, setToast);
  useAptitudeNotice(auth.user, setToast);
  const [storageError, setStorageError] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [requestedPage, setRequestedPage] = useState(null);
  const d = calculate(c);
  const update = (key, value) => setC((prev) => ({ ...prev, [key]: value }));
  const rule = (key, value) =>
    setC((prev) => ({ ...prev, rules: { ...prev.rules, [key]: value } }));
  useEffect(() => {
    try {
      localStorage.setItem(SHEETS_STORAGE, JSON.stringify(session));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [session]);
  // Os rascunhos locais pertencem a quem os criou: ao entrar com outra conta, comeca em branco em vez de enviar fichas alheias.
  useEffect(() => {
    const id = auth.user?.id;
    if (!id) return;
    let owner = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch { /* sem storage */ }
    if (owner && owner !== id) {
      setSession(restoreSheets({ getItem: () => null }));
      setMaster(false);
      setTab(0);
    }
    try { localStorage.setItem(OWNER_KEY, id); } catch { /* sem storage */ }
    // Abas ligadas a fichas de outra pessoa (abertas por um erro antigo da lista) saem daqui; so as da propria conta ficam.
    const linked = [...new Set(session.sheets.filter(s => s.cloud).map(s => s.cloud.id))];
    if (supabase && linked.length) {
      supabase.from('characters').select('id,owner_id').in('id', linked).then(({ data }) => {
        const foreign = new Set((data || []).filter(r => r.owner_id !== id).map(r => r.id));
        if (foreign.size) setSession(prev => prev.sheets.filter(s => s.cloud && foreign.has(s.cloud.id)).reduce((acc, s) => closeSheet(acc, s.id), prev));
      });
    }
  }, [auth.user?.id]);
  // As fichas da conta viram abas: ao entrar, abre cada uma que ainda nao esta aberta (a aba ativa nao muda).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!auth.user) return undefined;
    let alive = true;
    (async () => {
      try {
        const mine = await listMine();
        if (alive) setSession(prev => applyTables(prev, mine)); // mesa de cada ficha segundo a nuvem
        for (const row of mine.slice(0, 30)) {
          if (!alive) return;
          if (sessionRef.current.closedCloudIds?.includes(row.id) || sessionRef.current.sheets.some(s => s.cloud?.id === row.id)) continue;
          const full = await getCharacter(row.id);
          if (!alive) return;
          setSession(prev => prev.closedCloudIds?.includes(row.id) || prev.sheets.some(s => s.cloud?.id === row.id) ? prev : { ...openCloudSheet(prev, full), activeId: prev.activeId });
        }
      } catch { /* a lista tenta de novo no proximo carregamento */ }
    })();
    return () => { alive = false; };
  }, [auth.user?.id]);
  // XP concedido pelo mestre: recolhe o que esta pendente para cada ficha da conta e soma na ficha (o autosave envia).
  const claiming = useRef(false);
  const claimAgain = useRef(false);
  useEffect(() => {
    if (!auth.user) return undefined;
    const claimAll = async () => {
      if (claiming.current) { claimAgain.current = true; return; } // chegou outra concessao no meio: repete ao terminar
      claiming.current = true;
      try {
        for (const sheet of sessionRef.current.sheets.filter(s => s.cloud)) {
          try {
            const gained = await claimXp(sheet.cloud.id);
            if (gained > 0) {
              setSession(prev => editSheet(prev, sheet.id, ch => ({ ...ch, xp: Math.min(1000000, ch.xp + gained) })));
              const before = Math.floor(sheet.character.xp / 5);
              const after = Math.floor(Math.min(1000000, sheet.character.xp + gained) / 5);
              const up = after > before ? ` Subiu para o nível ${after}: +${(after - before) * 2} pontos de progressão!` : "";
              setToast(`${sheet.character.name || "Sua ficha"} recebeu ${gained} XP do mestre.${up}`);
            }
          } catch { /* sem permissao ou migration pendente: tenta de novo depois */ }
        }
      } finally {
        claiming.current = false;
        if (claimAgain.current) { claimAgain.current = false; claimAll(); }
      }
    };
    const first = setTimeout(claimAll, 2500);
    const timer = setInterval(claimAll, 15000); // reserva caso o tempo real falhe
    // Canal proprio: se a tabela ainda nao estiver no Realtime, so ele falha e a verificacao periodica segue valendo.
    const channel = supabase?.channel(`xp:${auth.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "xp_awards" }, () => claimAll())
      .subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") claimAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); if (channel) supabase.removeChannel(channel); };
  }, [auth.user?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  function changeItem(key, index, field, value) {
    update(
      key,
      c[key].map((x, i) => (i === index ? { ...x, [field]: value } : x)),
    );
  }
  function addItem(key) {
    const item =
      key === "advantages"
        ? { name: "", description: "", power: false }
        : key === "hindrances"
          ? { name: "", description: "", severity: "Menor" }
          : { name: "", description: "", cost: "" };
    update(key, [...c[key], item]);
  }
  async function signOut() {
    await auth.signOut();
    // As fichas ficam na conta; limpa os rascunhos deste navegador para o proximo usuario.
    try { localStorage.removeItem(SHEETS_STORAGE); localStorage.removeItem(LEGACY_STORAGE); localStorage.removeItem(OWNER_KEY); localStorage.removeItem("elara-last-room"); localStorage.removeItem("manrakora-custom-archetypes"); } catch { /* sem storage */ }
    setSession(restoreSheets({ getItem: () => null }));
    setMaster(false);
    setTab(0);
    navigate("/");
  }
  const activeSheet = session.sheets.find(s => s.id === activeId);
  // A ficha vale numa mesa só: ficha nova escolhe a mesa e a antiga (sem mesa) pode ser ligada a uma agora.
  const bindSheetTable = async table => {
    if (activeSheet.cloud) await bindCharacterTable(activeSheet.cloud.id, table.id);
    setSession(prev => setSheetTable(prev, activeSheet.id, { tableId: table.id, tableName: table.name }));
  };
  const ctx = { cloudId: activeSheet?.cloud?.id, tableId: activeSheet?.tableId, auth, c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage };
  const sheetsLocked = cloudConfigured && route === "/fichas" && !auth.user;
  const topbar = <TopBar theme={theme} setTheme={setTheme} route={route} auth={auth} onSignOut={signOut} />;
  const page = route === "/fichas" ? (sheetsLocked ? <main className="page">
      <p className="eyebrow">SUAS FICHAS</p>
      <h1>Entre para criar suas fichas</h1>
      <p className="muted">{auth.loading ? "Verificando sessão…" : "Cada ficha pertence à sua conta e fica salva na nuvem, para você abrir em qualquer aparelho e levar às suas mesas."}</p>
      {!auth.loading && <div className="cta-row"><button className="primary" onClick={() => loginThen("/fichas")}>Entrar ou criar conta</button><button className="outline" onClick={() => navigate("/")}>Voltar ao início</button></div>}
    </main> : null)
    : route === "/entrar" ? <AuthPage auth={auth} />
    : route === "/mesas" ? <TablesPage auth={auth} />
    : route.startsWith("/mesa/") ? <TablePage key={route} auth={auth} id={route.slice(6)} />
    : route.startsWith("/sala/") ? <RoomPage auth={auth} id={route.slice(6)} />
    : route.startsWith("/convite/") ? <InvitePage auth={auth} code={route.slice(9)} />
    : <HomePage auth={auth} />;
  if (page) return <>{topbar}{page}</>;
  return (
    <>
      {topbar}
      <CloudSheets status={autosave} auth={auth} sheet={session.sheets.find(s=>s.id===activeId)} onSync={auth.user ? syncNow : undefined} syncing={syncing}
        onDelete={activeSheet?.cloud ? () => setConfirm({
          title: 'Excluir esta ficha da conta?',
          text: 'A exclusão é permanente e remove o vínculo com a mesa.',
          actionLabel: 'Excluir ficha',
          danger: true,
          action: async () => {
            try {
              await deleteCharacter(activeSheet.cloud.id);
              setSession(prev => closeSheet(prev, activeSheet.id));
            } catch (error) { setToast('Não foi possível excluir a ficha. ' + error.message); }
          },
        }) : undefined} />
      {syncNote && <p className="muted" role="status" style={{margin:'4px 16px'}}>{syncNote}</p>}
      <SheetTabs session={session} onSelect={id => setSession(prev => ({...prev,activeId:id}))}
        onNew={() => addCharacter(newCharacter())} master={master} onMaster={() => setMaster(value => !value)}
        onClose={id => {
          const sheet = session.sheets.find(s => s.id === id);
          if (!sheet) return;
          if (sheet.cloud) {
            if (JSON.stringify(sheet.character) !== sheet.cloud.base) {
              setToast('Esta ficha tem alterações locais. Aguarde o salvamento ou use Sincronizar com a nuvem antes de fechar.');
              return;
            }
            setSession(prev => closeCloudTab(prev, id));
            return;
          }
          if (sheet.tableId && auth.user) {
            setToast('Aguarde a ficha ser salva na conta antes de fechar a aba.');
            return;
          }
          setConfirm({title:"Descartar esta ficha local?",text:"O rascunho será removido deste navegador.",actionLabel:"Descartar rascunho",danger:true,action:() => setSession(prev => closeSheet(prev,id))});
        }} />
      {master ? <MasterView sheets={session.sheets} onEdit={id => {setSession(prev => ({...prev,activeId:id}));setMaster(false);}} /> : <main className="layout">
        <aside className="sidebar">
          <p className="eyebrow">SEU PERSONAGEM</p>
          <h1>{c.name || "Uma nova história"}</h1>
          <p className="muted">{c.concept || "Dê forma à próxima aventura."}</p>
          <nav aria-label="Ficha">
            <button aria-current={editing == null ? "page" : undefined} className={editing == null ? "selected" : ""} onClick={() => { setEditing(null); goTo(0); }}>
              Identidade
              <span aria-hidden="true">{editing == null ? "↗" : "›"}</span>
            </button>
            <button aria-current={editing === "guide" ? "page" : undefined} className={editing === "guide" ? "selected" : ""} onClick={() => setEditing("guide")}>
              Guia de criação
              <span aria-hidden="true">{editing === "guide" ? "↗" : "›"}</span>
            </button>
            <button aria-current={editing === "market" ? "page" : undefined} className={editing === "market" ? "selected" : ""} onClick={() => setEditing("market")}>
              Mercado
              <span aria-hidden="true">{editing === "market" ? "↗" : "›"}</span>
            </button>
            <button aria-current={editing === 6 ? "page" : undefined} className={editing === 6 ? "selected" : ""} onClick={() => setEditing(6)}>
              Livro e regras
              <span aria-hidden="true">{editing === 6 ? "↗" : "›"}</span>
            </button>
          </nav>
          <div className="sidebar-bottom">
            <button
              className="quiet"
              onClick={() =>
                setConfirm({
                  title: "Carregar Elara Windrunner?",
                  text: "Abre a Elara em uma nova aba, preservando as outras fichas.",
                  action: () => {
                    addCharacter(elaraCharacter());
                    setTab(0);
                  },
                })
              }
            >
              Usar exemplo da Elara
            </button>
            <small>
              {storageError
                ? "Rascunho local indisponível neste navegador."
                : activeSheet?.cloud ? "Esta ficha está vinculada à sua conta." : "Rascunho salvo neste navegador."}
            </small>
          </div>
        </aside>
        <section className="editor" key={activeId}>
          {activeSheet && auth.user && <TableBinding key={activeSheet.id} sheet={activeSheet} onBind={bindSheetTable} />}
          <SheetModules ctx={ctx} editing={editing} setEditing={setEditing} />
        </section>
        <SheetSummary c={c} d={d} tableId={activeSheet?.tableId} cloudId={activeSheet?.cloud?.id} />
      </main>}
      <Toast toast={toast} onClose={() => setToast("")} />
      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
