import React, { useEffect, useId, useRef, useState } from 'react';
import { boardGrid, detectGrid, fitCalibration, gridLines } from '../../boardGrid.js';

export default function MapCalibration({ image, size, grid, setGrid, onPendingSuggestion, onInvalidFields }) {
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState(null);
  const [inputs, setInputs] = useState({});
  const hintId = useId();
  const [picking, setPicking] = useState(false);
  const [points, setPoints] = useState([]);
  const [sample, setSample] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [notice, setNotice] = useState('');
  const svg = useRef(null);
  const preview = useRef(null);
  const {width,height} = size;
  const normalized = boardGrid(grid);
  const patch = values => setGrid(boardGrid({ ...grid, ...values }));
  const fields = [['size','Tamanho da célula',20,400],['x','Deslocamento horizontal',-12000,12000],['y','Deslocamento vertical',-12000,12000]];
  const invalidField = ([key,,min,max]) => key in inputs && (!inputs[key].trim() || !Number.isFinite(Number(inputs[key])) || Number(inputs[key]) < min || Number(inputs[key]) > max);
  const hasInvalidFields = fields.some(invalidField);
  const rounded = value => String(Number(value.toFixed(2)));
  const displayed = suggestion ? boardGrid({ ...grid, ...suggestion }) : normalized;

  useEffect(() => { onPendingSuggestion(Boolean(suggestion)); return ()=>onPendingSuggestion(false); }, [suggestion,onPendingSuggestion]);
  useEffect(() => { onInvalidFields(hasInvalidFields); return ()=>onInvalidFields(false); }, [hasInvalidFields,onInvalidFields]);
  useEffect(() => { if(picking) svg.current?.focus({preventScroll:true}); }, [picking]);

  useEffect(() => {
    if (!picking || !cursor || zoom===1 || !preview.current) return;
    const matrix=svg.current?.getScreenCTM();
    if (!matrix) return;
    const screen=new DOMPoint(cursor.x,cursor.y).matrixTransform(matrix);
    const element=preview.current;
    const bounds=element.getBoundingClientRect();
    const margin=20;
    const dx=screen.x<bounds.left+margin ? screen.x-bounds.left-margin : Math.max(0,screen.x-bounds.right+margin);
    const dy=screen.y<bounds.top+margin ? screen.y-bounds.top-margin : Math.max(0,screen.y-bounds.bottom+margin);
    if(dx||dy) element.scrollBy(dx,dy);
  }, [picking,cursor,zoom]);

  function markPoint(point) {
    setCursor(point);
    if (!points.length) {
      setPoints([point]);
      setNotice('');
      return;
    }
    const fit = fitCalibration(points[0],point,1,1);
    if (!fit) {
      setNotice('Escolha o canto oposto do mesmo quadrado. Se precisar, aumente o zoom.');
      return;
    }
    const { uneven, ...values } = fit;
    patch(values);
    setInputs({});
    setSample({
      x: Math.min(points[0].x, point.x),
      y: Math.min(points[0].y, point.y),
      size: values.size,
    });
    setPoints([]);
    setPicking(false);
    setNotice(uneven ? 'Grade ajustada pela média dos dois lados. Confira o alinhamento ou marque outro quadrado.' : 'Grade ajustada em todo o mapa. Confira a prévia antes de aplicar.');
  }

  function moveCursor(event) {
    if (!picking) return;
    const delta = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if (!delta && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const here = cursor || { x:width/2, y:height/2 };
    if (!delta) { markPoint(here); return; }
    const step = event.shiftKey ? 10 : 1;
    setCursor({ x:Math.min(width,Math.max(0,here.x+delta[0]*step)), y:Math.min(height,Math.max(0,here.y+delta[1]*step)) });
  }

  function updateField([key,,min,max], value) {
    setSample(null);
    setInputs(previous=>({ ...previous,[key]:value }));
    const n = Number(value);
    if (value.trim() && Number.isFinite(n) && n >= min && n <= max) patch({[key]:n});
  }

  function choosePoint(event) {
    if (!picking) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) return;
    markPoint(point);
  }

  async function detect() {
    setNotice('Analisando imagem…');
    setPicking(false);
    try {
      const img = new Image();
      img.src = image;
      await img.decode();
      const canvas = document.createElement('canvas');
      const downsample = Math.min(1,1024 / Math.max(img.naturalWidth,img.naturalHeight));
      canvas.width = Math.max(1,Math.round(img.naturalWidth * downsample));
      canvas.height = Math.max(1,Math.round(img.naturalHeight * downsample));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const scale = Math.min(width / img.naturalWidth,height / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const result = detectGrid(ctx.getImageData(0,0,canvas.width,canvas.height),w,h);
      if (!result) { setNotice('Nenhuma grade quadrada confiável foi encontrada. Use a calibração por cliques ou os campos manuais.'); return; }
      setSuggestion({ ...result, x:result.x + (width-w)/2, y:result.y + (height-h)/2 });
      setNotice('Grade detectada. Confira a sobreposição antes de usar.');
    } catch { setNotice('Não foi possível analisar a imagem. Use a calibração manual.'); }
  }

  return <section className="map-calibration" aria-label="Calibração da grade">
    <div className="map-calibration-tools">
      <button type="button" className={picking ? 'outline' : 'primary'} disabled={Boolean(suggestion)} aria-pressed={picking} onClick={() => {
        setPicking(!picking);
        setPoints([]);
        setSample(null);
        setNotice('');
        setCursor(null);
      }}>{picking ? 'Cancelar marcação' : 'Ajustar por um quadrado'}</button>
      <button type="button" className="quiet" disabled={!image || Boolean(suggestion) || picking} onClick={detect}>Detectar automaticamente</button>
      <label className="map-zoom">Zoom <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Mapa inteiro</option><option value={2}>200%</option><option value={4}>400%</option><option value={8}>800%</option></select></label>
    </div>
    <p id={hintId} role="status" className="map-calibration-hint">
      {picking ? (points.length ? '2 de 2 · Marque o canto oposto do mesmo quadrado.' : '1 de 2 · Marque um canto de um quadrado do mapa.') : 'Use um quadrado do mapa como referência para alinhar toda a grade.'}
      {picking && <small> Pelo teclado, mova com as setas (Shift para acelerar) e marque com Enter.</small>}
    </p>
    <div ref={preview} className={`map-preview${zoom>1 ? ' is-zoomed' : ''}`}>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} style={zoom>1 ? {width:`${zoom*100}%`} : undefined}
        onClick={choosePoint} onKeyDown={moveCursor} tabIndex={picking ? 0 : undefined}
        aria-label={picking ? 'Marcação dos cantos da grade' : 'Prévia do mapa e da grade'}
        aria-describedby={picking ? hintId : undefined} role={picking ? 'group' : 'img'} className={picking ? 'is-picking' : undefined}>
        <rect width={width} height={height} fill="#181824" />
        {image && <image href={image} width={width} height={height} />}
        {!picking && (displayed.visible || suggestion) && <g stroke={suggestion ? '#ffd37b' : 'white'} opacity={suggestion ? Math.max(0.6,displayed.opacity) : displayed.opacity}>
          {gridLines(width,displayed.size,displayed.x).map(x=><line key={x} x1={x} x2={x} y1={0} y2={height} vectorEffect="non-scaling-stroke"/>)}
          {gridLines(height,displayed.size,displayed.y).map(y=><line key={y} y1={y} y2={y} x1={0} x2={width} vectorEffect="non-scaling-stroke"/>)}
        </g>}
        {!picking && sample && !suggestion && <rect x={sample.x} y={sample.y} width={sample.size} height={sample.size}
          fill="none" stroke="#ffcf63" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {picking && cursor && <g stroke="#ffcf63" strokeWidth="3">
          <line x1={0} x2={width} y1={cursor.y} y2={cursor.y} vectorEffect="non-scaling-stroke"/>
          <line x1={cursor.x} x2={cursor.x} y1={0} y2={height} vectorEffect="non-scaling-stroke"/>
        </g>}
        {picking && points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={Math.max(width,height)/140} fill="#ffcf63" stroke="#191923" strokeWidth={3}/>)}
      </svg>
    </div>
    {notice && <p role="status">{notice}</p>}
    {suggestion && <div className="map-suggestion callout">
      <p>Na prévia: célula {rounded(displayed.size)}, deslocamento {rounded(displayed.x)} × {rounded(displayed.y)}.</p>
      <div className="tabs-row">
        <button type="button" className="primary" onClick={() => {
          patch(suggestion); setSample(null); setInputs({}); setSuggestion(null); setNotice('Valores aceitos na prévia. Aplique no tabuleiro ou salve na biblioteca para gravar.');
        }}>Usar na prévia</button>
        <button type="button" className="outline" onClick={() => { setSuggestion(null); setNotice('Sugestão descartada.'); }}>Descartar sugestão</button>
      </div>
    </div>}
    <details className="map-advanced">
      <summary>Ajustes finos e exibição</summary>
      <div className="map-fields">
      {fields.map(field => {
        const [key,label,min,max] = field;
        const invalid = invalidField(field);
        const errorId = `${hintId}-${key}`;
        return <label key={key} className="field">{label}
          <input type="number" value={suggestion ? rounded(displayed[key]) : inputs[key] ?? rounded(displayed[key])} step="any" min={min} max={max} disabled={Boolean(suggestion)}
            aria-invalid={invalid || undefined} aria-describedby={invalid ? errorId : undefined}
            onChange={e=>updateField(field,e.target.value)} onBlur={()=>{if(!invalid)setInputs(previous=>{ const next={...previous}; delete next[key]; return next; });}}/>
          {!invalid && !suggestion && key !== 'size' && key in inputs && Math.abs(Number(inputs[key])-normalized[key])>0.005
            && <small className="muted">Deslocamento equivalente na prévia: {rounded(normalized[key])}.</small>}
          {invalid && <small id={errorId} className="map-field-error">Use um número entre {min} e {max}.</small>}
        </label>;
      })}
      <label className="field">Opacidade da grade <input type="range" min="0.05" max="1" step="0.01" value={grid.opacity} onChange={e=>patch({opacity:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={grid.visible} onChange={e=>patch({visible:e.target.checked})}/> Mostrar grade</label>
      <label className="check"><input type="checkbox" checked={grid.snap} onChange={e=>patch({snap:e.target.checked})}/> Encaixar tokens</label>
      </div>
    </details>
  </section>;
}
