-- 0042: os contadores de experiência (Central do Mestre, 0040) passam a ser visíveis para TODOS os membros da mesa, como o XP de evolução.
--
-- Antes (0040): character_experience só era lida pelo dono do personagem e pelo mestre. Agora qualquer membro aprovado da mesa lê (is_member),
-- então os valores aparecem na ficha, no Grupo e no resumo do token de cada personagem. A ESCRITA continua só pelo RPC do mestre
-- (gm_experience_adjust). As carteiras de moeda (character_wallets) continuam privadas (dono e mestre).
--
-- Só troca uma política de leitura (nenhum dado muda); pode ser repetida.

drop policy if exists experience_select on public.character_experience;
create policy experience_select on public.character_experience for select to authenticated using (public.is_member(table_id));
