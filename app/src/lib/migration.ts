import { supabase, COMPANY_ID } from "@/lib/supabase";
import * as XLSX from "xlsx";

// ============================================================================
// OUTIL DE MIGRATION — Import depuis Sage/EBP et fichiers Excel/CSV
// Stratégie de conquête : récupérer les clients des concurrents
// ============================================================================

export type MigrationResult = {
  success: boolean;
  entriesImported: number;
  accountsCreated: number;
  thirdPartiesCreated: number;
  errors: string[];
  warnings: string[];
};

/** Import d'une balance comptable (fichier Excel standard) */
export async function importBalanceFromExcel(file: File): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    entriesImported: 0,
    accountsCreated: 0,
    thirdPartiesCreated: 0,
    errors: [],
    warnings: [],
  };

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    if (rows.length === 0) {
      result.errors.push("Le fichier est vide");
      return result;
    }

    // Colonnes attendues : compte, libelle, debit, credit, (tiers)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const accountCode = String(row["compte"] ?? row["Compte"] ?? row["code"] ?? row["Code"] ?? "").trim();
      const label = String(row["libelle"] ?? row["Libelle"] ?? row["label"] ?? row["Label"] ?? "").trim();
      const debit = parseFloat(String(row["debit"] ?? row["Debit"] ?? "0").replace(",", "."));
      const credit = parseFloat(String(row["credit"] ?? row["Credit"] ?? "0").replace(",", "."));
      const thirdPartyName = String(row["tiers"] ?? row["Tiers"] ?? row["client"] ?? row["Client"] ?? "").trim();

      if (!accountCode) {
        result.warnings.push(`Ligne ${i + 1} : code compte vide, ignorée`);
        continue;
      }

      // Vérifie que le compte existe dans le plan comptable
      const { data: existingAccount } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("code", accountCode)
        .maybeSingle();

      if (!existingAccount) {
        // Crée le compte s'il n'existe pas
        const classNum = parseInt(accountCode.charAt(0));
        const accountType = classNum <= 5 ? (classNum <= 2 ? "actif" : classNum <= 4 ? "passif" : "actif") : classNum === 6 ? "charge" : "produit";

        await supabase.from("chart_of_accounts").insert({
          company_id: COMPANY_ID,
          code: accountCode,
          label: label || `Compte ${accountCode}`,
          class: classNum,
          account_type: accountType,
        });
        result.accountsCreated++;
      }

      // Gère le tiers si présent
      let thirdPartyId: string | null = null;
      if (thirdPartyName && (accountCode.startsWith("411") || accountCode.startsWith("401"))) {
        const { data: existingTP } = await supabase
          .from("third_parties")
          .select("id")
          .eq("company_id", COMPANY_ID)
          .eq("name", thirdPartyName)
          .maybeSingle();

        if (existingTP) {
          thirdPartyId = existingTP.id;
        } else {
          const { data: newTP } = await supabase
            .from("third_parties")
            .insert({
              company_id: COMPANY_ID,
              type: accountCode.startsWith("411") ? "client" : "fournisseur",
              name: thirdPartyName,
            })
            .select("id")
            .single();

          if (newTP) {
            thirdPartyId = newTP.id;
            result.thirdPartiesCreated++;
          }
        }
      }

      // Crée l'écriture d'ouverture (journal OD)
      const { data: journal } = await supabase
        .from("journals")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("code", "OD")
        .single();

      if (!journal) continue;

      const { data: entry } = await supabase
        .from("entries")
        .insert({
          company_id: COMPANY_ID,
          journal_id: journal.id,
          entry_date: `${new Date().getFullYear()}-01-01`,
          reference: `MIGRATION-${i + 1}`,
          description: `Migration - Solde d'ouverture ${accountCode}`,
          source: "manual",
          status: "validated",
        })
        .select("id")
        .single();

      if (!entry) continue;

      await supabase.from("entry_lines").insert({
        entry_id: entry.id,
        account_code: accountCode,
        third_party_id: thirdPartyId,
        label: label || accountCode,
        debit: debit || 0,
        credit: credit || 0,
      });

      result.entriesImported++;
    }

    result.success = result.errors.length === 0;
  } catch (e) {
    result.errors.push((e as Error).message);
  }

  return result;
}

/** Import depuis un CSV formaté Sage/EBP */
export async function importSageCSV(content: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    entriesImported: 0,
    accountsCreated: 0,
    thirdPartiesCreated: 0,
    errors: [],
    warnings: [],
  };

  try {
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      result.errors.push("Fichier CSV vide ou invalide");
      return result;
    }

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 4) continue;

      const accountCode = cols[0];
      const label = cols[1];
      const debit = parseFloat(cols[2].replace(",", ".")) || 0;
      const credit = parseFloat(cols[3].replace(",", ".")) || 0;
      const thirdPartyName = cols[4] ?? "";

      // Même logique que importBalanceFromExcel (compte, écriture, tiers)
      const { data: existingAccount } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("code", accountCode)
        .maybeSingle();

      if (!existingAccount) {
        const classNum = parseInt(accountCode.charAt(0));
        const accountType = classNum <= 5 ? (classNum <= 2 ? "actif" : classNum <= 4 ? "passif" : "actif") : classNum === 6 ? "charge" : "produit";

        await supabase.from("chart_of_accounts").insert({
          company_id: COMPANY_ID,
          code: accountCode,
          label: label || `Compte ${accountCode}`,
          class: classNum,
          account_type: accountType,
        });
        result.accountsCreated++;
      }

      const { data: journal } = await supabase
        .from("journals")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("code", "OD")
        .single();

      if (!journal) continue;

      const { data: entry } = await supabase
        .from("entries")
        .insert({
          company_id: COMPANY_ID,
          journal_id: journal.id,
          entry_date: `${new Date().getFullYear()}-01-01`,
          reference: `SAGE-${i}`,
          description: `Migration Sage - ${label}`,
          source: "manual",
          status: "validated",
        })
        .select("id")
        .single();

      if (!entry) continue;

      await supabase.from("entry_lines").insert({
        entry_id: entry.id,
        account_code: accountCode,
        label: label || accountCode,
        debit,
        credit,
      });

      result.entriesImported++;
    }

    result.success = result.errors.length === 0;
  } catch (e) {
    result.errors.push((e as Error).message);
  }

  return result;
}

/** Vérifie que la balance importée est équilibrée */
export function checkBalanceEquilibrium(rows: Array<{ debit: number; credit: number }>): { balanced: boolean; totalDebit: number; totalCredit: number; diff: number } {
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return {
    balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    totalDebit,
    totalCredit,
    diff: totalDebit - totalCredit,
  };
}