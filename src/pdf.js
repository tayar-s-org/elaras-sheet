import { equipmentText } from "./market/inventory.js";
import { racialSummary } from "./templates.js";
import { jsPDF } from "jspdf";
import { ATTRIBUTES, calculate, validateCharacter } from "./rules.js";

function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createPdfBlob(character) {
  const c = validateCharacter(character);
  const d = calculate(c);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const clean = (text) =>
    String(text ?? "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/−/g, "-")
      .replace(/→/g, ">")
      .replace(/·/g, "|");
  let y = 18;
  let page = 1;
  function header() {
    pdf.setFillColor(25, 47, 43);
    pdf.rect(0, 0, 210, 35, "F");
    pdf.setTextColor(255, 251, 238);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    const title = clean(c.name || "Personagem sem nome");
    pdf.text(pdf.splitTextToSize(title, 176).slice(0, 1), 17, 17);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(
      pdf
        .splitTextToSize(
          clean(`${c.race} | ${c.concept || "Aventureiro de Manrakora"}`),
          176,
        )
        .slice(0, 1),
      17,
      26,
    );
    pdf.setTextColor(35, 48, 44);
    y = 45;
  }
  function footer() {
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(
      `Crônicas de Manrakora | Ficha editável no aplicativo | ${page}`,
      17,
      289,
    );
    pdf.setTextColor(35, 48, 44);
  }
  function line(text, size = 10, bold = false) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(clean(text), 176);
    for (const item of lines) {
      if (y > 275) {
        footer();
        pdf.addPage();
        page += 1;
        header();
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
      }
      pdf.text(item, 17, y);
      y += size * 0.45 + 1;
    }
  }
  function section(title) {
    y += 3;
    line(title.toUpperCase(), 11, true);
    y += 1;
  }
  header();
  line(`Jogador: ${c.player || "—"} | Origem: ${c.village || "—"}`);
  line(`Conceito: ${c.concept || "—"}`);
  if (c.raceId) {
    section("Traços raciais");
    line(racialSummary(c));
    line(`Carisma racial ${d.charisma} | Benes raciais extras ${d.racial.benes} | Bônus racial Perceber +${d.racial.notice} | Escalar +${d.racial.climb}`);
  }
  section("Atributos");
  line(ATTRIBUTES.map((name) => `${name} d${c.attributes[name]}`).join(" | "));
  section("Valores derivados");
  line(
    `Vida ${d.life} | Stamina ${d.stamina} | Mana ${d.mana} | Movimentação ${d.movement}`,
  );
  line(
    `Aparar ${d.parry} | Resistência ${d.toughness} | Armadura incluída ${c.armor}`,
  );
  section("Perícias");
  if (c.dice.weaponDie) line(`Arma para comandos Discord: ${c.dice.weaponName || '-'} | ${c.dice.weaponCount}d${c.dice.weaponDie} | Modificador fixo: ${c.dice.damageBonus}`);
  line(
    Object.entries(c.skills)
      .filter(([, die]) => die)
      .map(([name, die]) => `${name} d${die}`)
      .join(" | ") || "Nenhuma perícia escolhida.",
  );
  section("Vantagens");
  for (const x of c.advantages)
    line(
      `${x.name || "Sem nome"}${x.power ? " (vantagem de poder)" : ""}${x.description ? " — " + x.description : ""}`,
    );
  if (!c.advantages.length) line("Nenhuma registrada.");
  section("Desvantagens");
  for (const x of c.hindrances)
    line(
      `${x.name || "Sem nome"} (${x.severity})${x.description ? " — " + x.description : ""}`,
    );
  if (!c.hindrances.length) line("Nenhuma registrada.");
  section("Poderes e canções");
  for (const x of c.powers)
    line(
      `${x.name || "Sem nome"} | Custo: ${x.cost || "a definir"}${x.description ? "\n" + x.description : ""}${(x.upgrades || []).map(u => `\nMelhoria ${u.n}: ${u.description}`).join("")}`,
    );
  if (!c.powers.length) line("Nenhum registrado.");
  for (const [title, text] of [
    ["Equipamento", equipmentText(c)],
    ["História", c.history],
    ["Anotações", c.notes],
  ]) {
    if (text) {
      section(title);
      line(text);
    }
  }
  line(`XP: ${c.xp} | Nível: ${d.level} | Pontos de progressão: +${d.progressionPoints}`);
  line(`Dinheiro: $${c.money}`);
  section("Conferência de pontos");
  line(
    `Atributos ${d.attributeCost} | Perícias ${d.skillCost} | Vantagens ${d.advantageCost} | Outros ${c.rules.spentElsewhere}`,
  );
  line(
    `Pontos iniciais: ${c.rules.budget === "" ? 30 : c.rules.budget} | Extras: ${d.extra} | Gastos: ${d.spent} | Saldo: ${d.remaining ?? "a definir"}`,
  );
  line(
    `Agilidade racial d6: ${c.rules.racialAgility ? "aplicada" : "não aplicada"}. Ajustes manuais constam nos dados editáveis do PDF.`,
    9,
  );
  line(
    "Revisar com o mestre o orçamento, os pré-requisitos, o acesso aos poderes e a aplicação do dano à vida.",
    9,
  );
  footer();
  // A PDF comment preserves the complete editable state without changing rendered pages.
  const bytes = pdf.output("arraybuffer");
  const marker = `\n%MANRAKORA-V1:${encode(JSON.stringify(c))}\n`;
  const blob = new Blob([bytes, marker], { type: "application/pdf" });
  return blob;
}

export function exportPdf(character) {
  const c = validateCharacter(character);
  const blob = createPdfBlob(c);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(c.name || "personagem")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 70)}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function importPdf(file) {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Selecione uma ficha de até 15 MB.");
  const content = await file.text();
  if (!content.startsWith("%PDF-"))
    throw new Error("O arquivo selecionado precisa ser um PDF.");
  const match = content.match(/%MANRAKORA-V1:([A-Za-z0-9+/=]+)/);
  if (!match)
    throw new Error(
      "Este PDF não contém uma ficha editável deste aplicativo. Abra o PDF original exportado pelo botão Salvar PDF.",
    );
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    return validateCharacter(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error(
      "Os dados da ficha estão danificados ou usam um formato incompatível.",
    );
  }
}
