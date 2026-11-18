import React from "react";
import { Field, NumberField } from "../../ui/Field.jsx";
import Catalog from "../../Catalog.jsx";
import { advantageCosts } from "../../rules.js";

/* eslint-disable-next-line no-unused-vars */
export default function EdgesTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  const costs = advantageCosts(c, d.racial.freeEdges);
  return (
            <>
              <p className="intro">
                Talentos e dificuldades dão personalidade à sua ficha.
              </p>
              <Catalog character={c}
                onAdd={(key, item) => {
                  setC(prev => ({...prev, [key]: [...prev[key], item]}));
                  setToast(`${item.name} adicionada à ficha.`);
                }}
                onOpenPage={page => {setRequestedPage(page);setTab(6);}}
              />
              <h3>Opções selecionadas e personalizadas</h3>
              <h3>Vantagens</h3>
              {c.advantages.map((x, i) => (
                <div className="item-card" key={i}>
                  <Field label="Nome">
                    <input
                      value={x.name}
                      maxLength={200}
                      onChange={(e) =>
                        changeItem("advantages", i, "name", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Requisitos e efeitos">
                    <textarea
                      maxLength={10000}
                      rows="2"
                      value={x.description}
                      onChange={(e) =>
                        changeItem(
                          "advantages",
                          i,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                  </Field>
                  <div className="row">
                    <span className="muted">Custo: {costs[i]?.cost ?? 0} {costs[i]?.cost === 1 ? "ponto" : "pontos"}{costs[i]?.repeat ? " (repetida)" : ""}. Pontos de Poder somam +10 de mana sozinhos; outros bônus: Mana adicional em Atributos.</span>
                    <button
                      className="text-button danger"
                      onClick={() =>
                        update(
                          "advantages",
                          c.advantages.filter((_, j) => i !== j),
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              <button className="outline" onClick={() => addItem("advantages")}>
                + Criar vantagem personalizada
              </button>
              <div className="form-grid compact">
                <NumberField
                  label="Vantagens anteriores ao custo atual"
                  max={100}
                  value={c.rules.ownedAdvantages}
                  onChange={(v) => rule("ownedAdvantages", v)}
                  hint="Ajusta o primeiro custo. Confirme o efeito das raciais."
                />
                <NumberField
                  label="Desconto de pontos em vantagens"
                  value={c.rules.advantageDiscount}
                  onChange={(v) => rule("advantageDiscount", v)}
                  hint="Para vantagens gratuitas acordadas com o mestre."
                />
              </div>
              <h3>Desvantagens</h3>
              {c.hindrances.map((x, i) => (
                <div className="item-card" key={i}>
                  <div className="form-grid">
                    <Field label="Nome">
                      <input
                        value={x.name}
                        maxLength={200}
                        onChange={(e) =>
                          changeItem("hindrances", i, "name", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Impacto">
                      <select
                        value={x.severity}
                        onChange={(e) =>
                          changeItem(
                            "hindrances",
                            i,
                            "severity",
                            e.target.value,
                          )
                        }
                      >
                        <option>Menor</option>
                        <option>Maior</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Como afeta o personagem">
                    <textarea
                      maxLength={10000}
                      rows="2"
                      value={x.description}
                      onChange={(e) =>
                        changeItem(
                          "hindrances",
                          i,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                  </Field>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      update(
                        "hindrances",
                        c.hindrances.filter((_, j) => i !== j),
                      )
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button className="outline" onClick={() => addItem("hindrances")}>
                + Criar desvantagem personalizada
              </button>
              <p className="muted">
                Menor concede 3 pontos. Maior concede 5. Registre aqui apenas as
                que dão pontos de criação. Desvantagens raciais já compensadas
                ficam nas Anotações.
              </p>
            </>
  );
}
