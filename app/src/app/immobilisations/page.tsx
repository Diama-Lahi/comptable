"use client";

import { useEffect, useState } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import {
  createAsset,
  fetchAssets,
  fetchCumulativeDepreciation,
  generateDepreciationEntry,
  monthlyDepreciationAmount,
  recordDisposal,
  type FixedAsset,
} from "@/lib/fixedAssets";

type Account = { code: string; label: string };

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thisMonthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export default function ImmobilisationsPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [cumuls, setCumuls] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [periodDate, setPeriodDate] = useState(thisMonthEnd());
  const [busy, setBusy] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [originalValue, setOriginalValue] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("36");
  const [assetAccountCode, setAssetAccountCode] = useState("");
  const [depreciationAccountCode, setDepreciationAccountCode] = useState("281");

  const [disposal, setDisposal] = useState<Record<string, { date: string; value: string }>>({});

  const load = async () => {
    setLoading(true);
    const list = await fetchAssets();
    setAssets(list);
    const entries = await Promise.all(list.map(async (a) => [a.id, await fetchCumulativeDepreciation(a.id)] as const));
    setCumuls(Object.fromEntries(entries));
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase
      .from("chart_of_accounts")
      .select("code, label")
      .eq("company_id", COMPANY_ID)
      .eq("class", 2)
      .order("code")
      .then(({ data }) => setAccounts(data ?? []));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !acquisitionDate || !originalValue || !assetAccountCode) return;
    await createAsset({
      label,
      category,
      acquisitionDate,
      originalValue: parseFloat(originalValue),
      usefulLifeMonths: parseInt(usefulLifeMonths, 10),
      assetAccountCode,
      depreciationAccountCode,
    });
    setLabel("");
    setCategory("");
    setAcquisitionDate("");
    setOriginalValue("");
    await load();
  };

  const handleGenerate = async (asset: FixedAsset) => {
    setBusy(asset.id);
    setMsg("");
    try {
      const result = await generateDepreciationEntry(asset, periodDate);
      setMsg(
        result === "created"
          ? `Dotation générée pour ${asset.label}.`
          : `Dotation déjà générée pour ${asset.label} à cette date.`
      );
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  const handleDisposal = async (asset: FixedAsset) => {
    const d = disposal[asset.id];
    if (!d?.date) return;
    setMsg("");
    try {
      await recordDisposal(asset, d.date, parseFloat(d.value) || 0);
      setMsg(`Cession enregistrée pour ${asset.label}, écriture générée.`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <h1 className="text-xl font-semibold">Immobilisations &amp; amortissements</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Nouvelle immobilisation</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Libellé
            <input type="text" className="border rounded px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Catégorie
            <input type="text" className="border rounded px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="matériel informatique" />
          </label>
          <label className="flex flex-col gap-1">
            Date d&apos;acquisition
            <input type="date" className="border rounded px-2 py-1" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Valeur d&apos;origine
            <input type="number" step="0.01" className="border rounded px-2 py-1" value={originalValue} onChange={(e) => setOriginalValue(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Durée (mois)
            <input type="number" className="border rounded px-2 py-1" value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1">
            Compte d&apos;immobilisation
            <select className="border rounded px-2 py-1" value={assetAccountCode} onChange={(e) => setAssetAccountCode(e.target.value)} required>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 col-span-3">
            Compte d&apos;amortissement
            <input type="text" className="border rounded px-2 py-1" value={depreciationAccountCode} onChange={(e) => setDepreciationAccountCode(e.target.value)} />
          </label>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm col-span-3 w-fit">
            Enregistrer
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Registre des immobilisations</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Générer la dotation à la date du
            <input type="date" className="border rounded px-2 py-1" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
          </label>
        </div>

        {loading && <p className="text-sm text-zinc-500">Chargement…</p>}
        {!loading && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Libellé</th>
                <th>Valeur d&apos;origine</th>
                <th>Dotation mensuelle</th>
                <th>Cumul amort.</th>
                <th>VNC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const cumul = cumuls[a.id] ?? 0;
                const vnc = a.original_value - cumul;
                return (
                  <tr key={a.id} className="border-b align-top">
                    <td className="py-1">
                      {a.label}
                      {a.disposal_date && <div className="text-xs text-zinc-500">Sorti le {a.disposal_date}</div>}
                    </td>
                    <td>{fmt(a.original_value)}</td>
                    <td>{fmt(monthlyDepreciationAmount(a))}</td>
                    <td>{fmt(cumul)}</td>
                    <td>{fmt(vnc)}</td>
                    <td>
                      {!a.disposal_date && (
                        <div className="flex flex-col gap-1">
                          <button
                            disabled={busy === a.id}
                            className="text-blue-600 underline text-xs"
                            onClick={() => handleGenerate(a)}
                          >
                            Générer dotation
                          </button>
                          <div className="flex gap-1 items-center">
                            <input
                              type="date"
                              className="border rounded px-1 py-0.5 text-xs w-28"
                              value={disposal[a.id]?.date ?? ""}
                              onChange={(e) =>
                                setDisposal((p) => ({ ...p, [a.id]: { date: e.target.value, value: p[a.id]?.value ?? "" } }))
                              }
                            />
                            <input
                              type="number"
                              placeholder="valeur cession"
                              className="border rounded px-1 py-0.5 text-xs w-24"
                              value={disposal[a.id]?.value ?? ""}
                              onChange={(e) =>
                                setDisposal((p) => ({ ...p, [a.id]: { date: p[a.id]?.date ?? "", value: e.target.value } }))
                              }
                            />
                            <button className="text-xs text-red-600 underline" onClick={() => handleDisposal(a)}>
                              Sortir
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        <p className="text-xs text-zinc-500">
          La sortie d&apos;immobilisation solde le compte d&apos;amortissement et l&apos;actif, encaisse la valeur de
          cession (compte 571, simplification) et enregistre la plus/moins-value (654/754).
        </p>
      </section>
    </main>
  );
}
