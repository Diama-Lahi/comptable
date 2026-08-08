"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import {
  createManualAdjustment,
  createSuggestedProvision,
  fetchAdjustments,
  rejectAdjustment,
  suggestDoubtfulInvoices,
  validateAdjustment,
  type Adjustment,
  type OverdueInvoice,
} from "@/lib/adjustments";

type Account = { code: string; label: string };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const typeLabels: Record<Adjustment["type"], string> = {
  charge_a_payer: "Charge à payer",
  produit_constate_avance: "Produit constaté d'avance",
  provision_creance_douteuse: "Provision créance douteuse",
};

export default function RegularisationsPage() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [overdue, setOverdue] = useState<OverdueInvoice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [manualType, setManualType] = useState<"charge_a_payer" | "produit_constate_avance">("charge_a_payer");
  const [manualAccount, setManualAccount] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");

  const load = async () => {
    setLoading(true);
    setAdjustments(await fetchAdjustments());
    setOverdue(await suggestDoubtfulInvoices());
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .in("class", [6, 7])
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  const handleSuggestProvision = async (invoice: OverdueInvoice) => {
    setProcessing(invoice.id);
    await createSuggestedProvision(invoice);
    await load();
    setProcessing(null);
  };

  const handleValidate = async (adj: Adjustment) => {
    setProcessing(adj.id);
    setMsg("");
    try {
      await validateAdjustment(adj);
      setMsg("Régularisation validée, écriture générée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(id);
    await rejectAdjustment(id);
    await load();
    setProcessing(null);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAccount || !manualAmount) return;
    await createManualAdjustment({
      type: manualType,
      accountCode: manualAccount,
      description: manualDesc,
      amount: parseFloat(manualAmount),
    });
    setManualAccount("");
    setManualDesc("");
    setManualAmount("");
    await load();
  };

  const suggested = adjustments.filter((a) => a.status === "suggested");
  const validated = adjustments.filter((a) => a.status === "validated");

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Régularisations de fin d&apos;exercice</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Créances clients probablement douteuses (&gt; 60 jours, non soldées)</h2>
        {overdue.length === 0 && <p className="text-sm text-zinc-500">Aucune détectée.</p>}
        {overdue.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Client</th>
                <th>Facture</th>
                <th>Date</th>
                <th className="text-right">Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((inv) => (
                <tr key={inv.id} className="border-b">
                  <td className="py-1">{inv.third_parties?.name ?? "—"}</td>
                  <td>{inv.invoice_number ?? "—"}</td>
                  <td>{inv.invoice_date}</td>
                  <td className="text-right">{fmt(inv.amount_ttc ?? 0)}</td>
                  <td>
                    <button
                      disabled={processing === inv.id}
                      className="text-blue-600 underline text-xs"
                      onClick={() => handleSuggestProvision(inv)}
                    >
                      Suggérer une provision
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle régularisation manuelle</h2>
        <form onSubmit={handleManualSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Type
            <select
              className="border rounded px-2 py-1"
              value={manualType}
              onChange={(e) => {
                setManualType(e.target.value as typeof manualType);
                setManualAccount("");
              }}
            >
              <option value="charge_a_payer">Charge à payer</option>
              <option value="produit_constate_avance">Produit constaté d&apos;avance</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Compte {manualType === "charge_a_payer" ? "de charge" : "de produit"}
            <select className="border rounded px-2 py-1" value={manualAccount} onChange={(e) => setManualAccount(e.target.value)} required>
              <option value="">—</option>
              {accounts
                .filter((a) => (manualType === "charge_a_payer" ? a.code.startsWith("6") : a.code.startsWith("7")))
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} — {a.label}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Description
            <input type="text" className="border rounded px-2 py-1" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input
              type="number"
              step="0.01"
              className="border rounded px-2 py-1"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Ajouter (suggérée)
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">À valider ({suggested.length})</h2>
        {loading && <p className="text-sm text-zinc-500">Chargement…</p>}
        {!loading && suggested.length === 0 && <p className="text-sm text-zinc-500">Rien en attente.</p>}
        {suggested.map((a) => (
          <div key={a.id} className="border rounded p-3 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{typeLabels[a.type]}</span> — {a.description?.replace(/^\[\w+\]\s*/, "")} —{" "}
              {fmt(a.amount)}
            </div>
            <div className="flex gap-2">
              <button
                disabled={processing === a.id}
                className="text-green-600 underline"
                onClick={() => handleValidate(a)}
              >
                Valider
              </button>
              <button
                disabled={processing === a.id}
                className="text-red-600 underline"
                onClick={() => handleReject(a.id)}
              >
                Rejeter
              </button>
            </div>
          </div>
        ))}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Validées ({validated.length})</h2>
        {validated.map((a) => (
          <div key={a.id} className="text-sm text-zinc-600">
            {typeLabels[a.type]} — {a.description?.replace(/^\[\w+\]\s*/, "")} — {fmt(a.amount)}
          </div>
        ))}
      </section>
    </main>
  );
}
