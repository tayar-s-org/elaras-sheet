import {newCharacter, validateCharacter} from './rules.js';

export const SHEETS_STORAGE = 'manrakora-sheets-v1';
export const LEGACY_STORAGE = 'manrakora-ficha-v1';
export const sheetId = () => globalThis.crypto?.randomUUID?.() || `ficha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function openSheet(session, character=newCharacter(), id=sheetId()) {
  return {...session, sheets:[...session.sheets,{id,character}], activeId:id};
}
export function editSheet(session,id,value) {
  return {...session,sheets:session.sheets.map(s=>s.id===id?{...s,character:typeof value==='function'?value(s.character):value}:s)};
}
export function openServerSheet(session,row) {
  const existing=session.sheets.find(s=>s.remote?.id===row.id && s.remote.editToken)||session.sheets.find(s=>s.remote?.id===row.id);
  if(existing) return {...session,activeId:existing.id,sheets:session.sheets.map(s=>s.id===existing.id?{...s,remote:{...s.remote,editToken:s.remote.editToken||session.editKeys?.[row.id]||''}}:s)};
  const next=openSheet(session,row.character);
  return {...next,sheets:next.sheets.map(s=>s.id===next.activeId?{...s,remote:{id:row.id,revision:row.revision,base:JSON.stringify(row.character),editToken:session.editKeys?.[row.id]||''}}:s)};
}
export function openCloudSheet(session,row) {
  const existing=session.sheets.find(s=>s.cloud?.id===row.id);
  const cloud={id:row.id,revision:row.revision,base:JSON.stringify(row.character)};
  if(existing) return {...session,activeId:existing.id,sheets:session.sheets.map(s=>s.id===existing.id && JSON.stringify(s.character)===s.cloud.base?{...s,character:row.character,cloud}:s)};
  const next=openSheet(session,row.character);
  return {...next,sheets:next.sheets.map(s=>s.id===next.activeId?{...s,cloud}:s)};
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
export function restoreSheets(storage) {
  try {
    const raw=JSON.parse(storage.getItem(SHEETS_STORAGE));
    if (Array.isArray(raw?.sheets) && raw.sheets.length) {
      const seen=new Set();
      const sheets=raw.sheets.map(s=>{
        if (typeof s.id!=='string' || seen.has(s.id)) throw new Error('Abas inválidas');
        seen.add(s.id);
        const remote = s.remote && /^[a-f0-9-]{36}$/.test(s.remote.id) && Number.isInteger(s.remote.revision) && s.remote.revision>0
          ? {id:s.remote.id,revision:s.remote.revision,base:typeof s.remote.base==='string'?s.remote.base:JSON.stringify(validateCharacter(s.character)),editToken:typeof s.remote.editToken==='string'?s.remote.editToken:''} : undefined;
        const character=validateCharacter(s.character);
        const cloud = s.cloud && /^[a-f0-9-]{36}$/.test(s.cloud.id) && Number.isInteger(s.cloud.revision) && s.cloud.revision>0
          ? {id:s.cloud.id,revision:s.cloud.revision,base:typeof s.cloud.base==='string'?s.cloud.base:JSON.stringify(character)} : undefined;
        return {id:s.id,character,...(remote?{remote}:{}),...(cloud?{cloud}:{})};
      });
      const editKeys=Object.fromEntries(Object.entries(raw.editKeys||{}).filter(([id,key])=>/^[a-f0-9-]{36}$/.test(id) && typeof key==='string' && /^[a-f0-9]{64}$/.test(key)));
      for(const s of sheets)if(s.remote?.editToken)editKeys[s.remote.id]=s.remote.editToken;
      return {sheets,activeId:sheets.some(s=>s.id===raw.activeId)?raw.activeId:sheets[0].id,...(Object.keys(editKeys).length?{editKeys}:{})};
    }
  } catch { /* Fall back to the previous single-sheet draft, which stays untouched. */ }
  try {
    const old=storage.getItem(LEGACY_STORAGE);
    if (old) return openSheet({sheets:[],activeId:''},validateCharacter(JSON.parse(old)));
  } catch { /* No usable saved sheet. */ }
  return openSheet({sheets:[],activeId:''});
}
