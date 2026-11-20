import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadAptitude } from '../../lib/aptitude.js';
import { loadProgress } from '../../lib/engine.js';
import { createQueryGate, scopedValue } from '../../lib/queryGate.js';
import { pickTable } from './pickTable.js';
import AptitudePanel from './AptitudePanel.jsx';
import './routine.css';

const NO_DATA = { aptitude: null, progress: [] };

// Distribuição de Aptidão direto da ficha: acha a(s) mesa(s) em que esta ficha está e abre o mesmo painel da sala.
// A Aptidão é por mesa e por personagem; se a ficha estiver em mais de uma mesa, escolhe-se a mesa.
export default function SheetAptitude({ cloudId, c }) {
  const [membershipEntry, setMembershipEntry] = useState(null);
  const [preferredTableId, setPreferredTableId] = useState('');
  const [dataEntry, setDataEntry] = useState(null);
  const [gate] = useState(createQueryGate);
  // Mesas e dados ficam atrelados à ficha (cloudId) e ao par (mesa, ficha) em que foram lidos: ao trocar, nunca aparece o que era de outra.
  const memberships = scopedValue(membershipEntry, cloudId, null);
  const tables = memberships?.tables ?? null;
  const table = pickTable(tables ?? [], preferredTableId);
  const tableId = table?.id || '';
  const dataIdentity = `${tableId}:${cloudId}`;
  const { aptitude, progress } = scopedValue(dataEntry, dataIdentity, NO_DATA);

  useEffect(() => {
    let alive = true;
    if (!cloudId) return undefined;
    if (!supabase) { setMembershipEntry({ identity: cloudId, value: { tables: [], boundOnly: null } }); return undefined; }
    // Mesas em que esta ficha é o personagem aprovado, e a mesa a que a ficha foi vinculada ao ser criada.
    Promise.all([
      supabase.from('table_members').select('table_id,tables(name,status)').eq('character_id', cloudId).eq('status', 'approved'),
      supabase.from('characters').select('table_id,tables!table_id(name,status)').eq('id', cloudId).maybeSingle(),
    ]).then(([members, sheet]) => {
      if (!alive) return;
      const list = (members.data || []).filter(r => r.tables).map(r => ({ id: r.table_id, name: r.tables.name, closed: r.tables.status === 'closed' }));
      const bound = sheet.data?.table_id ? { id: sheet.data.table_id, name: sheet.data.tables?.name || 'a mesa da ficha' } : null;
      setMembershipEntry({ identity: cloudId, value: { tables: list, boundOnly: bound && !list.some(t => t.id === bound.id) ? bound : null } });
    });
    return () => { alive = false; };
  }, [cloudId]);

  const refresh = useCallback(async () => {
    if (!tableId) return;
    const isCurrent = gate.begin();
    const [a, p] = await Promise.all([loadAptitude(tableId), loadProgress(tableId)]);
    if (!isCurrent()) return;
    setDataEntry(prev => ({ identity: dataIdentity, value: { aptitude: a || scopedValue(prev, dataIdentity, NO_DATA).aptitude, progress: (p && p[cloudId]) || [] } }));
  }, [tableId, cloudId, dataIdentity, gate]);
  useEffect(() => { refresh().catch(() => {}); return () => gate.invalidate(); }, [refresh, gate]);

  if (!cloudId) return <p className="callout">Aguarde o salvamento automático da ficha na sua conta para distribuir Aptidão.</p>;
  if (tables === null) return <p className="muted">Carregando…</p>;
  if (!tables.length && memberships.boundOnly) return <p className="callout">Esta ficha foi criada para a mesa <b>{memberships.boundOnly.name}</b>, mas ainda não é o personagem que você escolheu nela (ou sua entrada ainda não foi aprovada). A Aptidão é concedida e distribuída só para o personagem escolhido na mesa: escolha esta ficha como seu personagem lá e volte aqui.</p>;
  if (!tables.length) return <p className="callout">Esta ficha ainda não está em nenhuma mesa. A Aptidão é concedida pelo mestre de uma mesa (uma rolagem de 1d100), e você distribui os pontos aqui.</p>;
  return <div>
    {tables.length > 1 && <label className="field"><span>Mesa</span>
      <select value={table.id} onChange={e => setPreferredTableId(e.target.value)}>{tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    <AptitudePanel tableId={table.id} characterId={cloudId} owner isGm={false} closed={table.closed} character={c} aptitude={aptitude} progress={progress} refresh={refresh} />
  </div>;
}
