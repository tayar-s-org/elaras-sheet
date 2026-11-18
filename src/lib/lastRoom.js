// Lembra a sala em que a pessoa estava jogando, para voltar a ela depois de ir conferir a ficha.
const KEY = 'elara-last-room';

export function getLastRoom(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && v.userId === userId && typeof v.id === 'string' ? v : null;
  } catch { return null; }
}
export function setLastRoom(userId, id, name) {
  try { localStorage.setItem(KEY, JSON.stringify({ userId, id, name: String(name || '').slice(0, 100) })); } catch { /* sem storage */ }
}
export function clearLastRoom(id) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (!id || v?.id === id) localStorage.removeItem(KEY);
  } catch { /* sem storage */ }
}
