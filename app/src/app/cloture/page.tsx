"use client";

import { useEffect, useState } from "react";
import {
  closePeriod,
  computeVatSummary,
  createPeriod,
  fetchPeriods,
  fetchTaxRegime,
  type FiscalPeriod,
  type TaxRegime,
  type VatSummary,
} from "@/lib/closing";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CloturePage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [label, setLabel] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [creating, setCreating] = useState(false);
  const [taxRegime, setTaxRegime] = useState<TaxRegime>("reel_normal");

  const [selected, setSelected] = useState<FiscalPeriod | null>(null);
  const [vat, setVat] = useState<VatSummary | null>(null);
  const [loadingVat, setLoadingVat] = useState(false);
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => setPeriods(await fetchPeriods());

  useEffect(() => {
    load();
    fetchTaxRegime().then(setTaxRegime);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !start || !end) return;
    setCreating(true);
    await createPeriod(label, start, end);
    setLabel("");
    setStart("");
    setEnd("");
    setCreating(false);
    load();
  };

  const selectPeriod = async (period: FiscalPeriod) => {
    setSelected(period);
    setVat(null);
    setMsg("");
    if (taxRegime === "cgu") return;
    setLoadingVat(true);
    setVat(await computeVatSummary(period));
    setLoadingVat(false);
  };

  const handleClose = async () => {
    if (!selected) return;
    if (taxRegime !== "cgu" && !vat) return;
    setClosing(true);
    setMsg("");
    try {
      await closePeriod(selected, vat ?? { collectee: 0, deductible: 0, net: 0 });
      setMsg(
        taxRegime === "cgu"
          ? "Période clôturée (pas de TVA en régime CGU)."
          : "Période clôturée, écriture de solde de TVA générée."
      );
      await load();
      setSelected({ ...selected, status: "closed" });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur lors de la clôture");
    } finally {
      setClosing(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Clôture &amp; TVA</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle période fiscale</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end text-sm">
          <label className="flex flex-col gap-1">
            Libellé
            <input
              type="text"
              placeholder="Janvier 2026"
              className="border rounded px-2 py-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            Début
            <input type="date" className="border rounded px-2 py-1" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Fin
            <input type="date" className="border rounded px-2 py-1" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
          >
            Créer
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Périodes</h2>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Libellé</th>
              <th>Début</th>
              <th>Fin</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="py-1">{p.label}</td>
                <td>{p.start_date}</td>
                <td>{p.end_date}</td>
                <td>{p.status === "open" ? "ouverte" : "clôturée"}</td>
                <td>
                  <button className="text-blue-600 underline text-xs" onClick={() => selectPeriod(p)}>
                    Voir la TVA
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {selected && (
        <section className="space-y-3 border rounded p-4">
          <h2 className="font-medium">
            {taxRegime === "cgu" ? "Clôture" : "Tableau de TVA"} — {selected.label} ({selected.start_date} →{" "}
            {selected.end_date})
          </h2>

          {taxRegime === "cgu" && (
            <p className="text-sm text-zinc-500">
              Régime CGU : pas de déclaration de TVA (impôt forfaitaire). Voir <code>/parametres</code> pour changer le
              régime.
            </p>
          )}

          {loadingVat && <p className="text-sm text-zinc-500">Calcul…</p>}
          {taxRegime !== "cgu" && vat && !loadingVat && (
            <div className="overflow-x-auto">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-4 py-1">TVA collectée (ventes)</td>
                  <td className="text-right">{fmt(vat.collectee)}</td>
                </tr>
                <tr>
                  <td className="pr-4 py-1">TVA déductible (achats)</td>
                  <td className="text-right">{fmt(vat.deductible)}</td>
                </tr>
                <tr className="font-medium border-t">
                  <td className="pr-4 py-1">{vat.net >= 0 ? "TVA à payer" : "Crédit de TVA"}</td>
                  <td className="text-right">{fmt(Math.abs(vat.net))}</td>
                </tr>
              </tbody>
            </table>
            </div>
          )}

          {(taxRegime === "cgu" || (vat && !loadingVat)) &&
            (selected.status === "open" ? (
              <button
                onClick={handleClose}
                disabled={closing}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40"
              >
                {closing ? "Clôture..." : "Clôturer la période"}
              </button>
            ) : (
              <p className="text-sm text-zinc-500">
                Période déjà clôturée
                {selected.closed_at ? ` le ${new Date(selected.closed_at).toLocaleDateString("fr-FR")}` : ""}.
              </p>
            ))}
          {msg && <p className="text-sm text-green-600">{msg}</p>}
        </section>
      )}
    </main>
  );
}
