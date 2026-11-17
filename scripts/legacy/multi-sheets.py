from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'src/main.jsx';s=p.read_text(encoding='utf8')
s=s.replace('const STORAGE = "manrakora-ficha-v1";', '''import {SHEETS_STORAGE, restoreSheets, openSheet, editSheet, closeSheet} from './sheets.js';
import SheetTabs from './SheetTabs.jsx';
import MasterView from './MasterView.jsx';''')
start=s.index('function initialState()');end=s.index('function Field(',start)
s=s[:start]+s[end:]
s=s.replace('  const [c, setC] = useState(initialState);', '''  const [session, setSession] = useState(() => restoreSheets(localStorage));
  const activeId = session.activeId;
  const c = session.sheets.find(s => s.id === activeId).character;
  const setC = value => setSession(prev => editSheet(prev, activeId, value));
  const [master, setMaster] = useState(false);
  const addCharacter = character => {setSession(prev => openSheet(prev, character));setMaster(false);setTab(0);};''')
s=s.replace('localStorage.setItem(STORAGE, JSON.stringify(c));','localStorage.setItem(SHEETS_STORAGE, JSON.stringify(session));').replace('  }, [c]);','  }, [session]);')
start=s.index('    const selected = e.target.files?.[0];');end=s.index('  function save()',start)
s=s[:start]+'''    const selected = Array.from(e.target.files || []);
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
'''+s[end:]
s=s.replace('  function save() {','  function save(character = c) {').replace('      exportPdf(c);','      exportPdf(character);')
s=s.replace('onClick={save}', 'onClick={() => save()}')
s=s.replace('          accept="application/pdf,.pdf"','          accept="application/pdf,.pdf"\n          multiple')
s=s.replace('      <main className="layout">','''      <SheetTabs session={session} onSelect={id => setSession(prev => ({...prev,activeId:id}))}
        onNew={() => addCharacter(newCharacter())} master={master} onMaster={() => setMaster(value => !value)}
        onClose={id => setConfirm({title:"Fechar esta ficha?",text:"Ela será removida dos rascunhos deste navegador. Salve o PDF antes de fechar se quiser guardá-la.",action:() => setSession(prev => closeSheet(prev,id))})} />
      {master ? <MasterView sheets={session.sheets} onEdit={id => {setSession(prev => ({...prev,activeId:id}));setMaster(false);}} onSave={save} /> : <main className="layout">''')
s=s.replace('      </main>','      </main>}')
s=s.replace('        <section className="editor">','        <section className="editor" key={activeId}>')
start=s.index('            <button\n              className="text-button"\n              onClick={() =>\n                setConfirm({\n                  title: "Começar outra ficha?",')
end=s.index('            <small>',start)
s=s[:start]+'''            <button className="text-button" onClick={() => addCharacter(newCharacter())}>Nova ficha em outra aba</button>
'''+s[end:]
s=s.replace('text: "Preenche uma proposta de barda elfa com arco e conjuração. Substitui o rascunho atual.",','text: "Abre a Elara em uma nova aba, preservando as outras fichas.",').replace('setC(elaraCharacter());','addCharacter(elaraCharacter());')
s=s.replace('"Rascunho salvo neste navegador."','"Todas as abas salvas neste navegador."')
p.write_text(s,encoding='utf8')
p=root/'src/Dice.jsx';s=p.read_text(encoding='utf8')
s=s.replace('<span>Comando Dice Maiden</span>','<span>Expressão para o campo dice</span>').replace('value={roll.command}','value={roll.expression}')
s=s.replace('<button className="primary" onClick={()=>copy(roll.command)}>Copiar comando</button><button className="outline" onClick={()=>copy(roll.expression)}>Copiar só expressão</button>','<button className="primary" onClick={()=>copy(roll.expression)}>Copiar expressão</button>')
s=s.replace('Digite /roll e escolha o comando do Dice Maiden. Cole a expressão no campo de dados. Também pode tentar colar o comando completo e selecionar o comando sugerido pelo Discord.', 'No Discord: digite /roll, selecione o comando do bot Dice Maiden na lista e cole a expressão no campo dice. Não cole /roll nesse campo e não envie o comando como mensagem comum. Se houver outros bots com /roll, confira o nome do bot na sugestão.')
p.write_text(s,encoding='utf8')
