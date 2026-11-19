import React from 'react';
import { loginThen, navigate } from '../../lib/router.js';
import { joinByCode } from '../../lib/tables.js';
import JoinForm from './JoinForm.jsx';

export default function InvitePage({ auth, code }) {
  if (auth.loading) return <main className="page"><p className="muted">Verificando sessão…</p></main>;
  if (!auth.user) {
    return <main className="page">
      <h1>Convite para uma mesa</h1>
      <p className="muted">Entre ou crie sua conta para aceitar o convite.</p>
      <button className="primary" onClick={() => loginThen(`/convite/${code}`)}>Entrar</button>
    </main>;
  }
  return <main className="page">
    <h1>Convite para uma mesa</h1>
    <p className="muted">Código {code}. Escolha uma ficha (opcional) e envie seu pedido; o mestre pode precisar aprová-lo.</p>
    <JoinForm submitLabel="Enviar pedido" onSubmit={async ({ message, characterId }) => {
      navigate(`/mesa/${await joinByCode(code, message, characterId)}`);
    }} />
  </main>;
}
