// Trabalho configurado pelo mestre: custo e ganho totais de N horas (faixas progressivas: horas 1–4, 5–8 e 9–12).
const num = v => (v === '' || v === null || v === undefined ? 0 : Number(v));

export function jobTotals(cfg, hours) {
  let stamina = 0, mana = 0;
  for (let h = 1; h <= hours; h += 1) {
    const t = h <= 4 ? 0 : h <= 8 ? 1 : 2;
    stamina += num(cfg.staminaTiers?.[t]);
    mana += num(cfg.manaTiers?.[t]);
  }
  return { stamina, mana, pay: hours * num(cfg.pay), xp: hours * num(cfg.xp) };
}
