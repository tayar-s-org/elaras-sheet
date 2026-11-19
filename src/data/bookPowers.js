// Gerado a partir do livro (public/assets/book.json) por powersFromBook + powerDamage: custo, dano, distância e duração
// de cada poder. A ficha usa isto para preencher os campos vazios de poderes que vieram do livro.
export const BOOK_POWERS = {
 "adivinhacao": {
  "cost": "5",
  "damage": "Sem dano",
  "range": "Pessoal",
  "duration": "1 minuto"
 },
 "amigo das feras": {
  "cost": "Especial",
  "damage": "Sem dano",
  "range": "Astúcia x 100 metros",
  "duration": "10 minutos"
 },
 "andar nas paredes": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "armadura": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "atordoar": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "12/24/48",
  "duration": "Especial"
 },
 "aumentar/reduzir caracteristica": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (1/Rodada)"
 },
 "banir": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "Instantânea"
 },
 "barreira": {
  "cost": "1/seção",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (1 por seção, por rodada)"
 },
 "campo de dano": {
  "cost": "4",
  "damage": "2d6 (2d8 com ampliação), mais o dado de Força em combate desarmado",
  "range": "Toque",
  "duration": "3 (2/rodada)"
 },
 "cavar": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Astúcia x 2",
  "duration": "3 (2/rodada)"
 },
 "cegar": {
  "cost": "2-6",
  "damage": "Sem dano",
  "range": "12/24/48",
  "duration": "Instantânea"
 },
 "confusao": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Astúcia x 2",
  "duration": "Instantânea"
 },
 "conjurar aliado": {
  "cost": "3+",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (1/rodada)"
 },
 "crescimento/encolhimento": {
  "cost": "2+",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (2/rodadas)"
 },
 "cura": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "Instantânea"
 },
 "cura maior": {
  "cost": "10/20",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "Instantânea"
 },
 "dadiva do guerreiro": {
  "cost": "4",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "deflexao": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "detectar/ocultar arcano": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Visão",
  "duration": "3 (1/rodada) ou 1 hora (1/ hora)"
 },
 "devastacao": {
  "cost": "2-4",
  "damage": "Sem dano (arremessa o alvo 2d6 quadros)",
  "range": "Astúcia x 2",
  "duration": "Instantânea"
 },
 "disfarce": {
  "cost": "3-5",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "10 minutos (1/10 minutos)"
 },
 "dissipar": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "Instantânea"
 },
 "drenar pontos de poder": {
  "cost": "3",
  "damage": "Sem dano (drena 1d6+1 pontos de poder; 1d8+2 com ampliação)",
  "range": "Astúcia",
  "duration": "Instantânea"
 },
 "enredar": {
  "cost": "2-4",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "Especial"
 },
 "explosao": {
  "cost": "2-6",
  "damage": "2d6 (3d6 pelo dobro de pontos de poder)",
  "range": "24/48/96",
  "duration": "Instantânea"
 },
 "falar idioma": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "10 minutos (1/10 minutos)"
 },
 "fantoche": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (1/rodada)"
 },
 "ferir": {
  "cost": "2",
  "damage": "+2 no dano da arma (+4 com ampliação)",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "golpear": {
  "cost": "2",
  "damage": "Sem dano (arremessa o alvo 2d6 quadros)",
  "range": "Modelo de Cone",
  "duration": "Instantânea"
 },
 "iluminar/obscurecer": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "30 minutos (1/10 minutos) ou 3 (1/rodada)"
 },
 "intangibilidade": {
  "cost": "5",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (2/rodada)"
 },
 "invisibilidade": {
  "cost": "5",
  "damage": "Sem dano",
  "range": "Pessoal",
  "duration": "3 (1/rodada)"
 },
 "lentidao": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Astúcia x2",
  "duration": "3 (2/rodada)"
 },
 "ler a mente": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "1"
 },
 "manipulacao elemental": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Astúcia x2",
  "duration": "3 (1/rodada)"
 },
 "medo": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Astúcia x 2",
  "duration": "Instantânea"
 },
 "mudanca de forma": {
  "cost": "Especial",
  "damage": "Sem dano",
  "range": "Pessoal",
  "duration": "1 minuto (1/minuto)"
 },
 "protecao ambiental": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "1 hora (1/hora)"
 },
 "raio": {
  "cost": "1 por projétil",
  "damage": "2d6 por raio (3d6 por 2 pontos de poder)",
  "range": "12/24/48",
  "duration": "Instantânea"
 },
 "rajada": {
  "cost": "2",
  "damage": "2d10",
  "range": "Modelo de Cone",
  "duration": "Instantânea"
 },
 "rapidez": {
  "cost": "4",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (2/rodada)"
 },
 "socorro": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "Instantânea"
 },
 "sono": {
  "cost": "2",
  "damage": "Sem dano",
  "range": "Astúcia x 2",
  "duration": "1 minuto (1/minuto)"
 },
 "telecinese": {
  "cost": "5",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "3 (1/rodada)"
 },
 "teleporte": {
  "cost": "3+",
  "damage": "Sem dano (2d6 de dano ao conjurador em desastre)",
  "range": "Especial",
  "duration": "Instantânea"
 },
 "velocidade": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "visao distante": {
  "cost": "3",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "visao sombria": {
  "cost": "1",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "1 hora (1/hora)"
 },
 "voar": {
  "cost": "3/6",
  "damage": "Sem dano",
  "range": "Toque",
  "duration": "3 (1/rodada)"
 },
 "zumbi": {
  "cost": "3/Cadáver",
  "damage": "Sem dano",
  "range": "Astúcia",
  "duration": "Especial"
 }
};
