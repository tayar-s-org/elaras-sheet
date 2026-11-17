import React from "react";
import { Field } from "../../ui/Field.jsx";
import PowerCatalog from "../../PowerCatalog.jsx";

/* eslint-disable-next-line no-unused-vars */
export default function MagicGearTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                O que você carrega e a magia que aprendeu.
              </p>
              <h3>Poderes e canções</h3>
              <p className="muted">
                Busque um poder do livro ou adicione um poder personalizado aprovado pelo mestre.
              </p>
              <PowerCatalog character={c}
                onAdd={item => {
                  setC(prev => ({...prev, powers:[...prev.powers, item]}));
                  setToast(`${item.name} adicionado à ficha.`);
                }}
                onOpenPage={page => {setRequestedPage(page);setTab(6);}}
              />
              {c.powers.map((x, i) => (
                <div className="item-card" key={i}>
                  <div className="form-grid">
                    <Field label="Nome">
                      <input
                        value={x.name}
                        maxLength={200}
                        onChange={(e) =>
                          changeItem("powers", i, "name", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Custo de mana">
                      <input
                        value={x.cost}
                        maxLength={100}
                        onChange={(e) =>
                          changeItem("powers", i, "cost", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Efeito, alcance e conjuração">
                    <textarea
                      maxLength={10000}
                      rows="3"
                      value={x.description}
                      onChange={(e) =>
                        changeItem("powers", i, "description", e.target.value)
                      }
                    />
                  </Field>
                  <button
                    className="text-button danger"
                    onClick={() =>
                      update(
                        "powers",
                        c.powers.filter((_, j) => i !== j),
                      )
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button className="outline" onClick={() => addItem("powers")}>
                + Adicionar poder personalizado
              </button>
              <h3>Equipamento</h3>
              <Field
                label="Armas, armadura e bagagem"
                hint="Anote dano, alcance, munição, dinheiro e outros detalhes."
              >
                <textarea
                  maxLength={10000}
                  rows="9"
                  value={c.equipment}
                  onChange={(e) => update("equipment", e.target.value)}
                />
              </Field>
            </>
  );
}
