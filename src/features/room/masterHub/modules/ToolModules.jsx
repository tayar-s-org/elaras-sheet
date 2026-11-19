import React from 'react';
import { creatureOf } from '../../../../creature.js';
import { SoundPads } from '../../SoundBar.jsx';

// Módulos que só abrem as ferramentas REAIS do tabuleiro (os mesmos modais de antes: criador de criaturas, predefinições, gerenciador
// de tokens e mapas, música e soundpad). Nada é duplicado: `tools` liga cada botão ao estado que o BoardView já tinha.
const Card = ({ title, text, children }) => <section className="mh-section"><h3>{title}</h3>{text && <p className="muted mh-hint">{text}</p>}<div className="tabs-row">{children}</div></section>;
const Btn = ({ onClick, primary, disabled, children }) => <button type="button" className={primary ? 'primary' : 'outline'} disabled={disabled} onClick={onClick}>{children}</button>;

export function CreaturesModule({ ctx }) {
  const { tools, tokens, closed } = ctx;
  const creatures = tokens.filter(t => !t.character_id && creatureOf(t)).length;
  const pcs = tokens.filter(t => t.character_id).length;
  return <div className="mh-sections">
    <Card title="Criaturas e tokens" text={`${creatures} criatura(s) e ${pcs} token(s) de personagem no mapa.`}>
      <Btn primary disabled={closed} onClick={tools.openCreature}>Nova criatura</Btn>
      <Btn disabled={closed} onClick={tools.openPresets}>Predefinições</Btn>
      <Btn disabled={closed} onClick={tools.openTokens}>Gerenciar tokens e marcadores</Btn>
    </Card>
  </div>;
}

export function MapsModule({ ctx }) {
  const { tools, board, closed } = ctx;
  return <div className="mh-sections">
    <Card title="Mapas" text={`Mapa atual: ${board?.map_path ? 'imagem do tabuleiro' : 'sem imagem (grade em branco)'}. Gerar, importar ou trocar o cenário abre o gerenciador de mapas.`}>
      <Btn primary disabled={closed} onClick={() => tools.openMapTools('generate')}>Gerar mapa</Btn>
      <Btn disabled={closed} onClick={() => tools.openMapTools('library')}>Biblioteca de mapas</Btn>
      <Btn disabled={closed} onClick={() => tools.openMapTools('import')}>Importar imagem</Btn>
      <Btn disabled={closed} onClick={tools.openTokens}>Mapa e tokens</Btn>
    </Card>
  </div>;
}

export function MusicModule({ ctx }) {
  const { tools, board, closed } = ctx;
  const music = board?.settings?.music;
  return <div className="mh-sections">
    <Card title="Música da mesa" text={music ? `Tocando agora: ${music.name}.` : 'Nenhuma música escolhida.'}>
      <Btn primary disabled={closed} onClick={tools.openMusic}>Abrir música</Btn>
    </Card>
  </div>;
}

export function SoundpadModule({ ctx }) {
  const { tools, pad, closed } = ctx;
  return <div className="mh-sections">
    <section className="mh-section">
      <h3>Soundpad</h3>
      <p className="muted mh-hint">Toque os efeitos para todos da mesa. Cada jogador ouve no próprio volume. ↻ marca ambientes em repetição: clique de novo para parar.</p>
      {pad?.sounds?.length ? <SoundPads pad={pad} /> : <p className="muted">Nenhum som disponível.</p>}
      <div className="tabs-row">
        <Btn disabled={closed} onClick={tools.openSound}>Gerenciar sons (adicionar, renomear, apagar)</Btn>
      </div>
    </section>
  </div>;
}
