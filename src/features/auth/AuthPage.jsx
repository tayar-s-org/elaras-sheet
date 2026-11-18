import React, { useState } from 'react';
import { navigate } from '../../lib/router.js';

const translate = message => {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(message)) return 'Este e-mail já tem conta. Entre com a senha.';
  if (/password should be at least/i.test(message)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/rate limit/i.test(message)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.';
  return message;
};

export default function AuthPage({ auth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const register = mode === 'register';
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (register) {
        const signedIn = await auth.signUp(email.trim(), password, name.trim());
        if (!signedIn) { setMessage('Conta criada. Confirme o e-mail enviado para poder entrar.'); return; }
      } else await auth.signIn(email.trim(), password);
      let next = '/';
      try { next = sessionStorage.getItem('elara-next') || '/'; sessionStorage.removeItem('elara-next'); } catch { /* sem storage */ }
      navigate(next);
    } catch (error) { setMessage(translate(error.message)); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <form className="auth-card" onSubmit={submit}>
      <p className="eyebrow">CRÔNICAS DE MANRAKORA</p>
      <h1>{register ? 'Criar conta' : 'Entrar'}</h1>
      <p className="muted">{register ? 'Guarde suas fichas na nuvem e jogue com seus amigos.' : 'Acesse suas fichas em qualquer dispositivo.'}</p>
      {register && <label className="field"><span>Nome de exibição</span>
        <input required maxLength={60} value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" /></label>}
      <label className="field"><span>E-mail</span>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="field"><span>Senha</span>
        <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      <button className="primary full" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button>
      <p role="status" className="muted">{message}</p>
      <button type="button" className="text-button" onClick={() => { setMode(register ? 'login' : 'register'); setMessage(''); }}>
        {register ? 'Já tenho conta' : 'Criar uma conta'}</button>
      <button type="button" className="text-button" onClick={() => navigate('/')}>← Voltar ao início</button>
    </form>
  </main>;
}
