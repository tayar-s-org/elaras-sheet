-- Desfaz a 0026 (Aptidão). Apaga as rolagens concedidas, as distribuições e o histórico de Aptidão.
-- A XP de treino já gravada (com bônus) NAO muda: ela continua valendo como está.
-- Depois de rodar este arquivo, rode de novo a 0025_work_and_study.sql: ela restaura o advance_time sem Aptidão.

drop function if exists public.set_aptitude(uuid, uuid, jsonb);
drop function if exists public.grant_aptitude(uuid, uuid, uuid);
drop function if exists public.aptitude_received(uuid, uuid);
drop function if exists public.aptitude_pct(jsonb, text, text);
drop table if exists public.aptitude_log;
drop table if exists public.character_aptitude;
drop table if exists public.aptitude_grants;
