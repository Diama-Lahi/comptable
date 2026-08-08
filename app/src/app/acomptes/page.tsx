"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { applyDepositToInvoice, createDeposit, fetchDeposits, type CustomerDeposit } from "@/lib/deposits";

type InvoiceOption = { id: string; invoice_number: string | null; amount_ttc: number | null };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AcomptesPage() {
  const [deposits, setDeposits] = useState<CustomerDeposit[]>([]);
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [tvaDeclared, setTvaDeclared] = useState(false);
  const [msg, setMsg] = useState("");
  const [invoiceChoices, setInvoiceChoices] = useState<Record<string, InvoiceOption[]>>({});
  const [applyChoice, setApplyChoice] = useState<Record<string, string>>({});

  const load = async () => setDeposits(await fetchDeposits());

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thirdPartyName || !amount) return;
    setMsg("");
    try {
      await createDeposit({ thirdPartyName, depositDate, amount: parseFloat(amount), tvaDeclared });
      setMsg("Acompte enregistré, écriture générée.");
      setThirdPartyName("");
      setAmount("");
      setTvaDeclared(false);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  const loadInvoiceChoices = async (deposit: CustomerDeposit) => {
    if (!deposit.third_party_id) return;
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, amount_ttc")
      .eq("company_id", COMPANY_ID)
      .eq("third_party_id", deposit.third_party_id)
      .eq("type", "client")
      .neq("lettering_status", "soldee");
    setInvoiceChoices((p) => ({ ...p, [deposit.id]: data ?? [] }));
  };

  const handleApply = async (deposit: CustomerDeposit) => {
    const invoiceId = applyChoice[deposit.id];
    if (!invoiceId) return;
    setMsg("");
    try {
      await applyDepositToInvoice(deposit, invoiceId);
      setMsg("Acompte appliqué à la facture, écriture générée.");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Acomptes clients</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvel acompte reçu</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Client
            <input type="text" className="border rounded px-2 py-1" value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" className="border rounded px-2 py-1" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tvaDeclared} onChange={(e) => setTvaDeclared(e.target.checked)} />
            TVA due dès l&apos;encaissement (prestation de service)
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Acomptes</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Client</th>
              <th>Date</th>
              <th className="text-right">Montant</th>
              <th>TVA à l&apos;encaissement</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id} className="border-b align-top">
                <td className="py-1">{d.third_parties?.name ?? "—"}</td>
                <td>{d.deposit_date}</td>
                <td className="text-right">{fmt(d.amount)}</td>
                <td>{d.tva_declared ? "oui" : "non"}</td>
                <td>{d.status === "open" ? "ouvert" : "appliqué"}</td>
                <td>
                  {d.status === "open" && (
                    <div className="flex gap-1 items-center">
                      <select
                        className="border rounded px-1 py-0.5 text-xs"
                        value={applyChoice[d.id] ?? ""}
                        onFocus={() => loadInvoiceChoices(d)}
                        onChange={(e) => setApplyChoice((p) => ({ ...p, [d.id]: e.target.value }))}
                      >
                        <option value="">— choisir facture —</option>
                        {(invoiceChoices[d.id] ?? []).map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number ?? inv.id} ({fmt(inv.amount_ttc ?? 0)})
                          </option>
                        ))}
                      </select>
                      <button className="text-blue-600 underline text-xs" onClick={() => handleApply(d)}>
                        Appliquer
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
