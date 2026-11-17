import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

export function useAuth() {
  const [state, setState] = useState({ loading: Boolean(supabase), session: null, profile: null });
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setState(s => ({ ...s, loading: false, session: data.session })));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(s => ({ ...s, loading: false, session, profile: session ? s.profile : null }));
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  const userId = state.session?.user?.id;
  useEffect(() => {
    if (!supabase || !userId) return undefined;
    let alive = true;
    supabase.from('profiles').select('id,display_name,avatar_path').eq('id', userId).single()
      .then(({ data }) => alive && data && setState(s => ({ ...s, profile: data })));
    return () => { alive = false; };
  }, [userId]);
  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);
  const signUp = useCallback(async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) throw error;
    return Boolean(data.session);
  }, []);
  const signOut = useCallback(() => supabase.auth.signOut(), []);
  return { ...state, user: state.session?.user || null, signIn, signUp, signOut };
}
