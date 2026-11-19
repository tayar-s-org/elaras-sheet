// Loja do Mestre (migração 0041): regras puras usadas pela tela do mestre e pelo Mercado do jogador.
// Cada anúncio é um item customizado (nome, peso, efeitos, descrição — o mesmo modelo da ficha) com moeda e preço.
import { formatMoney } from '../money.js';
import { iconText, DEFAULT_CURRENCY_ICON } from '../features/room/masterHub/experienceIcons.js';

export const MAX_PRICE = 999999999;

// Dinheiro ($, o saldo da ficha) como "moeda" de venda. No banco o anúncio em $ tem currency_id nulo; na tela usa este id fixo.
export const MONEY_ID = 'money';
export const MONEY_CURRENCY = { id: MONEY_ID, name: 'Dinheiro', symbol: '$' };
// Opções de moeda para vender: $ primeiro (quando o banco já aceita, migração 0043) e depois as moedas criadas pelo mestre.
export const saleCurrencies = (currencies, allowMoney = true) => (allowMoney ? [MONEY_CURRENCY, ...currencies] : currencies);
// Moeda em que um anúncio é pago (null no banco = $).
export const shopCurrency = (listing, currencies) => (listing?.currency_id ? currencies.find(c => c.id === listing.currency_id) : MONEY_CURRENCY);

// Entrada de mochila equivalente ao anúncio (o servidor usa o id custom-<id do anúncio>, então compras repetidas empilham).
export const shopEntry = listing => ({
  id: `custom-${listing.id}`, qty: 1, equipped: false,
  custom: { name: listing.name, weight: Number(listing.weight) || 0, effects: Array.isArray(listing.effects) ? listing.effects : [], description: listing.description || '' },
});

// "🪙 25" — preço com o símbolo da moeda (sem moeda conhecida, só o número).
export const priceText = (price, currency) => `${currency?.symbol ? `${iconText(currency.symbol, DEFAULT_CURRENCY_ICON)} ` : ''}${formatMoney(price)}`;

// Dá para pagar? (a conferência de verdade é do servidor; isto só habilita o botão)
export const canAfford = (balance, price, qty = 1) => Number.isFinite(Number(balance)) && Number(balance) >= Number(price) * qty;

// Preço digitado: inteiro de 1 a 999.999.999.
export function parsePrice(text) {
  const n = Math.trunc(Number(String(text ?? '').replace(',', '.')));
  if (!Number.isFinite(n) || String(text ?? '').trim() === '') return { ok: false, error: 'Informe o preço.' };
  if (n < 1 || n > MAX_PRICE) return { ok: false, error: `O preço deve ficar entre 1 e ${MAX_PRICE.toLocaleString('pt-BR')}.` };
  return { ok: true, price: n };
}

// Opções de venda do formulário de criação do mestre: { sell, currencyId, price } -> { ok, error?, currencyId?, price? }.
// currencyId volta nulo quando o preço é em $ (é o que o banco espera).
export function saleOptions({ sell, currencyId, price }, currencies, allowMoney = true) {
  if (!sell) return { ok: true, sell: false };
  const options = saleCurrencies(currencies, allowMoney);
  if (!options.length) return { ok: false, error: 'Crie uma moeda em "Moedas" para vender na loja.' };
  const currency = options.find(c => c.id === currencyId) || options[0];
  const p = parsePrice(price);
  if (!p.ok) return p;
  return { ok: true, sell: true, currencyId: currency.id === MONEY_ID ? null : currency.id, price: p.price };
}

// Anúncios que o jogador vê (ativos), na ordem de criação; o mestre vê todos.
export const visibleListings = (shop, isGm) => (shop || []).filter(l => isGm || l.active);
