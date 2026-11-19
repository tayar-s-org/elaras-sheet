import React, { useEffect, useRef, useState } from 'react';
import { boardGrid, detectGrid, fitCalibration, gridLines } from '../../boardGrid.js';

export default function MapCalibration({ image, size, grid, setGrid, onPendingSuggestion }) {
  const [zoom, setZoom] = useState(1);
  const [picking, setPicking] = useState(false);
  const [points, setPoints] = useState([]);
  const [columns, setColumns] = useState(1);
  const [rows, setRows] = useState(1);
  const [suggestion, setSuggestion] = useState(null);
  const [notice, setNotice] = useState('');
  const svg = useRef(null);
  const {width,height} = size;
  const normalized = boardGrid(grid);
  const patch = values => { setSuggestion(null); setGrid({ ...grid, ...values }); };
  const displayed = suggestion ? boardGrid({ ...grid, ...suggestion }) : normalized;

  useEffect(() => { onPendingSuggestion(Boolean(suggestion)); return ()=>onPendingSuggestion(false); }, [suggestion,onPendingSuggestion]);
  useEffect(() => { setSuggestion(null); setPoints([]); setPicking(false); setNotice(''); }, [image]);

  function choosePoint(event) {
    if (!picking) return;
    const matrix = svg.current.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) return;
    setPoints(previous => previous.length === 2 ? [point] : [...previous,point]);
  }

  function calibrate() {
    const fit = fitCalibration(points[0],points[1],columns,rows);
    if (!fit) {
      setNotice('Marque dois cantos diferentes e use uma célula entre 20 e 400 unidades.');
      return;
    }
    const { uneven, ...values } = fit;
    setSuggestion(values);
    setNotice(uneven ? 'As medidas dos eixos diferem. Confira a prévia e refine o ajuste manualmente.' : 'Sugestão calculada. Confira as linhas antes de usar.');
  }

  async function detect() {
    setNotice('Analisando imagem…');
    setSuggestion(null);
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
      <button type="button" className="outline" disabled={!image} onClick={detect}>Detectar grade</button>
      <button type="button" className="outline" aria-pressed={picking} onClick={() => { setPicking(!picking); setPoints([]); setSuggestion(null); }}>{picking ? 'Cancelar marcação' : 'Calibrar por cliques'}</button>
      <label>Zoom da prévia <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
    </div>
    {picking && <div className="map-fields">
      <p>Marque dois cantos opostos de um bloco de células e informe o número de linhas e colunas.</p>
      <label className="field">Colunas <input type="number" min="1" max="100" value={columns} onChange={e=>setColumns(Math.max(1,Math.min(100,Math.trunc(Number(e.target.value))||1)))} /></label>
      <label className="field">Linhas <input type="number" min="1" max="100" value={rows} onChange={e=>setRows(Math.max(1,Math.min(100,Math.trunc(Number(e.target.value))||1)))} /></label>
      <button type="button" className="outline" disabled={points.length!==2} onClick={calibrate}>Calcular ajuste</button>
    </div>}
    <div className="map-preview">
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} style={{width:`${zoom*100}%`}} onClick={choosePoint} aria-label="Prévia do mapa e da grade" role="img">
        <rect width={width} height={height} fill="#181824" />
        {image && <image href={image} width={width} height={height} />}
        {(displayed.visible || suggestion || picking) && <g stroke="white" opacity={suggestion || picking ? Math.max(0.35,displayed.opacity) : displayed.opacity}>
          {gridLines(width,displayed.size,displayed.x).map(x=><line key={x} x1={x} x2={x} y1={0} y2={height} vectorEffect="non-scaling-stroke"/>)}
          {gridLines(height,displayed.size,displayed.y).map(y=><line key={y} y1={y} y2={y} x1={0} x2={width} vectorEffect="non-scaling-stroke"/>)}
        </g>}
        {picking && points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={Math.max(width,height)/140} fill="#ffcf63" stroke="#191923" strokeWidth={3}/>)}
      </svg>
    </div>
    {notice && <p role="status">{notice}</p>}
    {suggestion && <div className="tabs-row">
      <button type="button" className="primary" onClick={() => { patch(boardGrid({...grid,...suggestion})); setNotice('Calibração aplicada à prévia.'); setPicking(false); }}>Usar sugestão</button>
      <button type="button" className="outline" onClick={() => { setSuggestion(null); setNotice('Sugestão descartada.'); }}>Descartar sugestão</button>
    </div>}
    <div className="map-fields">
      {[['size','Tamanho da célula',20,400],['x','Deslocamento horizontal',-12000,12000],['y','Deslocamento vertical',-12000,12000]].map(([key,label,min,max]) =>
        <label key={key} className="field">{label}<input type="number" value={grid[key]} step="0.1" min={min} max={max} onChange={e=>patch({[key]:Number(e.target.value)})} /></label>)}
      <label className="field">Opacidade da grade <input type="range" min="0.05" max="1" step="0.01" value={grid.opacity} onChange={e=>patch({opacity:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={grid.visible} onChange={e=>patch({visible:e.target.checked})}/> Mostrar grade</label>
      <label className="check"><input type="checkbox" checked={grid.snap} onChange={e=>patch({snap:e.target.checked})}/> Encaixar tokens</label>
    </div>
  </section>;
}
