import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../../../supabase/migrations/0046_conditions_delta_and_state_guard.sql', import.meta.url), 'utf8');

test('0046 impede estado que não é objeto e preserva as condições do mestre em qualquer escrita', () => {
  assert.match(sql, /update public\.table_character_state set state = '\{\}'::jsonb where jsonb_typeof\(state\) is distinct from 'object'/);
  assert.match(sql, /check \(jsonb_typeof\(state\) = 'object'\) not valid/);
  assert.match(sql, /validate constraint table_character_state_state_is_object/);
  assert.match(sql, /state_keep_conditions[\s\S]*raise exception[^;]*objeto/); // o gatilho recusa em vez de deixar passar
  assert.doesNotMatch(sql, /jsonb_typeof\(new\.state\) is distinct from 'object' then return new/);
});

test('0046: gm_conditions_delta trava a linha, regrava pelo caminho auditado e só o mestre autenticado executa', () => {
  assert.match(sql, /create or replace function public\.gm_conditions_delta\(/);
  assert.match(sql, /mh_begin\(p_table, p_character, p_request_id, 'condition'\)/); // mestre, aluno aprovado, idempotência
  assert.match(sql, /table_id = p_table and character_id = p_character for update/);
  assert.match(sql, /return public\.gm_set_conditions\(p_table, p_character, new_c, p_note, p_request_id\)/);
  assert.match(sql, /revoke all on function public\.gm_conditions_delta[^;]*from public, anon/);
  assert.match(sql, /grant execute on function public\.gm_conditions_delta[^;]*to authenticated/);
});
