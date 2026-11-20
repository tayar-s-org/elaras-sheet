export const isTabHidden = (doc = document) => doc.visibilityState === 'hidden';

// Repete a tarefa a cada `intervalMs` so com a aba visivel e a roda de novo ao voltar para ela. Devolve a funcao que para tudo.
export function pollWhileVisible(task, intervalMs, doc = document) {
  const runIfVisible = () => { if (!isTabHidden(doc)) task(); };
  const timer = setInterval(runIfVisible, intervalMs);
  doc.addEventListener('visibilitychange', runIfVisible);
  return () => {
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', runIfVisible);
  };
}

// Nunca executa a tarefa assincrona em paralelo: pedidos feitos durante uma execucao viram uma unica nova execucao
// ao terminar (a leitura em andamento pode ja estar velha para quem pediu).
export function createCoalescedRunner(task) {
  let running = false;
  let rerunRequested = false;
  return async function run() {
    if (running) { rerunRequested = true; return; }
    running = true;
    try {
      do {
        rerunRequested = false;
        await task();
      } while (rerunRequested);
    } finally { running = false; }
  };
}
