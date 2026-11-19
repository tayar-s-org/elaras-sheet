-- Corrige o erro "new row violates row-level security policy for table characters" ao criar uma ficha para uma mesa
-- em que o pedido de entrada ainda esta pendente.
-- A 0028 exigia participacao APROVADA (is_member) para criar a ficha de uma mesa, mas as funcoes de vinculo
-- (bind_character_table, set_member_character e _join_table) ja aceitam participacao pendente ou aprovada.
-- Agora a criacao tambem aceita as duas (is_involved). A ficha continua sendo so do dono (owner_id = auth.uid()).
-- Pode rodar de novo sem estragar nada.

drop policy if exists "characters_insert_own" on public.characters;
create policy "characters_insert_own" on public.characters for insert to authenticated
  with check (owner_id = auth.uid() and (table_id is null or public.is_involved(table_id)));

-- A trava de troca de mesa (UPDATE) tambem usava is_member; alinha com o mesmo criterio.
create or replace function public.characters_table_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.table_id is distinct from old.table_id then
    if old.table_id is not null then
      if exists (select 1 from public.tables where id = old.table_id) then new.table_id := old.table_id; end if;
    elsif new.table_id is not null
      and coalesce(current_setting('app.bind_character', true), '') <> '1'
      and not public.is_involved(new.table_id) then
      new.table_id := null;
    end if;
  end if;
  return new;
end $$;
