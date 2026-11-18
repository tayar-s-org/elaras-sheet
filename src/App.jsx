import React, { useEffect, useRef, useState } from "react";
import { elaraCharacter, newCharacter, calculate } from "./rules.js";
import { exportPdf, importPdf } from "./pdf.js";
import { SHEETS_STORAGE, restoreSheets, openSheet, editSheet, closeSheet, openCloudSheet, setCloud } from "./sheets.js";
import SheetTabs from "./SheetTabs.jsx";
import MasterView from "./MasterView.jsx";
import CloudSheets from "./features/library/CloudSheets.jsx";
import AuthPage from "./features/auth/AuthPage.jsx";
import { useAuth } from "./features/auth/useAuth.js";
import { useHashRoute } from "./lib/router.js";
import TablesPage from "./features/tables/TablesPage.jsx";
import TablePage from "./features/tables/TablePage.jsx";
import InvitePage from "./features/tables/InvitePage.jsx";
import RoomPage from "./features/room/RoomPage.jsx";
import HomePage from "./features/home/HomePage.jsx";
import Dice from "./Dice.jsx";
import TopBar from "./features/sheet/TopBar.jsx";
import SheetSummary from "./features/sheet/SheetSummary.jsx";
import IdentityTab from "./features/sheet/IdentityTab.jsx";
import AttributesTab from "./features/sheet/AttributesTab.jsx";
import SkillsTab from "./features/sheet/SkillsTab.jsx";
import EdgesTab from "./features/sheet/EdgesTab.jsx";
import MagicGearTab from "./features/sheet/MagicGearTab.jsx";
import HistoryTab from "./features/sheet/HistoryTab.jsx";
import BookTab from "./features/sheet/BookTab.jsx";
import Toast from "./ui/Toast.jsx";
import ConfirmModal from "./ui/ConfirmModal.jsx";

const TABS = [
  "Identidade",
  "Atributos",
  "Perícias",
  "Vantagens",
  "Magia e bagagem",
  "História",
  "Livro e regras",
  "Dados para Discord",
];
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
  const c = session.sheets.find(s => s.id === activeId).character;
  const setC = value => setSession(prev => editSheet(prev, activeId, value));
  const [master, setMaster] = useState(false);
  const addCharacter = character => {setSession(prev => openSheet(prev, character));setMaster(false);setTab(0);};
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [requestedPage, setRequestedPage] = useState(null);
  const file = useRef();
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
  async function loadPdf(e) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (!selected.length) return;
    let count = 0;
    const errors = [];
    for (const file of selected) {
      try {
        const loaded = await importPdf(file);
        setSession(prev => openSheet(prev, loaded));
        count++;
      } catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    if (count) {setMaster(false);setTab(0);}
    setToast(`${count} ficha(s) aberta(s) em novas abas.${errors.length ? ' ' + errors.join(' ') : ''}`);
  }
  function save(character = c) {
    try {
      exportPdf(character);
      setToast(
        "PDF gerado com a ficha completa e os dados para reabrir neste aplicativo.",
      );
    } catch (error) {
      setToast("Não foi possível gerar o PDF. " + error.message);
    }
  }
  const ctx = { c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage };
  const page = route === "/fichas" ? null
    : route === "/entrar" ? <AuthPage auth={auth} />
    : route === "/mesas" ? <TablesPage auth={auth} />
    : route.startsWith("/mesa/") ? <TablePage auth={auth} id={route.slice(6)} />
    : route.startsWith("/sala/") ? <RoomPage auth={auth} id={route.slice(6)} />
    : route.startsWith("/convite/") ? <InvitePage auth={auth} code={route.slice(9)} />
    : <HomePage auth={auth} />;
  if (page) return <><TopBar theme={theme} setTheme={setTheme} file={file} loadPdf={loadPdf} save={save} setTab={setTab} route={route} />{page}</>;
  return (
    <>
      <TopBar theme={theme} setTheme={setTheme} file={file} loadPdf={loadPdf} save={save} setTab={setTab} route={route} />
      <CloudSheets auth={auth} sheet={session.sheets.find(s=>s.id===activeId)} sheets={session.sheets}
        onSaved={(id,row)=>setSession(prev=>setCloud(prev,id,row))}
        onOpen={row=>{setSession(prev=>openCloudSheet(prev,row));setMaster(false);setTab(0);}} />
      <SheetTabs session={session} onSelect={id => setSession(prev => ({...prev,activeId:id}))}
        onNew={() => addCharacter(newCharacter())} master={master} onMaster={() => setMaster(value => !value)}
        onClose={id => setConfirm({title:"Fechar esta ficha?",text:"Ela será removida dos rascunhos deste navegador. Salve o PDF antes de fechar se quiser guardá-la.",action:() => setSession(prev => closeSheet(prev,id))})} />
      {master ? <MasterView sheets={session.sheets} onEdit={id => {setSession(prev => ({...prev,activeId:id}));setMaster(false);}} onSave={save} /> : <main className="layout">
        <aside className="sidebar">
          <p className="eyebrow">SEU PERSONAGEM</p>
          <h1>{c.name || "Uma nova história"}</h1>
          <p className="muted">{c.concept || "Dê forma à próxima aventura."}</p>
          <nav aria-label="Etapas da ficha">
            {TABS.map((name, i) => (
              <button
                key={name}
                aria-current={tab === i ? "step" : undefined}
                className={tab === i ? "selected" : ""}
                onClick={() => setTab(i)}
              >
                {name}
                <span aria-hidden="true">{tab === i ? "↗" : "›"}</span>
              </button>
            ))}
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
            <button className="text-button" onClick={() => addCharacter(newCharacter())}>Nova ficha em outra aba</button>
            <small>
              {storageError
                ? "Rascunho local indisponível. Salve seu PDF."
                : "Todas as abas salvas neste navegador."}
              <br />O PDF permite levar sua ficha para outro computador.
            </small>
          </div>
        </aside>
        <section className="editor" key={activeId}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">SAVAGE WORLDS · REGRAS DA MESA</p>
              <h2>{TABS[tab]}</h2>
            </div>
            <span className="chapter">
              {String(tab + 1).padStart(2, "0")} / {String(TABS.length).padStart(2, "0")}
            </span>
          </div>
          {tab === 0 && <IdentityTab {...ctx} />}
          {tab === 1 && <AttributesTab {...ctx} />}
          {tab === 2 && <SkillsTab {...ctx} />}
          {tab === 3 && <EdgesTab {...ctx} />}
          {tab === 4 && <MagicGearTab {...ctx} />}
          {tab === 5 && <HistoryTab {...ctx} />}
          {tab === 6 && <BookTab {...ctx} />}
          {tab === 7 && <Dice character={c} onChange={value => update('dice', value)} />}
          {tab < TABS.length - 1 && (
            <div className="editor-footer">
              <button
                className="quiet"
                disabled={tab === 0}
                onClick={() => setTab(tab - 1)}
              >
                ← Voltar
              </button>
              <button className="primary" onClick={() => setTab(tab + 1)}>
                Continuar →
              </button>
            </div>
          )}
        </section>
        <SheetSummary c={c} d={d} save={save} />
      </main>}
      <Toast toast={toast} onClose={() => setToast("")} />
      <ConfirmModal confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
