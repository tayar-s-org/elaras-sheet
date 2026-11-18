-- Rotina de treino com varias rotinas por jogador (cada uma com nome e aprovacao propria) e um calendario mensal
-- onde o jogador coloca as rotinas aprovadas pelo mestre nos dias do mes.

-- 1) Varias rotinas por jogador e mesa: cada linha de table_training passa a ter id e nome.
alter table public.table_training drop constraint table_training_pkey;
alter table public.table_training
  add column id uuid not null default gen_random_uuid(),
  add column name text not null default '' check (char_length(name) <= 60),
  add column created_at timestamptz not null default now();
alter table public.table_training add primary key (id);
create index table_training_owner_idx on public.table_training (table_id, user_id);

create policy "training_delete" on public.table_training for delete to authenticated
  using (user_id = auth.uid() and public.is_member(table_id));

-- Cada jogador pode ter ate 20 rotinas por mesa.
create function public.training_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.table_training where table_id = new.table_id and user_id = new.user_id) >= 20 then
    raise exception 'Limite de 20 rotinas por jogador nesta mesa. Apague alguma antes de criar outra.';
  end if;
  return new;
end $$;
create trigger training_limit before insert on public.table_training
  for each row execute function public.training_limit();

-- Mesma regra de aprovacao de antes (0017/0019), agora por rotina; o id nao muda e so o dono muda o nome.
create or replace function public.training_review_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then new.status := 'draft'; end if;
    new.reviewed_at := null;
    new.review_note := null;
    return new;
  end if;
  new.id := old.id;
  new.created_at := old.created_at;
  new.user_id := old.user_id;
  new.table_id := old.table_id;
  if auth.uid() = old.user_id then
    if new.data is distinct from old.data then
      if not (old.status = 'draft' and new.status = 'pending') then new.status := 'draft'; end if;
    elsif new.status = 'approved' and old.status <> 'approved' then
      new.status := old.status;
    end if;
    if new.status is distinct from old.status then new.reviewed_at := null; else new.reviewed_at := old.reviewed_at; end if;
    new.review_note := case when new.status in ('pending', 'approved') then null else old.review_note end;
  elsif public.is_gm(old.table_id) then
    new.data := old.data;
    new.name := old.name;
    if new.status is distinct from old.status then new.reviewed_at := now(); else new.reviewed_at := old.reviewed_at; end if;
    new.review_note := case when new.status = 'draft' then nullif(btrim(new.review_note), '') else null end;
  else
    return old;
  end if;
  return new;
end $$;

-- 2) Calendario: um registro por jogador, mesa e mes ('2026-08'); days = { "dia do mes": id da rotina }.
create table public.table_training_calendar (
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  days jsonb not null default '{}'::jsonb check (jsonb_typeof(days) = 'object' and pg_column_size(days) < 8192),
  updated_at timestamptz not null default now(),
  primary key (table_id, user_id, month)
);
alter table public.table_training_calendar enable row level security;

create policy "training_cal_select" on public.table_training_calendar for select to authenticated
  using (public.is_member(table_id));
create policy "training_cal_insert" on public.table_training_calendar for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(table_id));
create policy "training_cal_update" on public.table_training_calendar for update to authenticated
  using (user_id = auth.uid() and public.is_member(table_id))
  with check (user_id = auth.uid() and public.is_member(table_id));

-- So rotinas aprovadas pelo mestre (e do proprio jogador) entram no calendario. Vale para o que foi colocado ou trocado agora;
-- se o mestre revogar uma aprovacao depois, o dia antigo continua la, mas nada novo com essa rotina entra.
create function public.training_calendar_guard() returns trigger
language plpgsql set search_path = public as $$
declare k text; v text;
begin
  if tg_op = 'UPDATE' then
    new.table_id := old.table_id; new.user_id := old.user_id; new.month := old.month;
  end if;
  for k, v in select * from jsonb_each_text(new.days) loop
    if k !~ '^[0-9]{1,2}$' or k::int < 1 or k::int > 31 then raise exception 'Dia inválido no calendário.'; end if;
    if v !~* '^[0-9a-f-]{36}$' then raise exception 'Rotina inválida no calendário.'; end if;
    if tg_op = 'INSERT' or (old.days ->> k) is distinct from v then
      if not exists (
        select 1 from public.table_training t
        where t.id = v::uuid and t.user_id = new.user_id and t.table_id = new.table_id and t.status = 'approved'
      ) then raise exception 'Só rotinas aprovadas pelo mestre podem ir para o calendário.'; end if;
    end if;
  end loop;
  new.updated_at := now();
  return new;
end $$;
create trigger training_calendar_guard before insert or update on public.table_training_calendar
  for each row execute function public.training_calendar_guard();
