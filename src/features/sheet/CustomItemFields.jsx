import React from "react";
import { ATTRIBUTES, SKILLS } from "../../rules.js";
import { DERIVED, MAX_BONUS, MAX_EFFECTS, MAX_NAME, MAX_DESCRIPTION, MAX_DAMAGE, sanitizeCustom, cleanDamage } from "../../market/custom.js";

const LISTS = { attributes: ATTRIBUTES, skills: SKILLS.map(([name]) => name) };
const KINDS = [["attribute", "Atributo"], ["skill", "Perícia"], ["derived", "Valor da ficha"]];
const targetsOf = kind => (kind === "attribute" ? ATTRIBUTES.map(a => [a, a]) : kind === "skill" ? LISTS.skills.map(s => [s, s]) : Object.entries(DERIVED));
const newEffect = () => ({ kind: "attribute", target: ATTRIBUTES[0], bonus: 1 });

export const emptyItemForm = () => ({ name: "", weight: "", damage: "", description: "", effects: [] });

// Item limpo (mesmas regras do pedido do jogador) a partir dos campos do formulário, ou null se faltar o nome.
export function itemFromForm(form) {
  const damage = cleanDamage(form.damage);
  return sanitizeCustom({ ...form, effects: [...(damage ? [{ kind: "damage", target: damage, bonus: 0 }] : []), ...form.effects], weight: Number(String(form.weight).replace(",", ".")) || 0 }, LISTS);
}

// Campos do item customizado, compartilhados entre o pedido do jogador (CustomItemForm) e a criação do mestre (GmItemsModal).
export default function CustomItemFields({ form, set }) {
  const setEffect = (i, patch) => set({ effects: form.effects.map((e, j) => {
    if (j !== i) return e;
    const next = { ...e, ...patch };
    if (patch.kind) next.target = targetsOf(patch.kind)[0][0];
    return next;
  }) });
  const damage = cleanDamage(form.damage);
  return <>
    <div className="ci-row2">
      <label className="field"><span>Nome do item</span>
        <input maxLength={MAX_NAME} value={form.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Anel do lobo cinzento" /></label>
      <label className="field"><span>Peso (kg)</span>
        <input type="number" min="0" max="500" step="0.1" value={form.weight} onChange={e => set({ weight: e.target.value })} placeholder="0" /></label>
    </div>

    <label className="field"><span>Dano (se for uma arma)</span>
      <input maxLength={MAX_DAMAGE} value={form.damage} onChange={e => set({ damage: e.target.value })} placeholder="Ex.: For+d6, 2d6+1, d8" />
      {form.damage.trim() && !damage && <small className="ci-hint">Use só letras, números e + − * / ( ). Ex.: For+d6.</small>}</label>

    <fieldset className="custom-set"><legend>O que o item dá ({form.effects.length}/{MAX_EFFECTS})</legend>
      {form.effects.length === 0 && <p className="muted ci-hint">Sem efeito nas regras: o item serve só como registro. Adicione bônus para ele ajudar nas rolagens.</p>}
      {form.effects.map((e, i) => <div className="ci-effect" key={i}>
        <select aria-label="Tipo do efeito" value={e.kind} onChange={ev => setEffect(i, { kind: ev.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="Alvo do efeito" value={e.target} onChange={ev => setEffect(i, { target: ev.target.value })}>{targetsOf(e.kind).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <input type="number" aria-label="Bônus" min={-MAX_BONUS} max={MAX_BONUS} value={e.bonus} onChange={ev => setEffect(i, { bonus: Number(ev.target.value) })} />
        <button type="button" className="text-button danger" aria-label="Remover efeito" onClick={() => set({ effects: form.effects.filter((_, j) => j !== i) })}>×</button>
      </div>)}
      <button type="button" className="outline" disabled={form.effects.length >= MAX_EFFECTS} onClick={() => set({ effects: [...form.effects, newEffect()] })}>+ Adicionar efeito</button>
      <p className="muted ci-hint">Atributos e perícias dão bônus nas rolagens (de −{MAX_BONUS} a +{MAX_BONUS}). Valores da ficha (armadura, Aparar, Movimento, Mana) somam direto nos números.</p>
    </fieldset>

    <label className="field"><span>Descrição</span>
      <textarea rows="3" maxLength={MAX_DESCRIPTION} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Como é, de onde veio, como funciona…" /></label>
  </>;
}
