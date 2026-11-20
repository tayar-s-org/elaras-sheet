import { callIdempotent } from '../../../lib/masterHub.js';

// Condições de um personagem por diferença (migração 0046): o servidor aplica add/remove sobre a lista que está no banco, sob trava,
// então duas abas do mestre nunca apagam a condição uma da outra. `remove` leva ids de condições.
export const changeConditions = ({ tableId, characterId, add = [], remove = [], note = '', requestId }) =>
  callIdempotent('gm_conditions_delta', { p_table: tableId, p_request_id: requestId, p_character: characterId, p_add: add, p_remove: remove, p_note: note });
