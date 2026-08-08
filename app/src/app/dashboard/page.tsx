"use client";

import { useEffect, useState } from "react";
import { computeKpis, fetchAuditThresholdCheck, type AuditThresholdCheck, type DashboardKpis } from "@/lib/dashboard";

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " F";
}

function StatTile({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
  sub?: string;
}) {
  const toneClass = tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : "text-black dark:text-white";
  return (
    <div className="border rounded p-4 flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}

function defaultYearRange() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export default function DashboardPage() {
  const [{ from, to }, setRange] = useState(defaultYearRange());
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [auditCheck, setAuditCheck] = useState<AuditThresholdCheck | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (f: string, t: string) => {
    setLoading(true);
    setKpis(await computeKpis(f, t));
    setLoading(false);
  };

  useEffect(() => {
    load(from, to);
    fetchAuditThresholdCheck().then(setAuditCheck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyRange = (f: string, t: string) => {
    setRange({ from: f, to: t });
    load(f, t);
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-xl font-semibold">Tableau de bord</h1>

      <div className="flex flex-wrap gap-3 items-end text-sm">
        <label className="flex flex-col gap-1">
          Du
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={from}
            onChange={(e) => applyRange(e.target.value, to)}
          />
        </label>
        <label className="flex flex-col gap-1">
          Au
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={to}
            onChange={(e) => applyRange(from, e.target.value)}
          />
        </label>
      </div>

      {auditCheck?.approaching && (
        <div className="border border-amber-400 bg-amber-50 dark:bg-amber-950 rounded p-3 text-sm">
          Vous approchez des seuils qui rendent un commissaire aux comptes obligatoire dans l&apos;espace OHADA (CA
          estimé : {auditCheck.annualRevenueEstimate ?? "—"}, effectif estimé : {auditCheck.employeeCountEstimate ?? "—"}) —
          <strong> à vérifier avec un professionnel</strong>, aucune action automatique.
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500">Calcul…</p>}

      {kpis && !loading && (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Chiffre d'affaires (période)" value={fmt(kpis.chiffreAffaires)} />
            <StatTile label="Charges (période)" value={fmt(kpis.charges)} />
            <StatTile
              label="Résultat net (période)"
              value={fmt(kpis.resultatNet)}
              tone={kpis.resultatNet >= 0 ? "good" : "bad"}
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatTile label="Trésorerie (à ce jour)" value={fmt(kpis.tresorerie)} />
            <StatTile label="Créances clients" value={fmt(kpis.creancesClients)} />
            <StatTile label="Dettes fournisseurs" value={fmt(kpis.dettesFournisseurs)} />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatTile
              label="Factures clients non soldées"
              value={String(kpis.facturesClientsImpayees.count)}
              sub={fmt(kpis.facturesClientsImpayees.total)}
              tone={kpis.facturesClientsImpayees.count > 0 ? "bad" : "neutral"}
            />
            <StatTile
              label="Factures fournisseurs non soldées"
              value={String(kpis.facturesFournisseursImpayees.count)}
              sub={fmt(kpis.facturesFournisseursImpayees.total)}
              tone={kpis.facturesFournisseursImpayees.count > 0 ? "bad" : "neutral"}
            />
          </section>
        </>
      )}
    </main>
  );
}
