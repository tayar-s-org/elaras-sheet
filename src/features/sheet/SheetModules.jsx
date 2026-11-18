import React, { useEffect } from "react";
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
import "./modules.css";

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

const ATTRIBUTE_ORDER = ["Agilidade", "Astúcia", "Espírito", "Força", "Vigor"];
const excerpt = (text, max = 220) => {
  const t = (text || "").trim().replace(/\n{2,}/g, "\n");
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
};
// Vantagens repetidas aparecem uma vez com o multiplicador (Nome ×2).
const groupedAdvantages = list => {
  const map = new Map();
  for (const a of list) {
    const name = a.name || "Sem nome";
    const key = name.trim().toLowerCase();
    map.set(key, map.has(key) ? [map.get(key)[0], map.get(key)[1] + 1, map.get(key)[2]] : [name, 1, a.power]);
  }
  return [...map.values()];
};
// Itens da mochila (equipados primeiro).
const bagItems = c => c.inventory.map(e => ({ ...e, name: resolveItem(e)?.name })).filter(e => e.name).sort((a, b) => Number(b.equipped) - Number(a.equipped));
// Bônus de rolagem vindo de itens equipados, ex.: " (+2)".
const bonusText = b => (b ? ` (${b > 0 ? `+${b}` : `−${Math.abs(b)}`})` : "");
const kg = n => `${(Math.round(n * 100) / 100).toString().replace(".", ",")} kg`;
const Empty = ({ children }) => <p className="mod-empty">{children}</p>;
const Chip = ({ label, value, tone }) => <span className={`mod-chip${tone ? ` ${tone}` : ""}`}>{label}{value != null && <b>{value}</b>}</span>;
const Stat = ({ label, value }) => <div className="mod-stat"><b>{value}</b><span>{label}</span></div>;

// Resumos diretos (so leitura) de cada modulo da ficha.
function Summary({ index, c, d }) {
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
        <h4 className="mod-sub">Vantagens ({c.advantages.length})</h4>
        {c.advantages.length ? <div className="mod-chips">{groupedAdvantages(c.advantages).map(([label, n, power]) => <Chip key={label} label={n > 1 ? `${label} ×${n}` : label} tone={power ? "power" : ""} />)}</div> : <Empty>Nenhuma vantagem.</Empty>}
        <h4 className="mod-sub">Complicações ({c.hindrances.length})</h4>
        {c.hindrances.length ? <div className="mod-chips">{c.hindrances.map((h, i) => <Chip key={i} label={h.name || "Sem nome"} value={h.severity} tone={h.severity === "Maior" ? "major" : "minor"} />)}</div> : <Empty>Nenhuma complicação.</Empty>}
      </>;
    case 4:
      return <>
        <h4 className="mod-sub">Poderes ({c.powers.length})</h4>
        {c.powers.length ? <div className="mod-chips">{c.powers.map((p, i) => <Chip key={i} label={p.name || "Sem nome"} value={p.cost || null} tone="power" />)}</div> : <Empty>Nenhum poder.</Empty>}
      </>;
    case 7: {
      const bag = bagItems(c);
      const bonus = [["Armadura", c.armor], ["Movimento", c.movementBonus], ["Aparar", c.parryBonus], ["Mana", c.manaBonus]].filter(([, v]) => v);
      const load = d.inventory;
      return <>
        <h4 className="mod-sub">Itens ({c.inventory.reduce((n, e) => n + e.qty, 0)})</h4>
        {bag.length ? <div className="mod-chips">{bag.map(e => <Chip key={e.id} label={e.name} value={e.qty > 1 ? `×${e.qty}` : null} tone={e.equipped ? "power" : ""} />)}</div> : <Empty>Nada na mochila. Compre equipamento no Mercado.</Empty>}
        {bag.length > 0 && <p className="mod-facts">Carga {kg(load.weight)} / {kg(load.capacity)}{load.overload ? ` · sobrecarga −${load.overload} de Movimento` : ""} · itens em roxo estão equipados</p>}
        {bonus.length > 0 && <div className="mod-chips">{bonus.map(([k, v]) => <Chip key={k} label={`Bônus de ${k}`} value={v > 0 ? `+${v}` : v} />)}</div>}
      </>;
    }
    case 5:
      return <>
        {c.history.trim() ? <p className="mod-text">{excerpt(c.history)}</p> : <Empty>Nenhuma história escrita.</Empty>}
        {c.notes.trim() && <><h4 className="mod-sub">Anotações</h4><p className="mod-text">{excerpt(c.notes, 140)}</p></>}
      </>;
    case 6:
      return <p className="mod-text">Consulte o PDF do livro e as regras do mestre sem sair da ficha.</p>;
    default:
      return null;
  }
}

function renderEditor(index, ctx) {
  switch (index) {
    case 0: return <IdentityTab {...ctx} />;
    case 1: return <AttributesTab {...ctx} />;
    case 2: return <SkillsTab {...ctx} />;
    case 3: return <EdgesTab {...ctx} />;
    case 4: return <MagicGearTab {...ctx} />;
    case 5: return <HistoryTab {...ctx} />;
    case 6: return <BookTab {...ctx} />;
    case 7: return <MarketTab {...ctx} initialView="bag" />;
    case "guide": return <GuideTab {...ctx} />;
    case "market": return <MarketTab {...ctx} />;
    default: return null;
  }
}

// Ficha completa só para leitura (usada na sala para ver a ficha de outro jogador): todos os módulos, sem editar.
export function SheetOverview({ c, d }) {
  return <div className="sheet-modules">
    {ORDER.map((i, pos) => i === 6 ? null : (
      <section key={MODULES[i]} className={`mod-card${i === 0 ? " wide" : ""}`} aria-label={MODULES[i]}>
        <header className="mod-head"><h2><span className="mod-num">{String(pos + 1).padStart(2, "0")}</span>{MODULES[i]}</h2></header>
        <div className="mod-body"><Summary index={i} c={c} d={d} /></div>
      </section>
    ))}
  </div>;
}

// Ficha em modulos: cada cartao resume a secao e o botao "Editar" abre o editor completo dela.
export default function SheetModules({ ctx, editing, setEditing }) {
  const { c, d } = ctx;
  useEffect(() => {
    if (editing == null) return undefined;
    const onKey = e => { if (e.key === "Escape") setEditing(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, setEditing]);

  return <>
    <div className="sheet-modules">
      {ORDER.map((i, pos) => (
        <section key={MODULES[i]} id={`sec-${i}`} className={`mod-card${i === 0 ? " wide" : ""}`} aria-labelledby={`mod-title-${i}`}>
          <header className="mod-head">
            <h2 id={`mod-title-${i}`}><span className="mod-num">{String(pos + 1).padStart(2, "0")}</span>{MODULES[i]}</h2>
            <button type="button" className="outline" onClick={() => setEditing(i)}>{i === 6 || i === 7 ? "Abrir" : "Editar"}</button>
          </header>
          <div className="mod-body"><Summary index={i} c={c} d={d} /></div>
        </section>
      ))}
    </div>
    {editing != null && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
      <div className="mod-editor" role="dialog" aria-modal="true" aria-labelledby="mod-editor-title">
        <header className="mod-editor-head">
          <h2 id="mod-editor-title">{editing === "guide" ? "Guia de criação" : editing === "market" ? "Mercado" : MODULES[editing]}</h2>
          <button type="button" className="primary" onClick={() => setEditing(null)}>Concluir</button>
        </header>
        <div className="mod-editor-body">{renderEditor(editing, ctx)}</div>
      </div>
    </div>}
  </>;
}
