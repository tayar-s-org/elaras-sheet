import { listMine, getCharacter } from '../../lib/cloud.js';

// Baixa a versao atual das fichas da conta (ate 30, as mais recentes).
export async function fetchCloudRows() {
  const rows = [];
  for (const item of (await listMine()).slice(0, 30)) rows.push(await getCharacter(item.id));
  return rows;
}
