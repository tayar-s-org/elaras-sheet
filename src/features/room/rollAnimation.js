// Decide qual rolagem animar no tabuleiro. `lastSeenId` e a maior rolagem ja vista; `caughtUpTo` e a maior que a
// reconciliacao apos uma reconexao trouxe: essas sao historico recuperado, nao rolagens novas, e nao animam.
export function nextRollToAnimate(rolls, lastSeenId, caughtUpTo = 0) {
  const baseline = Math.max(lastSeenId, caughtUpTo);
  const fresh = rolls.filter(r => r.id > baseline);
  return {
    lastSeenId: fresh.reduce((max, r) => Math.max(max, r.id), baseline),
    roll: fresh.at(-1) ?? null,
  };
}
