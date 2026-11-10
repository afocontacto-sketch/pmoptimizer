export type CsvValue = string | number;

export function csvCell(value: CsvValue, separator = ","): string {
  const text = String(value);
  const needsQuotes = text.includes('"') || text.includes(separator) || /[\r\n]/.test(text);
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text;
}

export function parseCsvRow(row: string, separator = ","): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === separator && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar en el archivo CSV.");
  values.push(value);
  return values;
}

export function buildCsv(headers: CsvValue[], rows: CsvValue[][], separator = ","): string {
  return [headers, ...rows].map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join("\r\n");
}

// Descarga con BOM para que Excel respete UTF-8.
export function downloadCsv(filename: string, headers: CsvValue[], rows: CsvValue[][], separator = ","): void {
  const csv = buildCsv(headers, rows, separator);
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTemplate(filename: string, headers: string[], sample: CsvValue[], separator = ","): void {
  downloadCsv(filename, headers, [sample], separator);
}
