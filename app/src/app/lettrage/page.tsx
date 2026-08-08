"use client";

import { useEffect, useState } from "react";
import { fetchCashAccounts, type CashBankAccount } from "@/lib/cashAccounts";
import {
  computeAgedBalance,
  fetchOutstandingInvoices,
  recordPayment,
  type OutstandingInvoice,
} from "@/lib/lettering";
import { getRateForDate } from "@/lib/currency";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusLabels: Record<OutstandingInvoice["lettering_status"], string> = {
  non_lettree: "non lettrée",
  partielle: "partielle",
  soldee: "soldée",
};

export default function LettragePage() {
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashBankAccount[]>([]);
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [payDates, setPayDates] = useState<Record<string, string>>({});
  const [payMethods, setPayMethods] = useState<Record<string, string>>({});
  const [payAccounts, setPayAccounts] = useState<Record<string, string>>({});
  const [payFxRates, setPayFxRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setInvoices(await fetchOutstandingInvoices());
    setCashAccounts(await fetchCashAccounts());
  };

  useEffect(() => {
    load();
  }, []);

  const aged = computeAgedBalance(invoices.filter((i) => i.type === "client"));

  const isForeign = (inv: OutstandingInvoice) => inv.currency !== "XOF";

  const loadFxRate = async (inv: OutstandingInvoice) => {
    if (!isForeign(inv)) return;
    const date = payDates[inv.id] || new Date().toISOString().slice(0, 10);
    const rate = await getRateForDate(inv.currency, date);
    if (rate) setPayFxRates((p) => ({ ...p, [inv.id]: String(rate) }));
  };

  const handlePay = async (inv: OutstandingInvoice) => {
    const amount = parseFloat(payAmounts[inv.id] ?? "");
    const date = payDates[inv.id] || new Date().toISOString().slice(0, 10);
    const method = (payMethods[inv.id] as "virement" | "wave" | "orange_money" | "especes" | "cheque") || "virement";
    const treasuryAccountCode = payAccounts[inv.id] || cashAccounts[0]?.account_code || "571";
    if (!amount) return;

    const fxRateOnPayment = isForeign(inv) ? parseFloat(payFxRates[inv.id] ?? "") : undefined;
    if (isForeign(inv) && !fxRateOnPayment) {
      setMsg(`Taux de change (${inv.currency} → XOF) requis pour cette facture.`);
      return;
    }

    setBusy(inv.id);
    setMsg("");
    try {
      await recordPayment({ invoice: inv, amount, paymentDate: date, method, treasuryAccountCode, fxRateOnPayment });
      setMsg("Paiement enregistré, écriture générée.");
      setPayAmounts((p) => ({ ...p, [inv.id]: "" }));
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Lettrage &amp; balance âgée</h1>

      <section className="space-y-2">
        <h2 className="font-medium">Balance âgée — créances clients non lettrées</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {(Object.entries(aged) as [string, number][]).map(([bucket, amount]) => (
            <div key={bucket} className="border rounded p-3">
              <div className="text-xs text-zinc-500">{bucket} jours</div>
              <div className="font-semibold">{fmt(amount)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Factures non soldées</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Type</th>
              <th>Tiers</th>
              <th>N°</th>
              <th>Date</th>
              <th className="text-right">TTC</th>
              <th className="text-right">Réglé</th>
              <th className="text-right">Restant</th>
              <th>Statut</th>
              <th>Paiement</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b align-top">
                <td className="py-1">{inv.type}</td>
                <td>{inv.third_parties?.name ?? "—"}</td>
                <td>{inv.invoice_number ?? "—"}</td>
                <td>{inv.invoice_date ?? "—"}</td>
                <td className="text-right">{fmt(inv.amount_ttc)}</td>
                <td className="text-right">{fmt(inv.applied)}</td>
                <td className="text-right">{fmt(inv.amount_ttc - inv.applied)}</td>
                <td>{statusLabels[inv.lettering_status]}</td>
                <td>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="0.01"
                        placeholder={isForeign(inv) ? `montant ${inv.currency}` : "montant"}
                        className="border rounded px-1 py-0.5 text-xs w-20"
                        value={payAmounts[inv.id] ?? ""}
                        onChange={(e) => setPayAmounts((p) => ({ ...p, [inv.id]: e.target.value }))}
                      />
                      <input
                        type="date"
                        className="border rounded px-1 py-0.5 text-xs w-28"
                        value={payDates[inv.id] ?? ""}
                        onChange={(e) => setPayDates((p) => ({ ...p, [inv.id]: e.target.value }))}
                        onBlur={() => loadFxRate(inv)}
                      />
                    </div>
                    {isForeign(inv) && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.000001"
                          placeholder={`taux ${inv.currency}→XOF`}
                          className="border rounded px-1 py-0.5 text-xs w-24"
                          value={payFxRates[inv.id] ?? ""}
                          onChange={(e) => setPayFxRates((p) => ({ ...p, [inv.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="text-[10px] text-blue-600 underline"
                          onClick={() => loadFxRate(inv)}
                        >
                          Auto
                        </button>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <select
                        className="border rounded px-1 py-0.5 text-xs"
                        value={payMethods[inv.id] ?? "virement"}
                        onChange={(e) => setPayMethods((p) => ({ ...p, [inv.id]: e.target.value }))}
                      >
                        <option value="virement">Virement</option>
                        <option value="wave">Wave</option>
                        <option value="orange_money">Orange Money</option>
                        <option value="especes">Espèces</option>
                        <option value="cheque">Chèque</option>
                      </select>
                      <select
                        className="border rounded px-1 py-0.5 text-xs"
                        value={payAccounts[inv.id] ?? cashAccounts[0]?.account_code ?? "571"}
                        onChange={(e) => setPayAccounts((p) => ({ ...p, [inv.id]: e.target.value }))}
                      >
                        {cashAccounts.length === 0 && <option value="571">571 — Caisse</option>}
                        {cashAccounts.map((c) => (
                          <option key={c.id} value={c.account_code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={busy === inv.id}
                        className="text-blue-600 underline text-xs"
                        onClick={() => handlePay(inv)}
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {invoices.length === 0 && <p className="text-sm text-zinc-500">Rien à lettrer.</p>}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>
    </main>
  );
}
