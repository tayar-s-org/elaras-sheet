import React from "react";
import { DICE, SKILLS } from "../../rules.js";
import { racialEffects } from "../../templates.js";

/* eslint-disable-next-line no-unused-vars */
export default function SkillsTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  return (
            <>
              <p className="intro">
                Escolha o que você sabe fazer. Cada estágio inicial custa 1
                ponto.
              </p>
              <p className="muted">
                Conjurar e Meditar aparecem nos treinos do mestre. Confirme como
                essas perícias ficam disponíveis. A compra de novas perícias
                durante a campanha tem custo próprio.
              </p>
              <div className="skills-grid">
                {SKILLS.map(([name, attribute]) => (
                  <label className="skill" key={name}>
                    <span>
                      {name}
                      <small>{attribute}</small>
                    </span>
                    <select
                      aria-label={`Perícia ${name}`}
                      value={c.skills[name] || 0}
                      onChange={(e) =>
                        update("skills", {
                          ...c.skills,
                          [name]: Number(e.target.value),
                        })
                      }
                    >
                      <option value="0">—</option>
                      {DICE.filter(v => v >= (racialEffects(c).skill === name ? 6 : 4)).map((v) => (
                        <option value={v} key={v}>
                          d{v}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {(!c.skills.Nadar || !c.skills.Perceber) && (
                <div className="callout">
                  <b>Atenção às regras da mesa</b>
                  <p>
                    {!c.skills.Nadar &&
                      "Sem Nadar, a planilha prevê afogamento ao submergir. "}
                    {!c.skills.Perceber &&
                      "Sem Perceber, você não identifica armadilhas e afins."}
                  </p>
                </div>
              )}
            </>
  );
}
