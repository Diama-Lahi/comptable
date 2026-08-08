"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchEcheancierSummary } from "@/lib/reminders";
import { fetchFeeRules, fetchFeeHistory, fetchClientCompanies, type FeeGeneration } from "@/lib/feeCalculator";

export default function CabinetDashboardPage() {
  const [clients, setClients] = useState<{ id: string; name: string; tax_id: string | null }[]>([]);
  const [feeHistory, setFeeHistory] = useState<FeeGeneration[]>([]);
  const [summary, setSummary] = useState<{
    totalClients: number;
    totalFeesMonth: number;
    pendingFees: number;
    alerts: string[];
  }>({ totalClients: 0, totalFeesMonth: 0, pendingFees: 0, alerts: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [companies, fees, echeancier] = await Promise.all([
        fetchClientCompanies(),
        fetchFeeHistory(),
        fetchEcheancierSummary(),
      ]);

      setClients(companies);
      setFeeHistory(fees);

      const pendingFees = fees.filter((f) => f.status !== "paid");
      const thisMonth = new Date().toISOString().slice(0, 7);

      const alerts: string[] = [];
      if (echeancier.alerteSeuil) {
        alerts.push(`⚠️ ${echeancier.totalClientsImpayes} client(s) ont un retard moyen de ${echeancier.joursMoyenRetard} jours`);
      }
      if (pendingFees.length > 0) {
        alerts.push(`💼 ${pendingFees.length} honoraires en attente de paiement`);
      }

      setSummary({
        totalClients: companies.length,
        totalFeesMonth: fees.filter((f) => f.period_from.startsWith(thisMonth)).reduce((s, f) => s + f.amount_calculated, 0),
        pendingFees: pendingFees.reduce((s, f) => s + f.amount_calculated, 0),
        alerts,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Cabinet — Vue d'ensemble</h1>
          <p className="app-page-desc">Dashboard multi-entités pour le cabinet d'expertise comptable</p>
        </div>
        <button className="app-btn-secondary" onClick={loadData}>Actualiser</button>
      </div>

      {/* Cartes résumé */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.totalClients}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Sociétés clientes</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.totalFeesMonth.toLocaleString("fr-FR")}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Honoraires du mois FCFA</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.pendingFees.toLocaleString("fr-FR")}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>En attente de paiement</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.alerts.length}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Alertes</p>
          </div>
        </div>
      )}

      {/* Alertes */}
      {summary.alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {summary.alerts.map((alert, i) => (
            <div key={i} className="p-3 rounded-lg text-sm font-medium" style={{ background: "#f59e0b20", color: "#92400e" }}>
              {alert}
            </div>
          ))}
        </div>
      )}

      {/* Liste des sociétés clientes */}
      <div className="app-card mb-6">
        <h3 className="font-semibold mb-3">Sociétés clientes du portefeuille</h3>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Chargement...</p>
        ) : clients.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune société cliente</p>
        ) : (
          <div className="space-y-2">
            {clients.map((client) => (
              <div key={client.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <div>
                  <span className="font-medium text-sm">{client.name}</span>
                  {client.tax_id && (
                    <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>NINEA: {client.tax_id}</span>
                  )}
                </div>
                <button className="app-btn-secondary text-xs">Voir</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historique des honoraires */}
      <div className="app-card">
        <h3 className="font-semibold mb-3">Historique des honoraires</h3>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Chargement...</p>
        ) : feeHistory.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune facture d'honoraires générée</p>
        ) : (
          <div className="space-y-2">
            {feeHistory.slice(0, 10).map((fee) => (
              <div key={fee.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <div className="flex-1">
                  <span className="text-sm font-medium">{fee.client_company_name ?? "Client"}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                    {fee.period_from} → {fee.period_to}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{fee.amount_calculated.toLocaleString("fr-FR")} FCFA</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: fee.status === "paid" ? "#10b98120" : fee.status === "invoiced" ? "#3b82f620" : "#f59e0b20",
                      color: fee.status === "paid" ? "#10b981" : fee.status === "invoiced" ? "#3b82f6" : "#f59e0b",
                    }}
                  >
                    {fee.status === "paid" ? "Payé" : fee.status === "invoiced" ? "Facturé" : "Calculé"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}