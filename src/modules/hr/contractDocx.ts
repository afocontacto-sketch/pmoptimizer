import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import type { Role } from "../../app/roles";
import { fail, ok } from "../../data/result";
import type { Result } from "../../data/result";
import { addEmployeeDocument } from "./employeeDocuments";
import type { EmployeeDocument } from "./employeeDocuments";
import { generateContractText } from "./contractTemplate";
import type { ContractInput } from "./contractTemplate";

export type DocBlock = { text: string; kind: "title" | "heading" | "body" | "line" };

// Convierte el texto renderizado en bloques: une las líneas de un mismo párrafo (la plantilla viene cortada a ~100 columnas).
export function contractBlocks(text: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  let open = false, signature = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { open = false; continue; }
    if (line.startsWith("___")) signature = true;
    if (signature) { blocks.push({ text: raw.replace(/\s+$/, ""), kind: "line" }); open = false; continue; }
    if (/^\s{10,}/.test(raw)) { blocks.push({ text: line, kind: "title" }); open = false; continue; }
    if (/^[A-ZÁÉÍÓÚÑ]+( BIS)?: [A-ZÁÉÍÓÚÑ]{3,}/.test(line)) { blocks.push({ text: line, kind: "heading" }); open = false; continue; }
    if (open && !/^([a-e]\)|- |\d+\. )/.test(line)) blocks[blocks.length - 1].text += ` ${line}`;
    else { blocks.push({ text: line, kind: "body" }); open = true; }
  }
  return blocks;
}

export async function contractDocxBase64(text: string): Promise<string> {
  const children = contractBlocks(text).map((block) => new Paragraph({
    alignment: block.kind === "title" ? AlignmentType.CENTER : block.kind === "body" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { after: block.kind === "line" ? 0 : 160 },
    children: [new TextRun({ text: block.text, bold: block.kind === "title" || block.kind === "heading", font: "Arial", size: 22 })],
  }));
  return Packer.toBase64String(new Document({ sections: [{ children }] }));
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Valida, genera el .docx y lo guarda en la carpeta del trabajador como "Contrato (borrador)".
export async function createContractDraft(
  input: ContractInput, actor: { user: string; role: Role },
): Promise<Result<{ document: EmployeeDocument; warnings: string[] }>> {
  const generated = generateContractText(input);
  if (!generated.ok) return fail(generated.error);
  const base64 = await contractDocxBase64(generated.value.text);
  const safeName = input.employee.name.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  const saved = addEmployeeDocument({
    employeeId: input.employee.id, type: "Contrato", name: "Contrato (borrador)", date: input.today,
    fileName: `contrato-borrador-${safeName}.docx`, size: Math.floor(base64.length * 3 / 4), dataUrl: `data:${DOCX_MIME};base64,${base64}`,
  }, actor, true);
  if (!saved.ok) return fail(saved.error);
  return ok({ document: saved.value, warnings: generated.value.warnings });
}
