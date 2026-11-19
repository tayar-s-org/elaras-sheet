import React, { useEffect, useRef, useState } from 'react';
import Modal from '../../ui/Modal.jsx';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { DEFAULT_SIZE, fitMapSize, putMapFile, switchBoardMap, saveBoardGrid, validateMapFile } from '../../lib/board.js';
import { deleteSavedMap, listSavedMaps, readMapFile, readSavedMap, renameSavedMap, saveMap } from '../../lib/mapLibrary.js';
import { boardGrid } from '../../boardGrid.js';
import MapCalibration from './MapCalibration.jsx';
import './maps.css';

const generators = [
  ['Reino','perilous-shores'], ['Cidade','city-generator'], ['Vila','village-generator'],
  ['Caverna/Clareira','cave-generator'], ['Masmorra','one-page-dungeon'], ['Habitação','dwellings'],
];

export default function MapWorkspace({ board, marks, local, room, initial, onClose }) {
  const askConfirm = useConfirm();
  const [view,setView] = useState(initial);
  const [generator,setGenerator] = useState(generators[0][1]);
  const [entries,setEntries] = useState(null);
  const [draft,setDraft] = useState(null);
  const [grid,setGrid] = useState(()=>boardGrid(board.grid));
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [rename,setRename] = useState(null);
  const [pendingSuggestion,setPendingSuggestion] = useState(false);
  const [invalidFields,setInvalidFields] = useState(false);
  const [baseline,setBaseline] = useState(null);
  const [draftVersion,setDraftVersion] = useState(0);
  const fileInput = useRef(null);
  const active = useRef(false);
  const draftUrl = useRef(null);
  const snapshot = (label, values) => JSON.stringify([label.trim(), boardGrid(values)]);
  const dirty = Boolean(draft && (baseline !== snapshot(name,grid) || pendingSuggestion || invalidFields));
  async function protect(action) {
    if (active.current) return;
    if (dirty && !(await askConfirm({
      title: 'Descartar ajustes da prévia?',
      text: 'O mapa e os ajustes que ainda não foram gravados vão se perder.',
      actionLabel: 'Descartar ajustes',
      cancelLabel: 'Continuar editando',
      danger: true,
    }))) return;
    return action();
  }
  const closeWorkspace = () => protect(onClose);

  const url = `https://watabou.github.io/${generator}/`;

  useEffect(() => {
    let alive = true;
    listSavedMaps(board.table_id).then(rows=>{if(alive)setEntries(rows);}).catch(e=>{if(alive){setError(e.message);setEntries([]);}});
    return () => { alive=false; if(draftUrl.current) URL.revokeObjectURL(draftUrl.current); };
  }, [board.table_id]);

  async function run(fn) {
    if(active.current)return;
    active.current=true; setBusy(true); setError(''); setNotice('');
    try { await fn(); }
    catch(e){ setError(e.message); }
    finally { active.current=false; setBusy(false); }
  }

  async function prepare(file, entry, current = false) {
    if(file)validateMapFile(file);
    const image = file ? URL.createObjectURL(file) : null;
    let size;
    try {
      if(entry || current) {
        const source=entry || board;
        size={width:source.width,height:source.height};
      } else {
        const img=new Image(); img.src=image; await img.decode();
        size=fitMapSize(img.naturalWidth,img.naturalHeight);
      }
    } catch(e){ if(image)URL.revokeObjectURL(image); throw e; }
    if(draftUrl.current)URL.revokeObjectURL(draftUrl.current);
    draftUrl.current=image;
    setDraft({file,image,size,current,activeMap:board.map_path || null});
    const values = boardGrid(entry?.grid || board.grid);
    const label = (entry?.name || (current ? board.name || 'Mapa da mesa' : file.name.replace(/\.[^.]+$/,''))).slice(0,100);
    setGrid(values);
    setName(label);
    setBaseline(entry || current ? snapshot(label,values) : null);
    setDraftVersion(version=>version+1);
    setView('calibrate');
  }

  function importFile(file) {
    if(file)protect(()=>run(()=>prepare(file)));
  }

  async function apply(clearMarks, remove = false) {
    if(!remove && draft.current){
      const next=await saveBoardGrid({...board,map_path:draft.activeMap},grid);
      local.setBoard(next);
      room.sendBroadcast('board_refresh',{ configuration: true });
      setBaseline(snapshot(name,next.grid));
      setNotice('Grade aplicada ao tabuleiro e disponível para a mesa.');
      return;
    }
    const path=remove ? null : await putMapFile('maps',board.table_id,draft.file);
    const next=await switchBoardMap(board,path,remove ? DEFAULT_SIZE : draft.size,remove ? board.grid : grid,clearMarks);
    local.setBoard(next);
    local.setMarks([]);
    room.sendBroadcast('board_refresh',{ configuration: true });
    await Promise.allSettled([local.reloadMap(),local.reloadItems()]);
    onClose();
  }

  async function requestLoad() {
    if (pendingSuggestion || invalidFields) return;
    const clearMarks = !draft.current && marks.length > 0;
    if (clearMarks && !(await askConfirm({
      title: 'Trocar mapa do tabuleiro?',
      text: 'A troca vai limpar os marcadores atuais. Os tokens serão mantidos.',
      actionLabel: 'Trocar mapa',
      danger: true,
    }))) return;
    return run(() => apply(clearMarks));
  }

  async function removeMap() {
    if (!(await askConfirm({
      title: 'Remover mapa do tabuleiro?',
      text: dirty
        ? 'Os marcadores atuais e os ajustes da prévia serão descartados. Os tokens serão mantidos.'
        : 'Os marcadores atuais serão apagados. Os tokens serão mantidos.',
      actionLabel: 'Remover mapa',
      danger: true,
    }))) return;
    return run(() => apply(true, true));
  }

  async function deleteEntry(entry) {
    if (!(await askConfirm({
      title: 'Excluir mapa salvo?',
      text: `“${entry.name}” será removido da biblioteca.`,
      actionLabel: 'Excluir mapa salvo',
      danger: true,
    }))) return;
    return run(async () => {
      await deleteSavedMap(entry);
      setEntries(previous => previous.filter(item => item.id !== entry.id));
    });
  }

  async function saveDraft(){
    const title=name.trim();
    if(!title)throw new Error('Informe um nome para salvar o mapa.');
    const entry=await saveMap(board.table_id,title,draft.file,draft.size,grid);
    setEntries(previous=>[entry,...(previous||[])]);
    setBaseline(snapshot(entry.name,entry.grid));
    setNotice(`“${entry.name}” foi salvo na biblioteca. Você também pode carregá-lo agora.`);
  }

  return <Modal onClose={closeWorkspace} busy={busy} aria-labelledby="map-workspace-title">
    <div className="modal map-workspace">
      <header className="row"><h2 id="map-workspace-title">Mapas e grade</h2><button type="button" className="quiet" disabled={busy} onClick={closeWorkspace}>Fechar</button></header>
      <div className="map-workspace-body">
      {view==='calibrate' || view==='import' ? <div className="map-section-heading">
        <button type="button" className="quiet" disabled={busy} onClick={()=>setView('library')}>← Biblioteca</button>
        <h3>{view==='import' ? 'Importar mapa' : draft?.current ? 'Ajustar grade atual' : name || 'Prévia do mapa'}</h3>
      </div> : <nav className="map-navigation" aria-label="Ferramentas de mapa">
        <button type="button" className="quiet" disabled={busy} aria-pressed={view==='library'} onClick={()=>setView('library')}>Biblioteca</button>
        <button type="button" className="quiet" disabled={busy} aria-pressed={view==='generate'} onClick={()=>setView('generate')}>Gerador</button>
        {draft && <button type="button" className="quiet" disabled={busy} onClick={()=>setView('calibrate')}>Retomar prévia</button>}
      </nav>}
      {error && <p role="alert" className="callout">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{importFile(e.target.files?.[0]);e.target.value='';}} />
      {(view==='generate'||view==='import') && <>
        {view==='generate' && <section className="map-generator">
          <div className="tabs-row"><label>Gerador <select value={generator} onChange={e=>setGenerator(e.target.value)}>{generators.map(([title,id])=><option key={id} value={id}>{title}</option>)}</select></label>
          <a className="outline" href={url} target="_blank" rel="noopener noreferrer">Abrir em nova aba</a></div>
          <iframe key={generator} title={`Gerador Watabou: ${generators.find(([,id])=>id===generator)[0]}`} src={url} sandbox="allow-scripts allow-same-origin allow-downloads" referrerPolicy="no-referrer" />
          <p className="muted">Exporte a imagem no Watabou e importe o arquivo abaixo. Se o download falhar aqui, abra o gerador em nova aba.</p>
        </section>}
        <div className="map-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); importFile(e.dataTransfer.files?.[0]);}}>
          <p>Arraste um PNG, JPEG ou WebP de até 5 MB.</p>
          <button type="button" className="primary" disabled={busy} onClick={()=>fileInput.current.click()}>Importar imagem</button>
        </div>
      </>}
      {view==='library' && <section className="map-library" aria-label="Mapas salvos">
        <div className="map-active">
          <div><h3>Tabuleiro da mesa</h3><p className="muted">{board.map_path ? 'Mapa em uso' : 'Sem imagem de mapa'}</p></div>
          <button type="button" className="outline" disabled={busy} onClick={()=>protect(()=>run(async()=>prepare(board.map_path ? await readMapFile('maps',board.map_path) : null,null,true)))}>Ajustar grade atual</button>
          {board.map_path && <details className="map-actions">
            <summary>Mais ações</summary>
            <button type="button" className="text-button danger" disabled={busy} onClick={removeMap}>Remover mapa do tabuleiro</button>
          </details>}
        </div>
        <div className="map-section-heading">
          <h3>Mapas salvos</h3>
          <button type="button" className="primary" disabled={busy} onClick={()=>setView('import')}>Importar mapa</button>
        </div>
        {!entries && <p role="status">Carregando biblioteca…</p>}
        {entries?.length===0 && <p className="muted">Nenhum mapa salvo nesta mesa.</p>}
        {entries?.map(entry=><article className="map-library-item" key={entry.id}>
          {rename?.id===entry.id ? <form className="tabs-row" onSubmit={e=>{e.preventDefault(); run(async()=>{
            const next=await renameSavedMap(entry.id,rename.name.trim());
            setEntries(xs=>xs.map(x=>x.id===next.id?next:x));setRename(null);
          });}}>
            <input aria-label="Novo nome" value={rename.name} maxLength={100} onChange={e=>setRename({...rename,name:e.target.value})}/>
            <button type="submit" className="primary" disabled={busy||!rename.name.trim()}>Salvar nome</button>
            <button type="button" className="quiet" disabled={busy} onClick={()=>setRename(null)}>Cancelar</button>
          </form> : <>
            <div className="map-entry-label"><strong>{entry.name}</strong><small className="muted">Célula de {Number(boardGrid(entry.grid).size.toFixed(1))}</small></div>
            <div className="map-entry-controls">
              <button type="button" className="outline" disabled={busy} onClick={()=>protect(()=>run(async()=>prepare(await readSavedMap(entry.image_path),entry)))}>Abrir prévia</button>
              <details className="map-actions">
                <summary aria-label={`Mais ações para ${entry.name}`}>Mais ações</summary>
                <div className="tabs-row">
                  <button type="button" className="quiet" disabled={busy} onClick={()=>setRename({id:entry.id,name:entry.name})}>Renomear</button>
                  <button type="button" className="text-button danger" disabled={busy} onClick={()=>deleteEntry(entry)}>Excluir</button>
                </div>
              </details>
            </div>
          </>}
        </article>)}
      </section>}
      {draft && <fieldset key={draftVersion} hidden={view!=='calibrate'} disabled={busy} className="map-draft">
        <MapCalibration image={draft.image} size={draft.size || DEFAULT_SIZE} grid={grid} setGrid={setGrid}
          onPendingSuggestion={setPendingSuggestion} onInvalidFields={setInvalidFields}/>
        {draft.file && <label className="field">Nome na biblioteca <input value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>}
      </fieldset>}
      {busy && <p role="status">Processando…</p>}
      </div>
      {view==='calibrate' && draft && <footer className="map-workspace-footer">
        {pendingSuggestion && <p role="status">Aceite ou descarte a sugestão para gravar.</p>}
        {!pendingSuggestion && invalidFields && <p role="status">Corrija os campos da grade antes de gravar.</p>}
        <div className="tabs-row">
          {draft.file && <button type="button" className="outline" disabled={busy||!name.trim()||pendingSuggestion||invalidFields} onClick={()=>run(saveDraft)}>Salvar na biblioteca</button>}
          <button type="button" className="primary" disabled={busy||pendingSuggestion||invalidFields} onClick={requestLoad}>{draft.current ? 'Aplicar grade na mesa' : 'Carregar na mesa'}</button>
        </div>
      </footer>}
    </div>
  </Modal>;
}
