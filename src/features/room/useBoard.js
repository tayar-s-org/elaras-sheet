import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { loadBoard, loadBoardItems, mapUrl } from '../../lib/board.js';
import { applyTokenRow } from '../../tokenState.js';

const upsert = (list, row) => (list.some(x => x.id === row.id) ? list.map(x => (x.id === row.id ? { ...x, ...row } : x)) : [...list, row]);

// Estado do tabuleiro: carga inicial, mudancas em tempo real e posicoes provisorias de arraste.
export function useBoard(tableId, user, room) {
  const [board, setBoard] = useState(undefined);
  const [tokens, setTokens] = useState([]);
  const [marks, setMarks] = useState([]);
  const [mapSrc, setMapSrc] = useState(null);
  const [drags, setDrags] = useState({});
  const [error, setError] = useState('');
  const dragging = useRef(new Set());
  const boardRef = useRef(null);
  const mapRequest = useRef(0);
  const { onBroadcast } = room;

  const refreshItems = useCallback(async id => {
    const items = await loadBoardItems(id);
    setTokens(items.tokens);
    setMarks(items.marks);
  }, []);
  const refreshMap = useCallback(async b => {
    const request = ++mapRequest.current;
    setMapSrc(null);
    try {
      const src = b?.map_path ? await mapUrl(b.map_path) : null;
      if (mapRequest.current === request) setMapSrc(src);
    } catch (e) {
      if (mapRequest.current === request) setError(e.message);
    }
  }, []);

  const syncBoard = useCallback(next => {
    const previous = boardRef.current;
    boardRef.current = next;
    setBoard(next);
    if (next.map_path !== previous?.map_path) {
      refreshMap(next);
      refreshItems(next.id).catch(e => setError(e.message));
    }
  }, [refreshItems, refreshMap]);

  useEffect(() => {
    if (!supabase || !user) return undefined;
    let alive = true;
    let channel;
    let boardRequest = 0;
    async function reloadBoard() {
      const request = ++boardRequest;
      const previous = boardRef.current;
      try {
        const next = await loadBoard(tableId);
        if (alive && request === boardRequest && previous === boardRef.current && next) syncBoard(next);
      } catch (e) {
        if (alive && request === boardRequest) setError(e.message);
      }
    }
    const stopRefresh = onBroadcast('board_refresh', payload => {
      if (payload?.configuration) reloadBoard();
    });
    (async () => {
      try {
        const b = await loadBoard(tableId);
        if (!alive) return;
        setBoard(b);
        boardRef.current = b;
        if (!b) return;
        await Promise.all([refreshItems(b.id), refreshMap(b)]);
        if (!alive) return;
        channel = supabase.channel(`board:${tableId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'boards', filter: `table_id=eq.${tableId}` }, p => {
            const prev = boardRef.current;
            if (prev?.id === p.new.id) syncBoard({ ...prev, ...p.new });
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'board_tokens', filter: `table_id=eq.${tableId}` }, p => {
            if (p.eventType === 'DELETE') setTokens(prev => prev.filter(t => t.id !== p.old.id));
            else if (!dragging.current.has(p.new.id)) {
              setTokens(prev => applyTokenRow(prev, p.new)); // token com nome oculto chega em branco: o mestre mantém o nome real
              setDrags(prev => { if (!(p.new.id in prev)) return prev; const { [p.new.id]: _, ...rest } = prev; return rest; });
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'board_marks', filter: `table_id=eq.${tableId}` }, p => {
            if (p.eventType === 'DELETE') setMarks(prev => prev.filter(m => m.id !== p.old.id));
            else setMarks(prev => upsert(prev, p.new));
          })
          .subscribe(status => { if (status === 'SUBSCRIBED') reloadBoard(); });
      } catch (e) { if (alive) { setError(e.message); setBoard(prev => (prev === undefined ? null : prev)); } }
    })();
    return () => { alive = false; stopRefresh(); mapRequest.current += 1; if (channel) supabase.removeChannel(channel); };
  }, [tableId, user?.id, onBroadcast, refreshItems, refreshMap, syncBoard]);

  // Posicoes provisorias vindas de outros jogadores durante o arraste.
  useEffect(() => onBroadcast('drag', p => {
    if (!p?.id || dragging.current.has(p.id)) return;
    setDrags(prev => (p.done ? (({ [p.id]: _, ...rest }) => rest)(prev) : { ...prev, [p.id]: { x: p.x, y: p.y } }));
  }), [onBroadcast]);
  // O mestre avisa quando algo mudou de forma que o Realtime nao entrega (ex.: token oculto).
  useEffect(() => onBroadcast('board_refresh', payload => {
    if (!payload?.configuration && boardRef.current) refreshItems(boardRef.current.id).catch(() => {});
  }), [onBroadcast, refreshItems]);

  const local = {
    setTokens, setMarks,
    setBoard: b => { boardRef.current = b; setBoard(b); },
    beginDrag: id => dragging.current.add(id),
    endDrag: id => dragging.current.delete(id),
    reloadItems: () => boardRef.current && refreshItems(boardRef.current.id),
    reloadMap: () => refreshMap(boardRef.current),
  };
  return { board, tokens, marks, mapSrc, drags, error, setError, local };
}
