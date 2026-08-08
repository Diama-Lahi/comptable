"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { createCustomsDeclaration, fetchCustomsDeclarations, type CustomsDeclaration } from "@/lib/customs";

type InvoiceOption = { id: string; invoice_number: string | null };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DouanePage() {
  const [declarations, setDeclarations] = useState<CustomsDeclaration[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [relatedInvoiceId, setRelatedInvoiceId] = useState("");
  const [declarationDate, setDeclarationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customsValue, setCustomsValue] = useState("");
  const [dutiesPaid, setDutiesPaid] = useState("");
  const [importVatPaid, setImportVatPaid] = useState("");
  const [transitFees, setTransitFees] = useState("");

  const load = async () => setDeclarations(await fetchCustomsDeclarations());

  useEffect(() => {
    load();
    supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("company_id", COMPANY_ID)
      .eq("type", "fournisseur")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setInvoices(data ?? []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customsValue) return;
    await createCustomsDeclaration({
      relatedInvoiceId: relatedInvoiceId || null,
      declarationDate,
      customsValue: parseFloat(customsValue),
      dutiesPaid: parseFloat(dutiesPaid) || 0,
      importVatPaid: parseFloat(importVatPaid) || 0,
      transitFees: parseFloat(transitFees) || 0,
    });
    setCustomsValue("");
    setDutiesPaid("");
    setImportVatPaid("");
    setTransitFees("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Douane &amp; import</h1>
      <p className="text-sm text-zinc-500">
        Suivi du coût de revient réel d&apos;un achat importé (valeur en douane + droits + TVA à l&apos;import + frais
        de transit). La TVA à l&apos;import payée reste récupérable comme TVA déductible si l&apos;entreprise y est
        assujettie — à imputer manuellement via <code>/saisie</code> (compte 4452) si applicable.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle déclaration</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Achat fournisseur lié
            <select className="border rounded px-2 py-1" value={relatedInvoiceId} onChange={(e) => setRelatedInvoiceId(e.target.value)}>
              <option value="">—</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number ?? inv.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Date de déclaration
            <input type="date" className="border rounded px-2 py-1" value={declarationDate} onChange={(e) => setDeclarationDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Valeur en douane
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={customsValue} onChange={(e) => setCustomsValue(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Droits de douane
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={dutiesPaid} onChange={(e) => setDutiesPaid(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            TVA à l&apos;import payée
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={importVatPaid} onChange={(e) => setImportVatPaid(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Frais de transit/dédouanement
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={transitFees} onChange={(e) => setTransitFees(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm w-fit self-end">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Déclarations</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Date</th>
              <th className="text-right">Valeur douane</th>
              <th className="text-right">Droits</th>
              <th className="text-right">TVA import</th>
              <th className="text-right">Transit</th>
              <th className="text-right">Coût de revient total</th>
              <th>Confiance</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d) => (
              <tr key={d.id} className="border-b">
                <td className="py-1">{d.declaration_date}</td>
                <td className="text-right">{fmt(d.customs_value)}</td>
                <td className="text-right">{fmt(d.duties_paid)}</td>
                <td className="text-right">{fmt(d.import_vat_paid)}</td>
                <td className="text-right">{fmt(d.transit_fees)}</td>
                <td className="text-right font-medium">{fmt(d.total_landed_cost)}</td>
                <td>
                  <span
                    className="app-badge"
                    style={
                      d.needs_review
                        ? { color: "var(--accent-red)", borderColor: "var(--accent-red)" }
                        : { color: "var(--accent-emerald)" }
                    }
                  >
                    {d.needs_review ? "À revoir" : "OK"}
                  </span>
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
