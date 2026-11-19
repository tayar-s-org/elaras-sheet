import React, { useState } from 'react';
import { calculate, validateCharacter } from '../../../rules.js';
import { Summary, renderEditor } from '../../sheet/SheetModules.jsx';
import AptitudeSummary, { useAptitudeFor } from '../../routine/AptitudeSummary.jsx';
import BagView from './BagView.jsx';
import { sheetOps } from '../../sheet/sheetOps.js';
import { editSheet } from '../../../sheets.js';
import { formatMoney } from '../../../money.js';
import '../../../ui/money.css';
import '../../sheet/modules.css';

const kg = n => `${(Math.round(n * 100) / 100).toString().replace('.', ',')} kg`;

// Contexto dos editores da ficha, ligado à aba aberta na conta (o autosave grava na nuvem).
function sheetCtx({ sheet, d, sheets, auth, tableId }) {
  const { setSession, setConfirm, setToast } = sheets;
  const setC = value => setSession(prev => editSheet(prev, sheet.id, value));
  return {
    cloudId: sheet.cloud?.id, cloudBase: sheet.cloud?.base, tableId: sheet.tableId || tableId, auth,
    c: sheet.character, d, setC, setConfirm, setToast,
    setRequestedPage: () => {}, setTab: () => {}, requestedPage: null, // o livro de regras não abre dentro do tabuleiro
    ...sheetOps(sheet.character, setC),
  };
}

function OwnEditor({ module, subject, sheets, auth, tableId }) {
  let d;
  try { d = calculate(validateCharacter(subject.sheet.character)); } catch { return <p className="muted">Não foi possível ler esta ficha.</p>; }
  return renderEditor(module.editor, sheetCtx({ sheet: subject.sheet, d, sheets, auth, tableId }));
}

// Resumo só de leitura, igual ao da ficha.
function ReadView({ module, c, d, apt, own, bag, onOpenShop }) {
  if (module.key === 'aptitude') return <AptitudeSummary apt={apt} always />;
  if (module.key === 'market') {
    if (!own) return <div className="bsp-readonly">
      <p className="muted">O Mercado é do jogador: compra e venda só acontecem na ficha dele. Para vender itens aos jogadores, use a Loja do Mestre.</p>
      {onOpenShop && <div><button type="button" className="outline" onClick={onOpenShop}>Abrir Itens › Loja do Mestre</button></div>}
    </div>;
    const load = d.inventory;
    return <div className="mod-chips">
      <span className="mod-chip"><span className="money-coin" aria-hidden="true">$</span> Dinheiro <b>{formatMoney(c.money)}</b></span>
      <span className="mod-chip">Carga <b>{kg(load.weight)} / {kg(load.capacity)}</b></span>
      <span className="mod-chip">Compre, venda e equipe itens abrindo o mercado.</span>
    </div>;
  }
  if (module.key === 'bag') return <BagView c={c} d={d} {...bag} />;
  return <div className="bsp-readonly">
    {!own && <p className="muted bsp-ro-note">Somente leitura. Dinheiro, XP, itens e condições se alteram pelos módulos da Central.</p>}
    <Summary index={module.summary} c={c} d={d} />
  </div>;
}

// Conteúdo de um módulo: primeiro o resumo (como na ficha); o dono tem o botão "Editar", que abre os mesmos editores da ficha.
export default function ModuleContent({ module, subject, sheets, auth, tableId, closed = false, onOpenShop = null }) {
  const [editing, setEditing] = useState(false);
  const own = subject.kind === 'own';
  const canEdit = own && subject.editable && Boolean(sheets);
  const apt = useAptitudeFor({ characterId: subject.characterId, tableId, enabled: module.key === 'aptitude' });
  let c = null, d = null;
  try { c = validateCharacter(subject.data); d = calculate(c); } catch { c = null; }
  if (!c) return <p className="muted">Não foi possível ler esta ficha.</p>;

  if (editing && canEdit) {
    return <>
      <div className="bsp-actions"><button type="button" className="primary" onClick={() => setEditing(false)}>Concluir</button></div>
      <OwnEditor module={module} subject={subject} sheets={sheets} auth={auth} tableId={tableId} />
    </>;
  }
  const label = module.key === 'market' ? 'Abrir mercado' : module.key === 'aptitude' && apt?.available > 0 ? 'Distribuir pontos' : 'Editar';
  return <>
    {own && <div className="bsp-actions">
      <button type="button" className={module.key === 'aptitude' && apt?.available > 0 ? 'primary' : 'outline'} disabled={!canEdit}
        title={canEdit ? undefined : 'Aguarde a ficha carregar na sua conta (ou abra-a em Fichas).'} onClick={() => setEditing(true)}>{label}</button>
    </div>}
    <ReadView module={module} c={c} d={d} apt={apt} own={own} bag={{ characterId: subject.characterId, tableId, editable: !closed && (own || subject.kind === 'gm') }} onOpenShop={onOpenShop} />
  </>;
}
