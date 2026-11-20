// Limite de itens mantidos em memoria por historico ao vivo (chat, rolagens, vida/mana).
export const LIVE_BUFFER_LIMIT = 200;

const newest = (list, limit) => (list.length > limit ? list.slice(-limit) : list);

// Acrescenta um item do tempo real; ignora repetidos (o eco do proprio envio) e descarta os mais antigos acima do limite.
export function appendById(list, item, limit = LIVE_BUFFER_LIMIT) {
  return list.some(x => x.id === item.id) ? list : newest([...list, item], limit);
}

const maxId = list => list.reduce((max, item) => Math.max(max, item.id), -Infinity);
const minId = list => list.reduce((min, item) => Math.min(min, item.id), Infinity);

// Junta o historico lido do servidor ao que ja chegou em tempo real: um item por id, em ordem crescente de id.
// Se o snapshot comeca depois de tudo o que o buffer tinha (ids nao sao sequenciais por mesa), houve mais itens
// perdidos do que o snapshot cobre: o buffer antigo e descartado em vez de deixar um buraco silencioso.
// Itens do tempo real mais novos que o snapshot (chegaram durante a leitura) sempre ficam.
export function mergeById(current, snapshot, limit = LIVE_BUFFER_LIMIT) {
  const snapshotNewest = maxId(snapshot);
  const overlappable = current.filter(item => item.id <= snapshotNewest);
  const hasHole = overlappable.length > 0 && minId(snapshot) > maxId(overlappable);
  const byId = new Map(snapshot.map(item => [item.id, item]));
  (hasHole ? current.filter(item => item.id > snapshotNewest) : current).forEach(item => byId.set(item.id, item));
  return newest([...byId.values()].sort((a, b) => a.id - b.id), limit);
}
