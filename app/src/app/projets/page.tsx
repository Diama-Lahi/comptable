"use client";

import { useEffect, useState } from "react";
import { computeResultByProject, createCostCenter, fetchCostCenters, type CostCenter, type ProjectResult } from "@/lib/costCenters";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function defaultYearRange() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default function ProjetsPage() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [results, setResults] = useState<ProjectResult[]>([]);
  const [{ from, to }, setRange] = useState(defaultYearRange());
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (f: string, t: string) => {
    setLoading(true);
    const centers = await fetchCostCenters();
    setCostCenters(centers);
    setResults(await computeResultByProject(f, t, centers));
    setLoading(false);
  };

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (f: string, t: string) => {
    setRange({ from: f, to: t });
    load(f, t);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !label) return;
    await createCostCenter(code, label);
    setCode("");
    setLabel("");
    await load(from, to);
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Comptabilité analytique par projet</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouveau projet / centre de coût</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Code
            <input type="text" className="border rounded px-2 py-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ECOLE-SN" required />
          </label>
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="École Sénégal" required />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">
            Créer
          </button>
        </form>
        <p className="text-xs text-zinc-500">
          Une fois créé, le projet est sélectionnable comme dimension optionnelle sur chaque ligne d&apos;écriture
          dans <code>/saisie</code>.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <h2 className="font-medium">Résultat par projet</h2>
          <label className="flex flex-col gap-1">
            Du
            <input type="date" className="border rounded px-2 py-1" value={from} onChange={(e) => applyRange(e.target.value, to)} />
          </label>
          <label className="flex flex-col gap-1">
            Au
            <input type="date" className="border rounded px-2 py-1" value={to} onChange={(e) => applyRange(from, e.target.value)} />
          </label>
        </div>

        {loading && <p className="text-sm text-zinc-500">Calcul…</p>}
        {!loading && costCenters.length === 0 && <p className="text-sm text-zinc-500">Aucun projet créé.</p>}
        {!loading && costCenters.length > 0 && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Projet</th>
                <th className="text-right">Produits</th>
                <th className="text-right">Charges</th>
                <th className="text-right">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.costCenterId} className="border-b">
                  <td className="py-1">{r.label}</td>
                  <td className="text-right">{fmt(r.produits)}</td>
                  <td className="text-right">{fmt(r.charges)}</td>
                  <td className={`text-right font-medium ${r.resultat >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(r.resultat)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </main>
  );
}
