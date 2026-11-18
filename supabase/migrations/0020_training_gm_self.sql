-- Mestre que tambem joga: ele pode aprovar ou devolver a propria rotina de treino (ele e quem administra a mesa).
-- Jogadores comuns continuam sem poder se aprovar.

create or replace function public.training_review_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  gm boolean := public.is_gm(coalesce(old.table_id, new.table_id));
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then new.status := 'draft'; end if;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;
  new.user_id := old.user_id;
  new.table_id := old.table_id;
  if auth.uid() = old.user_id then
    if new.data is distinct from old.data then
      if not (old.status = 'draft' and new.status = 'pending') then new.status := 'draft'; end if;
    elsif new.status = 'approved' and old.status <> 'approved' and not gm then
      new.status := old.status;
    end if;
    if new.status is distinct from old.status then new.reviewed_at := case when gm and new.status <> 'pending' then now() else null end;
    else new.reviewed_at := old.reviewed_at; end if;
    -- jogador comum nao mexe no texto; o do mestre vale numa devolucao (draft); aprovar ou enviar limpa
    new.review_note := case
      when new.status in ('pending', 'approved') then null
      when gm then nullif(btrim(new.review_note), '')
      else old.review_note end;
  elsif gm then
    new.data := old.data;
    if new.status is distinct from old.status then new.reviewed_at := now(); else new.reviewed_at := old.reviewed_at; end if;
    new.review_note := case when new.status = 'draft' then nullif(btrim(new.review_note), '') else null end;
  else
    return old;
  end if;
  return new;
end $$;
