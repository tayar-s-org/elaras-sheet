import React from "react";
import { tokenUrl } from "../../lib/tokens.js";
import MoneyTag from "../../ui/MoneyTag.jsx";

export default function SheetSummary({ c, d, save }) {
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
          <div className="stats">
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
          </div>
          <div className="points">
            <div className="row" data-deficit={d.remaining < 0} data-ok={d.remaining === 0}>
              <h3>Pontos de criação</h3>
              <strong
                className={
                  d.remaining !== null && d.remaining < 0 ? "negative" : ""
                }
              >
                {d.remaining ?? "—"}
              </strong>
            </div>
            <p className="muted">
              {d.remaining === null
                ? "Defina os pontos iniciais em Identidade."
                : d.remaining < 0
                  ? "Você ultrapassou o orçamento definido."
                  : "pontos disponíveis"}
            </p>
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
          <button className="outline full" onClick={() => save()}>
            Salvar ficha em PDF
          </button>
        </aside>
  );
}
