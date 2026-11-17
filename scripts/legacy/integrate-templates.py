from pathlib import Path
root = Path(__file__).resolve().parents[1]
p=root/'src/rules.js'; s=p.read_text(encoding='utf8')
s='import { racialEffects } from "./templates.js";\n'+s
s=s.replace('  ["Meditar", "Espírito"],','  ["Meditar", "Espírito"],\n  ["Fé", "Espírito"],\n  ["Ciência Estranha", "Astúcia"],\n  ["Conhecimento (Ciência)", "Astúcia"],\n  ["Conhecimento (Outro)", "Astúcia"],\n  ["Conhecimento (Batalha)", "Astúcia"],\n  ["Conhecimento (Arcano)", "Astúcia"],')
s=s.replace('    race: "Humano",','    race: "Humano",\n    raceId: "",\n    raceChoice: "Agilidade",\n    raceSkill: "Conhecimento",')
s=s.replace('  const a = c.attributes;', '  const a = c.attributes;\n  const racial = racialEffects(c);')
s=s.replace('(name === "Agilidade" && c.rules.racialAgility ? 6 : 4)', '(racial.base[name] || (name === "Agilidade" && c.rules.racialAgility ? 6 : 4))')
s=s.replace('  const skillCost = Object.values(c.skills).reduce(\n    (sum, die) => sum + (die ? (die - 2) / 2 : 0),','  const skillCost = Object.entries(c.skills).reduce(\n    (sum, [name, die]) => sum + Math.max(0, (die ? (die - 2) / 2 : 0) - (name === racial.skill ? 2 : 0)),')
s=s.replace('sum + 1 + c.rules.ownedAdvantages + i,','sum + (i < racial.freeEdges ? 0 : 1 + c.rules.ownedAdvantages + i - racial.freeEdges),')
s=s.replace('    attributeCost,','    racial,\n    charisma: racial.charisma,\n    attributeCost,',1)
s=s.replace('        c.movementBonus,','        c.movementBonus + racial.movement,')
s=s.replace('toughness: 2 + a.Vigor / 2 + c.armor,','toughness: 2 + a.Vigor / 2 + c.armor + racial.toughness,')
s=s.replace('  for (const name of ATTRIBUTES) {','  c.raceId = ["Androide","Anão","Atlante","Aviano","Elfo","Humano","Meio-elfo","Meio-orc","Pequenino","Rakashano","Sáurio"].includes(raw.raceId) ? raw.raceId : "";\n  c.raceChoice = raw.raceChoice === "Vantagem" ? "Vantagem" : "Agilidade";\n  c.raceSkill = SKILLS.some(([name]) => name === raw.raceSkill) ? raw.raceSkill : "Conhecimento";\n  for (const name of ATTRIBUTES) {')
s=s.replace('  return c;\n}', '  const racial = racialEffects(c);\n  for (const [name, die] of Object.entries(racial.base)) c.attributes[name] = Math.max(die, c.attributes[name]);\n  if (racial.skill) c.skills[racial.skill] = Math.max(6, c.skills[racial.skill] || 0);\n  return c;\n}')
p.write_text(s,encoding='utf8')
p=root/'src/main.jsx'; s=p.read_text(encoding='utf8')
s=s.replace('import Book from "./Book.jsx";', 'import Book from "./Book.jsx";\nimport Templates from "./Templates.jsx";\nimport { racialEffects } from "./templates.js";')
start=s.index('                <Field label="Raça">'); end=s.index('                <Field label="Vila de origem">', start)
s=s[:start]+'''                <Field label="Raça atual" hint="Escolha no catálogo abaixo para aplicar os traços do livro.">
                  <input value={c.race} maxLength={100} onChange={e => update("race", e.target.value)} disabled={Boolean(c.raceId)} />
                </Field>
'''+s[end:]
start=s.index('              <div className="callout">',s.index('{tab === 0 &&'))
s=s[:start]+'''              <Templates character={c} onChange={setC} onLoad={(title, action) => setConfirm({title, text:"A ficha atual será substituída. Salve seu PDF antes de continuar se quiser guardá-la.", action})} />
'''+s[start:]
s=s.replace('                <Field\n                  label="Traço racial opcional"','                {!c.raceId && <Field\n                  label="Traço racial opcional"')
s=s.replace('                    Agilidade começa em d6\n                  </span>\n                </Field>', '                    Agilidade começa em d6\n                  </span>\n                </Field>}')
s=s.replace('                            v < 6','                            v < 6')
s=s.replace('                          !(\n                            name === "Agilidade"', '                          v >= (racialEffects(c).base[name] || 4) && !(\n                            name === "Agilidade"')
s=s.replace('                      <option value="0">-</option>', '                      {! (racialEffects(c).skill === name) && <option value="0">-</option>}')
s=s.replace('                      {DICE.map((v) => (', '                      {DICE.filter(v => v >= (racialEffects(c).skill === name ? 6 : 4)).map((v) => (')
s=s.replace('Registre traços raciais e seus efeitos em Anotações. Só a base\n                racial opcional de Agilidade é aplicada automaticamente.', 'Os traços raciais escolhidos em Identidade são aplicados automaticamente.\n                Bônus situacionais aparecem no painel da raça; ajustes abaixo são adicionais.')
p.write_text(s,encoding='utf8')
p=root/'src/pdf.js'; s=p.read_text(encoding='utf8')
s='import { racialSummary } from "./templates.js";\n'+s
s=s.replace('  section("Atributos");','  if (c.raceId) {\n    section("Traços raciais");\n    line(racialSummary(c));\n    line(`Carisma racial ${d.charisma} | Benes raciais extras ${d.racial.benes} | Bônus racial Perceber +${d.racial.notice} | Escalar +${d.racial.climb}`);\n  }\n  section("Atributos");')
p.write_text(s,encoding='utf8')
