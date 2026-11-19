import React, { useEffect, useId, useRef, useState } from 'react';
import { boardGrid, detectGrid, fitCalibration, gridLines } from '../../boardGrid.js';

export default function MapCalibration({ image, size, grid, setGrid, onPendingSuggestion, onInvalidFields }) {
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState(null);
  const [inputs, setInputs] = useState({});
  const hintId = useId();
  const [picking, setPicking] = useState(false);
  const [points, setPoints] = useState([]);
  const [columns, setColumns] = useState(1);
  const [rows, setRows] = useState(1);
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
    setPoints(previous => previous.length === 2 ? [point] : [...previous,point]);
    setCursor(point);
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

  function calibrate() {
    if (points.length !== 2) return;
    const fit = fitCalibration(points[0],points[1],columns,rows);
    if (!fit) {
      setNotice('Marque dois cantos diferentes e use uma célula entre 20 e 400 unidades.');
      return;
    }
    const { uneven, ...values } = fit;
    setSuggestion(values);
    setPicking(false);
    setNotice(uneven ? 'As medidas dos eixos diferem. Confira a prévia e refine o ajuste manualmente.' : 'Sugestão calculada. Confira as linhas antes de usar.');
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
    <div className="tabs-row">
      <button type="button" className="outline" disabled={!image || Boolean(suggestion)} onClick={detect}>Detectar grade</button>
      <button type="button" className="outline" disabled={Boolean(suggestion)} aria-pressed={picking} onClick={() => {
        setPicking(!picking);
        setPoints([]);
        setNotice('');
        setCursor({x:width/2,y:height/2});
      }}>{picking ? 'Cancelar marcação' : 'Marcar cantos'}</button>
      <label className="map-zoom">Zoom <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Mapa inteiro</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
    </div>
    {picking && <p id={hintId} className="map-calibration-hint">Marque dois cantos opostos. Com teclado, use as setas (Shift para mover mais rápido) e Enter para marcar.</p>}
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
        {picking && cursor && <g stroke="#ffcf63" strokeWidth="3">
          <line x1={0} x2={width} y1={cursor.y} y2={cursor.y} vectorEffect="non-scaling-stroke"/>
          <line x1={cursor.x} x2={cursor.x} y1={0} y2={height} vectorEffect="non-scaling-stroke"/>
        </g>}
        {picking && points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={Math.max(width,height)/140} fill="#ffcf63" stroke="#191923" strokeWidth={3}/>)}
      </svg>
    </div>
    {picking && <div className="map-fields">
      <p role="status">{points.length}/2 cantos marcados</p>
      <label className="field">Colunas <input type="number" min="1" max="100" value={columns} onChange={e=>setColumns(Math.max(1,Math.min(100,Math.trunc(Number(e.target.value))||1)))} /></label>
      <label className="field">Linhas <input type="number" min="1" max="100" value={rows} onChange={e=>setRows(Math.max(1,Math.min(100,Math.trunc(Number(e.target.value))||1)))} /></label>
      <button type="button" className="outline" disabled={points.length!==2} onClick={calibrate}>Calcular ajuste</button>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {suggestion && <div className="map-suggestion callout">
      <p>Na prévia: célula {rounded(displayed.size)}, deslocamento {rounded(displayed.x)} × {rounded(displayed.y)}.</p>
      <div className="tabs-row">
        <button type="button" className="primary" onClick={() => {
          patch(suggestion); setInputs({}); setSuggestion(null); setNotice('Valores aceitos na prévia. Aplique no tabuleiro ou salve na biblioteca para gravar.');
        }}>Usar na prévia</button>
        <button type="button" className="outline" onClick={() => { setSuggestion(null); setNotice('Sugestão descartada.'); }}>Descartar sugestão</button>
      </div>
    </div>}
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
  </section>;
}
