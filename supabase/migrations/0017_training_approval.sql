-- Rotina de treino com aprovacao do mestre.
-- Estados: draft (rascunho), pending (jogador enviou) e approved (mestre aprovou).
-- O jogador so envia ou retira o envio; so o mestre aprova ou devolve (e so mexe no estado, nunca nos dados).
-- Editar os dados de uma rotina pendente ou aprovada volta para rascunho.

alter table public.table_training
  add column status text not null default 'draft' check (status in ('draft', 'pending', 'approved')),
  add column reviewed_at timestamptz;

create policy "training_gm_review" on public.table_training for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));

create function public.training_review_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then new.status := 'draft'; end if;
    new.reviewed_at := null;
    return new;
  end if;
  new.user_id := old.user_id;
  new.table_id := old.table_id;
  if auth.uid() = old.user_id then
    if new.data is distinct from old.data then
      if not (old.status = 'draft' and new.status = 'pending') then new.status := 'draft'; end if;
    elsif new.status = 'approved' and old.status <> 'approved' then
      new.status := old.status;
    end if;
    if new.status is distinct from old.status then new.reviewed_at := null; else new.reviewed_at := old.reviewed_at; end if;
  elsif public.is_gm(old.table_id) then
    new.data := old.data;
    if new.status is distinct from old.status then new.reviewed_at := now(); else new.reviewed_at := old.reviewed_at; end if;
  else
    return old;
  end if;
  return new;
end $$;
create trigger training_review_guard before insert or update on public.table_training
  for each row execute function public.training_review_guard();
