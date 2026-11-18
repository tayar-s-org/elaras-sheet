import { supabase } from './supabase.js';

const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };

// Relógio da mesa: { tick } (sem registro = a mesa ainda está no tick 0, Primeiro Mês, dia 1, 06:00).
// Devolve null se a migration 0023 ainda não foi rodada.
export async function loadClock(tableId) {
  const { data, error } = await supabase.from('table_clock').select('tick,updated_at').eq('table_id', tableId).maybeSingle();
  if (error) return null;
  return { tick: data?.tick ?? 0, updatedAt: data?.updated_at ?? null };
}

export async function loadClockLog(tableId, limit = 30) {
  const { data, error } = await supabase.from('table_clock_log')
    .select('id,from_tick,to_tick,hours,kind,checked,created_by,created_at').eq('table_id', tableId)
    .order('id', { ascending: false }).limit(limit);
  return error ? null : data;
}

// Agenda de todos os personagens da mesa: { [character_id]: { [dayNo]: routine_id } }.
export async function loadRoutineDays(tableId) {
  const { data, error } = await supabase.from('table_routine_days').select('character_id,day_no,routine_id').eq('table_id', tableId).limit(20000);
  if (error) return null;
  const out = {};
  for (const r of data) (out[r.character_id] ||= {})[r.day_no] = r.routine_id;
  return out;
}

// Dono: coloca a rotina (aprovada) nos dias, ou tira (routineId = null). O servidor recusa dia que já começou.
export async function assignDays(tableId, characterId, dayNos, routineId) {
  if (!dayNos.length) return;
  if (routineId) {
    const rows = dayNos.map(day_no => ({ table_id: tableId, character_id: characterId, day_no, routine_id: routineId }));
    const { error } = await supabase.from('table_routine_days').upsert(rows, { onConflict: 'table_id,character_id,day_no' });
    fail(error, 'Não foi possível salvar o calendário.');
  } else {
    const { error } = await supabase.from('table_routine_days').delete()
      .eq('table_id', tableId).eq('character_id', characterId).in('day_no', dayNos);
    fail(error, 'Não foi possível salvar o calendário.');
  }
}

// Mestre: confere o que impediria o avanço (vazio, pending, rejected, draft). O servidor repete a conferência ao avançar.
export async function checkAdvanceOnServer(tableId, hours) {
  const { data, error } = await supabase.rpc('check_advance', { p_table: tableId, p_hours: hours });
  fail(error, 'Não foi possível conferir o avanço.');
  return data;
}

// Mestre: avança o relógio. Falha, sem mudar nada, se o relógio andou desde que a tela abriu ou se há pendências.
export async function advanceClock(tableId, hours, expectedTick, kind = 'hours') {
  const { data, error } = await supabase.rpc('advance_clock', { p_table: tableId, p_hours: hours, p_expected_tick: expectedTick, p_kind: kind });
  fail(error, 'Não foi possível avançar o tempo.');
  return data;
}
