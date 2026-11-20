-- 0047: entrega de benefícios em duas fases (consultar, aplicar na ficha, confirmar), sem perder nem duplicar nada.
--
-- Problema: claim_evolutions (0024), claim_spell_upgrades (0025) e claim_custom_skills (0027/0032) marcam o benefício como
-- entregue ANTES de o app aplicá-lo na ficha e salvar. Se o navegador fecha, a conta troca ou a resposta se perde, o benefício
-- some e nenhum outro aparelho o recebe.
--
-- Agora o app (1) consulta o que está pendente SEM marcar nada (peek_pending_benefits, uma chamada para todas as fichas da conta),
-- (2) aplica na ficha, anota o ID do benefício na própria ficha e deixa o autosave gravar, e (3) só então confirma por ID
-- (confirm_benefits). Confirmar o mesmo ID de novo não muda nada, e o registro de IDs na ficha impede aplicar duas vezes.
--
-- Aditiva: as funções claim_* continuam como estão para os apps já publicados. Só o dono da ficha consulta e confirma.
-- Funciona com ou sem a 0032: o atributo da perícia é lido por to_jsonb(linha), sem citar a coluna (sem a 0032 vem nulo, como no fluxo antigo).
-- Pode ser repetida (create or replace).

create or replace function public.peek_pending_benefits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;
  return jsonb_build_object(
    'evolutions', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'character_id', e.character_id, 'kind', e.kind, 'name', e.name) order by e.created_at)
      from (
        select a.* from public.evolution_awards a
        join public.characters c on c.id = a.character_id
        where c.owner_id = uid and a.claimed_at is null
        order by a.created_at limit 200
      ) e
    ), '[]'::jsonb),
    'spell_upgrades', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'character_id', u.character_id, 'spell_id', u.spell_id, 'n', u.n,
        'description', u.description, 'at', to_char(u.created_at, 'YYYY-MM-DD')) order by u.created_at)
      from (
        select a.* from public.spell_upgrade_awards a
        join public.characters c on c.id = a.character_id
        where c.owner_id = uid and a.claimed_at is null
        order by a.created_at limit 200
      ) u
    ), '[]'::jsonb),
    'custom_skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'character_id', s.character_id, 'name', s.name, 'die', s.die,
        'attribute', to_jsonb(s) ->> 'attribute') order by s.created_at)
      from (
        select t.* from public.table_custom_skills t
        join public.characters c on c.id = t.character_id
        where c.owner_id = uid and t.user_id = uid and t.status = 'approved' and t.delivered_at is null
        order by t.created_at limit 200
      ) s
    ), '[]'::jsonb)
  );
end $$;

-- Confirma por ID o que o app já aplicou e salvou. Devolve quantos IDs mudaram de fato (0 numa repetição).
create or replace function public.confirm_benefits(
  p_evolutions uuid[] default '{}', p_spell_upgrades uuid[] default '{}', p_custom_skills uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n_evolutions int; n_upgrades int; n_skills int;
begin
  if uid is null then raise exception 'Entre na sua conta.'; end if;

  update public.evolution_awards a set claimed_at = now()
  from public.characters c
  where c.id = a.character_id and c.owner_id = uid
    and a.id = any(coalesce(p_evolutions, '{}')) and a.claimed_at is null;
  get diagnostics n_evolutions = row_count;

  update public.spell_upgrade_awards a set claimed_at = now()
  from public.characters c
  where c.id = a.character_id and c.owner_id = uid
    and a.id = any(coalesce(p_spell_upgrades, '{}')) and a.claimed_at is null;
  get diagnostics n_upgrades = row_count;

  -- O gatilho de table_custom_skills só deixa alterar delivered_at com esta marca (0027).
  perform set_config('app.custom_skill_claim', '1', true);
  update public.table_custom_skills t set delivered_at = now()
  where t.id = any(coalesce(p_custom_skills, '{}')) and t.user_id = uid and t.status = 'approved' and t.delivered_at is null;
  get diagnostics n_skills = row_count;
  perform set_config('app.custom_skill_claim', '0', true);

  return jsonb_build_object('evolutions', n_evolutions, 'spell_upgrades', n_upgrades, 'custom_skills', n_skills);
end $$;

revoke all on function public.peek_pending_benefits() from public, anon;
revoke all on function public.confirm_benefits(uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.peek_pending_benefits() to authenticated;
grant execute on function public.confirm_benefits(uuid[], uuid[], uuid[]) to authenticated;
