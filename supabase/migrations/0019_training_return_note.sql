-- Motivo da devolucao: ao devolver (ou revogar) uma rotina, o mestre escreve o texto que o jogador le.
-- O jogador nao altera o texto; ele some quando a rotina e enviada de novo.

alter table public.table_training
  add column review_note text check (review_note is null or char_length(review_note) <= 500);

create or replace function public.training_review_guard() returns trigger
language plpgsql security definer set search_path = public as $$
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
    elsif new.status = 'approved' and old.status <> 'approved' then
      new.status := old.status;
    end if;
    if new.status is distinct from old.status then new.reviewed_at := null; else new.reviewed_at := old.reviewed_at; end if;
    -- o jogador nao mexe no texto; ele some quando a rotina volta a ser enviada ou aprovada
    new.review_note := case when new.status in ('pending', 'approved') then null else old.review_note end;
  elsif public.is_gm(old.table_id) then
    new.data := old.data;
    if new.status is distinct from old.status then new.reviewed_at := now(); else new.reviewed_at := old.reviewed_at; end if;
    -- o texto so vale numa devolucao (status draft); aprovar ou enviar limpa
    new.review_note := case when new.status = 'draft' then nullif(btrim(new.review_note), '') else null end;
  else
    return old;
  end if;
  return new;
end $$;
