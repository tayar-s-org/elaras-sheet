import { ACT, ACTIVITY_LABEL } from './activities.js';
import { MODALITY_LABEL } from './progression.js';

export const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');
export const signed = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0');

// Texto do que uma hora fez (editor e histórico). stats.spells traz os nomes dos feitiços.
export function describeEvent(e, stats) {
  if (!e.activity) return '';
  if (!e.ok) return e.reason || 'Sem efeito.';
  const spellName = id => stats?.spells?.find(s => s.id === id)?.name || 'feitiço';
  const mod = x => (x === 'focused' ? ' (focado)' : '');
  switch (e.activity) {
    case ACT.SKILL: {
      const row = e.row || {};
      return `${e.trainHour}ª hora de treino${mod(row.mode)}: −${fmt(e.cost)} de estamina${e.manaCost ? ` e −${fmt(e.manaCost)} de mana` : ''} · +1 XP em ${row.skill}`;
    }
    case ACT.SPELL: {
      const row = e.row || {};
      return `Treino de ${spellName(row.spell)}${mod(row.mode)}: −${fmt(e.cost)} de mana · +1 XP no feitiço, +0,5 em Conjurar, +0,25 em Espírito`;
    }
    case ACT.STUDY: return `Estudo de ${spellName(e.spell || e.row?.spell)}: +1 hora de estudo`;
    case ACT.REST: {
      const { streak, paid } = e.rest || {};
      if (!paid) return `Descanso ininterrupto, ${streak}ª hora: ainda sem recuperação (vem retroativa na 4ª hora)`;
      return streak === 4 ? `Descanso ininterrupto, ${streak}ª hora: +${fmt(paid)} de estamina (as 4 horas, retroativo)` : `Descanso ininterrupto, ${streak}ª hora: +${fmt(paid)} de estamina`;
    }
    case ACT.WORK: return `${e.workHour}ª hora de trabalho: −${fmt(-e.staminaDelta)} de estamina, −${fmt(-e.manaDelta)} de mana · +$${fmt(e.pay || 0)}${e.xp?.length ? ` · +${fmt(e.xp[0].amount)} XP em ${e.xp[0].name}` : ''}`;
    case ACT.QUICK: return 'Descanso rápido: +2 de estamina';
    case ACT.MEDITATE: {
      const m = e.meditation || {};
      return `${m.started ? `Sessão de meditação iniciada: +${fmt(m.rate)} de mana por hora` : `Meditação: +${fmt(e.manaDelta)} de mana`} · +1 XP em Meditar, +0,5 em Espírito`;
    }
    default: return ACTIVITY_LABEL[e.activity] || '';
  }
}

export { MODALITY_LABEL };

export const describeDay = () => 'O dia da campanha vai das 06:00 às 05:59 do dia seguinte: os limites diários (horas de treino, descanso, sessões de meditação) reiniciam às 06:00.';
