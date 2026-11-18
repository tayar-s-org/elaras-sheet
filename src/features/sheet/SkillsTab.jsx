import React, { useState } from "react";
import { DICE, SKILLS } from "../../rules.js";
import { racialEffects } from "../../templates.js";
import "./skills.css";

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const GROUPS = [...new Set(SKILLS.map(([, attr]) => attr))];

/* eslint-disable-next-line no-unused-vars */
export default function SkillsTab({ c, d, update, rule, setC, setConfirm, setToast, setRequestedPage, setTab, changeItem, addItem, requestedPage }) {
  const [query, setQuery] = useState("");
  const [skillTab, setSkillTab] = useState(() => (Object.values(c.skills).some(v => v > 0) ? "trained" : GROUPS[0]));
  const racialSkill = racialEffects(c).skill;
  const trained = Object.values(c.skills).filter(v => v > 0).length;
  const setDie = (name, die) => update("skills", { ...c.skills, [name]: die });
  const cost = (name, die) => Math.max(0, (die ? (die - 2) / 2 : 0) - (name === racialSkill ? 2 : 0));
  const searching = query.trim().length > 0;
  const inTab = ([name, attr]) => (skillTab === "trained" ? c.skills[name] > 0 : attr === skillTab);
  // Buscando, procura em todas as abas; sem busca, mostra so a aba escolhida.
  const visible = skill => (searching ? norm(skill[0]).includes(norm(query)) : inTab(skill));
  const count = attr => SKILLS.filter(([name, a]) => a === attr && c.skills[name] > 0).length;

  return (
    <>
      <p className="intro">Escolha o que você sabe fazer. Cada estágio inicial custa 1 ponto.</p>

      <div className="skills2-bar">
        <div className="skills2-stat"><b>{trained}</b><span>treinadas</span></div>
        <div className="skills2-stat"><b>{d.skillCost}</b><span>pontos em perícias</span></div>
        <div className={`skills2-stat${d.remaining < 0 ? " bad" : ""}`}><b>{d.remaining ?? "—"}</b><span>pontos livres na ficha</span></div>
      </div>

      <div className="skills2-filters">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar perícia…" aria-label="Buscar perícia" />
      </div>

      <div className="tabs-row skills2-tabs" role="tablist" aria-label="Perícias por atributo">
        <button type="button" role="tab" aria-selected={!searching && skillTab === "trained"} className={!searching && skillTab === "trained" ? "primary" : "outline"} onClick={() => { setQuery(""); setSkillTab("trained"); }}>Treinadas ({trained})</button>
        {GROUPS.map(attr => <button key={attr} type="button" role="tab" aria-selected={!searching && skillTab === attr} className={!searching && skillTab === attr ? "primary" : "outline"} onClick={() => { setQuery(""); setSkillTab(attr); }}>{attr} <span className="skills2-count">{count(attr)}/{SKILLS.filter(([, a]) => a === attr).length}</span></button>)}
      </div>

      {GROUPS.map(attr => {
        const rows = SKILLS.filter(([, a]) => a === attr).filter(visible);
        if (!rows.length) return null;
        return <section className="skills2-group" key={attr} aria-label={`Perícias de ${attr}`}>
          <h3>{attr} <span className="skills2-attr">d{c.attributes[attr]}</span></h3>
          <div className="skills2-list">
            {rows.map(([name]) => {
              const die = c.skills[name] || 0;
              const minDie = racialSkill === name ? 6 : 4;
              return <div className={`skills2-row${die ? " on" : ""}`} key={name}>
                <span className="skills2-name">{name}{racialSkill === name && <small>racial, grátis até d6</small>}</span>
                <div className="die-picker" role="radiogroup" aria-label={`Dado de ${name}`}>
                  <button type="button" role="radio" aria-checked={!die} className={!die ? "sel" : ""} onClick={() => setDie(name, 0)} title="Sem treino">—</button>
                  {DICE.map(v => <button key={v} type="button" role="radio" aria-checked={die === v} disabled={v < minDie} className={die === v ? "sel" : ""} onClick={() => setDie(name, v)}>d{v}</button>)}
                </div>
                {die === 12 && c.bonuses?.skills?.[name] > 0 && <b className="die-bonus" title="Bônus de evolução: rola 1d12 e soma este valor">d12+{c.bonuses.skills[name]}</b>}
                <span className="skills2-cost" aria-label="Custo">{die ? `${cost(name, die)} pt` : ""}</span>
              </div>;
            })}
          </div>
        </section>;
      })}
      {!SKILLS.some(visible) && <p className="muted">{searching ? "Nenhuma perícia encontrada." : skillTab === "trained" ? "Nenhuma perícia treinada ainda. Escolha um atributo acima para começar." : "Nenhuma perícia neste atributo."}</p>}

      {(!c.skills.Nadar || !c.skills.Perceber) && (
        <div className="callout">
          <b>Atenção às regras da mesa</b>
          <p>
            {!c.skills.Nadar && "Sem Nadar, a planilha prevê afogamento ao submergir. "}
            {!c.skills.Perceber && "Sem Perceber, você não identifica armadilhas e afins."}
          </p>
        </div>
      )}
      <p className="muted skills2-note">Conjurar e Meditar aparecem nos treinos do mestre; confirme como ficam disponíveis. A compra de novas perícias durante a campanha tem custo próprio.</p>
    </>
  );
}
