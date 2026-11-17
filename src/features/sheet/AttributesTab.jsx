import React from "react";
import { NumberField } from "../../ui/Field.jsx";
import { ATTRIBUTES, DICE } from "../../rules.js";
import { racialEffects } from "../../templates.js";

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
                  </div>
                ))}
              </div>
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
