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
