// Cache de links temporários (URLs assinadas) com validade: renova antes de expirar e junta pedidos simultâneos da mesma chave.

const RENEW_MARGIN_MS = 10 * 60 * 1000;

// sign(key) -> Promise<url>; ttlMs é a validade que o link assinado tem desde o pedido.
export function createSignedUrlCache({ sign, ttlMs, marginMs = RENEW_MARGIN_MS, now = Date.now }) {
  const entries = new Map();
  const pending = new Map();

  // Só o pedido ainda registrado em `pending` grava o resultado: forget(key) descarta um pedido em andamento.
  const request = key => {
    const issuedAt = now();
    const current = () => pending.get(key) === promise;
    const promise = sign(key)
      .then(url => { if (current()) entries.set(key, { url, expiresAt: issuedAt + ttlMs }); return url; })
      .finally(() => { if (current()) pending.delete(key); });
    return promise;
  };

  return {
    get(key) {
      const hit = entries.get(key);
      if (hit && now() < hit.expiresAt - marginMs) return Promise.resolve(hit.url);
      if (!pending.has(key)) pending.set(key, request(key));
      return pending.get(key);
    },
    forget(key) { entries.delete(key); pending.delete(key); },
  };
}
