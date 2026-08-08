export type ParsedBankRow = {
  bank_date: string; // yyyy-mm-dd
  label: string;
  amount: number;
};

function parseDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const eu = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (eu) {
    const [, d, m, y] = eu;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/,(\d{2})$/, ".$1").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Parse un CSV bancaire simple : colonnes date, libellé, montant (positif = entrée, négatif = sortie). */
export function parseBankCsv(text: string): { rows: ParsedBankRow[]; errors: string[] } {
  const delimiter = text.split("\n")[0].includes(";") ? ";" : ",";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];

  lines.forEach((line, i) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) return;

    const bank_date = parseDate(cols[0]);
    const amount = parseAmount(cols[2]);

    if (!bank_date || amount === null) {
      if (i > 0) errors.push(`Ligne ${i + 1} ignorée (format non reconnu) : ${line}`);
      return; // first line is likely a header
    }

    rows.push({ bank_date, label: cols[1], amount });
  });

  return { rows, errors };
}
