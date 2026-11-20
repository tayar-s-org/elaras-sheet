import { FAILURE, failureKind, failsWholeCycle } from '../../lib/backendError.js';

export const STEP_RETRY_MS = 5 * 60 * 1000;

// Etapas que o servidor ainda não tem (migration pendente). Uma etapa desligada é tentada de novo depois de `retryAfterMs`,
// para o app se recuperar sozinho quando a migration for aplicada com a página já aberta.
export function createStepGate(now = Date.now, retryAfterMs = STEP_RETRY_MS) {
  const disabledAt = new Map();
  return {
    isDisabled(step) {
      const since = disabledAt.get(step);
      if (since === undefined) return false;
      if (now() - since < retryAfterMs) return true;
      disabledAt.delete(step);
      return false;
    },
    disable(step) { disabledAt.set(step, now()); },
    reset() { disabledAt.clear(); },
  };
}

// Roda uma etapa do ciclo. Recurso ainda não instalado desliga a etapa por um tempo; falha que atinge o ciclo inteiro
// (sem rede, sessão vencida) interrompe o ciclo; as demais só pulam a etapa.
export async function runStep(step, gate, action) {
  if (gate.isDisabled(step)) return undefined;
  try {
    return await action();
  } catch (error) {
    if (failsWholeCycle(error)) throw error;
    if (failureKind(error) === FAILURE.notInstalled) gate.disable(step);
    return undefined;
  }
}
