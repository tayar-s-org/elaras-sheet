// Mesa escolhida na ficha: a preferida só vale se ainda existe na lista da ficha atual; senão, a primeira.
export const pickTable = (tables, preferredId) => tables.find(t => t.id === preferredId) || tables[0] || null;
