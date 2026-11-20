-- 0051: o limite de jogadores da mesa passa a ser serializado.
--
-- Em _join_table (entrada, 0028) e decide_member (aprovação, 0002) a vaga era conferida contando os jogadores aprovados SEM
-- travar nada: duas entradas, ou uma entrada e uma aprovação, ao mesmo tempo viam a mesma última vaga livre e as duas
-- ocupavam, estourando max_players.
--
-- Agora as duas funções travam a linha da mesa (for no key update) antes de contar. A segunda transação espera a primeira
-- terminar e conta de novo já vendo o jogador novo. "no key update" não bloqueia quem só referencia a mesa (mensagens, rolagens).
-- Lock sempre na mesa e só depois nas linhas de table_members, então as duas funções não se esperam em círculo.
--
-- Mesmas assinaturas, regras e mensagens das versões atuais; só muda o lock. Reescreve duas funções em uso (create or replace);
-- pode ser repetida.

create or replace function public._join_table(t uuid, p_message text, p_character uuid) returns public.member_status
language plpgsql security definer set search_path = public as $$
declare
  tbl public.tables;
  cur public.table_members;
  next_status public.member_status;
  ch_table uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select * into tbl from public.tables where id = t for no key update;
  if not found then raise exception 'Mesa não encontrada.'; end if;
  if tbl.status = 'closed' then raise exception 'Esta mesa está encerrada.'; end if;
  if p_character is not null then
    select table_id into ch_table from public.characters where id = p_character and owner_id = auth.uid();
    if not found then raise exception 'Ficha inválida.'; end if;
    if ch_table is not null and ch_table <> t then
      raise exception 'Esta ficha foi criada para outra mesa e não pode ser usada nesta.';
    end if;
  end if;

  select * into cur from public.table_members where table_id = t and user_id = auth.uid();
  if found then
    if cur.status = 'kicked' then raise exception 'Você foi removido desta mesa.'; end if;
    if cur.status in ('pending', 'approved') then return cur.status; end if;
  end if;

  next_status := case when tbl.auto_approve then 'approved' else 'pending' end;
  if next_status = 'approved' and (
    select count(*) from public.table_members
    where table_id = t and role = 'player' and status = 'approved'
  ) >= tbl.max_players then
    next_status := 'pending';
  end if;

  insert into public.table_members (table_id, user_id, role, status, character_id, message, requested_at, decided_at)
  values (t, auth.uid(), 'player', next_status, p_character, left(coalesce(p_message, ''), 300), now(),
          case when next_status = 'approved' then now() end)
  on conflict (table_id, user_id) do update
    set status = excluded.status, character_id = excluded.character_id, message = excluded.message,
        requested_at = now(), decided_at = excluded.decided_at;

  if p_character is not null and ch_table is null then
    perform set_config('app.bind_character', '1', true);
    update public.characters set table_id = t where id = p_character;
    perform set_config('app.bind_character', '', true);
  end if;
  return next_status;
end $$;

create or replace function public.decide_member(p_table uuid, p_user uuid, p_status public.member_status)
returns void
language plpgsql security definer set search_path = public as $$
declare tbl public.tables;
begin
  select * into tbl from public.tables where id = p_table for no key update;
  if not found or tbl.owner_id <> auth.uid() then raise exception 'Apenas o mestre pode fazer isso.'; end if;
  if p_status not in ('approved', 'rejected', 'kicked') then raise exception 'Estado inválido.'; end if;
  if p_user = tbl.owner_id then raise exception 'O mestre não pode ser alterado.'; end if;
  if p_status = 'approved' and (
    select count(*) from public.table_members
    where table_id = p_table and role = 'player' and status = 'approved' and user_id <> p_user
  ) >= tbl.max_players then raise exception 'A mesa está cheia.'; end if;
  update public.table_members set status = p_status, decided_at = now()
  where table_id = p_table and user_id = p_user and role = 'player';
  if not found then raise exception 'Participante não encontrado.'; end if;
end $$;

revoke all on function public._join_table(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.decide_member(uuid, uuid, public.member_status) from public, anon;
