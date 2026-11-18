import test from 'node:test';
import assert from 'node:assert/strict';
import {newCharacter,elaraCharacter} from './rules.js';
import {SHEETS_STORAGE,LEGACY_STORAGE,openSheet,editSheet,closeSheet,restoreSheets,openServerSheet,openCloudSheet,setCloud} from './sheets.js';
import {createPdfBlob,importPdf} from './pdf.js';

test('reabrir ficha do servidor preserva edição, chave e aba existente',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const key='a'.repeat(64);
  const row={id,revision:1,character:elaraCharacter()};
  let s=openServerSheet({sheets:[],activeId:'',editKeys:{[id]:key}},row);
  assert.equal(s.sheets[0].remote.editToken,key);
  s=editSheet(s,s.activeId,c=>({...c,xp:10}));
  const reopened=openServerSheet(s,{...row,revision:2});
  assert.equal(reopened.sheets.length,1);
  assert.equal(reopened.sheets[0].character.xp,10);
  const closed=closeSheet(s,s.activeId);
  const again=openServerSheet(closed,row);
  assert.equal(again.sheets.at(-1).remote.editToken,key);
  const restored=restoreSheets({getItem:k=>k===SHEETS_STORAGE?JSON.stringify(s):null});
  assert.equal(restored.editKeys[id],key);
});

test('migra rascunho antigo e restaura todas as abas com seleção',()=>{
  const data=new Map([[LEGACY_STORAGE,JSON.stringify(elaraCharacter())]]);
  const storage={getItem:key=>data.get(key)||null};
  const migrated=restoreSheets(storage);
  assert.equal(migrated.sheets[0].character.name,'Elara Windrunner');
  const session=openSheet(migrated,newCharacter(),'second');
  data.set(SHEETS_STORAGE,JSON.stringify(session));
  assert.deepEqual(restoreSheets(storage),session);
  assert.ok(data.has(LEGACY_STORAGE));
});
test('editar e importar outra ficha não substitui os personagens existentes',async()=>{
  let s=openSheet({sheets:[],activeId:''},elaraCharacter(),'a');
  s=openSheet(s,newCharacter(),'b');
  s=editSheet(s,'a',c=>({...c,name:'Elara editada'}));
  assert.equal(s.activeId,'b');
  assert.equal(s.sheets[0].character.name,'Elara editada');
  assert.equal(s.sheets[1].character.name,'');
  const imported=await importPdf(createPdfBlob(s.sheets[0].character));
  s=openSheet(s,imported,'c');
  assert.equal(s.sheets.length,3);
  assert.equal(s.sheets[0].character.name,'Elara editada');
  assert.equal(s.sheets[2].character.name,'Elara editada');
});
test('fechar aba seleciona vizinha e sempre mantém uma ficha utilizável',()=>{
  let s=openSheet({sheets:[],activeId:''},newCharacter(),'a');
  s=openSheet(s,newCharacter(),'b');
  s=closeSheet(s,'b');
  assert.equal(s.activeId,'a');
  s=closeSheet(s,'a');
  assert.equal(s.sheets.length,1);
  assert.equal(s.sheets[0].id,s.activeId);
});
test('ficha da nuvem mantém vínculo, não duplica abas e sobrevive ao recarregamento',()=>{
  const id='22222222-2222-4222-8222-222222222222';
  const row={id,revision:3,character:elaraCharacter()};
  let s=openCloudSheet(openSheet({sheets:[],activeId:''},{...newCharacter(),name:'Base'},'a'),row);
  assert.equal(s.sheets.length,2);
  assert.equal(s.sheets[1].cloud.id,id);
  const opened=s.activeId;
  s=openSheet(s,newCharacter(),'c');
  s=openCloudSheet(s,{...row,revision:4});
  assert.equal(s.sheets.length,3);
  assert.equal(s.activeId,opened);
  assert.equal(s.sheets[1].cloud.revision,4);
  s=editSheet(s,opened,c=>({...c,name:'Editada'}));
  s=openCloudSheet(s,{...row,revision:5});
  assert.equal(s.sheets[1].character.name,'Editada');
  assert.equal(s.sheets[1].cloud.revision,4);
  s=setCloud(s,opened,{id,revision:6,character:s.sheets[1].character});
  assert.equal(s.sheets[1].cloud.revision,6);
  const data=new Map([[SHEETS_STORAGE,JSON.stringify(s)]]);
  assert.deepEqual(restoreSheets({getItem:k=>data.get(k)??null}),s);
});

test('abrir ficha da nuvem substitui a única aba em branco',()=>{
  const id='33333333-3333-4333-8333-333333333333';
  const row={id,revision:2,character:{...elaraCharacter(),name:'Da nuvem'}};
  let s=openCloudSheet(openSheet({sheets:[],activeId:''},newCharacter(),'a'),row);
  assert.equal(s.sheets.length,1);
  assert.equal(s.sheets[0].id,'a');
  assert.equal(s.sheets[0].character.name,'Da nuvem');
  assert.equal(s.sheets[0].cloud.id,id);
  s=openCloudSheet(openSheet({sheets:[],activeId:''},{...newCharacter(),name:'Rascunho'},'b'),row);
  assert.equal(s.sheets.length,2);
});

test('sincronizar: troca fichas desatualizadas, abre as que faltam e mantém a aba ativa', async () => {
  const { syncCloudSheets, sheetsLosingChanges } = await import('./sheets.js');
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
  const row = (id, revision, name) => ({ id, revision, character: { ...newCharacter(), name } });
  let s = openCloudSheet(openSheet({ sheets: [], activeId: '' }, newCharacter(), 'a'), row(A, 3, 'Antiga'));
  s = { ...s, sheets: s.sheets.map(x => ({ ...x, character: { ...x.character, name: 'Editada' } })) };   // alteração local sem salvar
  const rows = [row(A, 5, 'Nova'), row(B, 1, 'Outra')];
  assert.equal(sheetsLosingChanges(s, rows).length, 1);
  const r = syncCloudSheets(s, rows);
  assert.equal(r.session.sheets.length, 2);
  assert.equal(r.session.sheets[0].character.name, 'Nova');
  assert.equal(r.session.sheets[0].cloud.revision, 5);
  assert.equal(r.session.activeId, 'a');
  assert.deepEqual([r.updated.length, r.added.length], [1, 1]);
  // mesma revisão com alterações locais: não mexe
  const same = syncCloudSheets(s, [row(A, 3, 'Antiga')]);
  assert.equal(same.session.sheets[0].character.name, 'Editada');
  assert.equal(sheetsLosingChanges(s, [row(A, 3, 'Antiga')]).length, 0);
});

test('applyTables acerta a mesa das fichas abertas com o que a nuvem diz', async () => {
  const { applyTables, setSheetTable, openCloudSheet, openSheet } = await import('./sheets.js');
  const A = '123e4567-e89b-12d3-a456-426614174000', T = '123e4567-e89b-12d3-a456-4266141740aa';
  let s = openCloudSheet({ sheets: [], activeId: '' }, { id: A, revision: 1, character: newCharacter(), tableId: T, tableName: 'Mesa Sábado' });
  assert.equal(s.sheets[0].tableId, T);
  assert.equal(s.sheets[0].tableName, 'Mesa Sábado');
  // a nuvem diz que a ficha ficou sem mesa (mesa apagada): a aba perde a mesa
  s = applyTables(s, [{ id: A, table_id: null, tables: null }]);
  assert.equal('tableId' in s.sheets[0], false);
  // a nuvem diz que a ficha é de uma mesa
  s = applyTables(s, [{ id: A, table_id: T, tables: { name: 'Mesa Sábado' } }]);
  assert.deepEqual([s.sheets[0].tableId, s.sheets[0].tableName], [T, 'Mesa Sábado']);
  assert.equal(applyTables(s, [{ id: A, table_id: T, tables: { name: 'Mesa Sábado' } }]), s, 'sem mudança devolve a mesma sessão');
  // ficha em rascunho local escolhe a mesa; o rascunho sobrevive ao recarregar
  const draft = setSheetTable(openSheet({ sheets: [], activeId: '' }), openSheet({ sheets: [], activeId: '' }).activeId, { tableId: T, tableName: 'X' });
  assert.ok(draft);
});

test('a mesa escolhida para uma ficha em rascunho sobrevive ao recarregar e lixo é descartado', async () => {
  const { setSheetTable } = await import('./sheets.js');
  const T = '123e4567-e89b-12d3-a456-4266141740aa';
  const base = openSheet({ sheets: [], activeId: '' });
  const bound = setSheetTable(base, base.activeId, { tableId: T, tableName: 'Mesa Sábado' });
  const store = { getItem: () => JSON.stringify(bound) };
  const back = restoreSheets(store);
  assert.equal(back.sheets[0].tableId, T);
  assert.equal(back.sheets[0].tableName, 'Mesa Sábado');
  const forged = JSON.parse(JSON.stringify(bound));
  forged.sheets[0].tableId = 'não é id';
  const cleaned = restoreSheets({ getItem: () => JSON.stringify(forged) });
  assert.equal('tableId' in cleaned.sheets[0], false);
});
