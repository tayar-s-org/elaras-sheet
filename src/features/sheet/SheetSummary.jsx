import React, { useState } from "react";
import { tokenUrl } from "../../lib/tokens.js";
import MoneyTag from "../../ui/MoneyTag.jsx";
import LiveVitals from "./LiveVitals.jsx";
import ActiveConditions from "./ActiveConditions.jsx";
import { useCharacterConditions, useTableExtras } from "../room/masterHub/extras.jsx";
import ExperienceIcon from "../room/masterHub/ExperienceIcon.jsx";
import { charismaTitle, signed } from "../../rpg/charisma.js";

// tableId e cloudId: a ficha já vinculada a uma mesa mostra Vida, Stamina e Mana atuais como no token.
export default function SheetSummary({ c, d, tableId, cloudId }) {
  // Mesmas fontes do token e do Grupo: condições (estado da mesa) e carteira/contadores (a RLS entrega só os do próprio dono).
  const conditions = useCharacterConditions(tableId, cloudId);
  const extras = useTableExtras(tableId, Boolean(tableId && cloudId));
  const wallet = cloudId ? extras.currencies.map(x => ({ key: `c${x.id}`, label: x.name, icon: x.symbol, amount: extras.wallets[cloudId]?.[x.id] || 0 })) : [];
  const exps = cloudId ? extras.types.map(x => ({ key: `t${x.id}`, label: x.name, icon: x.icon, amount: extras.experience[cloudId]?.[x.id] || 0 })) : [];
  const list = (title, items) => items.length > 0 && <div className="summary-holding-group"><small className="holding-label">{title}</small>
    <ul className="summary-holdings" aria-label={title}>{items.map(h => <li key={h.key}><span>{h.label}</span><b><ExperienceIcon icon={h.icon} /> {h.amount}</b></li>)}</ul></div>;
  // O orçamento de criação fica recolhido na sessão (ficha ligada a uma mesa) e em telas estreitas, onde empurraria os módulos para baixo.
  // Abre sozinho só se estourou, ou numa ficha sem mesa em tela larga (coluna lateral, sem custo de rolagem).
  const bound = Boolean(tableId && cloudId);
  const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width: 1180px)").matches;
  const [pointsOpen, setPointsOpen] = useState(null);
  const showPoints = pointsOpen ?? (d.remaining < 0 || (!bound && !narrow));
  return (
        <aside className="summary" aria-label="Ficha em tempo real">
          <div className="summary-id">
            {tokenUrl(c.tokenImage)
              ? <img className="summary-token" src={tokenUrl(c.tokenImage)} alt={`Token de ${c.name || "personagem"}`} />
              : <div className="crest" aria-hidden="true">✧</div>}
            <div className="summary-who">
              <h2>{c.name || "Seu personagem"}</h2>
              <p className="summary-level">Nível {d.level}<span> · {c.xp} XP</span></p>
              <p className="muted">{[c.race, c.village].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          {bound
            ? <LiveVitals d={d} tableId={tableId} cloudId={cloudId} />
            : <div className="stats">
              {[
                ["Vida", d.life, "health"],
                ["Stamina", d.stamina, "health"],
                ["Mana", d.mana, "mana"],
                ["Movimento", d.movement],
                ["Aparar", d.parry],
                ["Resistência", d.toughness],
              ].map(([name, v, resource]) => (
                <div key={name} data-resource={resource}>
                  <strong>{v}</strong>
                  <span>{name}</span>
                </div>
              ))}
            </div>}
          <p className="summary-charisma" title={charismaTitle(d.charismaInfo)}>
            <span>Carisma</span>
            <b>{signed(d.charismaTotal)}</b>
            {d.charismaInfo.conditional.length > 0 && <small>{d.charismaInfo.conditional.length} {d.charismaInfo.conditional.length === 1 ? "situacional" : "situacionais"}</small>}
          </p>
          <ActiveConditions conditions={conditions} />
          <div className="summary-wallet">
            <MoneyTag value={c.money} />
            {list('Moedas', wallet)}
            {list('Experiências', exps)}
          </div>
          <details className="points" open={showPoints} onToggle={e => setPointsOpen(e.currentTarget.open)}>
            <summary className="points-summary" data-deficit={d.remaining < 0} data-ok={d.remaining === 0}>
              <span className="points-label">
                <b>Pontos de criação</b>
                <small>
                  {d.remaining === null
                    ? "Defina o orçamento em Identidade"
                    : d.remaining < 0
                      ? "Orçamento excedido"
                      : d.remaining === 0 ? "Todos os pontos usados" : "Pontos disponíveis"}
                </small>
              </span>
              <strong>{d.remaining ?? "—"}</strong>
            </summary>
            <div className="point-line point-total"><span>Total de pontos</span><b>{d.remaining + d.spent}</b></div>
            <div className="point-line point-total"><span>Pontos gastos</span><b>{d.spent}</b></div>
            {[
              ["Atributos", d.attributeCost, true],
              ["Perícias", d.skillCost, true],
              ["Vantagens", d.advantageCost, true],
              ["Outros gastos", c.rules.spentElsewhere, true],
              ["Nível " + d.level, "+" + d.progressionPoints],
              ["Pontos extras", "+" + d.extra],
            ].map(([name, value, isCost]) => (
              <div className="point-line" key={name} data-cost={isCost}>
                <span>{name}</span>
                <b>{value}</b>
              </div>
            ))}
            <p className="summary-note">
              O mestre confirma os requisitos, as regras raciais e os poderes.
              Revise a ficha antes de jogar.
            </p>
          </details>
        </aside>
  );
}
