"use client";

import { useEffect, useState } from "react";
import {
  computeForecast,
  createRecurringCharge,
  fetchRecurringCharges,
  type ForecastPoint,
  type RecurringCharge,
} from "@/lib/forecast";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const sourceLabels: Record<string, string> = {
  facture_client: "Encaissement client",
  facture_fournisseur: "Décaissement fournisseur",
  charge_recurrente: "Charge récurrente",
};

export default function PrevisionnelPage() {
  const [charges, setCharges] = useState<RecurringCharge[]>([]);
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [firstNegativeDate, setFirstNegativeDate] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<"mensuelle" | "trimestrielle" | "annuelle">("mensuelle");
  const [nextDueDate, setNextDueDate] = useState("");

  const load = async () => {
    setCharges(await fetchRecurringCharges());
    const { points, firstNegativeDate } = await computeForecast();
    setPoints(points);
    setFirstNegativeDate(firstNegativeDate);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !amount || !nextDueDate) return;
    await createRecurringCharge({ label, amount: parseFloat(amount), frequency, nextDueDate });
    setLabel("");
    setAmount("");
    setNextDueDate("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Prévisionnel de trésorerie</h1>
      <p className="text-sm text-zinc-500">
        Projection à partir de la trésorerie actuelle + charges récurrentes + factures à échéance
        (<code>due_date</code>, renseignable dans <code>/factures</code>).
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle charge récurrente</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Loyer bureau" required />
          </label>
          <label className="flex flex-col gap-1">
            Montant
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Fréquence
            <select className="border rounded px-2 py-1" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="mensuelle">Mensuelle</option>
              <option value="trimestrielle">Trimestrielle</option>
              <option value="annuelle">Annuelle</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Prochaine échéance
            <input type="date" className="border rounded px-2 py-1" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-1">{c.label}</td>
                <td>{c.frequency}</td>
                <td>{c.next_due_date}</td>
                <td className="text-right">{fmt(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Projection</h2>
        {firstNegativeDate && (
          <p className="text-sm text-red-600">Trésorerie projetée négative à partir du {firstNegativeDate}.</p>
        )}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Date</th>
              <th>Source</th>
              <th className="text-right">Montant</th>
              <th className="text-right">Solde projeté</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{p.date}</td>
                <td>{sourceLabels[p.source] ?? p.source}</td>
                <td className="text-right">{fmt(p.amount)}</td>
                <td className={`text-right ${p.runningBalance < 0 ? "text-red-600" : ""}`}>{fmt(p.runningBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {points.length === 0 && <p className="text-sm text-zinc-500">Rien à projeter.</p>}
      </section>
    </main>
  );
}
