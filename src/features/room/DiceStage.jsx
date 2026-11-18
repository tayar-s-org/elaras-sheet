import React, { useEffect, useRef, useState } from 'react';
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PlaneGeometry, ShadowMaterial,
  Mesh, Quaternion, Vector3, PCFShadowMap,
} from 'three';
import { dieDef, alignQuaternion } from '../../dice3d/geometry.js';
import { planDice, seededRandom } from '../../dice3d/plan.js';
import { makeDieMesh, DIE_COLORS } from '../../dice3d/mesh.js';
import { describeRoll } from '../../diceRoll.js';

const DURATION = 1900;      // ms de movimento por dado
const HOLD = 5000;          // ms com os dados e o resultado visíveis antes de sumirem
const easeOutCubic = p => 1 - (1 - p) ** 3;

function click(audio) {
  try {
    const ctx = audio.ctx || (audio.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 160 + Math.random() * 140;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* sem audio: segue em silencio */ }
}

// Palco 3D transparente sobre o tabuleiro. O servidor ja decidiu o resultado; aqui so animamos os dados
// pousando nas faces certas, com movimento derivado do id da rolagem (igual para todos os jogadores).
export default function DiceStage({ event, settings, onFinish }) {
  const hostRef = useRef(null);
  const engine = useRef(null);
  const settingsRef = useRef(settings);
  const finishRef = useRef(onFinish);
  settingsRef.current = settings;
  finishRef.current = onFinish;
  const [badge, setBadge] = useState(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch { engine.current = null; return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.domElement.className = 'dice-canvas';
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 1, 0.1, 80);
    const view = { zoom: 1 };
    const placeCamera = () => {
      // Em areas estreitas a camera sobe para os dados caberem.
      view.zoom = Math.max(1, Math.min(1.7, 1.3 / camera.aspect));
      camera.position.set(0, 11 * view.zoom, 5 * view.zoom);
      camera.lookAt(0, 0, -0.3);
    };
    placeCamera();
    scene.add(new HemisphereLight(0xffffff, 0x555570, 1.15));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
    sun.shadow.radius = 4;
    scene.add(sun);
    const ground = new Mesh(new PlaneGeometry(60, 60), new ShadowMaterial({ opacity: 0.38 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const state = { dice: [], raf: 0, timers: [], current: null, audio: {} };
    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      placeCamera();
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    function clearDice() {
      state.timers.forEach(clearTimeout);
      state.timers = [];
      cancelAnimationFrame(state.raf);
      state.dice.forEach(d => { scene.remove(d.mesh); d.mesh.userData.dispose(); });
      state.dice = [];
      renderer.render(scene, camera);
    }
    function finish(id) {
      if (state.current === id) { state.current = null; finishRef.current?.(id); }
    }

    function play(ev) {
      if (state.current != null) finish(state.current);
      clearDice();
      setFading(false);
      const roll = ev.roll;
      const info = describeRoll(roll);
      const showBadge = () => setBadge({ who: ev.who, formula: info.title, total: info.total, outcome: info.outcome, tone: info.tone });
      const plan = planDice(roll);
      state.current = roll.id;
      if (!plan) { showBadge(); finish(roll.id); state.timers.push(setTimeout(() => setBadge(null), HOLD)); return; }
      setBadge(null);

      const rng = seededRandom(roll.id);
      const aspect = camera.aspect;
      const visibleWidth = 8.7 * view.zoom * aspect;
      const cols = Math.max(2, Math.min(6, Math.floor(visibleWidth / 3)));
      const rowsCount = Math.ceil(plan.length / cols);
      const ends = [];
      plan.forEach((d, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, plan.length - row * cols);
        const col = i % cols;
        ends.push({ x: (col - (inRow - 1) / 2) * 2.7 + (rng() - 0.5) * 0.4, z: (row - (rowsCount - 1) / 2) * 2.7 - 0.3 + (rng() - 0.5) * 0.3 });
      });

      plan.forEach((d, i) => {
        const def = dieDef(d.sides);
        const color = d.role === 'wild' ? DIE_COLORS.wild : d.role === 'trait' ? DIE_COLORS.trait : DIE_COLORS[d.kind] || DIE_COLORS.d6;
        const mesh = makeDieMesh(def, { kind: d.kind, color, opacity: d.role === 'discarded' ? 0.5 : 1, value: d.value });
        const target = alignQuaternion(def, d.value);
        const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng() * Math.PI * 2);
        const end = ends[i];
        const side = Math.floor(rng() * 3);
        const start = side === 0
          ? { x: end.x + (rng() - 0.5) * 4, z: 9 * view.zoom }
          : { x: (side === 1 ? -1 : 1) * (visibleWidth / 2 + 3), z: end.z + rng() * 4 };
        const axis = new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        const spin = (6 + rng() * 4) * Math.PI * (rng() < 0.5 ? -1 : 1);
        state.dice.push({ mesh, rest: def.restY * mesh.userData.scale, target: yaw.multiply(target), end, start, axis, spin, delay: rng() * 260, bounces: 0 });
        scene.add(mesh);
        mesh.position.set(start.x, 6, start.z);
      });

      const t0 = performance.now();
      const spinQ = new Quaternion();
      const frame = now => {
        let done = true;
        for (const d of state.dice) {
          const p = Math.min(1, Math.max(0, (now - t0 - d.delay) / DURATION));
          if (p < 1) done = false;
          const e = easeOutCubic(p);
          d.mesh.position.x = d.start.x + (d.end.x - d.start.x) * e;
          d.mesh.position.z = d.start.z + (d.end.z - d.start.z) * e;
          d.mesh.position.y = d.rest + 2.5 * (1 - p) ** 2 * Math.abs(Math.cos(3.2 * Math.PI * p));
          spinQ.setFromAxisAngle(d.axis, d.spin * (1 - e));
          d.mesh.quaternion.copy(spinQ).multiply(d.target);
          const hits = Math.floor(3.2 * p + 0.5);
          if (hits > d.bounces && p < 0.97) { d.bounces = hits; if (settingsRef.current?.sound) click(state.audio); }
        }
        renderer.render(scene, camera);
        if (!done) { state.raf = requestAnimationFrame(frame); return; }
        showBadge();
        finish(roll.id);
        state.timers.push(setTimeout(() => setFading(true), HOLD));
        state.timers.push(setTimeout(() => { clearDice(); setBadge(null); }, HOLD + 700));
      };
      state.raf = requestAnimationFrame(frame);
    }

    engine.current = { play, clear: clearDice, current: () => state.current, finish };
    return () => {
      ro.disconnect();
      if (state.current != null) finish(state.current);
      clearDice();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    if (!event) return;
    if (engine.current) engine.current.play(event);
    else {
      // Sem WebGL: mostra so o cartao com o resultado.
      const info = describeRoll(event.roll);
      setFading(false);
      setBadge({ who: event.who, formula: info.title, total: info.total, outcome: info.outcome, tone: info.tone });
      finishRef.current?.(event.roll.id);
      const t = setTimeout(() => setBadge(null), HOLD);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [event]);

  return <div className={`dice-stage${fading ? ' fading' : ''}`} ref={hostRef} aria-hidden={!badge}>
    {badge && <div className={`dice-badge ${badge.tone}`} role="status">
      <span className="dice-badge-who">{badge.who}</span>
      <span className="dice-badge-total">{badge.total}</span>
      {badge.outcome && <span className="dice-badge-outcome">{badge.outcome}</span>}
      <span className="dice-badge-formula">{badge.formula}</span>
    </div>}
  </div>;
}
