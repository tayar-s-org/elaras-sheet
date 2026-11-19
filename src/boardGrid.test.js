import test from 'node:test';
import assert from 'node:assert/strict';
import { boardGrid, detectGrid, fitCalibration, gridLines, snapToGrid, snapInsideGrid } from './boardGrid.js';

function sample(lines) {
  const width=420,height=300,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    data.fill(lines(x,y)?10:210,i,i+3);
    data[i+3]=255;
  }
  return {data,width,height};
}

test('grade legada mantém encaixe ligado à visibilidade e grade calibrada usa a mesma origem para desenhar e mover',()=>{
  assert.equal(boardGrid({visible:false}).snap,false);
  const grid=boardGrid({size:40,x:-7,y:12,visible:false,snap:true});
  assert.equal(grid.snap,true);
  assert.deepEqual(gridLines(120,grid.size,grid.x),[33,73,113]);
  assert.equal(snapToGrid(80,grid.size,grid.x),93);
  assert.equal(snapToGrid(13,grid.size,grid.y),32);
  assert.equal(snapInsideGrid(0,40,12,20,130),32);
  assert.equal(snapInsideGrid(130,40,12,20,130),72);
});

test('calibração por cantos soluciona tamanho e origem e informa diferenças entre os eixos',()=>{
  assert.deepEqual(fitCalibration({x:95,y:134},{x:15,y:14},2,3),{size:40,x:15,y:14,uneven:false});
  assert.equal(fitCalibration({x:15,y:14},{x:95,y:134},2,2).uneven,true);
});

test('detector encontra grade deslocada e rejeita imagem uniforme, linhas inclinadas e células retangulares',()=>{
  const fit=image=>detectGrid(image,image.width,image.height);
  assert.deepEqual(fit(sample((x,y)=>x%40===9||y%40===13)),{size:40,x:9,y:13});
  assert.deepEqual(fit(sample((x,y)=>(x%40===9 && y%20<15)||(y%40===13 && x%20<15))),{size:40,x:9,y:13});
  assert.equal(fit(sample(()=>false)),null);
  assert.equal(fit(sample((x,y)=>(x+Math.floor(y/3))%40===9||(y+Math.floor(x/3))%40===13)),null);
  assert.equal(fit(sample((x,y)=>x%40===9||y%60===13)),null);
});
