"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { parseBankCsv, type ParsedBankRow } from "@/lib/bankImport";
import {
  confirmReconciliation,
  fetchUnreconciledBankLines,
  findBestMatch,
  type CandidateLine,
  type Confidence,
} from "@/lib/reconciliation";

type BankTx = {
  id: string;
  bank_date: string;
  label: string | null;
  amount: number;
  reconciled: boolean;
};

const confidenceLabel: Record<Confidence, string> = {
  certain: "certain",
  probable: "probable",
  a_verifier: "à vérifier",
};

const confidenceColor: Record<Confidence, string> = {
  certain: "text-green-600",
  probable: "text-amber-600",
  a_verifier: "text-zinc-500",
};

export default function BanquePage() {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ParsedBankRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [candidates, setCandidates] = useState<CandidateLine[]>([]);
  const [manualPick, setManualPick] = useState<Record<string, string>>({});
  const [reconciling, setReconciling] = useState<string | null>(null);

  const loadAll = async () => {
    const { data: txs } = await supabase
      .from("bank_transactions")
      .select("id, bank_date, label, amount, reconciled")
      .eq("company_id", COMPANY_ID)
      .order("bank_date", { ascending: false })
      .limit(50);
    setTransactions(txs ?? []);
    setCandidates(await fetchUnreconciledBankLines());
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    const { rows, errors } = parseBankCsv(text);
    setPreview(rows);
    setParseErrors(errors);
  };

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    setImportMsg("");

    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("bank_date, label, amount")
      .eq("company_id", COMPANY_ID);

    const existingKeys = new Set((existing ?? []).map((e) => `${e.bank_date}|${e.label}|${e.amount}`));
    const newRows = preview.filter((r) => !existingKeys.has(`${r.bank_date}|${r.label}|${r.amount}`));

    if (newRows.length) {
      const { error } = await supabase
        .from("bank_transactions")
        .insert(newRows.map((r) => ({ company_id: COMPANY_ID, ...r })));
      if (error) {
        setImportMsg(`Erreur : ${error.message}`);
        setImporting(false);
        return;
      }
    }

    setImportMsg(
      `${newRows.length} transaction(s) importée(s)` +
        (newRows.length < preview.length ? `, ${preview.length - newRows.length} doublon(s) ignoré(s)` : "")
    );
    setCsvText("");
    setPreview([]);
    setImporting(false);
    loadAll();
  };

  const handleReconcile = async (tx: BankTx, entryLineId: string, confidence: Confidence) => {
    setReconciling(tx.id);
    try {
      await confirmReconciliation(tx.id, entryLineId, confidence);
      await loadAll();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Erreur de rapprochement");
    } finally {
      setReconciling(null);
    }
  };

  const unreconciled = transactions.filter((t) => !t.reconciled);

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Banque — import &amp; rapprochement</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Import relevé bancaire (CSV)</h2>
        <p className="text-sm text-zinc-500">
          Format attendu : 3 colonnes <code>date, libellé, montant</code> (positif = entrée, négatif = sortie).
          Première ligne (en-tête) ignorée automatiquement si non reconnue.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {preview.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm">{preview.length} ligne(s) détectée(s)</p>
            <div className="max-h-40 overflow-auto border rounded text-sm">
              <div className="overflow-x-auto">
              <table className="w-full">
                <tbody>
                  {preview.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-2 py-1">{r.bank_date}</td>
                      <td className="px-2 py-1">{r.label}</td>
                      <td className="px-2 py-1 text-right">{r.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            {parseErrors.length > 0 && (
              <p className="text-xs text-amber-600">{parseErrors.length} ligne(s) ignorée(s) (format non reconnu)</p>
            )}
            <button
              onClick={handleImport}
              disabled={importing}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
            >
              {importing ? "Import..." : "Importer"}
            </button>
          </div>
        )}
        {importMsg && <p className="text-sm text-green-600">{importMsg}</p>}
        {csvText && preview.length === 0 && (
          <p className="text-sm text-red-600">Aucune ligne exploitable détectée dans ce fichier.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">
          Transactions à rapprocher ({unreconciled.length})
        </h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Date</th>
              <th>Libellé</th>
              <th className="text-right">Montant</th>
              <th>Correspondance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {unreconciled.map((tx) => {
              const match = findBestMatch(tx.amount, tx.bank_date, candidates);
              const picked = manualPick[tx.id];
              return (
                <tr key={tx.id} className="border-b align-top">
                  <td className="py-1">{tx.bank_date}</td>
                  <td>{tx.label}</td>
                  <td className="text-right">{tx.amount.toFixed(2)}</td>
                  <td>
                    {match ? (
                      <span className={confidenceColor[match.confidence]}>
                        {match.candidate.entry_date} · {match.candidate.description ?? "—"} · {match.candidate.amount.toFixed(2)}{" "}
                        ({confidenceLabel[match.confidence]})
                      </span>
                    ) : (
                      <select
                        className="border rounded px-1 py-0.5 text-xs"
                        value={picked ?? ""}
                        onChange={(e) => setManualPick((p) => ({ ...p, [tx.id]: e.target.value }))}
                      >
                        <option value="">— choisir manuellement —</option>
                        {candidates.map((c) => (
                          <option key={c.entry_line_id} value={c.entry_line_id}>
                            {c.entry_date} · {c.description ?? "—"} · {c.amount.toFixed(2)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <button
                      disabled={reconciling === tx.id || !(match || picked)}
                      className="text-blue-600 underline text-xs disabled:opacity-40"
                      onClick={() =>
                        match
                          ? handleReconcile(tx, match.candidate.entry_line_id, match.confidence)
                          : handleReconcile(tx, picked, "a_verifier")
                      }
                    >
                      Rapprocher
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {unreconciled.length === 0 && <p className="text-sm text-zinc-500">Rien à rapprocher.</p>}
      </section>
    </main>
  );
}
