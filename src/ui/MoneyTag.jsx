import React from 'react';
import { formatMoney } from '../money.js';
import './money.css';

// Dinheiro do personagem, mostrado logo abaixo do nível (resumo da ficha, token e ficha do grupo).
export default function MoneyTag({ value, label = 'Dinheiro' }) {
  const text = formatMoney(value);
  return <p className="money-tag" aria-label={`${label}: ${text}`}>
    <span className="money-coin" aria-hidden="true">$</span>
    <span className="money-label">{label}</span>
    <b>{text}</b>
  </p>;
}
