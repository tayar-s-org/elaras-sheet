import React from "react";
import { NumberField } from "../../ui/Field.jsx";
import { ATTRIBUTES, DICE } from "../../rules.js";
import { racialEffects } from "../../templates.js";
import { signed } from "../../rpg/charisma.js";

/* eslint-disable-next-line no-unused-vars */
export default function AttributesTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                Cada estágio custa 2 pontos. Quanto maior o dado, maior o
                potencial.
              </p>
              <div className="attribute-list">
                {ATTRIBUTES.map((name, i) => (
                  <div className="attribute" key={name}>
                    <div>
                      <h3>{name}</h3>
                      <p>
                        {
                          [
                            "Mobilidade, destreza e ataques com arco.",
                            "Aprendizado, investigação e conhecimentos.",
                            "Vontade, perícias arcanas e mana.",
                            "Impacto corpo a corpo e capacidade de carga.",
                            "Vida, stamina e resistência física.",
                          ][i]
                        }
                      </p>
                    </div>
                    <select
                      aria-label={name}
                      value={c.attributes[name]}
                      onChange={(e) =>
                        update("attributes", {
                          ...c.attributes,
                          [name]: Number(e.target.value),
                        })
                      }
                    >
                      {DICE.filter(
                        (v) =>
                          v >= (racialEffects(c).base[name] || 4) && !(
                            name === "Agilidade" &&
                            c.rules.racialAgility &&
                            v < 6
                          ),
                      ).map((v) => (
                        <option value={v} key={v}>
                          d{v}
                        </option>
                      ))}
                    </select>
                    {c.attributes[name] === 12 && c.bonuses?.attributes?.[name] > 0 && <b className="die-bonus" title="Bônus de evolução: rola 1d12 e soma este valor">d12+{c.bonuses.attributes[name]}</b>}
                  </div>
                ))}
              </div>
              <section className="charisma-box" aria-label="Carisma">
                <div className="charisma-head">
                  <div>
                    <h3>Carisma</h3>
                    <p>Vem da raça, das vantagens e das complicações. Entra em Persuadir e Manha.</p>
                  </div>
                  <strong aria-label={`Carisma ${signed(d.charismaTotal)}`}>{signed(d.charismaTotal)}</strong>
                </div>
                {d.charismaInfo.always.length + d.charismaInfo.conditional.length > 0
                  ? <ul>
                    {d.charismaInfo.always.map(e => <li key={`${e.kind}:${e.name}`}><span>{e.kind} {e.name}</span><b>{signed(e.value)}</b></li>)}
                    {d.charismaInfo.conditional.map(e => <li key={`${e.kind}:${e.name}`} className="when"><span>{e.kind} {e.name}, {e.when}</span><b>{signed(e.value)}</b></li>)}
                  </ul>
                  : <p className="muted">Nenhuma raça, vantagem ou complicação altera o Carisma desta ficha.</p>}
              </section>
              <h3>Ajustes de equipamento e campanha</h3>
              <div className="form-grid">
                {[
                  ["Armadura", "armor"],
                  ["Bônus de Aparar", "parryBonus"],
                  ["Ajuste de Movimentação", "movementBonus"],
                  ["Mana adicional", "manaBonus"],
                ].map(([label, key]) => (
                  <NumberField
                    key={key}
                    label={label}
                    value={c[key]}
                    min={key === "armor" ? 0 : -100}
                    onChange={(v) => update(key, v)}
                  />
                ))}
              </div>
              <p className="muted">
                Os traços raciais escolhidos em Identidade são aplicados automaticamente.
                Bônus situacionais aparecem no painel da raça; ajustes abaixo são adicionais.
              </p>
            </>
  );
}
