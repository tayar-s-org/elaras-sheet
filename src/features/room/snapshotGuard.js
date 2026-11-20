// Protege leituras assincronas (snapshots) contra respostas velhas: so a leitura mais recente vale, e o que o
// tempo real alterou depois que ela comecou nao e sobrescrito por ela.
export function createSnapshotGuard() {
  let clock = 0;
  let latestTicket = 0;
  const touchedAt = new Map();
  return {
    begin() { latestTicket = ++clock; return latestTicket; },
    isLatest: ticket => ticket === latestTicket,
    touch(key) { touchedAt.set(key, ++clock); },
    touchedAfter: (ticket, key) => (touchedAt.get(key) ?? 0) > ticket,
  };
}

// Mapa chave -> valor: o snapshot vence, exceto nas chaves que o tempo real alterou depois dele (ficam como estao agora).
export function reconcileByKey(snapshot, current, changedSinceSnapshot) {
  const merged = { ...current };
  Object.entries(snapshot).forEach(([key, value]) => { if (!changedSinceSnapshot(key)) merged[key] = value; });
  return merged;
}

// Lista de linhas com `id`: o snapshot vence e remove o que sumiu no servidor; so ficam como estao agora as linhas
// que o tempo real (ou um arraste local) alterou, incluiu ou apagou depois dele.
export function reconcileById(snapshot, current, changedSinceSnapshot) {
  const currentById = new Map(current.map(row => [row.id, row]));
  const knownIds = new Set(snapshot.map(row => row.id));
  const merged = snapshot.map(row => (changedSinceSnapshot(row.id) ? currentById.get(row.id) : row)).filter(Boolean);
  current.forEach(row => { if (!knownIds.has(row.id) && changedSinceSnapshot(row.id)) merged.push(row); });
  return merged;
}
