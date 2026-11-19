import React, { useEffect, useRef, useState } from 'react';
import Modal from '../../ui/Modal.jsx';
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
  const [view,setView] = useState(initial);
  const [generator,setGenerator] = useState(generators[0][1]);
  const [entries,setEntries] = useState(null);
  const [draft,setDraft] = useState(null);
  const [grid,setGrid] = useState(()=>boardGrid(board.grid));
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [confirm,setConfirm] = useState(null);
  const [rename,setRename] = useState(null);
  const [pendingSuggestion,setPendingSuggestion] = useState(false);
  const fileInput = useRef(null);
  const active = useRef(false);
  const draftUrl = useRef(null);
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
    setGrid(boardGrid(entry?.grid || board.grid));
    setName(entry?.name || (current ? board.name || 'Mapa da mesa' : file.name.replace(/\.[^.]+$/,'')));
    setView('calibrate');
  }

  function importFile(file) {
    if(file)run(()=>prepare(file));
  }

  async function apply(clearMarks, remove = false) {
    if(!remove && draft.current){
      const next=await saveBoardGrid({...board,map_path:draft.activeMap},grid);
      local.setBoard(next);
      setNotice('Grade atualizada.');
      return;
    }
    const path=remove ? null : await putMapFile('maps',board.table_id,draft.file);
    const next=await switchBoardMap(board,path,remove ? DEFAULT_SIZE : draft.size,remove ? board.grid : grid,clearMarks);
    local.setBoard(next);
    local.setMarks([]);
    await Promise.allSettled([local.reloadMap(),local.reloadItems()]);
    room.sendBroadcast('board_refresh',{});
    onClose();
  }

  function requestLoad(){
    if(pendingSuggestion)return;
    if(!draft.current && marks.length) { setConfirm('load'); return; }
    run(()=>apply(false));
  }

  async function saveDraft(){
    const title=name.trim();
    if(!title)throw new Error('Informe um nome para salvar o mapa.');
    const entry=await saveMap(board.table_id,title,draft.file,draft.size,grid);
    setEntries(previous=>[entry,...(previous||[])]);
    setNotice(`“${entry.name}” foi salvo na biblioteca. Você também pode carregá-lo agora.`);
  }

  return <Modal onClose={onClose} busy={busy} aria-labelledby="map-workspace-title">
    <div className="modal map-workspace">
      <header className="row"><h2 id="map-workspace-title">Mapas e grade</h2><button type="button" className="quiet" disabled={busy} onClick={onClose}>Fechar</button></header>
      <nav className="tabs-row" aria-label="Ferramentas de mapa">
        <button type="button" className={view==='generate'?'primary':'outline'} disabled={busy} aria-pressed={view==='generate'} onClick={()=>setView('generate')}>Gerar mapa</button>
        <button type="button" className={view==='library'?'primary':'outline'} disabled={busy} aria-pressed={view==='library'} onClick={()=>setView('library')}>Biblioteca de mapas</button>
        <button type="button" className="outline" disabled={busy} onClick={()=>run(async()=>prepare(board.map_path ? await readMapFile('maps',board.map_path) : null,null,true))}>Ajustar grade atual</button>
        {draft && view!=='calibrate' && <button type="button" className="outline" disabled={busy} onClick={()=>setView('calibrate')}>Voltar à prévia</button>}
      </nav>
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
        <div className="tabs-row">
          <button type="button" className="outline" disabled={busy} onClick={()=>setView('import')}>Importar para a biblioteca</button>
          {board.map_path && <button type="button" className="outline" disabled={busy} onClick={()=>run(async()=>prepare(await readMapFile('maps',board.map_path),null,true))}>Salvar mapa atual</button>}
          {board.map_path && <button type="button" className="text-button danger" disabled={busy} onClick={()=>setConfirm('remove')}>Remover mapa do tabuleiro</button>}
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
            <strong>{entry.name}</strong> <small className="muted">Célula de {Number(boardGrid(entry.grid).size.toFixed(1))}</small>
            <div className="tabs-row">
              <button type="button" className="outline" disabled={busy} onClick={()=>run(async()=>prepare(await readSavedMap(entry.image_path),entry))}>Prévia e carregamento</button>
              <button type="button" className="quiet" disabled={busy} onClick={()=>setRename({id:entry.id,name:entry.name})}>Renomear</button>
              <button type="button" className="text-button danger" disabled={busy} onClick={()=>setConfirm(entry)}>Excluir</button>
            </div>
          </>}
        </article>)}
      </section>}
      {view==='calibrate' && draft && <>
        <fieldset disabled={busy||Boolean(confirm)} className="map-draft">
          <MapCalibration image={draft.image} size={draft.size || DEFAULT_SIZE} grid={grid} setGrid={setGrid} onPendingSuggestion={setPendingSuggestion}/>
          {draft.file && <label className="field">Nome na biblioteca <input value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>}
          <div className="tabs-row">
            {draft.file && <button type="button" className="outline" disabled={!name.trim()||pendingSuggestion} onClick={()=>run(saveDraft)}>Salvar na biblioteca</button>}
            <button type="button" className="primary" disabled={pendingSuggestion} onClick={requestLoad}>{draft.current ? 'Aplicar grade ao tabuleiro' : 'Carregar no tabuleiro'}</button>
          </div>
        </fieldset>
      </>}
      {confirm && <section className="callout" aria-label="Confirmação">
        <p>{confirm==='load' ? 'Trocar o mapa vai limpar os marcadores atuais. Os tokens serão mantidos.' : confirm==='remove' ? 'Remover o mapa e limpar os marcadores atuais? Os tokens serão mantidos.' : `Excluir “${confirm.name}” da biblioteca?`}</p>
        <button type="button" className="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button>{' '}
        <button type="button" className="primary" disabled={busy} onClick={()=>run(async()=>{
          if(confirm==='load') await apply(true);
          else if(confirm==='remove') await apply(true,true);
          else {await deleteSavedMap(confirm);setEntries(xs=>xs.filter(x=>x.id!==confirm.id));}
          setConfirm(null);
        })}>{confirm==='load' ? 'Trocar mapa' : confirm==='remove' ? 'Remover mapa' : 'Excluir mapa salvo'}</button>
      </section>}
      {busy && <p role="status">Processando…</p>}
    </div>
  </Modal>;
}
