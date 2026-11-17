from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'src/main.jsx';s=p.read_text(encoding='utf8')
s=s.replace('O total inicial está em aberto na planilha. O contador usa um','A ficha começa com 30 pontos e recebe 2 pontos por nível. O contador usa um').replace('Ajuste com o mestre.', 'Nível = piso(XP / 5).')
s=s.replace('hint="Deixe vazio até o mestre definir."','hint="Padrão da mesa: 30 pontos. Vazio também considera 30."')
marker='              <h3>Acordos de criação</h3>'
s=s.replace(marker,'''              <div className="form-grid">
                <NumberField label="Experiência (XP)" value={c.xp} max={1000000} onChange={v => update("xp", v)} hint="A cada 5 XP, sobe um nível e recebe 2 pontos." />
                <Field label="Nível calculado"><output>{d.level} · +{d.progressionPoints} pontos de progressão</output></Field>
              </div>
'''+marker)
start=s.index('                    <label className="check">',s.index('{c.advantages.map'))
end=s.index('                    <button',start)
s=s[:start]+'''                    <span className="muted">Bônus específicos de mana: use Mana adicional em Atributos.</span>
'''+s[end:]
s=s.replace('["Outros gastos", c.rules.spentElsewhere],','["Outros gastos", c.rules.spentElsewhere],\n              ["Nível " + d.level, "+" + d.progressionPoints],')
p.write_text(s,encoding='utf8')
p=root/'src/rules.js';s=p.read_text(encoding='utf8')
s=s.replace('O orçamento inicial está como “x pontos”.','O orçamento inicial é 30 pontos. Nível = piso(XP / 5); cada nível concede 2 pontos adicionais.')
s=s.replace('piso(soma dos atributos / 12 + 1)','piso(soma dos atributos / 12)')
s=s.replace('Mana máxima = 2 × Espírito + 10 por vantagem de poder.', 'Mana máxima = 10 + 2 × Espírito. Bônus específicos podem ser registrados em Mana adicional.')
p.write_text(s,encoding='utf8')
p=root/'src/pdf.js';s=p.read_text(encoding='utf8')
s=s.replace('  section("Conferência de pontos");','  line(`XP: ${c.xp} | Nível: ${d.level} | Pontos de progressão: +${d.progressionPoints}`);\n  section("Conferência de pontos");')
s=s.replace('c.rules.budget === "" ? "a definir" : c.rules.budget','c.rules.budget === "" ? 30 : c.rules.budget')
p.write_text(s,encoding='utf8')
p=root/'src/rules.test.js';s=p.read_text(encoding='utf8').replace('[10, 12, 3, 4, 5, 16]','[10, 12, 2, 4, 5, 26]').replace('assert.equal(d.remaining, null);','assert.equal(d.remaining, 8);').replace('assert.equal(d.mana, 18);','assert.equal(d.mana, 18);')
p.write_text(s,encoding='utf8')
