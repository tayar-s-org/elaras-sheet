// Executa um ciclo assíncrono por vez. Pedidos que chegam durante um ciclo (evento em tempo real, volta ao foco) viram
// uma repetição ao terminar, em vez de ciclos simultâneos. `cancel()` encerra a identidade atual (troca de conta,
// desmontagem): o ciclo em andamento vê `isCurrent()` falso e nenhum novo é iniciado.
export function createCycleRunner(task) {
  let running = false;
  let again = false;
  let cancelled = false;
  const isCurrent = () => !cancelled;
  async function request() {
    if (cancelled) return;
    if (running) { again = true; return; }
    running = true;
    try { await task({ isCurrent }); }
    catch { /* o ciclo seguinte tenta de novo */ }
    finally {
      running = false;
      if (again && !cancelled) { again = false; request(); }
    }
  }
  return { request, cancel() { cancelled = true; } };
}
