import React from "react";
import { tokenUrl } from "../../lib/tokens.js";
import MoneyTag from "../../ui/MoneyTag.jsx";
import LiveVitals from "./LiveVitals.jsx";

// tableId e cloudId: a ficha já vinculada a uma mesa mostra Vida, Stamina e Mana atuais como no token.
export default function SheetSummary({ c, d, tableId, cloudId }) {
  return (
        <aside className="summary">
          <p className="eyebrow">FICHA EM TEMPO REAL</p>
          {tokenUrl(c.tokenImage)
            ? <img className="summary-token" src={tokenUrl(c.tokenImage)} alt={`Token de ${c.name || "personagem"}`} />
            : <div className="crest" aria-hidden="true">✧</div>}
          <h2>{c.name || "Seu personagem"}</h2>
          <p className="summary-level">Nível {d.level}<span> · {c.xp} XP</span></p>
          <MoneyTag value={c.money} />
          <p className="muted">
            {c.race} · {c.village}
          </p>
          {tableId && cloudId
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
          <div className="points">
            <div className="row" data-deficit={d.remaining < 0} data-ok={d.remaining === 0}>
              <div className="points-label">
                <h3>Pontos de criação</h3>
                <p>
                  {d.remaining === null
                    ? "Defina o orçamento em Identidade"
                    : d.remaining < 0
                      ? "Orçamento excedido"
                      : d.remaining === 0 ? "Todos os pontos usados" : "Pontos disponíveis"}
                </p>
              </div>
              <strong>{d.remaining ?? "—"}</strong>
            </div>
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
          </div>
          <p className="summary-note">
            O mestre confirma os requisitos, as regras raciais e os poderes.
            Revise a ficha antes de jogar.
          </p>
        </aside>
  );
}
