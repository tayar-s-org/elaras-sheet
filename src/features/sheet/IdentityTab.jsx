import React from "react";
import { Field, NumberField } from "../../ui/Field.jsx";
import Templates from "../../Templates.jsx";
import { stageForXP } from "../../catalogRules.js";

/* eslint-disable-next-line no-unused-vars */
export default function IdentityTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                Toda aventura começa com alguém que decide partir.
              </p>
              <div className="form-grid">
                <Field label="Nome do personagem">
                  <input
                    value={c.name}
                    maxLength={100}
                    placeholder="Como vão lembrar de você?"
                    onChange={(e) => update("name", e.target.value)}
                  />
                </Field>
                <Field label="Jogador">
                  <input
                    value={c.player}
                    maxLength={100}
                    onChange={(e) => update("player", e.target.value)}
                  />
                </Field>
                <Field label="Raça atual" hint="Escolha no catálogo abaixo para aplicar os traços do livro.">
                  <input value={c.race} maxLength={100} onChange={e => update("race", e.target.value)} disabled={Boolean(c.raceId)} />
                </Field>
                <Field label="Vila de origem">
                  <select
                    value={c.village}
                    onChange={(e) => update("village", e.target.value)}
                  >
                    {[
                      "Miryndol",
                      "Seylara",
                      "Eldwën",
                      "Tirashae",
                      "Lorandel",
                      "Valmyra",
                      "Outra origem",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <div className="wide">
                  <Field label="Conceito">
                    <input
                      maxLength={200}
                      placeholder="Barda elfa · arco e canções arcanas"
                      value={c.concept}
                      onChange={(e) => update("concept", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <Templates character={c} onChange={setC} onLoad={(title, action) => setConfirm({title, text:"A ficha atual será substituída. Salve seu PDF antes de continuar se quiser guardá-la.", action})} />
              <div className="callout">
                <b>As florestas de Sylvargan</b>
                <p>
                  A campanha começa em uma das seis vilas do leste. Miryndol e
                  Seylara ficam perto de Vaelyndra, Eldwën e Tirashae a uma
                  distância normal, Lorandel e Valmyra ficam longe.
                </p>
              </div>
              <div className="form-grid">
                <NumberField label="Experiência (XP)" value={c.xp} max={1000000} onChange={v => update("xp", v)} hint="A cada 5 XP, sobe um nível e recebe 2 pontos." />
                <Field label="Nível calculado"><output>{d.level} · +{d.progressionPoints} pontos de progressão</output></Field>
              </div>
              <h3>Acordos de criação</h3>
              <p className="muted">
                A ficha começa com 30 pontos e recebe 2 pontos por nível. O contador usa um
                orçamento compartilhado para atributos, perícias e vantagens.
                Estágio do livro: {stageForXP(c.xp)}. Nível da mesa = piso(XP / 5).
              </p>
              <div className="form-grid">
                <Field
                  label="Pontos iniciais"
                  hint="Padrão da mesa: 30 pontos. Vazio também considera 30."
                >
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    value={c.rules.budget}
                    placeholder="A definir"
                    onChange={(e) =>
                      rule(
                        "budget",
                        e.target.value === ""
                          ? ""
                          : Math.max(
                              0,
                              Math.min(
                                10000,
                                Math.trunc(Number(e.target.value)),
                              ),
                            ),
                      )
                    }
                  />
                </Field>
                <NumberField
                  label="Pontos extras acordados"
                  value={c.rules.extraPoints}
                  onChange={(v) => rule("extraPoints", v)}
                />
                <NumberField
                  label="Pontos gastos em outros avanços"
                  value={c.rules.spentElsewhere}
                  onChange={(v) => rule("spentElsewhere", v)}
                />

              </div>
            </>
  );
}
