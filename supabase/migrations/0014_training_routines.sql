-- Rotina de treino: uma planilha por jogador e mesa (o que o personagem faz no dia a dia entre as sessoes).
-- Todos os membros da mesa leem; so o dono escreve a propria.

create table public.table_training (
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id)
);
alter table public.table_training enable row level security;

create policy "training_select" on public.table_training for select to authenticated
  using (public.is_member(table_id));
create policy "training_insert" on public.table_training for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(table_id));
create policy "training_update" on public.table_training for update to authenticated
  using (user_id = auth.uid() and public.is_member(table_id))
  with check (user_id = auth.uid() and public.is_member(table_id));

create function public.training_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger training_touch before insert or update on public.table_training
  for each row execute function public.training_touch();
