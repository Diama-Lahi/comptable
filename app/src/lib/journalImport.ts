import { supabase, COMPANY_ID } from "@/lib/supabase";
import { assertPeriodOpen } from "@/lib/closing";

export type ImportedLine = {
  rowIndex: number;
  date: string;
  journalCode: string;
  reference: string;
  accountCode: string;
  label: string;
  debit: number;
  credit: number;
};

export type ImportedEntryGroup = {
  key: string;
  date: string;
  journalCode: string;
  reference: string;
  lines: ImportedLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};

const HEADER_ALIASES: Record<keyof Omit<ImportedLine, "rowIndex" | "debit" | "credit">, string[]> = {
  date: ["date"],
  journalCode: ["journal", "code journal", "journal code"],
  reference: ["référence", "reference", "ref", "n° pièce", "piece", "n° piece"],
  accountCode: ["compte", "code compte", "n° compte", "numero compte", "numéro compte", "compte syscohada"],
  label: ["libellé", "libelle", "description", "intitulé"],
};

function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // enlève les accents pour comparer
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);
  return normalizedHeaders.findIndex((h) => normalizedAliases.includes(h));
}

function excelDateToIso(value: unknown): string {
  if (typeof value === "string") {
    // déjà au format texte — on tente ISO ou jj/mm/aaaa
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return value.slice(0, 10);
    const fr = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (fr) {
      const year = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
      return `${year}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
    }
    return value;
  }
  if (typeof value === "number") {
    // numéro de série Excel (jours depuis 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  return "";
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[  ]/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export type ParsedJournalImport = {
  groups: ImportedEntryGroup[];
  errors: string[];
};

/** Parse un classeur Excel (une ligne = une ligne d'écriture) en écritures groupées par date+journal+référence. */
export async function parseJournalExcel(file: File): Promise<ParsedJournalImport> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const errors: string[] = [];
  if (rows.length < 2) {
    return { groups: [], errors: ["Le fichier ne contient aucune ligne de données."] };
  }

  const headers = (rows[0] as unknown[]).map(String);
  const col = {
    date: findColumn(headers, HEADER_ALIASES.date),
    journalCode: findColumn(headers, HEADER_ALIASES.journalCode),
    reference: findColumn(headers, HEADER_ALIASES.reference),
    accountCode: findColumn(headers, HEADER_ALIASES.accountCode),
    label: findColumn(headers, HEADER_ALIASES.label),
  };

  const missing = Object.entries(col)
    .filter(([, idx]) => idx === -1)
    .map(([key]) => key);
  // Référence et libellé sont optionnels ; date, journal et compte sont indispensables.
  const missingRequired = missing.filter((m) => m === "date" || m === "journalCode" || m === "accountCode");
  if (missingRequired.length > 0) {
    return {
      groups: [],
      errors: [
        `Colonnes obligatoires introuvables : ${missingRequired.join(", ")}. Colonnes attendues : Date, Journal, Compte, Débit, Crédit (Référence et Libellé optionnels).`,
      ],
    };
  }

  // Débit / Crédit : recherche insensible à la casse/accents, pas de synonymes multiples nécessaires.
  const debitIdx = headers.findIndex((h) => normalizeHeader(h) === "debit");
  const creditIdx = headers.findIndex((h) => normalizeHeader(h) === "credit");
  if (debitIdx === -1 || creditIdx === -1) {
    return { groups: [], errors: ["Colonnes \"Débit\" et \"Crédit\" introuvables."] };
  }

  const lines: ImportedLine[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === undefined || c === "")) continue; // ligne vide

    const date = excelDateToIso(row[col.date]);
    const journalCode = String(row[col.journalCode] ?? "").trim().toUpperCase();
    const accountCode = String(row[col.accountCode] ?? "").trim();
    const reference = col.reference !== -1 ? String(row[col.reference] ?? "").trim() : "";
    const label = col.label !== -1 ? String(row[col.label] ?? "").trim() : "";
    const debit = parseNumber(row[debitIdx]);
    const credit = parseNumber(row[creditIdx]);

    if (!date || !journalCode || !accountCode) {
      errors.push(`Ligne ${i + 1} : date, journal ou compte manquant — ignorée.`);
      continue;
    }
    if (debit === 0 && credit === 0) {
      errors.push(`Ligne ${i + 1} : ni débit ni crédit renseigné — ignorée.`);
      continue;
    }

    lines.push({ rowIndex: i + 1, date, journalCode, reference, accountCode, label, debit, credit });
  }

  // Regroupement en écritures : même date + journal + référence = une seule écriture.
  // Sans référence, chaque ligne devient sa propre écriture (à équilibrer elle-même,
  // donc soit débit=crédit sur une seule ligne — rare —, soit une erreur signalée).
  const groupMap = new Map<string, ImportedLine[]>();
  lines.forEach((l, idx) => {
    const key = l.reference ? `${l.date}|${l.journalCode}|${l.reference}` : `__single__${idx}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(l);
    groupMap.set(key, arr);
  });

  const groups: ImportedEntryGroup[] = Array.from(groupMap.entries()).map(([key, groupLines]) => {
    const totalDebit = Math.round(groupLines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
    const totalCredit = Math.round(groupLines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
    return {
      key,
      date: groupLines[0].date,
      journalCode: groupLines[0].journalCode,
      reference: groupLines[0].reference,
      lines: groupLines,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  });

  groups
    .filter((g) => !g.balanced)
    .forEach((g) =>
      errors.push(
        `Écriture ${g.reference || `ligne ${g.lines[0].rowIndex}`} (${g.date}) déséquilibrée : débit ${g.totalDebit} ≠ crédit ${g.totalCredit}.`
      )
    );

  return { groups, errors };
}

export type ImportResult = { imported: number; skippedDuplicates: number; failed: string[] };

/**
 * Importe les écritures équilibrées (les autres doivent être corrigées dans le fichier avant réimport).
 * Ignore une écriture si une entrée existante partage déjà journal + date + référence (évite les doublons
 * en cas de réimport du même fichier).
 */
export async function importJournalGroups(
  groups: ImportedEntryGroup[],
  journalCodeToId: Map<string, string>,
  validAccountCodes: Set<string>
): Promise<ImportResult> {
  let imported = 0;
  let skippedDuplicates = 0;
  const failed: string[] = [];

  for (const group of groups.filter((g) => g.balanced)) {
    const label = `${group.reference || group.lines[0].rowIndex} (${group.date})`;
    const journalId = journalCodeToId.get(group.journalCode);
    if (!journalId) {
      failed.push(`${label} : journal "${group.journalCode}" introuvable.`);
      continue;
    }
    const unknownAccounts = group.lines.filter((l) => !validAccountCodes.has(l.accountCode));
    if (unknownAccounts.length > 0) {
      failed.push(`${label} : compte(s) inconnu(s) — ${unknownAccounts.map((l) => l.accountCode).join(", ")}.`);
      continue;
    }

    try {
      await assertPeriodOpen(group.date);
    } catch (err) {
      failed.push(`${label} : ${err instanceof Error ? err.message : "période clôturée"}.`);
      continue;
    }

    if (group.reference) {
      const { data: existing } = await supabase
        .from("entries")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("journal_id", journalId)
        .eq("entry_date", group.date)
        .eq("reference", group.reference)
        .maybeSingle();
      if (existing) {
        skippedDuplicates++;
        continue;
      }
    }

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .insert({
        company_id: COMPANY_ID,
        journal_id: journalId,
        entry_date: group.date,
        reference: group.reference || null,
        description: group.lines.find((l) => l.label)?.label ?? null,
        source: "excel_import",
        status: "validated",
      })
      .select("id")
      .single();

    if (entryError || !entry) {
      failed.push(`${label} : ${entryError?.message ?? "échec de création de l'écriture"}.`);
      continue;
    }

    const { error: linesError } = await supabase.from("entry_lines").insert(
      group.lines.map((l) => ({
        entry_id: entry.id,
        account_code: l.accountCode,
        label: l.label || null,
        debit: l.debit,
        credit: l.credit,
      }))
    );

    if (linesError) {
      failed.push(`${label} : ${linesError.message}.`);
      await supabase.from("entries").delete().eq("id", entry.id);
      continue;
    }

    imported++;
  }

  return { imported, skippedDuplicates, failed };
}
