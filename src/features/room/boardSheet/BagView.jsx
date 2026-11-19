import React, { useState } from 'react';
import { Summary } from '../../sheet/SheetModules.jsx';
import { QtyMinus, LiquidUnits, SendMenu } from '../../sheet/ItemControls.jsx';
import TransferModal from '../../sheet/TransferModal.jsx';
import { resolveItem } from '../../../market/items.js';
import { consumeRemote, setFillRemote } from '../../../lib/items.js';

// Resumo da Mochila com as mesmas ações do token: gastar uma unidade (−), ajustar/tirar cantil e enviar a outro jogador.
// São as funções do servidor da mochila (a ficha aberta reconcilia a diferença); sem permissão, é só o resumo.
export default function BagView({ c, d, characterId, tableId, editable }) {
  const [sending, setSending] = useState(null); // { id, name, max, index }
  const [error, setError] = useState('');
  const run = async fn => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const actions = editable && characterId ? entry => {
    const item = resolveItem(entry);
    if (!item) return null;
    return {
      inline: <>
        <QtyMinus entry={entry} item={item} onConsume={() => run(() => consumeRemote(characterId, entry.id))} />
        {tableId && !item.liquid && <SendMenu onSend={() => setSending({ id: entry.id, name: item.name, max: entry.qty, index: null })} />}
      </>,
      below: <LiquidUnits entry={entry} item={item}
        onFill={(i, litres) => run(() => setFillRemote(characterId, entry.id, i, litres))}
        onConsume={i => run(() => consumeRemote(characterId, entry.id, 1, i))}
        onSend={tableId ? i => setSending({ id: entry.id, name: item.name, max: 1, index: i }) : null} />,
    };
  } : undefined;
  return <div className="bsp-readonly">
    <Summary index={7} c={c} d={d} bagActions={actions} />
    {error && <p role="alert" className="muted">{error}</p>}
    {sending && <TransferModal tableId={tableId} fromCharacter={characterId} itemId={sending.id} itemName={sending.name} max={sending.max} index={sending.index} onClose={() => setSending(null)} />}
  </div>;
}
