import PlayersModule from './modules/PlayersModule.jsx';
import MoneyModule from './modules/MoneyModule.jsx';
import ItemsModule from './modules/ItemsModule.jsx';
import ExperienceModule from './modules/ExperienceModule.jsx';
import ConditionsModule from './modules/ConditionsModule.jsx';
import { CreaturesModule, MapsModule, MusicModule, SoundpadModule } from './modules/ToolModules.jsx';
import HistoryModule from './modules/HistoryModule.jsx';

// Chave do módulo (a lista e a ordem estão em core.js) -> componente. Cada módulo recebe só `{ ctx }` (ver MasterHub.jsx).
// Para adicionar um módulo: uma linha em MASTER_MODULES (core.js) e uma aqui. Guia: src/features/room/masterHub/README.md.
export const MODULE_COMPONENTS = {
  players: PlayersModule,
  money: MoneyModule,
  items: ItemsModule,
  experience: ExperienceModule,
  conditions: ConditionsModule,
  creatures: CreaturesModule,
  maps: MapsModule,
  music: MusicModule,
  soundpad: SoundpadModule,
  history: HistoryModule,
};
