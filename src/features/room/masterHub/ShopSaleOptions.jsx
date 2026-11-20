import React from 'react';
import { saleOptions, saleCurrencies } from '../../../market/shop.js';
import { iconText, DEFAULT_CURRENCY_ICON } from '../../../market/experienceIcons.js';

// Opção "Vender na Loja do Mestre" do formulário de criação de itens do mestre: moeda (uma das já criadas na mesa) e preço.
// Usada na Central (módulo Itens) e na janela "Entregar itens" do Grupo. value = { sell, currencyId, price }.
export const emptySale = () => ({ sell: false, currencyId: '', price: '' });

export default function ShopSaleOptions({ value, onChange, currencies, allowMoney = true, disabled = false }) {
  const options = saleCurrencies(currencies, allowMoney);
  const sale = saleOptions(value, currencies, allowMoney);
  const currencyId = options.find(c => c.id === value.currencyId)?.id || options[0]?.id || '';
  return <fieldset className="custom-set mh-sale">
    <legend>Loja do Mestre</legend>
    <label className="check"><input type="checkbox" checked={value.sell} disabled={disabled} onChange={e => onChange({ sell: e.target.checked })} /> Vender este item na Loja do Mestre</label>
    {value.sell && (options.length ? <div className="mh-form">
      <label className="field"><span>Moeda</span>
        <select value={currencyId} disabled={disabled} onChange={e => onChange({ currencyId: e.target.value })}>
          {options.map(c => <option key={c.id} value={c.id}>{iconText(c.symbol, DEFAULT_CURRENCY_ICON)} {c.name}{c.id === 'money' ? ' (padrão da mesa)' : ''}</option>)}
        </select></label>
      <label className="field"><span>Preço</span>
        <input type="number" inputMode="numeric" min="1" max="999999999" value={value.price} disabled={disabled} placeholder="Ex.: 25"
          onChange={e => onChange({ price: e.target.value })} onFocus={e => e.target.select()} style={{ width: '12ch' }} /></label>
      {!sale.ok && value.price !== '' && <small className="muted" role="status">{sale.error}</small>}
    </div> : <p className="muted mh-hint">Crie uma moeda em “Moedas” (Central do Mestre) para poder vender na loja.</p>)}
    {value.sell && <p className="muted mh-hint">O item aparece na aba “Loja do Mestre” do Mercado dos jogadores; quem tiver saldo naquela moeda (ou dinheiro, se o preço for em $) compra, e o item vai direto para a mochila.</p>}
  </fieldset>;
}
