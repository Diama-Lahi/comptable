"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchCostCenters, type CostCenter } from "@/lib/costCenters";
import { assertPeriodOpen } from "@/lib/closing";

type Journal = { id: string; code: string; label: string };
type Account = { code: string; label: string };

type Line = {
  account_code: string;
  label: string;
  debit: string;
  credit: string;
  cost_center_id: string;
};

const emptyLine = (): Line => ({ account_code: "", label: "", debit: "", credit: "", cost_center_id: "" });

export default function SaisiePage() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);

  const [journalId, setJournalId] = useState("");
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine()]);

  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    supabase
      .from("journals")
      .select("id, code, label")
      .eq("company_id", COMPANY_ID)
      .order("code")
      .then(({ data }) => setJournals(data ?? []));

    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));

    fetchCostCenters().then(setCostCenters);
  }, []);

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const balanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01;

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index: number) =>
    setLines((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));

  const resetForm = () => {
    setReference("");
    setDescription("");
    setLines([emptyLine(), emptyLine()]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalId || !balanced) return;

    setStatus("saving");
    setErrorMsg("");

    try {
      await assertPeriodOpen(entryDate);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Période invalide");
      return;
    }

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .insert({
        company_id: COMPANY_ID,
        journal_id: journalId,
        entry_date: entryDate,
        reference: reference || null,
        description: description || null,
        source: "manual",
        status: "validated",
      })
      .select("id")
      .single();

    if (entryError || !entry) {
      setStatus("error");
      setErrorMsg(entryError?.message ?? "Erreur inconnue");
      return;
    }

    const rows = lines
      .filter((l) => l.account_code && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        label: l.label || null,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        cost_center_id: l.cost_center_id || null,
      }));

    const { error: linesError } = await supabase.from("entry_lines").insert(rows);

    if (linesError) {
      setStatus("error");
      setErrorMsg(linesError.message);
      return;
    }

    setStatus("done");
    resetForm();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-xl font-semibold">Saisie manuelle d&apos;écriture</h1>

      <div className="app-card px-5 py-4 space-y-2 text-sm">
        <div className="font-medium">Pourquoi deux comptes minimum ?</div>
        <p style={{ color: "var(--muted)" }}>
          En comptabilité, l&apos;argent ne disparaît jamais : il se <strong>déplace</strong> d&apos;un compte à un
          autre. Chaque écriture doit donc toucher au moins deux comptes — un débit, un crédit — pour le{" "}
          <strong>même montant total</strong>. C&apos;est ce que le tableau ci-dessous vérifie (le total Débit doit
          être égal au total Crédit avant de pouvoir enregistrer).
        </p>
        <div className="app-panel px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
          <div className="font-medium mb-1" style={{ color: "var(--foreground)" }}>
            Exemple : tu achètes des fournitures de bureau à 10 000 F, payées en espèces.
          </div>
          <div>Ligne 1 — Compte 605 (Autres achats) : Débit 10 000 (la charge augmente)</div>
          <div>Ligne 2 — Compte 571 (Caisse) : Crédit 10 000 (l&apos;argent en caisse diminue)</div>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Besoin d&apos;un rappel sur débit/crédit ou les codes de compte ?{" "}
          <a href="/aide" className="underline" style={{ color: "var(--accent-blue)" }}>
            Voir le lexique
          </a>
          .
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Journal
            <select
              className="border rounded px-2 py-1"
              value={journalId}
              onChange={(e) => setJournalId(e.target.value)}
              required
            >
              <option value="">—</option>
              {journals.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Date
            <input
              type="date"
              className="border rounded px-2 py-1"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Référence pièce
            <input
              type="text"
              className="border rounded px-2 py-1"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Description
          <input
            type="text"
            className="border rounded px-2 py-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="space-y-2">
          <div className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.8fr_1fr_auto] gap-2 text-sm font-medium">
            <span>Compte</span>
            <span>Libellé</span>
            <span>Débit</span>
            <span>Crédit</span>
            <span>Projet</span>
            <span />
          </div>

          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.8fr_1fr_auto] gap-2">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={line.account_code}
                onChange={(e) => updateLine(i, { account_code: e.target.value })}
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="border rounded px-2 py-1 text-sm"
                value={line.label}
                onChange={(e) => updateLine(i, { label: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1 text-sm"
                value={line.debit}
                onChange={(e) => updateLine(i, { debit: e.target.value, credit: "" })}
              />
              <input
                type="number"
                step="0.01"
                className="border rounded px-2 py-1 text-sm"
                value={line.credit}
                onChange={(e) => updateLine(i, { credit: e.target.value, debit: "" })}
              />
              <select
                className="border rounded px-2 py-1 text-sm"
                value={line.cost_center_id}
                onChange={(e) => updateLine(i, { cost_center_id: e.target.value })}
              >
                <option value="">—</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-red-600 text-sm"
                onClick={() => removeLine(i)}
              >
                ✕
              </button>
            </div>
          ))}

          <button type="button" onClick={addLine} className="text-sm text-blue-600">
            + Ajouter une ligne
          </button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span>
            Débit : {totalDebit.toFixed(2)} · Crédit : {totalCredit.toFixed(2)}
          </span>
          {!balanced && <span className="text-red-600">L&apos;écriture doit être équilibrée</span>}
        </div>

        <button
          type="submit"
          disabled={!balanced || status === "saving"}
          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
        >
          {status === "saving" ? "Enregistrement..." : "Enregistrer l'écriture"}
        </button>

        {status === "done" && <p className="text-green-600 text-sm">Écriture enregistrée.</p>}
        {status === "error" && <p className="text-red-600 text-sm">Erreur : {errorMsg}</p>}
      </form>
    </main>
  );
}
