// Dano de cada poder do livro, tirado da descrição de cada um (páginas 153 a 168). Poderes que não causam dano
// dizem "Sem dano"; quando o poder faz outra coisa numérica (derrubar, drenar Pontos de Poder, aumentar o dano da arma)
// isso aparece entre parênteses. A chave é o nome sem acento e em minúsculas.
export const normalizePowerName = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const DAMAGE = {
  'raio': '2d6 por raio (3d6 por 2 pontos de poder)',
  'explosao': '2d6 (3d6 pelo dobro de pontos de poder)',
  'rajada': '2d10',
  'campo de dano': '2d6 (2d8 com ampliação), mais o dado de Força em combate desarmado',
  'ferir': '+2 no dano da arma (+4 com ampliação)',
  'drenar pontos de poder': 'Sem dano (drena 1d6+1 pontos de poder; 1d8+2 com ampliação)',
  'devastacao': 'Sem dano (arremessa o alvo 2d6 quadros)',
  'golpear': 'Sem dano (arremessa o alvo 2d6 quadros)',
  'teleporte': 'Sem dano (2d6 de dano ao conjurador em desastre)',
};

export const powerDamage = name => DAMAGE[normalizePowerName(name)] || 'Sem dano';
