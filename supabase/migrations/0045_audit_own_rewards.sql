-- 0045: o registro da mesa (sob o tabuleiro, aba "XP e dinheiro") passa a mostrar também as moedas e as experiências personalizadas.
--
-- Essas concessões só ficavam em master_audit_log, que só o mestre lê. Esta política deixa o DONO do personagem ler as linhas de
-- categoria 'wallet' (moeda da mesa) e 'experience' (tipo de experiência) do PRÓPRIO personagem, igual ao XP e ao dinheiro, que cada
-- jogador vê só na própria ficha. O mestre continua vendo tudo (política master_audit_select). Sem política de escrita.
-- Só cria uma política nova; pode ser repetida.

drop policy if exists master_audit_select_own on public.master_audit_log;
create policy master_audit_select_own on public.master_audit_log for select to authenticated
  using (category in ('wallet', 'experience') and character_id is not null and public.owns_character(character_id));
