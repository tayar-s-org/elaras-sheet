import { useState } from 'react';
import { useConfirm } from '../../ui/ConfirmProvider.jsx';
import { updateToken, removeToken, addToken, loadCreatureDetails, saveCreatureToken } from '../../lib/board.js';
import { uploadTokenImage, tokenUrl, saveTokenArtwork } from '../../lib/tokens.js';
import { setCharacterTokenImage } from '../../lib/cloud.js';
import { loadPresets, savePreset } from '../../lib/presets.js';
import { creatureOf, uniqueName, metaForCopy, metaWithHp, metaWithMaxHp, metaWithHideHp, newCreatureMeta, CREATURE_COLOR } from '../../creature.js';
import { isNameHidden, effectsOf, addEffect, removeEffect } from '../../tokenState.js';
import { keepIn } from './boardViewport.js';

// Operacoes sobre os tokens do tabuleiro (colocar o meu, criaturas, imagem, vida, efeitos, apagar). Cada uma muda o
// estado local na hora e grava na nuvem; se o servidor recusar, recarrega os tokens. `maker` e o editor de token aberto.
export function useTokenOperations({ board, tokens, characters, me, myCharacter, names, geometry, local, setError, maker, setMaker, setMasterOpen, onSelect }) {
  const askConfirm = useConfirm();
  const { W, H, gsize, tokenHalf } = geometry;
  const [busy, setBusy] = useState(false);
  const [creatureRevision, setCreatureRevision] = useState(0);
  const [tokenOverride, setTokenOverride] = useState({}); // ficha -> imagem recém-salva, até a leitura periódica das fichas trazer a nova

  // Token de personagem: a imagem é a da ficha (sempre sincronizada); a gravada no token só vale para tokens antigos, de ficha sem imagem.
  const newerArtwork = characterId => {
    const cached = tokenOverride[characterId];
    return cached && cached.revision > (characters[characterId]?.revision || 0) ? cached : null;
  };
  const sheetImage = characterId => (characterId ? newerArtwork(characterId)?.path ?? characters[characterId]?.data?.tokenImage : '') || '';
  const imageOf = t => tokenUrl(sheetImage(t.character_id) || t.image_path);

  const place = () => ({ x: W / 2 + (tokens.length % 5) * 20, y: H / 2 + (tokens.length % 5) * 20 });
  const addMine = async imagePath => {
    const c = characters[myCharacter];
    const t = await addToken(board, { kind: 'pc', name: c?.name || names[me] || 'Personagem', character_id: myCharacter, image_path: imagePath || null, ...place() });
    local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev : [...prev, t]));
    onSelect(t.id);
  };
  const placeMine = async () => {
    setBusy(true);
    setError('');
    try { await addMine(null); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  // Coloca o token na lista local; se o Realtime ja o trouxe (em branco, quando o nome esta oculto), completa com os valores reais.
  const putToken = t => local.setTokens(prev => (prev.some(x => x.id === t.id) ? prev.map(x => (x.id === t.id ? { ...x, ...t } : x)) : [...prev, t]));
  // Mestre: nome oculto e efeitos de uma criatura ja criada. O estado local muda na hora; se o servidor recusar, recarrega.
  const patchCreature = async (token, patch) => {
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, ...patch } : t)));
    try { await updateToken(token.id, patch); } catch (err) { setError(err.message); local.reloadItems(); }
  };
  const toggleName = (token, hide) => patchCreature(token, { name_hidden: hide });
  const addTokenEffect = (token, input) => {
    const effects = addEffect(token.effects, input);
    if (effects.length !== effectsOf(token).length) patchCreature(token, { effects });
  };
  const removeTokenEffect = (token, id) => patchCreature(token, { effects: removeEffect(token.effects, id) });
  // Central do Mestre: grava a lista inteira de efeitos do token e DEVOLVE a falha (patchCreature só mostra o erro), para o lote não dar sucesso falso.
  const setTokenEffects = async (token, effects) => {
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, effects } : t)));
    try { await updateToken(token.id, { effects }); } catch (err) { local.reloadItems(); throw err; }
  };
  const editCreature = async token => {
    const details = await loadCreatureDetails(token.id);
    setMasterOpen(false);
    setMaker({ creature: true, token, details });
  };

  const saveCreature = async (blob, extra) => {
    const editing = maker?.token;
    const target = editing && tokens.find(t => t.id === editing.id);
    if (editing && !target) throw new Error('Esta criatura não está mais no tabuleiro.');
    const artwork = await saveTokenArtwork(me, extra.artwork);
    const image_path = await uploadTokenImage(me, blob);
    const position = target || place();
    const half = tokenHalf({ size: extra.size });
    const meta = target && extra.hp !== null
      ? metaWithHideHp({ meta: metaWithMaxHp(target, extra.hp) }, extra.hideHp)
      : newCreatureMeta(extra.hp, extra.hideHp);
    const next = await saveCreatureToken(board, target?.id || null, {
      name: extra.name, image_path, size: extra.size, meta, name_hidden: extra.hideName,
      color: CREATURE_COLOR,
      ...(!target || target.size !== extra.size ? { x: keepIn(position.x, half, W), y: keepIn(position.y, half, H) } : {}),
    }, { artwork, sheet: extra.sheet });
    local.setTokens(prev => prev.some(t => t.id === next.id) ? prev.map(t => t.id === next.id ? next : t) : [...prev, next]);
    setCreatureRevision(rev => rev + 1);
    onSelect(next.id);
  };
  const adjustHp = async (token, delta) => {
    const c = creatureOf(token);
    if (!c || c.noHp) return;
    const meta = metaWithHp(token, c.hp + delta);
    local.setTokens(prev => prev.map(t => (t.id === token.id ? { ...t, meta } : t)));
    try { await updateToken(token.id, { meta }); } catch (err) { setError(err.message); local.reloadItems(); }
  };
  // Mestre: guarda a criatura so como predefinicao da mesa (nao poe no mapa). Devolve o nome salvo.
  const saveCreaturePreset = async (blob, extra) => {
    const artwork = await saveTokenArtwork(me, extra.artwork);
    const image_path = await uploadTokenImage(me, blob);
    const previous = maker?.preset;
    const taken = (await loadPresets(board.table_id)).filter(p => p.id !== previous?.id).map(p => p.name);
    const p = await savePreset(board.table_id, {
      name: uniqueName(extra.name, taken), image_path, max_hp: extra.hp, size: extra.size,
      details: { artwork, sheet: extra.sheet, hideHp: extra.hideHp, hideName: extra.hideName },
    }, previous?.id);
    return p.name;
  };
  // Duplica a criatura (so o mestre): mesmo nome (com numero), foto, vida cheia e nome oculto; efeitos nao vao junto. Fica na celula ao lado.
  const duplicateCreature = async token => {
    const spot = { x: keepIn(token.x + gsize, tokenHalf(token), W), y: keepIn(token.y, tokenHalf(token), H) };
    try {
      const details = await loadCreatureDetails(token.id);
      const t = await saveCreatureToken(board, null, { name: uniqueName(token.name, tokens.map(x => x.name)), color: token.color, size: token.size, image_path: token.image_path || null, meta: metaForCopy(token), name_hidden: isNameHidden(token), ...spot }, details);
      putToken(t);
      onSelect(t.id);
    } catch (err) { setError(err.message); }
  };
  // Apaga o token da criatura (so o mestre); pede confirmacao porque nao tem volta.
  const removeCreature = async token => {
    if (!(await askConfirm({ title: 'Apagar token?', text: `Apagar o token "${token.name || 'da criatura'}" do tabuleiro? Isso não pode ser desfeito.`, actionLabel: 'Apagar token', danger: true }))) return;
    try {
      await removeToken(token.id);
      local.setTokens(prev => prev.filter(t => t.id !== token.id));
      onSelect(null);
    } catch (err) { setError(err.message); local.reloadItems(); }
  };
  // Envia a imagem do token; atualiza o token existente ou, se ainda nao ha token do jogador, cria um.
  const saveTokenImage = async (blob, extra) => {
    if (maker?.preset) return saveCreaturePreset(blob, extra);
    if (maker?.creature) return saveCreature(blob, extra);
    const target = maker?.token;
    // Token do próprio jogador: a imagem vai para a ficha (e o token a acompanha); o token não guarda imagem própria.
    if (myCharacter && (!target || target.character_id === myCharacter)) {
      const artwork = await saveTokenArtwork(me, extra.artwork);
      const path = await uploadTokenImage(me, blob);
      const saved = await setCharacterTokenImage(myCharacter, path, artwork);
      setTokenOverride(prev => ({ ...prev, [myCharacter]: { path, artwork, revision: saved.revision } }));
      if (!target) await addMine(null);
      return;
    }
    const path = await uploadTokenImage(me, blob);
    if (target) {
      await updateToken(target.id, { image_path: path });
      local.setTokens(prev => prev.map(t => (t.id === target.id ? { ...t, image_path: path } : t)));
    } else {
      await addMine(path);
    }
  };

  return {
    busy, creatureRevision, newerArtwork, sheetImage, imageOf,
    placeMine, editCreature, adjustHp, duplicateCreature, removeCreature, toggleName, addTokenEffect, removeTokenEffect, setTokenEffects,
    saveTokenImage, saveCreaturePreset,
  };
}
