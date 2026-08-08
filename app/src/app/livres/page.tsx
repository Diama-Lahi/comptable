"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import {
  computeAccountLedger,
  computeTrialBalance,
  fetchJournalLines,
  type JournalEntryLine,
} from "@/lib/ledger";
import {
  importJournalGroups,
  parseJournalExcel,
  type ImportedEntryGroup,
} from "@/lib/journalImport";

type Journal = { id: string; code: string; label: string };
type Account = { code: string; label: string; account_type: string };

type Tab = "journal" | "grand-livre" | "balance";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function LivresPage() {
  const [tab, setTab] = useState<Tab>("journal");

  const [journals, setJournals] = useState<Journal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalId, setJournalId] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [lines, setLines] = useState<JournalEntryLine[]>([]);
  const [loading, setLoading] = useState(false);

  const [importGroups, setImportGroups] = useState<ImportedEntryGroup[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    supabase
      .from("journals")
      .select("id, code, label")
      .eq("company_id", COMPANY_ID)
      .order("code")
      .then(({ data }) => setJournals(data ?? []));

    supabase
      .from("chart_of_accounts")
      .select("code, label, account_type")
      .eq("company_id", COMPANY_ID)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  const reload = async () => {
    setLoading(true);
    setLines(await fetchJournalLines({ journalId: journalId || undefined, from: from || undefined, to: to || undefined }));
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalId, from, to]);

  const accountLabel = (code: string) => {
    const a = accounts.find((acc) => acc.code === code);
    return a ? `${code} — ${a.label}` : code;
  };

  const handleImportFile = async (file: File) => {
    setImportMsg("");
    setImportGroups([]);
    setImportErrors([]);
    const { groups, errors } = await parseJournalExcel(file);
    setImportGroups(groups);
    setImportErrors(errors);
  };

  const handleConfirmImport = async () => {
    setImportBusy(true);
    setImportMsg("");
    try {
      const journalCodeToId = new Map(journals.map((j) => [j.code, j.id]));
      const validAccountCodes = new Set(accounts.map((a) => a.code));
      const result = await importJournalGroups(importGroups, journalCodeToId, validAccountCodes);
      setImportMsg(
        `${result.imported} écriture(s) importée(s)` +
          (result.skippedDuplicates ? `, ${result.skippedDuplicates} doublon(s) ignoré(s)` : "") +
          (result.failed.length ? `, ${result.failed.length} échec(s)` : "")
      );
      if (result.failed.length) setImportErrors((prev) => [...prev, ...result.failed]);
      setImportGroups([]);
      await reload();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Échec de l'import");
    } finally {
      setImportBusy(false);
    }
  };

  const accountLedger = useMemo(() => {
    if (!accountCode) return [];
    const account = accounts.find((a) => a.code === accountCode);
    if (!account) return [];
    return computeAccountLedger(lines, accountCode, account.account_type);
  }, [lines, accountCode, accounts]);

  const trialBalance = useMemo(() => computeTrialBalance(lines, accounts), [lines, accounts]);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Livres comptables</h1>
        <button
          type="button"
          className="app-badge"
          onClick={() => setShowImport((v) => !v)}
        >
          {showImport ? "Fermer l'import" : "Importer depuis Excel"}
        </button>
      </div>

      {showImport && (
        <div className="app-card px-5 py-4 space-y-3">
          <div className="space-y-1">
            <div className="font-medium text-sm">Import du journal depuis un fichier Excel</div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Colonnes attendues (première ligne = en-têtes) : <code>Date</code>, <code>Journal</code> (code AC/VE/BQ/CA/OD),{" "}
              <code>Compte</code> (code SYSCOHADA), <code>Débit</code>, <code>Crédit</code>, et optionnellement{" "}
              <code>Référence</code> et <code>Libellé</code>. Les lignes partageant la même date + journal +
              référence forment une seule écriture — une écriture doit être équilibrée (débit = crédit) pour être
              importée.
            </p>
          </div>

          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
          />

          {importErrors.length > 0 && (
            <div className="text-xs space-y-0.5" style={{ color: "var(--accent-red)" }}>
              {importErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {importGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">
                {importGroups.filter((g) => g.balanced).length} écriture(s) prête(s) à importer
                {importGroups.some((g) => !g.balanced) &&
                  ` (${importGroups.filter((g) => !g.balanced).length} déséquilibrée(s) ignorée(s))`}
              </p>
              <div className="max-h-52 overflow-auto border rounded text-xs">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <tbody>
                    {importGroups
                      .filter((g) => g.balanced)
                      .flatMap((g) =>
                        g.lines.map((l, i) => (
                          <tr key={`${g.key}-${i}`} className="border-b">
                            <td className="px-2 py-1">{l.date}</td>
                            <td className="px-2 py-1">{l.journalCode}</td>
                            <td className="px-2 py-1">{l.accountCode}</td>
                            <td className="px-2 py-1">{l.label}</td>
                            <td className="px-2 py-1 text-right">{l.debit ? l.debit.toFixed(2) : ""}</td>
                            <td className="px-2 py-1 text-right">{l.credit ? l.credit.toFixed(2) : ""}</td>
                          </tr>
                        ))
                      )}
                  </tbody>
                </table>
                </div>
              </div>
              <button
                onClick={handleConfirmImport}
                disabled={importBusy || importGroups.filter((g) => g.balanced).length === 0}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
              >
                {importBusy ? "Import..." : "Confirmer l'import"}
              </button>
            </div>
          )}

          {importMsg && <p className="text-sm text-green-600">{importMsg}</p>}
        </div>
      )}

      <div className="flex gap-4 border-b text-sm">
        {(["journal", "grand-livre", "balance"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 ${tab === t ? "border-b-2 border-black font-medium" : "text-zinc-500"}`}
          >
            {t === "journal" ? "Journal" : t === "grand-livre" ? "Grand livre" : "Balance"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex flex-col gap-1">
          Journal
          <select className="border rounded px-2 py-1" value={journalId} onChange={(e) => setJournalId(e.target.value)}>
            <option value="">Tous</option>
            {journals.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Du
          <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          Au
          <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {tab === "grand-livre" && (
          <label className="flex flex-col gap-1">
            Compte
            <select
              className="border rounded px-2 py-1"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading && <p className="text-sm text-zinc-500">Chargement…</p>}

      {!loading && tab === "journal" && (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {lines.length} ligne(s) — journal complet (aucun filtre appliqué par défaut), numéro de compte SYSCOHADA
            et libellé affichés pour chaque ligne.
          </p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Date</th>
                <th>Journal</th>
                <th>Référence</th>
                <th>N° compte</th>
                <th>Libellé</th>
                <th className="text-right">Débit</th>
                <th className="text-right">Crédit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b">
                  <td className="py-1">{l.entry_date}</td>
                  <td>{l.journal_code}</td>
                  <td>{l.reference ?? "—"}</td>
                  <td>{accountLabel(l.account_code)}</td>
                  <td>{l.label ?? l.description ?? "—"}</td>
                  <td className="text-right">{l.debit ? fmt(l.debit) : ""}</td>
                  <td className="text-right">{l.credit ? fmt(l.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium border-t">
                <td colSpan={5} className="py-1 text-right">
                  Total
                </td>
                <td className="text-right">{fmt(totalDebit)}</td>
                <td className="text-right">{fmt(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
          {lines.length === 0 && <p className="text-sm text-zinc-500">Aucune écriture sur cette période.</p>}
        </div>
      )}

      {!loading && tab === "grand-livre" && (
        <div className="space-y-2">
          {!accountCode && <p className="text-sm text-zinc-500">Choisis un compte ci-dessus.</p>}
          {accountCode && (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1">Date</th>
                  <th>Journal</th>
                  <th>Libellé</th>
                  <th className="text-right">Débit</th>
                  <th className="text-right">Crédit</th>
                  <th className="text-right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {accountLedger.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-1">{l.entry_date}</td>
                    <td>{l.journal_code}</td>
                    <td>{l.label ?? l.description ?? "—"}</td>
                    <td className="text-right">{l.debit ? fmt(l.debit) : ""}</td>
                    <td className="text-right">{l.credit ? fmt(l.credit) : ""}</td>
                    <td className="text-right">{fmt(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          {accountCode && accountLedger.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun mouvement sur ce compte pour cette période.</p>
          )}
        </div>
      )}

      {!loading && tab === "balance" && (
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Compte</th>
              <th>Libellé</th>
              <th className="text-right">Débit</th>
              <th className="text-right">Crédit</th>
              <th className="text-right">Solde</th>
            </tr>
          </thead>
          <tbody>
            {trialBalance.map((r) => (
              <tr key={r.account_code} className="border-b">
                <td className="py-1">{r.account_code}</td>
                <td>{r.label}</td>
                <td className="text-right">{fmt(r.totalDebit)}</td>
                <td className="text-right">{fmt(r.totalCredit)}</td>
                <td className="text-right">{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium border-t">
              <td colSpan={2} className="py-1 text-right">
                Total
              </td>
              <td className="text-right">{fmt(totalDebit)}</td>
              <td className="text-right">{fmt(totalCredit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      )}
    </main>
  );
}
