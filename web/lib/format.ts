export function money(v: string | number | null | undefined, cents = false): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  const hasCents = cents || Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 });
}

export function pct(v: string | number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(Number(v) * 100).toFixed(digits)}%`;
}

export function ratio(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(2)}x`;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  loan_request: "Loan request",
  rent_roll: "Rent roll",
  operating_statement: "Operating statement",
  appraisal: "Appraisal",
  ownership_certification: "Ownership certification",
  operating_agreement: "Operating agreement",
  pfs: "Personal financial statement",
  irs_8825: "Form 8825",
  irs_4562: "Form 4562",
};

export function shortTitle(title: string): string {
  return title.replace(/ - (Cedar Row Apartments|Cedar Row Holdings LLC|Birchview Flats|Northgate Birchview LLC)$/, "");
}

export const FIELD_LABEL: Record<string, string> = {
  gross_rents: "Gross rents", other_income: "Other income", total_income: "Total income", advertising: "Advertising",
  cleaning_maintenance: "Cleaning", insurance: "Insurance", legal_professional: "Legal", re_taxes: "Real estate taxes",
  repairs: "Repairs", utilities: "Utilities", management: "Management", other_expenses: "Other expenses", total_opex: "Total expenses",
  noi: "NOI", interest: "Interest", depreciation: "Depreciation", amortization: "Amortization", net_income: "Net income",
  other_deductions: "Other deductions", total_expenses: "Total expenses", pct: "Ownership %", name: "Name", ssn: "SSN",
  rent: "Rent", tenant: "Tenant", unit: "Unit", dob: "Date of birth", loan_amount: "Loan amount", value: "Value",
};
