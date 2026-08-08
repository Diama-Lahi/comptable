"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { createContract, fetchContracts, generateRecurringInvoice, type Contract } from "@/lib/contracts";

type Account = { code: string; label: string };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thisMonthDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function ContratsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periodDate, setPeriodDate] = useState(thisMonthDate());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const [thirdPartyName, setThirdPartyName] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"mensuelle" | "annuelle">("mensuelle");
  const [startDate, setStartDate] = useState("");
  const [defaultAccountCode, setDefaultAccountCode] = useState("");

  const load = async () => setContracts(await fetchContracts());

  useEffect(() => {
    load();
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .eq("class", 7)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thirdPartyName || !label || !amount || !startDate || !defaultAccountCode) return;
    await createContract({
      thirdPartyName,
      label,
      amount: parseFloat(amount),
      frequency,
      startDate,
      defaultAccountCode,
    });
    setThirdPartyName("");
    setLabel("");
    setAmount("");
    setStartDate("");
    await load();
  };

  const handleGenerate = async (contract: Contract) => {
    setBusy(contract.id);
    setMsg("");
    try {
      const result = await generateRecurringInvoice(contract, periodDate);
      setMsg(
        result === "created"
          ? `Facture générée pour ${contract.label}.`
          : `Facture déjà générée pour ${contract.label} à cette période.`
      );
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Contrats &amp; facturation récurrente</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau contrat</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Client
            <input type="text" className="border rounded px-2 py-1" value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Abonnement mensuel" required />
          </label>
          <label className="flex flex-col gap-1">
            Montant TTC
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Fréquence
            <select className="border rounded px-2 py-1" value={frequency} onChange={(e) => setFrequency(e.target.value as "mensuelle" | "annuelle")}>
              <option value="mensuelle">Mensuelle</option>
              <option value="annuelle">Annuelle</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Date de début
            <input type="date" className="border rounded px-2 py-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Compte de produit
            <select className="border rounded px-2 py-1" value={defaultAccountCode} onChange={(e) => setDefaultAccountCode(e.target.value)} required>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Créer
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Contrats actifs</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Période à facturer
            <input type="date" className="border rounded px-2 py-1" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Client</th>
              <th>Libellé</th>
              <th className="text-right">Montant</th>
              <th>Fréquence</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-1">{c.third_parties?.name ?? "—"}</td>
                <td>{c.label}</td>
                <td className="text-right">{fmt(c.amount)}</td>
                <td>{c.frequency}</td>
                <td>{c.status}</td>
                <td>
                  {c.status === "active" && (
                    <button disabled={busy === c.id} className="text-blue-600 underline text-xs" onClick={() => handleGenerate(c)}>
                      Générer facture
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
    </main>
  );
}
