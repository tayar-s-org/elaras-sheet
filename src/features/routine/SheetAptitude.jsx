import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadAptitude } from '../../lib/aptitude.js';
import { loadProgress } from '../../lib/engine.js';
import AptitudePanel from './AptitudePanel.jsx';
import './routine.css';

// Distribuição de Aptidão direto da ficha: acha a(s) mesa(s) em que esta ficha está e abre o mesmo painel da sala.
// A Aptidão é por mesa e por personagem; se a ficha estiver em mais de uma mesa, escolhe-se a mesa.
export default function SheetAptitude({ cloudId, c }) {
  const [tables, setTables] = useState(null);
  const [boundOnly, setBoundOnly] = useState(null);
  const [tableId, setTableId] = useState('');
  const [aptitude, setAptitude] = useState(null);
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!cloudId || !supabase) { setTables([]); return undefined; }
    // Mesas em que esta ficha é o personagem aprovado, e a mesa a que a ficha foi vinculada ao ser criada.
    Promise.all([
      supabase.from('table_members').select('table_id,tables(name,status)').eq('character_id', cloudId).eq('status', 'approved'),
      supabase.from('characters').select('table_id,tables!table_id(name,status)').eq('id', cloudId).maybeSingle(),
    ]).then(([members, sheet]) => {
      if (!alive) return;
      const list = (members.data || []).filter(r => r.tables).map(r => ({ id: r.table_id, name: r.tables.name, closed: r.tables.status === 'closed' }));
      const bound = sheet.data?.table_id ? { id: sheet.data.table_id, name: sheet.data.tables?.name || 'a mesa da ficha' } : null;
      setBoundOnly(bound && !list.some(t => t.id === bound.id) ? bound : null);
      setTables(list);
      setTableId(prev => prev || list[0]?.id || '');
    });
    return () => { alive = false; };
  }, [cloudId]);

  const refresh = useCallback(async () => {
    if (!tableId) return;
    const [a, p] = await Promise.all([loadAptitude(tableId), loadProgress(tableId)]);
    if (a) setAptitude(a);
    setProgress((p && p[cloudId]) || []);
  }, [tableId, cloudId]);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  if (!cloudId) return <p className="callout">Aguarde o salvamento automático da ficha na sua conta para distribuir Aptidão.</p>;
  if (tables === null) return <p className="muted">Carregando…</p>;
  if (!tables.length && boundOnly) return <p className="callout">Esta ficha foi criada para a mesa <b>{boundOnly.name}</b>, mas ainda não é o personagem que você escolheu nela (ou sua entrada ainda não foi aprovada). A Aptidão é concedida e distribuída só para o personagem escolhido na mesa: escolha esta ficha como seu personagem lá e volte aqui.</p>;
  if (!tables.length) return <p className="callout">Esta ficha ainda não está em nenhuma mesa. A Aptidão é concedida pelo mestre de uma mesa (uma rolagem de 1d100), e você distribui os pontos aqui.</p>;
  const table = tables.find(t => t.id === tableId) || tables[0];
  return <div>
    {tables.length > 1 && <label className="field"><span>Mesa</span>
      <select value={tableId} onChange={e => { setAptitude(null); setTableId(e.target.value); }}>{tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    <AptitudePanel tableId={table.id} characterId={cloudId} owner isGm={false} closed={table.closed} character={c} aptitude={aptitude} progress={progress} refresh={refresh} />
  </div>;
}
