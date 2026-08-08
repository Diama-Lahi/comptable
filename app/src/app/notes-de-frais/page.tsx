"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import {
  approveExpenseReport,
  fetchAdvances,
  fetchExpenseReports,
  giveAdvance,
  reimburseExpenseReport,
  rejectExpenseReport,
  settleAdvance,
  submitExpenseReport,
  type Advance,
  type ExpenseReport,
} from "@/lib/expenses";

type Account = { code: string; label: string };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusLabels: Record<ExpenseReport["status"], string> = {
  submitted: "soumise",
  approved: "approuvée",
  reimbursed: "remboursée",
  rejected: "rejetée",
};

export default function NotesDeFraisPage() {
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [submittedBy, setSubmittedBy] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [motif, setMotif] = useState("");
  const [amount, setAmount] = useState("");
  const [chargeAccount, setChargeAccount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);

  const [advanceName, setAdvanceName] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceDate, setAdvanceDate] = useState("");
  const [settleAmounts, setSettleAmounts] = useState<Record<string, string>>({});

  const load = async () => {
    setReports(await fetchExpenseReports());
    setAdvances(await fetchAdvances());
  };

  useEffect(() => {
    load();
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .eq("class", 6)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittedBy || !expenseDate || !amount || !chargeAccount) return;

    let receiptPath: string | null = null;
    if (receipt) {
      receiptPath = `expenses/${COMPANY_ID}/${Date.now()}-${receipt.name}`;
      await supabase.storage.from("invoices").upload(receiptPath, receipt);
    }

    await submitExpenseReport({
      submittedBy,
      expenseDate,
      motif,
      amount: parseFloat(amount),
      chargeAccountCode: chargeAccount,
      receiptPath,
    });
    setSubmittedBy("");
    setExpenseDate("");
    setMotif("");
    setAmount("");
    setChargeAccount("");
    setReceipt(null);
    await load();
  };

  const handleReimburse = async (report: ExpenseReport) => {
    setBusy(report.id);
    setMsg("");
    try {
      await reimburseExpenseReport(report);
      setMsg("Note de frais remboursée, écriture générée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const handleGiveAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceName || !advanceAmount || !advanceDate) return;
    await giveAdvance({ thirdPartyName: advanceName, amount: parseFloat(advanceAmount), givenDate: advanceDate });
    setAdvanceName("");
    setAdvanceAmount("");
    setAdvanceDate("");
    await load();
  };

  const handleSettle = async (advance: Advance) => {
    const amt = parseFloat(settleAmounts[advance.id] ?? "0");
    if (!amt) return;
    await settleAdvance(advance, amt);
    setSettleAmounts((p) => ({ ...p, [advance.id]: "" }));
    await load();
  };

  const openReceipt = async (path: string) => {
    const { data } = await supabase.storage.from("invoices").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Notes de frais &amp; avances</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle note de frais</h2>
        <form onSubmit={handleSubmitReport} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Personne
            <input type="text" className="border rounded px-2 py-1" value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" className="border rounded px-2 py-1" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            Motif
            <input type="text" className="border rounded px-2 py-1" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Compte de charge
            <select className="border rounded px-2 py-1" value={chargeAccount} onChange={(e) => setChargeAccount(e.target.value)} required>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 col-span-2">
            Justificatif (photo)
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit">
            Soumettre
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Notes de frais</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Personne</th>
              <th>Date</th>
              <th>Motif</th>
              <th className="text-right">Montant</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-1">{r.submitted_by}</td>
                <td>{r.expense_date}</td>
                <td>{r.motif?.replace(/^\[\w+\]\s*/, "")}</td>
                <td className="text-right">{fmt(r.amount)}</td>
                <td>{statusLabels[r.status]}</td>
                <td className="flex gap-2">
                  {r.receipt_url && (
                    <button className="text-blue-600 underline text-xs" onClick={() => openReceipt(r.receipt_url!)}>
                      Voir
                    </button>
                  )}
                  {r.status === "submitted" && (
                    <button className="text-green-600 underline text-xs" onClick={() => approveExpenseReport(r.id).then(load)}>
                      Approuver
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button
                      disabled={busy === r.id}
                      className="text-green-600 underline text-xs"
                      onClick={() => handleReimburse(r)}
                    >
                      Rembourser
                    </button>
                  )}
                  {(r.status === "submitted" || r.status === "approved") && (
                    <button className="text-red-600 underline text-xs" onClick={() => rejectExpenseReport(r.id).then(load)}>
                      Rejeter
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle avance</h2>
        <form onSubmit={handleGiveAdvance} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Bénéficiaire
            <input type="text" className="border rounded px-2 py-1" value={advanceName} onChange={(e) => setAdvanceName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" className="border rounded px-2 py-1" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Donner l&apos;avance
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Avances en cours</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Bénéficiaire</th>
              <th>Date</th>
              <th className="text-right">Donné</th>
              <th className="text-right">Réglé</th>
              <th className="text-right">Solde</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {advances.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-1">{a.third_parties?.name ?? "—"}</td>
                <td>{a.given_date}</td>
                <td className="text-right">{fmt(a.amount_given)}</td>
                <td className="text-right">{fmt(a.amount_settled)}</td>
                <td className="text-right">{fmt(a.balance)}</td>
                <td>{a.status === "open" ? "ouverte" : "soldée"}</td>
                <td>
                  {a.status === "open" && (
                    <div className="flex gap-1 items-center">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="montant"
                        className="border rounded px-1 py-0.5 text-xs w-20"
                        value={settleAmounts[a.id] ?? ""}
                        onChange={(e) => setSettleAmounts((p) => ({ ...p, [a.id]: e.target.value }))}
                      />
                      <button className="text-blue-600 underline text-xs" onClick={() => handleSettle(a)}>
                        Régler
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
