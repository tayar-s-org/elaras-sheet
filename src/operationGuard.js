// Invalida operações assíncronas pendentes: cada operação pega um token e, depois de cada await, confere se ainda vale.
// Um token deixa de valer quando outra operação da mesma chave começa, quando a chave é cancelada ou quando tudo é cancelado.

export function createOperationGuard() {
  let epoch = 0;
  const generations = new Map();
  return {
    begin(key) {
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      return { key, epoch, generation };
    },
    isCurrent: token => token.epoch === epoch && generations.get(token.key) === token.generation,
    cancel(key) { generations.set(key, (generations.get(key) ?? 0) + 1); },
    cancelAll() { epoch += 1; generations.clear(); },
  };
}
