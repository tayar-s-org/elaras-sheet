from pathlib import Path
root = Path(__file__).resolve().parents[1]
p = root/'src/main.jsx'
s = p.read_text(encoding='utf8')
s = s.replace('import "./style.css";', 'import "./style.css";\nimport Book from "./Book.jsx";\nimport Catalog from "./Catalog.jsx";')
start = s.index('  const [query, setQuery]')
end = s.index('  const file = useRef();',start)
s = s[:start] + '  const [requestedPage, setRequestedPage] = useState(null);\n' + s[end:]
start = s.index('  const bookPages = React.useMemo')
end = s.index('  function changeItem', start)
s = s[:start] + s[end:]
start = s.index('              <h3>Livro completo</h3>')
end = s.index('\n            </>\n          )}', start)
s = s[:start] + '              <Book requestedPage={requestedPage} />' + s[end:]
start = s.index('              <p className="muted">', s.index('{tab === 3 &&'))
end = s.index('              <h3>Vantagens</h3>',start)
s = s[:start] + '''              <Catalog character={c}
                onAdd={(key, item) => {
                  setC(prev => ({...prev, [key]: [...prev[key], item]}));
                  setToast(`${item.name} adicionada à ficha.`);
                }}
                onOpenPage={page => {setRequestedPage(page);setTab(6);}}
              />
              <h3>Opções selecionadas e personalizadas</h3>
''' + s[end:]
s = s.replace('+ Adicionar vantagem', '+ Criar vantagem personalizada').replace('+ Adicionar desvantagem', '+ Criar desvantagem personalizada')
p.write_text(s, encoding='utf8')
p = root/'index.html'
p.write_text(p.read_text(encoding='utf8').replace('    <script src="./assets/livro.js"></script>\n',''), encoding='utf8')
