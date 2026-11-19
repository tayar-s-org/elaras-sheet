import React, { useEffect, useRef, useState } from 'react';

const KEY = 'manrakora-gm-alert';
const SETTLE_MS = 6000; // logo ao abrir a sala os pedidos já existentes ainda estão carregando: não apita por eles

let ctx = null;
// Dois toques curtos (sem arquivo de áudio): sol e depois dó agudo.
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = ctx || new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [[784, 0], [1047, 0.16]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    });
  } catch { /* sem áudio disponível */ }
}

// Mestre: toca um aviso sempre que o total de pedidos esperando (entrada na mesa, itens, habilidades, rotinas, solicitações) aumenta.
// O hook fica sempre ativo na sala; o botão para ligar/desligar fica na aba Mesa (GmAlertToggle).
export function useGmAlert(total, isGm) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } });
  const prev = useRef(null);
  const mounted = useRef(Date.now());

  useEffect(() => {
    if (!isGm) return;
    if (prev.current !== null && total > prev.current && on && Date.now() - mounted.current > SETTLE_MS) chime();
    prev.current = total;
  }, [total, isGm, on]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch { /* sem storage */ }
    if (next) chime(); // também libera o áudio do navegador e serve de teste
  };
  return { on, toggle };
}

export function GmAlertToggle({ alert, total }) {
  return <section className="gm-alert-box">
    <h4>Aviso sonoro de pedidos</h4>
    <p className="muted">Toca um som quando chega um pedido de entrada na mesa, item, habilidade, rotina de treino ou solicitação dos jogadores. Só o mestre ouve, com a sala aberta neste navegador.</p>
    <div className="row">
      <button type="button" className={alert.on ? 'primary' : 'outline'} aria-pressed={alert.on} onClick={alert.toggle}>
        🔔 {alert.on ? 'Ligado (clique para desligar)' : 'Desligado (clique para ligar)'}</button>
      <button type="button" className="outline" onClick={chime}>Testar som</button>
      {total > 0 && <span className="muted">{total} pedido{total > 1 ? 's' : ''} esperando</span>}
    </div>
  </section>;
}
