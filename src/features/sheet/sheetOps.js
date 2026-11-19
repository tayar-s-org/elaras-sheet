// Operações de edição da ficha (as mesmas usadas pela página da ficha e pelo painel do tabuleiro).
// setC recebe o novo valor ou uma função (prev => novo) e `c` é a ficha atual.
export function sheetOps(c, setC) {
  const update = (key, value) => setC(prev => ({ ...prev, [key]: value }));
  const rule = (key, value) => setC(prev => ({ ...prev, rules: { ...prev.rules, [key]: value } }));
  const changeItem = (key, index, field, value) => update(key, c[key].map((x, i) => (i === index ? { ...x, [field]: value } : x)));
  const addItem = key => {
    const item = key === 'advantages' ? { name: '', description: '', power: false }
      : key === 'hindrances' ? { name: '', description: '', severity: 'Menor' }
      : { name: '', description: '', cost: '' };
    update(key, [...c[key], item]);
  };
  return { update, rule, changeItem, addItem };
}
