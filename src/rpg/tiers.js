// Conversão de um dado em "categoria" para as tabelas de regras. ÚNICO lugar onde isso é decidido.
//
// INTERPRETAÇÃO ADOTADA (fácil de mudar aqui): as tabelas usam SOMENTE o dado-base e ignoram o bônus.
//   d12+1, d12+2… continuam sendo um dado de 12 lados com bônus; nunca viram D18, D24 ou outra categoria.
//   Sessões de meditação por dia   = piso(dado-base de Espírito / 6), no mínimo 1   (d6=1, d12=2)
//   Horas de treino de feitiço/dia = piso(dado-base de Conjurar / 2)                 (d6=3, d12=6)
// As linhas D18, D24 e D30 das tabelas do pedido só passam a valer se algum dia existir dado-base maior que 12.

export const baseDie = die => Math.max(0, Math.trunc(Number(die?.die ?? die) || 0));

export const meditationSessionsPerDay = spirit => Math.max(1, Math.floor(baseDie(spirit) / 6));
export const spellTrainingHoursPerDay = conjurar => Math.floor(baseDie(conjurar) / 2);
