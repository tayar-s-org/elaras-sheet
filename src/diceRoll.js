// Especificacao e exibicao de rolagens da sala. O sorteio acontece no servidor (RPC roll_dice);
// aqui so montamos a especificacao enviada e formatamos o resultado recebido.

export const ROOM_DICE = [4, 6, 8, 10, 12, 20, 100];

export function parseFormula(input) {
  const text = String(input || '').toLowerCase().replace(/\s+/g, '');
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
  return { kind: 'dice', dice, modifier, mode: 'normal' };
}

// Rolagem da ficha: sem dado selvagem e sem dificuldade (o mestre decide o resultado; `noTarget` avisa o registro para não
// mostrar sucesso/falha, já que o servidor ainda guarda a dificuldade padrão 4). `bonuses` ([{ label, value }]) só serve para explicar o modificador no registro;
// quem soma é o `modifier`, que já é o total deles.
export const traitSpec = ({ type, name, modifier = 0, bonuses = [] }) => ({
  kind: 'trait', trait: { type, name }, wild: false, modifier, noTarget: true,
  bonuses: bonuses.filter(b => b.value).map(b => ({ label: String(b.label).slice(0, 60), value: b.value })),
});

const signed = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const chainText = chain => (chain.length > 1 ? `${chain.join(' + ')} = ${chain.reduce((a, b) => a + b, 0)}` : String(chain[0]));

// Texto do que cada parte da conta fez. Devolve `lines` (uma por passo) e `detail` (as mesmas, numa linha só).
function describeTrait(roll) {
  const r = roll.result;
  const bonuses = Array.isArray(roll.spec?.bonuses) ? roll.spec.bonuses : [];
  const bonusSum = bonuses.reduce((n, b) => n + b.value, 0);
  // Se o detalhamento enviado não fecha com o modificador salvo, mostra só o total em vez de uma conta errada.
  const itemized = bonuses.length > 0 && bonusSum === r.modifier;
  const incap = r.incap?.steps > 0 && r.incap.baseDie;
  const lines = [];

  const dieText = (die, bonus) => `d${die}${bonus > 0 ? `+${bonus}` : ''}`;
  const evolution = r.bonus || 0; // d12+N: o servidor lê o +N da ficha e soma
  lines.push(`Dado: ${r.name} ${r.untrained ? 'sem treino (d4 −2)' : dieText(r.die, evolution)}${incap ? ` · incapacitação ${r.incap.total} reduziu de ${dieText(r.incap.baseDie, r.incap.baseBonus)} para ${dieText(r.die, evolution)}` : ''}`);
  const explosions = r.traitRolls.length > 1 ? ` (explodiu ${r.traitRolls.length - 1}×: tirou o máximo, rolou de novo e somou)` : '';
  lines.push(`Rolagem: ${chainText(r.traitRolls)}${explosions}`);
  if (r.wild) lines.push(`Dado selvagem d6: ${chainText(r.wildRolls)} · vale o maior (${Math.max(r.traitTotal, r.wildTotal)})`);
  const base = r.wild ? Math.max(r.traitTotal, r.wildTotal) : r.traitTotal;
  if (r.penalty) lines.push(`${signed(r.penalty)} ${r.untrained ? 'penalidade por não ter treino' : 'penalidade: o dado já estava no mínimo (d4)'}`);
  if (evolution) lines.push(`${signed(evolution)} bônus do d12+${evolution} (soma ao resultado, não é dado)`);
  if (itemized) for (const b of bonuses) lines.push(`${signed(b.value)} ${b.label}`);
  else if (r.modifier) lines.push(`${signed(r.modifier)} modificadores`);

  const parts = [String(base)];
  if (r.penalty) parts.push(signed(r.penalty));
  if (evolution) parts.push(signed(evolution));
  if (itemized) for (const b of bonuses) parts.push(signed(b.value));
  else if (r.modifier) parts.push(signed(r.modifier));
  lines.push(`Total: ${parts.join(' ')} = ${roll.total}`);

  // Rolagem sem dificuldade (a da ficha hoje): só o total, sem sucesso, falha ou aumentos.
  if (roll.spec?.noTarget) {
    return { title: String(roll.formula).replace(/ vs \d+$/, ''), lines, detail: lines.join(' · '), total: roll.total, outcome: '', tone: '' };
  }
  const outcome = r.criticalFailure ? 'Falha crítica!'
    : r.success ? (r.raises ? `Sucesso com ${r.raises} aumento${r.raises > 1 ? 's' : ''}` : 'Sucesso') : 'Falha';
  const why = r.criticalFailure ? 'o dado do atributo e o selvagem tiraram 1 juntos'
    : r.success ? `${roll.total} ≥ dificuldade ${r.target}${r.raises ? `; cada 4 pontos acima dela é um aumento (${roll.total - r.target} acima)` : ''}`
      : `${roll.total} < dificuldade ${r.target}`;
  lines.push(`Resultado: ${why}`);
  return { title: roll.formula, lines, detail: lines.join(' · '), total: roll.total, outcome, tone: r.criticalFailure ? 'bad' : r.success ? 'good' : 'bad' };
}

export function describeRoll(roll) {
  const r = roll.result;
  if (r.kind === 'trait') return describeTrait(roll);
  // Rolagens antigas ainda podem ter duas tentativas (vantagem/desvantagem): continuam legíveis no histórico.
  const lines = r.attempts.map((attempt, index) => {
    const groups = attempt.groups.map(g => `${g.negative ? '−' : ''}${g.count}d${g.sides}${g.explode ? '!' : ''}: ${g.dice.map(chain => (chain.length > 1 ? `(${chain.join('+')})` : String(chain[0]))).join(', ')}`).join(' · ');
    const mark = r.attempts.length > 1 ? (index === r.chosen ? '✔ ' : '✘ ') : '';
    return `${mark}${groups}${r.modifier ? ` ${r.modifier > 0 ? `+${r.modifier}` : r.modifier}` : ''} = ${attempt.total}`;
  });
  return { title: roll.formula, lines, detail: lines.join(' | '), total: roll.total, outcome: '', tone: '' };
}
