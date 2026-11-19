// Concede algo (XP, dinheiro) a várias fichas: um erro numa ficha não impede as seguintes e a mensagem diz quem falhou.
export async function grantEach(targets, fn) {
  const failed = [];
  let ok = 0;
  for (const t of targets) {
    try { await fn(t); ok += 1; } catch (e) { failed.push({ name: t.name || 'personagem', message: e?.message || 'erro' }); }
  }
  return { ok, failed };
}

// Texto para o mestre: sucesso total vira `okText`; falha parcial lista quem não recebeu.
export function grantSummary({ ok, failed }, okText) {
  if (!failed.length) return okText;
  const who = failed.map(f => `${f.name} (${f.message})`).join('; ');
  return ok ? `Enviado a ${ok}, mas falhou para: ${who}` : `Não foi enviado: ${who}`;
}
