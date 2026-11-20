import React, { useEffect, useState } from "react";
import { elaraCharacter, newCharacter, calculate } from "../rules.js";
import { editSheet, openSheet, closeSheet, closeCloudTab, setSheetTable } from "../sheets.js";
import { deleteCharacter, bindCharacterTable } from "../lib/cloud.js";
import SheetTabs from "../SheetTabs.jsx";
import MasterView from "../MasterView.jsx";
import CloudSheets from "../features/library/CloudSheets.jsx";
import TableBinding from "../features/sheet/TableBinding.jsx";
import SheetSummary from "../features/sheet/SheetSummary.jsx";
import SheetModules from "../features/sheet/SheetModules.jsx";
import { sheetOps } from "../features/sheet/sheetOps.js";

// Rola ate a secao n do modulo (a ficha e uma pagina unica).
const scrollToSection = i => {
  requestAnimationFrame(() => {
    const el = document.getElementById(`sec-${i}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
  });
};

const SidebarButton = ({ selected, onClick, children }) => (
  <button aria-current={selected ? "page" : undefined} className={selected ? "selected" : ""} onClick={onClick}>
    {children}
    <span aria-hidden="true">{selected ? "↗" : "›"}</span>
  </button>
);

// Editor de fichas: abas, faixa de salvamento, modulos e resumo lateral da ficha ativa.
export default function SheetWorkspace({ auth, sheets: { session, setSession, setConfirm, setToast }, autosave, sync, storageError }) {
  const activeId = session.activeId;
  const activeSheet = session.sheets.find(s => s.id === activeId);
  const c = activeSheet.character;
  const setC = value => setSession(prev => editSheet(prev, activeId, value));
  const [master, setMaster] = useState(false);
  const [editing, setEditing] = useState(null); // modulo aberto no editor completo
  const [requestedPage, setRequestedPage] = useState(null);
  useEffect(() => { setEditing(null); }, [activeId]);
  // Chamado pelas secoes: 6 abre o livro; as demais rolam ate o modulo.
  const setTab = i => { if (i === 6) setEditing(6); else { setEditing(null); scrollToSection(i); } };
  const addCharacter = character => { setSession(prev => openSheet(prev, character)); setMaster(false); setTab(0); };
  const d = calculate(c);
  const { update, rule, changeItem, addItem } = sheetOps(c, setC);

  // A ficha vale numa mesa só: ficha nova escolhe a mesa e a antiga (sem mesa) pode ser ligada a uma agora.
  const bindSheetTable = async table => {
    if (activeSheet.cloud) await bindCharacterTable(activeSheet.cloud.id, table.id);
    setSession(prev => setSheetTable(prev, activeSheet.id, { tableId: table.id, tableName: table.name }));
  };
  const deleteActiveSheet = () => setConfirm({
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
  });
  const closeTab = id => {
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
  };
  const ctx = { cloudId: activeSheet.cloud?.id, cloudBase: activeSheet.cloud?.base, tableId: activeSheet.tableId, auth, c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage };

  return (
    <>
      <CloudSheets status={autosave.active} otherSheets={autosave.others} auth={auth} sheet={activeSheet} onSync={auth.user ? sync.syncNow : undefined} syncing={sync.syncing}
        onDelete={activeSheet.cloud ? deleteActiveSheet : undefined} />
      {sync.syncNote && <p className="muted mx-[16px] my-[4px]" role="status">{sync.syncNote}</p>}
      <SheetTabs session={session} onSelect={id => setSession(prev => ({...prev,activeId:id}))}
        onNew={() => addCharacter(newCharacter())} master={master} onMaster={() => setMaster(value => !value)} onClose={closeTab} />
      {master ? <MasterView sheets={session.sheets} onEdit={id => {setSession(prev => ({...prev,activeId:id}));setMaster(false);}} /> : <main className="layout">
        <aside className="sidebar">
          <p className="eyebrow">SEU PERSONAGEM</p>
          <h1>{c.name || "Uma nova história"}</h1>
          <p className="muted">{c.concept || "Dê forma à próxima aventura."}</p>
          <nav aria-label="Ficha">
            <SidebarButton selected={editing == null} onClick={() => { setEditing(null); scrollToSection(0); }}>Identidade</SidebarButton>
            <SidebarButton selected={editing === "guide"} onClick={() => setEditing("guide")}>Guia de criação</SidebarButton>
            <SidebarButton selected={editing === "market"} onClick={() => setEditing("market")}>Mercado</SidebarButton>
            <SidebarButton selected={editing === 6} onClick={() => setEditing(6)}>Livro e regras</SidebarButton>
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
                : activeSheet.cloud ? "Esta ficha está vinculada à sua conta." : "Rascunho salvo neste navegador."}
            </small>
          </div>
        </aside>
        <section className="editor" key={activeId}>
          {auth.user && <TableBinding key={activeSheet.id} sheet={activeSheet} onBind={bindSheetTable} />}
          <SheetModules ctx={ctx} editing={editing} setEditing={setEditing} />
        </section>
        <SheetSummary c={c} d={d} tableId={activeSheet.tableId} cloudId={activeSheet.cloud?.id} />
      </main>}
    </>
  );
}
