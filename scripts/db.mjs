// Roda SQL no projeto Supabase pela Management API (para migrações e consultas).
//
//   node scripts/db.mjs supabase/migrations/0021_exemplo.sql      # roda um arquivo
//   node scripts/db.mjs --query "select now()"                    # roda uma consulta
//   node scripts/db.mjs --file arquivo.sql --dry                  # só mostra o que rodaria
//
// O token (SUPABASE_ACCESS_TOKEN, "sbp_...") fica em .env.local, que o git ignora, ou no ambiente. NUNCA o coloque em
// arquivo versionado, commit, mensagem ou log. A chave service_role não é usada.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'ttjzhxhnpifvbipyonxs';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, '.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find(l => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : '';
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const qIndex = args.indexOf('--query');
const fIndex = args.indexOf('--file');
const filePath = fIndex >= 0 ? args[fIndex + 1] : args.find((a, i) => !a.startsWith('--') && (qIndex < 0 || i !== qIndex + 1));
const sql = qIndex >= 0 ? args[qIndex + 1] : filePath ? readFileSync(filePath, 'utf8') : '';
if (!sql.trim()) { console.error('Uso: node scripts/db.mjs <arquivo.sql> | --query "sql" [--dry]'); process.exit(2); }

if (dry) { console.log(sql); process.exit(0); }
const token = envValue('SUPABASE_ACCESS_TOKEN');
if (!token) { console.error('Falta SUPABASE_ACCESS_TOKEN em .env.local.'); process.exit(2); }

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
let body; try { body = JSON.parse(text); } catch { body = text; }
if (!res.ok) { console.error(`Erro ${res.status}:`, typeof body === 'string' ? body : JSON.stringify(body)); process.exit(1); }
console.log(Array.isArray(body) && body.length ? JSON.stringify(body, null, 2) : 'OK (sem linhas para mostrar)');
