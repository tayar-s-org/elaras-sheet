import {newCharacter, validateCharacter} from './rules.js';

export const SHEETS_STORAGE = 'manrakora-sheets-v1';
export const LEGACY_STORAGE = 'manrakora-ficha-v1';
export const REJECTED_STORAGE = 'manrakora-sheets-rejected';
export const sheetId = () => globalThis.crypto?.randomUUID?.() || `ficha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export const emptySession=()=>({sheets:[],activeId:''});
export function openSheet(session, character=newCharacter(), id=sheetId()) {
  return {...session, sheets:[...session.sheets,{id,character}], activeId:id};
}
export const newSession=()=>openSheet(emptySession());
export function editSheet(session,id,value) {
  return {...session,sheets:session.sheets.map(s=>s.id===id?{...s,character:typeof value==='function'?value(s.character):value}:s)};
}
export function openServerSheet(session,row) {
  const existing=session.sheets.find(s=>s.remote?.id===row.id && s.remote.editToken)||session.sheets.find(s=>s.remote?.id===row.id);
  if(existing) return {...session,activeId:existing.id,sheets:session.sheets.map(s=>s.id===existing.id?{...s,remote:{...s.remote,editToken:s.remote.editToken||session.editKeys?.[row.id]||''}}:s)};
  const next=openSheet(session,row.character);
  return {...next,sheets:next.sheets.map(s=>s.id===next.activeId?{...s,remote:{id:row.id,revision:row.revision,base:JSON.stringify(row.character),editToken:session.editKeys?.[row.id]||''}}:s)};
}
// Mesa da ficha (a ficha so vale nela). Fichas antigas da nuvem podem vir sem mesa.
const tableOf=row=>({...(row.tableId?{tableId:row.tableId,tableName:row.tableName||''}:{})});
// Atualiza a mesa de cada ficha aberta com o que a nuvem diz (listMine: { id, table_id, tables: { name } }).
export function applyTables(session,rows) {
  let changed=false;
  const sheets=session.sheets.map(s=>{
    const row=s.cloud && rows.find(r=>r.id===s.cloud.id);
    if(!row) return s;
    const tableId=row.table_id||'', tableName=tableId?(row.tables?.name||''):'';
    if((s.tableId||'')===tableId && (s.tableName||'')===tableName) return s;
    changed=true;
    const {tableId:_id,tableName:_name,...rest}=s;
    return tableId?{...rest,tableId,tableName}:rest;
  });
  return changed?{...session,sheets}:session;
}
export function setSheetTable(session,id,table) {
  return {...session,sheets:session.sheets.map(s=>s.id===id?{...s,tableId:table.tableId,tableName:table.tableName||''}:s)};
}
export function openCloudSheet(session,row) {
  const existing=session.sheets.find(s=>s.cloud?.id===row.id);
  const cloud={id:row.id,revision:row.revision,base:JSON.stringify(row.character)};
  if(session.closedCloudIds?.includes(row.id)) session={...session,closedCloudIds:session.closedCloudIds.filter(id=>id!==row.id)};
  if(existing) return {...session,activeId:existing.id,sheets:session.sheets.map(s=>s.id===existing.id?(JSON.stringify(s.character)===s.cloud.base?{...s,character:row.character,cloud,...tableOf(row)}:{...s,...tableOf(row)}):s)};
  // Uma unica aba em branco e intocada e substituida em vez de ficar sobrando ao lado.
  const only=session.sheets.length===1 && !session.sheets[0].cloud && JSON.stringify(session.sheets[0].character)===JSON.stringify(newCharacter());
  if(only) return {...session,activeId:session.sheets[0].id,sheets:[{...session.sheets[0],character:row.character,cloud,...tableOf(row)}]};
  const next=openSheet(session,row.character);
  return {...next,sheets:next.sheets.map(s=>s.id===next.activeId?{...s,cloud,...tableOf(row)}:s)};
}
// Fichas abertas com alteracoes ainda nao salvas que a nuvem ja ultrapassou (a sincronizacao as descartaria).
export function sheetsLosingChanges(session,rows) {
  return session.sheets.filter(s=>s.cloud && JSON.stringify(s.character)!==s.cloud.base && rows.some(r=>r.id===s.cloud.id && r.revision>s.cloud.revision));
}
// Traz a versao da nuvem: fichas com revisao mais nova sao trocadas, as que faltam abrem como aba (a aba ativa nao muda).
// Ficha com alteracoes locais na mesma revisao fica como esta (o salvamento automatico envia).
export function syncCloudSheets(session,rows) {
  const updated=[];
  let sheets=session.sheets.map(s=>{
    const row=s.cloud && rows.find(r=>r.id===s.cloud.id);
    if(!row || row.revision<=s.cloud.revision) return s;
    updated.push(s.id);
    return {...s,character:row.character,cloud:{id:row.id,revision:row.revision,base:JSON.stringify(row.character)},...tableOf(row)};
  });
  let next={...session,sheets};
  const added=[];
  for(const row of rows){
    if(next.sheets.some(s=>s.cloud?.id===row.id)) continue;
    const before=next.activeId;
    next={...openCloudSheet(next,row),activeId:before};
    added.push(row.id);
  }
  if(!next.sheets.some(s=>s.id===next.activeId)) next={...next,activeId:next.sheets[0].id};
  return {session:next,updated,added};
}
export function setCloud(session,id,row) {
  return {...session,sheets:session.sheets.map(s=>s.id===id?{...s,cloud:{id:row.id,revision:row.revision,base:JSON.stringify(row.character)}}:s)};
}
export function closeSheet(session,id) {
  const index=session.sheets.findIndex(s=>s.id===id);
  const sheets=session.sheets.filter(s=>s.id!==id);
  if (!sheets.length) return openSheet({...session,sheets:[],activeId:''});
  return {...session,sheets,activeId:session.activeId===id?sheets[Math.min(index,sheets.length-1)].id:session.activeId};
}
export function closeCloudTab(session,id) {
  const cloudId=session.sheets.find(s=>s.id===id)?.cloud?.id;
  if(!cloudId) return session;
  return closeSheet({...session,closedCloudIds:[...new Set([...(session.closedCloudIds||[]),cloudId])]},id);
}
const UUID_LIKE=/^[a-f0-9-]{36}$/;
// Reconstroi uma aba salva; lanca se a ficha dela for invalida.
function restoreTab(stored) {
  const remote = stored.remote && UUID_LIKE.test(stored.remote.id) && Number.isInteger(stored.remote.revision) && stored.remote.revision>0
    ? {id:stored.remote.id,revision:stored.remote.revision,base:typeof stored.remote.base==='string'?stored.remote.base:JSON.stringify(validateCharacter(stored.character)),editToken:typeof stored.remote.editToken==='string'?stored.remote.editToken:''} : undefined;
  const character=validateCharacter(stored.character);
  const cloud = stored.cloud && UUID_LIKE.test(stored.cloud.id) && Number.isInteger(stored.cloud.revision) && stored.cloud.revision>0
    ? {id:stored.cloud.id,revision:stored.cloud.revision,base:typeof stored.cloud.base==='string'?stored.cloud.base:JSON.stringify(character)} : undefined;
  const tableId = typeof stored.tableId==='string' && UUID_LIKE.test(stored.tableId) ? stored.tableId : '';
  return {id:stored.id,character,...(remote?{remote}:{}),...(cloud?{cloud}:{}),...(tableId?{tableId,tableName:typeof stored.tableName==='string'?stored.tableName.slice(0,100):''}:{})};
}
// Uma aba invalida nao derruba as outras: as recusadas voltam em `rejected`, no formato original.
function restoreTabs(storedTabs) {
  const sheets=[], rejected=[], seen=new Set();
  for(const stored of storedTabs){
    try {
      if (typeof stored?.id!=='string' || seen.has(stored.id)) throw new Error('Aba inválida');
      sheets.push(restoreTab(stored));
      seen.add(stored.id);
    } catch { rejected.push(stored); }
  }
  return {sheets,rejected};
}
function restoreSession(raw,sheets) {
  const editKeys=Object.fromEntries(Object.entries(raw.editKeys||{}).filter(([id,key])=>UUID_LIKE.test(id) && typeof key==='string' && /^[a-f0-9]{64}$/.test(key)));
  for(const s of sheets)if(s.remote?.editToken)editKeys[s.remote.id]=s.remote.editToken;
  const closedCloudIds=Array.isArray(raw.closedCloudIds)
    ? raw.closedCloudIds.filter(id=>typeof id==='string' && UUID_LIKE.test(id) && !sheets.some(s=>s.cloud?.id===id))
    : [];
  return {sheets,...(closedCloudIds.length?{closedCloudIds}:{}),activeId:sheets.some(s=>s.id===raw.activeId)?raw.activeId:sheets[0].id,...(Object.keys(editKeys).length?{editKeys}:{})};
}
export function readStoredSheets(storage) {
  let rejected=[];
  try {
    const raw=JSON.parse(storage.getItem(SHEETS_STORAGE));
    if (Array.isArray(raw?.sheets) && raw.sheets.length) {
      const restored=restoreTabs(raw.sheets);
      rejected=restored.rejected;
      if (restored.sheets.length) return {session:restoreSession(raw,restored.sheets),rejected};
    }
  } catch { /* Fall back to the previous single-sheet draft, which stays untouched. */ }
  try {
    const old=storage.getItem(LEGACY_STORAGE);
    if (old) return {session:openSheet({sheets:[],activeId:''},validateCharacter(JSON.parse(old))),rejected};
  } catch { /* No usable saved sheet. */ }
  return {session:newSession(),rejected};
}
export const restoreSheets=storage=>readStoredSheets(storage).session;
// Guarda as abas recusadas para recuperacao manual: a sessao salva e regravada sem elas e as apagaria para sempre.
export function keepRejectedSheets(storage,rejected) {
  let kept=[];
  try { const list=JSON.parse(storage.getItem(REJECTED_STORAGE)); if(Array.isArray(list)) kept=list; } catch { /* lista ilegivel: recomeca */ }
  const known=new Set(kept.map(item=>JSON.stringify(item)));
  const added=rejected.filter(item=>!known.has(JSON.stringify(item)));
  if(added.length) storage.setItem(REJECTED_STORAGE,JSON.stringify([...kept,...added]));
}
