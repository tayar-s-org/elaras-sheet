// Atualização incremental das fichas da mesa: só baixa o JSON das que mudaram (a revisão sobe a cada gravação no servidor).

export const staleCharacterIds = (known, revisions) =>
  revisions.filter(r => known[r.id]?.revision !== r.revision).map(r => r.id);

// Monta o mapa atual na ordem de `revisions`; devolve o próprio `known` se nada mudou (evita renderização à toa).
export function mergeCharacters(known, revisions, fetched) {
  const next = {};
  for (const { id } of revisions) {
    const row = fetched[id] ?? known[id];
    if (row) next[id] = row;
  }
  const knownIds = Object.keys(known);
  const unchanged = knownIds.length === Object.keys(next).length && knownIds.every(id => next[id] === known[id]);
  return unchanged ? known : next;
}
