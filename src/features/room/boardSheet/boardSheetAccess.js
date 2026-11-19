// Quem o painel da ficha mostra no tabuleiro e o que essa pessoa pode fazer.
//   own      a própria ficha: editores reais da ficha (a aba aberta na conta, que o autosave grava)
//   gm       o mestre vendo a ficha de um jogador: tudo visível, só leitura
//   limited  outro jogador vendo ficha alheia: só identidade básica, módulos privados
//   creature token de criatura/sem ficha: estado vazio
//   none     nada selecionado e sem ficha própria: estado vazio
export function resolveSubject({ sel = null, myCharacter = null, isGm = false, characters = {}, sessionSheets = [] }) {
  const empty = kind => ({ kind, characterId: null, data: null, sheet: null, editable: false, full: false });
  let characterId = null;
  if (sel) {
    if (!sel.character_id) return empty('creature');
    characterId = sel.character_id;
  } else if (myCharacter) {
    characterId = myCharacter; // sem seleção: cada um vê a própria ficha
  } else {
    return empty('none');
  }
  const cloudData = characters[characterId]?.data || null;
  if (characterId === myCharacter) {
    // A aba da conta é a versão mais atual (ainda pode não ter sido salva); sem ela, lê a cópia da nuvem em só leitura.
    const sheet = sessionSheets.find(s => s.cloud?.id === characterId) || null;
    return { kind: 'own', characterId, data: sheet?.character || cloudData, sheet, editable: Boolean(sheet), full: true };
  }
  return { kind: isGm ? 'gm' : 'limited', characterId, data: cloudData, sheet: null, editable: false, full: isGm };
}

export const MODULE_BUTTONS = [
  { key: 'skills', label: 'Perícias', editor: 2, summary: 2 },
  { key: 'attributes', label: 'Atributos', editor: 1, summary: 1 },
  { key: 'edges', label: 'Vantagens', editor: 3, summary: 3 },
  { key: 'magic', label: 'Magia', editor: 4, summary: 4 },
  { key: 'bag', label: 'Mochila', editor: 7, summary: 7 },
  { key: 'aptitude', label: 'Aptidão', editor: 'aptitude', summary: 'aptitude' },
  { key: 'market', label: 'Mercado', editor: 'market', summary: null },
];

// Os módulos só abrem quando há uma ficha com permissão de ver tudo.
export const modulesAvailable = subject => Boolean(subject.full && subject.data);
