import React, { useState } from 'react';
import { HEX_COLOR } from '../../tokenArtwork.js';

export default function ColorControl({ label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  return <div className="token-color">
    <label className="field"><span>{label}</span><input type="color" value={value}
      onChange={event => { setDraft(null); onChange(event.target.value); }} /></label>
    <label className="field"><span>{label} em hexadecimal</span><input maxLength={7} value={draft ?? value}
      onBlur={() => setDraft(null)} onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (HEX_COLOR.test(next)) onChange(next);
      }} /></label>
  </div>;
}
