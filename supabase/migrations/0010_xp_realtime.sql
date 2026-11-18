-- XP chega na hora: o app do jogador assina novas concessoes (a RLS de xp_awards ja limita a quem pode ver).
do $$
begin
  alter publication supabase_realtime add table public.xp_awards;
exception when duplicate_object then null;
end $$;
