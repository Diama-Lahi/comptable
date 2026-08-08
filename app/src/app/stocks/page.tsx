"use client";

import { useEffect, useState } from "react";
import {
  createStockValuation,
  distinctPeriodDates,
  fetchStockValuations,
  fetchStockVariationClosures,
  generateStockVariationEntry,
  stockValueAt,
  type StockValuation,
  type StockVariationClosure,
} from "@/lib/stock";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StocksPage() {
  const [valuations, setValuations] = useState<StockValuation[]>([]);
  const [closures, setClosures] = useState<StockVariationClosure[]>([]);
  const [periodDate, setPeriodDate] = useState("");
  const [productRef, setProductRef] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [variationBusy, setVariationBusy] = useState(false);
  const [variationMsg, setVariationMsg] = useState("");

  const load = async () => {
    setValuations(await fetchStockValuations());
    setClosures(await fetchStockVariationClosures());
  };

  useEffect(() => {
    load();
  }, []);

  const periodDates = distinctPeriodDates(valuations);
  const [closingDate, openingDate] = periodDates;
  const closingValue = closingDate ? stockValueAt(valuations, closingDate) : 0;
  const openingValue = openingDate ? stockValueAt(valuations, openingDate) : 0;
  const alreadyClosed = closures.some((c) => c.period_date === closingDate);

  const handleGenerateVariation = async () => {
    if (!closingDate || !openingDate) return;
    setVariationBusy(true);
    setVariationMsg("");
    try {
      await generateStockVariationEntry({ openingDate, openingValue, closingDate, closingValue });
      setVariationMsg("Écriture de variation de stock générée.");
      await load();
    } catch (err) {
      setVariationMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setVariationBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodDate || !productRef || !quantity || !unitCost) return;
    await createStockValuation({
      periodDate,
      productRef,
      quantity: parseFloat(quantity),
      unitCost: parseFloat(unitCost),
    });
    setProductRef("");
    setQuantity("");
    setUnitCost("");
    await load();
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Stocks — valorisation</h1>
      <p className="text-sm text-zinc-500">
        Valorisation manuelle simplifiée (quantité × coût moyen pondéré) en attendant une décision d&apos;intégration
        avec le système de gestion de stock existant (voir <code>docs/gaps-comptabilite.md</code>, section 3). Le
        coût des marchandises vendues est dérivé automatiquement à la clôture par variation de stock (méthode de
        l&apos;inventaire intermittent, ci-dessous) plutôt qu&apos;un calcul manuel ligne à ligne.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle valorisation</h2>
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Date (fin de période)
            <input type="date" className="border rounded px-2 py-1" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Référence produit
            <input type="text" className="border rounded px-2 py-1" value={productRef} onChange={(e) => setProductRef(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Quantité
            <input type="number" step="0.001" className="border rounded px-2 py-1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Coût unitaire moyen pondéré
            <input type="number" step="0.0001" className="border rounded px-2 py-1" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Enregistrer
          </button>
        </form>
      </section>

      {periodDates.length >= 2 && (
        <section className="space-y-2 app-card px-5 py-4">
          <h2 className="font-medium">Variation de stock (coût des marchandises vendues)</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Compare les deux dernières dates de valorisation et calcule automatiquement l&apos;écriture de variation —
            débit 603 / crédit 311 si le stock a baissé (cas courant), l&apos;inverse s&apos;il a augmenté.
          </p>
          <div className="text-sm space-y-1">
            <div>Stock au {openingDate} (ouverture) : {fmt(openingValue)}</div>
            <div>Stock au {closingDate} (clôture) : {fmt(closingValue)}</div>
            <div className="font-medium">Variation : {fmt(closingValue - openingValue)}</div>
          </div>
          <button
            onClick={handleGenerateVariation}
            disabled={variationBusy || alreadyClosed || closingValue === openingValue}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
          >
            {alreadyClosed
              ? "Déjà généré pour cette date"
              : variationBusy
              ? "Génération..."
              : "Générer l'écriture de variation"}
          </button>
          {variationMsg && <p className="text-sm text-green-600">{variationMsg}</p>}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">
          Historique {valuations.length > 0 && `— valeur totale dernière période (${valuations[0].period_date}) : ${fmt(closingValue)}`}
        </h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Date</th>
              <th>Produit</th>
              <th className="text-right">Quantité</th>
              <th className="text-right">Coût unitaire</th>
              <th className="text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {valuations.map((v) => (
              <tr key={v.id} className="border-b">
                <td className="py-1">{v.period_date}</td>
                <td>{v.product_ref}</td>
                <td className="text-right">{v.quantity}</td>
                <td className="text-right">{fmt(v.unit_cost)}</td>
                <td className="text-right">{fmt(v.total_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </main>
  );
}
