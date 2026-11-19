-- Perícia personalizada passa a ter um atributo (Agilidade, Astúcia, Espírito, Força ou Vigor). No treino da rotina ela rende
-- 1 de XP da perícia e 0,5 de XP do atributo. Pedidos novos exigem o atributo; os antigos ficam sem e o jogador define na ficha.
-- Depende da 0027. Pode ser repetida sem estragar nada.

alter table public.table_custom_skills add column if not exists attribute text;
alter table public.table_custom_skills drop constraint if exists table_custom_skills_attribute_check;
alter table public.table_custom_skills add constraint table_custom_skills_attribute_check
  check (attribute is null or attribute in ('Agilidade', 'Astúcia', 'Espírito', 'Força', 'Vigor'));

-- Novo pedido: o atributo é obrigatório.
create or replace function public.custom_skills_before_insert() returns trigger
language plpgsql as $$
begin
  new.name := btrim(new.name);
  new.status := 'pending'; new.gm_note := ''; new.delivered_at := null; new.decided_at := null;
  if new.attribute is null then raise exception 'Escolha o atributo da perícia.'; end if;
  if (select count(*) from public.table_custom_skills
      where table_id = new.table_id and user_id = new.user_id and status = 'pending') >= 10 then
    raise exception 'Você já tem 10 perícias aguardando aprovação nesta mesa.';
  end if;
  return new;
end $$;

-- Na decisão o mestre só altera status e anotação (o atributo, como o nome e o dado, não muda).
create or replace function public.custom_skills_before_update() returns trigger
language plpgsql as $$
begin
  new.table_id := old.table_id; new.user_id := old.user_id; new.character_id := old.character_id;
  new.name := old.name; new.die := old.die; new.attribute := old.attribute; new.created_at := old.created_at;
  if coalesce(current_setting('app.custom_skill_claim', true), '') <> '1' then new.delivered_at := old.delivered_at; end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;

-- A entrega devolve também o atributo.
drop function if exists public.claim_custom_skills(uuid);
create function public.claim_custom_skills(p_character uuid)
returns table (id uuid, name text, die int, attribute text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid()) then
    raise exception 'Ficha inválida.';
  end if;
  perform set_config('app.custom_skill_claim', '1', true);
  return query
    update public.table_custom_skills t set delivered_at = now()
    where t.character_id = p_character and t.user_id = auth.uid() and t.status = 'approved' and t.delivered_at is null
    returning t.id, t.name, t.die, t.attribute;
end $$;
revoke all on function public.claim_custom_skills(uuid) from public, anon;
