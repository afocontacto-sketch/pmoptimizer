import { describe, expect, test } from "vitest";
import { buildCsv, csvCell, parseCsvRow } from "../src/data/csv";
import { escapeHtml, htmlTable } from "../src/components/print/printDocument";
import { genericReportDoc } from "../src/components/print/printTemplates";

describe("csv", () => {
  test("escapa comillas, separador y saltos", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a;b", ";")).toBe('"a;b"');
    expect(csvCell("a,b", ";")).toBe("a,b");
  });
  test("ida y vuelta", () => {
    const line = buildCsv(["x"], [['uno, "dos"', 3]]).split("\r\n")[1];
    expect(parseCsvRow(line)).toEqual(['uno, "dos"', "3"]);
  });
  test("comilla sin cerrar lanza error", () => {
    expect(() => parseCsvRow('"abc')).toThrow();
  });
});

describe("impresión", () => {
  test("escapeHtml neutraliza etiquetas", () => {
    expect(escapeHtml("<b>&\"'")).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
  test("htmlTable alinea numéricos y escapa", () => {
    const html = htmlTable(["A", "B"], [["<x>", 1]], { numericColumns: [1] });
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain('<td class="num">1</td>');
  });
  test("genericReportDoc", () => {
    expect(genericReportDoc({ title: "T", headers: ["A"], rows: [] }).bodyHtml).toContain("Sin datos");
    expect(genericReportDoc({ title: "T", headers: ["A"], rows: [["1"]] }).bodyHtml).toContain("<table>");
  });
});
