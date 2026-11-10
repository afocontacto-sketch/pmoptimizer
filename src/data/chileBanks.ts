// Instituciones que reciben transferencias en Chile. Archivo de datos editable.
// Fuente bancos: CMF, "Bancos" https://www.cmfchile.cl/portal/principal/623/w4-article-47003.html (consultada 2026-11-10).
// Fuente cooperativas y cuentas digitales: codigo institucional CMF segun https://boufin.com/recursos/guias/codigos-de-bancos-chile/ (act. 2026-10-26).
// Banco Security (049) se excluye: la CMF lo fusiona en Banco BICE (Res. Ex. N.10940, 20-oct-2025).
export type BankGroup = "Bancos" | "Cooperativas y cuentas digitales";

export type BankEntry = { code: string; name: string; group: BankGroup };

export const chileBanks: readonly BankEntry[] = [
  { code: "001", name: "Banco de Chile", group: "Bancos" },
  { code: "009", name: "Banco Internacional", group: "Bancos" },
  { code: "012", name: "BancoEstado", group: "Bancos" },
  { code: "014", name: "Scotiabank Chile", group: "Bancos" },
  { code: "016", name: "BCI (Banco de Crédito e Inversiones)", group: "Bancos" },
  { code: "028", name: "Banco BICE", group: "Bancos" },
  { code: "031", name: "HSBC Bank (Chile)", group: "Bancos" },
  { code: "037", name: "Banco Santander-Chile", group: "Bancos" },
  { code: "039", name: "Banco Itaú Chile", group: "Bancos" },
  { code: "041", name: "JP Morgan Chase Bank, N. A.", group: "Bancos" },
  { code: "051", name: "Banco Falabella", group: "Bancos" },
  { code: "053", name: "Banco Ripley", group: "Bancos" },
  { code: "055", name: "Banco Consorcio", group: "Bancos" },
  { code: "059", name: "Banco BTG Pactual Chile", group: "Bancos" },
  { code: "060", name: "China Construction Bank, Agencia en Chile", group: "Bancos" },
  { code: "061", name: "Bank of China, Agencia en Chile", group: "Bancos" },
  { code: "062", name: "Tanner Banco Digital", group: "Bancos" },
  { code: "063", name: "Tenpo Bank Chile", group: "Bancos" },
  { code: "672", name: "Coopeuch", group: "Cooperativas y cuentas digitales" },
  { code: "729", name: "Prepago Los Héroes", group: "Cooperativas y cuentas digitales" },
  { code: "730", name: "Tenpo Payments (Tenpo prepago)", group: "Cooperativas y cuentas digitales" },
  { code: "875", name: "Mercado Pago", group: "Cooperativas y cuentas digitales" },
];

export const bankLabel = (code: string): string => {
  const entry = chileBanks.find((bank) => bank.code === code);
  return entry ? `${entry.code} ${entry.name}` : code;
};
