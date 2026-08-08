"use client";

import { useEffect, useState } from "react";
import { createExchangeRate, fetchExchangeRates, type ExchangeRate } from "@/lib/currency";

export default function DevisesPage() {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [fromCurrency, setFromCurrency] = useState("CAD");
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState("");

  const load = async () => setRates(await fetchExchangeRates());

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCurrency || !rate) return;
    await createExchangeRate({ fromCurrency: fromCurrency.toUpperCase(), rateDate, rate: parseFloat(rate) });
    setRate("");
    await load();
  };

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Devises &amp; taux de change</h1>
      <p className="text-sm text-zinc-500">
        Les factures en devise étrangère (page <code>/factures</code>) utilisent le taux le plus récent enregistré ici
        à une date donnée pour convertir en XOF. L&apos;écart de change à l&apos;encaissement n&apos;est pas encore
        calculé automatiquement.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau taux</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Devise (vers XOF)
            <input type="text" className="border rounded px-2 py-1 uppercase" value={fromCurrency} onChange={(e) => setFromCurrency(e.target.value)} placeholder="CAD" required />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input type="date" className="border rounded px-2 py-1" value={rateDate} onChange={(e) => setRateDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Taux (1 devise = X XOF)
            <input type="number" step="0.000001" className="border rounded px-2 py-1" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Historique des taux</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Devise</th>
              <th>Date</th>
              <th className="text-right">Taux</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-1">{r.from_currency} → {r.to_currency}</td>
                <td>{r.rate_date}</td>
                <td className="text-right">{r.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
