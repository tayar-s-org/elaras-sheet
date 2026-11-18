// Sons que vêm com o app em todas as mesas (arquivos em public/sounds). O nome do botão é o nome do arquivo original.
const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');

export const DEFAULT_SOUNDS = [
  { id: 'default:abrindo-porta', name: "Abrindo Porta", file: 'abrindo-porta.mp3', loop: false },
  { id: 'default:afiando-arma', name: "Afiando Arma", file: 'afiando-arma.mp3', loop: false },
  { id: 'default:bard-1', name: "Bard 1", file: 'bard-1.mp3', loop: true },
  { id: 'default:bard-2', name: "Bard 2", file: 'bard-2.mp3', loop: true },
  { id: 'default:batendo-na-porta', name: "Batendo na Porta", file: 'batendo-na-porta.mp3', loop: false },
  { id: 'default:cerveja', name: "Cerveja", file: 'cerveja.mp3', loop: false },
  { id: 'default:fechar-porta', name: "Fechar Porta", file: 'fechar-porta.mp3', loop: false },
  { id: 'default:fogueira', name: "Fogueira", file: 'fogueira.mp3', loop: true },
  { id: 'default:jogando-moedas', name: "Jogando Moedas", file: 'jogando-moedas.mp3', loop: false },
  { id: 'default:pratos-e-talheres', name: "Pratos e Talheres", file: 'pratos-e-talheres.mp3', loop: false },
  { id: 'default:psst', name: "Psst!", file: 'psst.mp3', loop: false },
  { id: 'default:relincho-cavalo', name: "Relincho Cavalo", file: 'relincho-cavalo.mp3', loop: false },
  { id: 'default:risada-maligna', name: "Risada Maligna", file: 'risada-maligna.mp3', loop: false },
  { id: 'default:risada-malvada', name: "Risada Malvada", file: 'risada-malvada.mp3', loop: false },
].map(s => ({ ...s, builtin: true, url: `${BASE}sounds/${s.file}` }));

export const isBuiltinSound = id => String(id).startsWith('default:');
