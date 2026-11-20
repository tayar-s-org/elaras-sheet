import { createContext, useContext, useState } from 'react';
import { blankDraft, isDraftDirty } from './archetypeDraft.js';

// O rascunho vive acima do editor em modal: sobrevive a troca de sub-aba e de ficha ativa, e quem fecha o modal sabe se ha o que perder.
export const ArchetypeDraftContext = createContext(null);
export const useSharedArchetypeDraft = () => useContext(ArchetypeDraftContext);

export function useArchetypeDraftState() {
  const [draft, setDraft] = useState(blankDraft);
  const [baseline, setBaseline] = useState(draft); // ponto de partida: so o que diverge dele se perderia ao fechar
  const start = next => { setDraft(next); setBaseline(next); };
  return { draft, setDraft, setBaseline, start, isDirty: isDraftDirty(draft, baseline), discard: () => start(blankDraft()) };
}
