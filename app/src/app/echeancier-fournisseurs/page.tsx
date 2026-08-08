"use client";

import { useState, useEffect } from "react";
import { fetchSupplierDueInvoices, fetchEcheancierSummary, type DueItem, type EcheancierSummary } from "@/lib/reminders";

export default function EcheancierFournisseursPage() {
  const [invoices, setInvoices] = useState<DueItem[]>([]);
  const [summary, setSummary] = useState<EcheancierSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [inv, sum] = await Promise.all([
        fetchSupplierDueInvoices(),
        fetchEcheancierSummary(),
      ]);
      setInvoices(inv);
      setSummary(sum);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Échéancier fournisseurs</h1>
          <p className="app-page-desc">Suivi des échéances de paiement fournisseurs</p>
        </div>
        <button className="app-btn-secondary" onClick={loadData}>Actualiser</button>
      </div>

      {/* Résumé */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.totalFournisseurs}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Factures à échéance</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.montantTotalFournisseurs.toLocaleString("fr-FR")}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Montant total FCFA</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.totalClientsImpayes}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Clients impayés</p>
          </div>
          <div className="app-card text-center">
            <p className="text-2xl font-bold">{summary.montantTotalClients.toLocaleString("fr-FR")}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>Créances clients FCFA</p>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : invoices.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucune échéance à venir</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const isOverdue = inv.days_until_due < 0;
            const isDueSoon = inv.days_until_due >= 0 && inv.days_until_due <= 5;

            return (
              <div key={inv.invoice_id} className="app-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{inv.invoice_number ?? "N/A"}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: isOverdue ? "#ef444420" : isDueSoon ? "#f59e0b20" : "#10b98120",
                        color: isOverdue ? "#ef4444" : isDueSoon ? "#f59e0b" : "#10b981",
                      }}
                    >
                      {isOverdue ? `En retard (J${inv.days_until_due})` : isDueSoon ? `Échéance J+${inv.days_until_due}` : `J+${inv.days_until_due}`}
                    </span>
                  </div>
                  <span className="font-semibold">{inv.amount.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {inv.third_party_name} — Échéance : {inv.due_date}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}