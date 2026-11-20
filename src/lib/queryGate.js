// Garante que só a resposta da consulta mais recente (da identidade atual) seja aplicada: uma resposta que chega depois de uma
// consulta mais nova, de um evento Realtime ou de uma troca de mesa/ficha vê `isCurrent()` falso e deve ser descartada.
export function createQueryGate() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      const mine = generation;
      return () => mine === generation;
    },
    // Invalida tudo o que está em voo (troca de identidade ou evento mais novo que as consultas pendentes).
    invalidate() { generation += 1; },
  };
}

// O valor guardado só vale para a identidade em que foi lido; em outra, usa o valor inicial (nunca mostra dados da mesa/ficha anterior).
export const scopedValue = (entry, identity, initial) => (entry?.identity === identity ? entry.value : initial);
