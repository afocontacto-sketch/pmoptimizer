export type PrintMeta = [label: string, value: string];

export type PrintOptions = {
  title: string;
  docNumber?: string;
  subtitle?: string;
  meta?: PrintMeta[];
  bodyHtml: string;
  orientation?: "portrait" | "landscape";
  user?: string;
};

const LOGO_TIMEOUT_MS = 3000;
const CLEANUP_FALLBACK_MS = 60000;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function htmlTable(
  headers: string[],
  rows: (string | number)[][],
  options: { numericColumns?: number[] } = {},
): string {
  const numeric = new Set(options.numericColumns ?? []);
  const head = headers.map((h, i) => `<th${numeric.has(i) ? ' class="num"' : ""}>${escapeHtml(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c, i) => `<td${numeric.has(i) ? ' class="num"' : ""}>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const baseStyles = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; font-size: 12px; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; }
  .logo { width: 64px; height: 64px; object-fit: contain; }
  .brand { font-weight: 800; font-size: 20px; color: #1e3a8a; }
  .head-text { flex: 1; }
  h1 { margin: 0; font-size: 18px; }
  .sub { color: #4b5563; margin-top: 2px; }
  .docnum { text-align: right; font-weight: 700; font-size: 14px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; margin-bottom: 12px; }
  .meta div span { color: #6b7280; display: block; font-size: 10px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eff6ff; }
  .num { text-align: right; }
  footer { margin-top: 16px; border-top: 1px solid #d1d5db; padding-top: 6px; color: #6b7280; font-size: 10px; display: flex; justify-content: space-between; }
  .page::after { content: counter(page); }
`;

function buildHtml(options: PrintOptions, logoHtml: string): string {
  const { title, docNumber, subtitle, meta = [], bodyHtml, orientation = "portrait", user } = options;
  const issued = new Date().toLocaleString("es-CL");
  const metaHtml = meta.length
    ? `<section class="meta">${meta.map(([l, v]) => `<div><span>${escapeHtml(l)}</span>${escapeHtml(v)}</div>`).join("")}</section>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>@page { size: ${orientation}; margin: 14mm; } ${baseStyles}</style></head><body>
<header>${logoHtml}<div class="head-text"><h1>${escapeHtml(title)}</h1>${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}</div>
<div class="docnum">${docNumber ? `N° ${escapeHtml(docNumber)}<br>` : ""}<span class="sub">Emitido: ${escapeHtml(issued)}${user ? `<br>Usuario: ${escapeHtml(user)}` : ""}</span></div></header>
${metaHtml}${bodyHtml}
<footer><span>Documento interno PMOptimizer</span><span>Página <span class="page"></span></span></footer></body></html>`;
}

function logoUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}logo-pmoptimizer.jpg`;
}

// Comprueba si el logo carga; si no, devuelve el texto de respaldo.
function resolveLogoHtml(): Promise<string> {
  return new Promise((resolve) => {
    const fallback = '<div class="brand">PMOptimizer</div>';
    const image = new Image();
    const timer = window.setTimeout(() => resolve(fallback), LOGO_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(`<img class="logo" src="${escapeHtml(logoUrl())}" alt="PMOptimizer">`);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(fallback);
    };
    image.src = logoUrl();
  });
}

function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const cleanup = () => frame.remove();
  const win = frame.contentWindow;
  if (!win) {
    cleanup();
    throw new Error("No se pudo preparar la impresión.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, CLEANUP_FALLBACK_MS);
  win.focus();
  win.print();
}

export async function printDocument(options: PrintOptions): Promise<void> {
  const logoHtml = await resolveLogoHtml();
  printHtml(buildHtml(options, logoHtml));
}

// Para dashboards con gráficos SVG. Los estilos de emotion no viajan: usar plantillas para tablas.
export async function printElement(
  element: HTMLElement,
  title: string,
  orientation: "portrait" | "landscape" = "landscape",
): Promise<void> {
  await printDocument({ title, bodyHtml: element.outerHTML, orientation });
}
