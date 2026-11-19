import React from "react";
import Modal from '../../ui/Modal.jsx';
import { stageForXP } from "../../catalogRules.js";
import { formatMoney } from "../../money.js";
import "../../ui/money.css";
import { tokenUrl } from "../../lib/tokens.js";
import IdentityTab from "./IdentityTab.jsx";
import AttributesTab from "./AttributesTab.jsx";
import SkillsTab from "./SkillsTab.jsx";
import EdgesTab from "./EdgesTab.jsx";
import MagicGearTab from "./MagicGearTab.jsx";
import HistoryTab from "./HistoryTab.jsx";
import BookTab from "./BookTab.jsx";
import GuideTab from "./GuideTab.jsx";
import MarketTab from "./MarketTab.jsx";
import { resolveItem } from "../../market/items.js";
import { itemEffects } from "../../market/effects.js";
import "./modules.css";
import AptitudeSummary, { useAptitudeFor } from "../routine/AptitudeSummary.jsx";
import SheetAptitude from "../routine/SheetAptitude.jsx";
import PointsStrip from "./PointsStrip.jsx";

export const MODULES = [
  "Identidade",
  "Atributos",
  "Perícias",
  "Vantagens",
  "Magia",
  "História",
  "Livro e regras",
  "Mochila",
];
// Ordem em que os módulos aparecem (a Mochila fica logo depois da Magia; os índices acima não mudam).
const ORDER = [0, 1, 2, 3, 4, 7, 5, 6];
// Editores que gastam pontos de criação e por isso mostram o saldo no topo (Perícias já traz o seu).
const POINT_EDITORS = [0, 1, 3];

const ATTRIBUTE_ORDER = ["Agilidade", "Astúcia", "Espírito", "Força", "Vigor"];
const excerpt = (text, max = 220) => {
  const t = (text || "").trim().replace(/\n{2,}/g, "\n");
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};
// Vantagens repetidas aparecem uma vez com o multiplicador (Nome ×2); a descrição é a da primeira que tiver texto.
const groupedAdvantages = list => {
  const map = new Map();
  for (const a of list) {
    const name = a.name || "Sem nome";
    const key = name.trim().toLowerCase();
    const prev = map.get(key);
    map.set(key, prev ? [prev[0], prev[1] + 1, prev[2], prev[3] || a.description] : [name, 1, a.power, a.description]);
  }
  return [...map.values()];
};
// Cartão que abre para mostrar o efeito (descrição da vantagem ou da complicação, efeitos do equipamento).
const Detail = ({ title, tag, tone, children }) => <details className={`mod-detail${tone ? ` ${tone}` : ""}`}><summary><b>{title}</b>{tag ? <small>{tag}</small> : null}</summary><div className="mod-detail-body">{children}</div></details>;
// Itens da mochila (equipados primeiro).
const bagItems = c => c.inventory.map(e => ({ ...e, name: resolveItem(e)?.name })).filter(e => e.name).sort((a, b) => Number(b.equipped) - Number(a.equipped));
// Bônus de rolagem vindo de itens equipados, ex.: " (+2)".
const bonusText = b => (b ? ` (${b > 0 ? `+${b}` : `−${Math.abs(b)}`})` : "");
const kg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;
const Empty = ({ children }) => <p className="mod-empty">{children}</p>;
const Chip = ({ label, value, tone }) => <span className={`mod-chip${tone ? ` ${tone}` : ""}`}>{label}{value != null && <b>{value}</b>}</span>;
const Stat = ({ label, value }) => <div className="mod-stat"><b>{value}</b><span>{label}</span></div>;

// Resumos diretos (so leitura) de cada modulo da ficha.
// bagActions (opcional, só a Mochila): (entrada) => ({ inline, below }) com botões extras por item; a ficha não usa.
export function Summary({ index, c, d, bagActions }) {
  switch (index) {
    case 0: {
      const src = tokenUrl(c.tokenImage);
      return <div className="mod-identity">
        {src ? <img className="mod-token" src={src} alt={`Token de ${c.name || "personagem"}`} /> : <span className="mod-token empty" aria-hidden="true">✧</span>}
        <div>
          <h3 className="mod-name">{c.name || "Sem nome"}</h3>
          <p className="muted">{c.concept || "Sem conceito definido"}</p>
          <p className="mod-facts">{[c.race, c.age && `${c.age}`, c.village, c.player && `Jogador: ${c.player}`].filter(Boolean).join(" · ")}</p>
          <p className="mod-facts">Nível {d.level} · {c.xp} XP · {stageForXP(c.xp)}</p>
          <p className="mod-facts mod-money"><span className="money-coin" aria-hidden="true">$</span> Dinheiro: <b>{formatMoney(c.money)}</b></p>
          <p className="mod-facts">Pontos: {d.remaining + d.spent} no total · {d.spent} gastos · {d.remaining} livres</p>
        </div>
      </div>;
    }
    case 1:
      return <>
        <div className="mod-chips">{ATTRIBUTE_ORDER.map(a => <Chip key={a} label={a} value={`d${c.attributes[a]}${bonusText(d.inventory.rollBonus.attribute[a])}`} />)}</div>
        <div className="mod-stats">
          <Stat label="Movimento" value={d.movement} /><Stat label="Aparar" value={d.parry} /><Stat label="Resistência" value={d.toughness} />
          <Stat label="Vida" value={d.life} /><Stat label="Stamina" value={d.stamina} /><Stat label="Mana" value={d.mana} />
        </div>
      </>;
    case 2: {
      const skills = Object.entries(c.skills).filter(([, die]) => die > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return skills.length
        ? <div className="mod-chips">{skills.map(([name, die]) => <Chip key={name} label={name} value={`d${die}${bonusText(d.inventory.rollBonus.skill[name])}`} />)}</div>
        : <Empty>Nenhuma perícia ainda.</Empty>;
    }
    case 3:
      return <>
        <h3 className="mod-sub">Vantagens ({c.advantages.length})</h3>
        {c.advantages.length ? <div className="mod-details">{groupedAdvantages(c.advantages).map(([label, n, power, description]) => <Detail key={label} title={n > 1 ? `${label} ×${n}` : label} tag={power ? "poder" : ""} tone={power ? "power" : ""}>{description ? <p>{description}</p> : <p className="muted">Sem descrição. Escreva o efeito em Editar.</p>}</Detail>)}</div> : <Empty>Nenhuma vantagem.</Empty>}
        <h3 className="mod-sub">Complicações ({c.hindrances.length})</h3>
        {c.hindrances.length ? <div className="mod-details">{c.hindrances.map((h, i) => <Detail key={i} title={h.name || "Sem nome"} tag={h.severity} tone={h.severity === "Maior" ? "major" : "minor"}>{h.description ? <p>{h.description}</p> : <p className="muted">Sem descrição.</p>}</Detail>)}</div> : <Empty>Nenhuma complicação.</Empty>}
      </>;
    case 4:
      return <>
        <h3 className="mod-sub">Poderes ({c.powers.length})</h3>
        {c.powers.length ? <ul className="mod-spells">{c.powers.map((p, i) => <li key={i} className="mod-spell">
          <b className="mod-spell-name">{p.name || "Sem nome"}{p.upgrades?.length ? <small> · {p.upgrades.length} melhoria(s)</small> : null}</b>
          <span className="mod-spell-facts">
            <span><i>Custo de mana</i>{p.cost || "—"}</span>
            <span><i>Dano</i>{p.damage || "—"}</span>
            <span><i>Distância</i>{p.range || "—"}</span>
            <span><i>Duração</i>{p.duration || "—"}</span>
          </span>
          {p.description ? <details className="mod-spell-desc"><summary>Descrição</summary><p>{p.description}</p></details> : null}
        </li>)}</ul> : <Empty>Nenhum poder.</Empty>}
        {c.powers.some(p => p.upgrades?.length) && <ul className="mod-upgrades">{c.powers.flatMap((p, i) => (p.upgrades || []).map(u => <li key={`${i}-${u.n}`}><b>{p.name || "Feitiço"} · melhoria {u.n}:</b> {u.description}</li>))}</ul>}
      </>;
    case 7: {
      const bag = bagItems(c);
      const bonus = [["Armadura", c.armor], ["Movimento", c.movementBonus], ["Aparar", c.parryBonus], ["Mana", c.manaBonus]].filter(([, v]) => v);
      const load = d.inventory;
      return <>
        <h3 className="mod-sub">Itens ({c.inventory.reduce((n, e) => n + e.qty, 0)})</h3>
        {bag.length ? <div className="mod-details">{bag.map(e => {
          const fx = itemEffects(resolveItem(e));
          const detail = <Detail key={e.id} title={e.qty > 1 ? `${e.name} ×${e.qty}` : e.name} tag={e.equipped ? "equipado" : ""} tone={e.equipped ? "power" : ""}>
            {fx.lines.length ? <ul>{fx.lines.map(l => <li key={l}>{l}</li>)}</ul> : <p className="muted">Sem efeito em regras.</p>}
            {fx.notes && <p>{fx.notes}</p>}
          </Detail>;
          const extra = bagActions?.(e);
          return extra ? <div className="mod-bag-row" key={e.id}><div className="mod-bag-line">{detail}{extra.inline}</div>{extra.below}</div> : detail;
        })}</div> : <Empty>Nada na mochila. Compre equipamento no Mercado.</Empty>}
        {bag.length > 0 && <p className="mod-facts">Carga {kg(load.weight)} / {kg(load.capacity)}{load.overload ? ` · sobrecarga −${load.overload} de Movimento` : ""} · itens em roxo estão equipados</p>}
        {bonus.length > 0 && <div className="mod-chips">{bonus.map(([k, v]) => <Chip key={k} label={`Bônus de ${k}`} value={v > 0 ? `+${v}` : v} />)}</div>}
      </>;
    }
    case 5:
      return <>
        {c.history.trim() ? <p className="mod-text">{excerpt(c.history)}</p> : <Empty>Nenhuma história escrita.</Empty>}
        {c.notes.trim() && <><h3 className="mod-sub">Anotações</h3><p className="mod-text">{excerpt(c.notes, 140)}</p></>}
      </>;
    case 6:
      return <p className="mod-text">Consulte o PDF do livro e as regras do mestre sem sair da ficha.</p>;
    default:
      return null;
  }
}

export function renderEditor(index, ctx) {
  switch (index) {
    case 0: return <IdentityTab {...ctx} />;
    case 1: return <AttributesTab {...ctx} />;
    case 2: return <SkillsTab {...ctx} />;
    case 3: return <EdgesTab {...ctx} />;
    case 4: return <MagicGearTab {...ctx} />;
    case 5: return <HistoryTab {...ctx} />;
    case 6: return <BookTab {...ctx} />;
    case 7: return <MarketTab {...ctx} initialView="bag" />;
    case "aptitude": return <SheetAptitude cloudId={ctx.cloudId} c={ctx.c} />;
    case "guide": return <GuideTab {...ctx} />;
    case "market": return <MarketTab {...ctx} />;
    default: return null;
  }
}

// Ficha completa só para leitura (usada na sala para ver a ficha de outro jogador): todos os módulos, sem editar.
export function SheetOverview({ c, d, apt }) {
  return <div className="sheet-modules">
    {ORDER.map((i, pos) => i === 6 ? null : (
      <section key={MODULES[i]} className={`mod-card${i === 0 ? " wide" : ""}`} aria-label={MODULES[i]}>
        <header className="mod-head"><h2><span className="mod-num">{String(pos + 1).padStart(2, "0")}</span>{MODULES[i]}</h2></header>
        <div className="mod-body"><Summary index={i} c={c} d={d} /></div>
      </section>
    ))}
    {apt && <section className="mod-card wide" aria-label="Aptidão"><header className="mod-head"><h2>Aptidão</h2></header><div className="mod-body"><AptitudeSummary apt={apt} always /></div></section>}
  </div>;
}

// Ficha em modulos: cada cartao resume a secao e o botao "Editar" abre o editor completo dela.
export default function SheetModules({ ctx, editing, setEditing }) {
  const { c, d } = ctx;
  const apt = useAptitudeFor({ characterId: ctx.cloudId, tableId: ctx.tableId || null });

  return <>
    <div className="sheet-modules">
      {ORDER.flatMap((i, pos) => {
        const card = (
          <section key={MODULES[i]} id={`sec-${i}`} className={`mod-card${i === 0 ? " wide" : ""}`} aria-labelledby={`mod-title-${i}`}>
            <header className="mod-head">
              <h2 id={`mod-title-${i}`}><span className="mod-num">{String(pos + 1).padStart(2, "0")}</span>{MODULES[i]}</h2>
              <button type="button" className="outline" onClick={() => setEditing(i)}>{i === 6 || i === 7 ? "Abrir" : "Editar"}</button>
            </header>
            <div className="mod-body"><Summary index={i} c={c} d={d} /></div>
          </section>
        );
        // A janela de Aptidão fica sempre visível, logo acima do Livro, mesmo sem pontos recebidos.
        if (i !== 6) return [card];
        const free = apt?.available > 0;
        return [
          <section key="aptitude" id="sec-aptitude" className="mod-card wide" aria-labelledby="mod-title-aptitude">
            <header className="mod-head">
              <h2 id="mod-title-aptitude"><span className="mod-num">✦</span>Aptidão{free ? <span className="tr-badge pending">{apt.available} para distribuir</span> : null}</h2>
              <button type="button" className={free ? "primary" : "outline"} onClick={() => setEditing("aptitude")}>{free ? "Distribuir pontos" : "Abrir"}</button>
            </header>
            <div className="mod-body">
              <AptitudeSummary apt={apt} always />
            </div>
          </section>,
          card,
        ];
      })}
    </div>
    {editing != null && <Modal onClose={() => setEditing(null)} aria-labelledby="mod-editor-title">
      <div className="mod-editor">
        <header className="mod-editor-head">
          <h2 id="mod-editor-title">{editing === "guide" ? "Guia de criação" : editing === "market" ? "Mercado" : editing === "aptitude" ? "Aptidão" : MODULES[editing]}</h2>
          <button type="button" className="primary" onClick={() => setEditing(null)}>Concluir</button>
        </header>
        {POINT_EDITORS.includes(editing) && <PointsStrip d={d} />}
        <div className="mod-editor-body">{renderEditor(editing, ctx)}</div>
      </div>
    </Modal>}
  </>;
}
