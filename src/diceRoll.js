// Especificacao e exibicao de rolagens da sala. O sorteio acontece no servidor (RPC roll_dice);
// aqui so montamos a especificacao enviada e formatamos o resultado recebido.

export const ROOM_DICE = [4, 6, 8, 10, 12, 20, 100];
const MODE_WORDS = { adv: 'advantage', vantagem: 'advantage', dis: 'disadvantage', desvantagem: 'disadvantage' };

export function parseFormula(input, mode = 'normal') {
  let text = String(input || '').toLowerCase().trim();
  const word = text.match(/\s+(adv|vantagem|dis|desvantagem)$/);
  if (word) { mode = MODE_WORDS[word[1]]; text = text.slice(0, word.index); }
  text = text.replace(/\s+/g, '');
  if (!text) throw new Error('Digite uma fórmula, por exemplo 2d6+3.');
  if (!/^[+-]?(\d*d\d+!?|\d+)([+-](\d*d\d+!?|\d+))*$/.test(text)) throw new Error('Fórmula inválida. Use o formato 2d6+1d4+3 (acrescente ! para dados explosivos).');
  const dice = [];
  let modifier = 0;
  for (const [, sign, count, sides, bang, flat] of text.matchAll(/([+-]?)(?:(\d*)d(\d+)(!?)|(\d+))/g)) {
    const negative = sign === '-';
    if (flat !== undefined) { modifier += negative ? -Number(flat) : Number(flat); continue; }
    const c = count === '' ? 1 : Number(count);
    const s = Number(sides);
    if (!ROOM_DICE.includes(s)) throw new Error(`d${s} não existe. Use d4, d6, d8, d10, d12, d20 ou d100.`);
    if (c < 1 || c > 50) throw new Error('Use de 1 a 50 dados por grupo.');
    dice.push({ count: c, sides: s, explode: bang === '!', negative });
  }
  if (!dice.length) throw new Error('Inclua ao menos um dado, por exemplo 1d20.');
  if (dice.length > 10) throw new Error('No máximo 10 grupos de dados.');
  if (dice.reduce((n, d) => n + d.count, 0) > 100) throw new Error('Dados demais (máximo 100 por rolagem).');
  if (Math.abs(modifier) > 1000) throw new Error('Modificador fora do limite (±1000).');
  return { kind: 'dice', dice, modifier, mode };
}

export const traitSpec = ({ type, name, wild = true, modifier = 0, target = 4 }) => ({
  kind: 'trait', trait: { type, name }, wild, modifier, target,
});

const chainText = chain => (chain.length > 1 ? `(${chain.join('+')})` : String(chain[0]));
const signed = n => (n > 0 ? `+${n}` : String(n));

export function describeRoll(roll) {
  const r = roll.result;
  if (r.kind === 'trait') {
    const parts = [`${r.name} d${r.die}${r.untrained ? ' (sem treino)' : ''}: ${chainText(r.traitRolls)}`];
    if (r.wild) parts.push(`dado selvagem d6: ${chainText(r.wildRolls)}`);
    const adjust = [r.penalty ? signed(r.penalty) : '', r.modifier ? signed(r.modifier) : ''].filter(Boolean).join(' ');
    const best = r.wild ? Math.max(r.traitTotal, r.wildTotal) : r.traitTotal;
    const outcome = r.criticalFailure ? 'Falha crítica!'
      : r.success ? (r.raises ? `Sucesso com ${r.raises} aumento${r.raises > 1 ? 's' : ''}` : 'Sucesso') : 'Falha';
    return { title: roll.formula, detail: `${parts.join(' · ')} → ${best}${adjust ? ` ${adjust}` : ''} = ${roll.total}`, total: roll.total, outcome, tone: r.criticalFailure ? 'bad' : r.success ? 'good' : 'bad' };
  }
  const lines = r.attempts.map((attempt, index) => {
    const groups = attempt.groups.map(g => `${g.negative ? '−' : ''}${g.count}d${g.sides}${g.explode ? '!' : ''}: ${g.dice.map(chainText).join(', ')}`).join(' · ');
    const mark = r.attempts.length > 1 ? (index === r.chosen ? '✔ ' : '✘ ') : '';
    return `${mark}${groups}${r.modifier ? ` ${signed(r.modifier)}` : ''} = ${attempt.total}`;
  });
  return { title: roll.formula, detail: lines.join(' | '), total: roll.total, outcome: '', tone: '' };
}
