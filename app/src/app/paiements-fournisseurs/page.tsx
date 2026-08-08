"use client";

import { useState, useEffect } from "react";
import { fetchPaymentBatches, fetchUnpaidSupplierInvoices, createPaymentBatch, executePaymentBatch, type SupplierPaymentBatch } from "@/lib/supplierPayments";

export default function PaiementsFournisseursPage() {
  const [batches, setBatches] = useState<SupplierPaymentBatch[]>([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState<Awaited<ReturnType<typeof fetchUnpaidSupplierInvoices>>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [b, u] = await Promise.all([fetchPaymentBatches(), fetchUnpaidSupplierInvoices()]);
      setBatches(b);
      setUnpaidInvoices(u);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function toggleInvoice(id: string) {
    const next = new Set(selectedInvoices);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedInvoices(next);
  }

  async function handleCreateBatch() {
    if (selectedInvoices.size === 0) return;

    const items = unpaidInvoices
      .filter((inv) => selectedInvoices.has(inv.id))
      .map((inv) => ({
        payment_id: null,
        supplier_id: inv.third_party_id,
        amount: inv.amount_ttc,
        iban: "",
        bic: "",
        communication: `Paiement facture ${inv.invoice_number ?? ""}`,
      }));

    try {
      await createPaymentBatch(items);
      setSelectedInvoices(new Set());
      setShowForm(false);
      await loadData();
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    }
  }

  async function handleExecute(id: string) {
    if (!confirm("Confirmer l'exécution de ce lot de paiement ?")) return;
    await executePaymentBatch(id);
    await loadData();
  }

  const statusColors: Record<string, string> = {
    pending: "var(--muted)",
    generated: "#3b82f6",
    executed: "#10b981",
    cancelled: "#ef4444",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Paiements fournisseurs</h1>
          <p className="app-page-desc">Générez des lots de virement XML UEMOA pour vos fournisseurs</p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowForm(!showForm)} disabled={unpaidInvoices.length === 0}>
          {showForm ? "Annuler" : "+ Nouveau lot de virement"}
        </button>
      </div>

      {/* Formulaire création lot */}
      {showForm && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-3">Créer un lot de virement</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Sélectionnez les factures à inclure dans ce lot :
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {unpaidInvoices.map((inv) => (
              <label key={inv.id} className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedInvoices.has(inv.id)}
                  onChange={() => toggleInvoice(inv.id)}
                  className="app-checkbox"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{inv.third_party_name}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                    {inv.invoice_number ?? "N/A"} — Échéance {inv.due_date}
                  </span>
                </div>
                <span className="text-sm font-semibold">{inv.amount_ttc.toLocaleString("fr-FR")} FCFA</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              {selectedInvoices.size} facture(s) sélectionnée(s) — Total :{" "}
              {unpaidInvoices
                .filter((inv) => selectedInvoices.has(inv.id))
                .reduce((s, inv) => s + inv.amount_ttc, 0)
                .toLocaleString("fr-FR")}{" "}
              FCFA
            </span>
            <button className="app-btn-primary" onClick={handleCreateBatch} disabled={selectedInvoices.size === 0}>
              Générer le lot XML UEMOA
            </button>
          </div>
        </div>
      )}

      {/* Liste des lots */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : batches.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucun lot de paiement</p>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => (
            <div key={batch.id} className="app-card flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{batch.batch_number}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: statusColors[batch.status] + "20", color: statusColors[batch.status] }}
                  >
                    {batch.status === "generated" ? "Fichier généré" : batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {batch.batch_date} — {batch.payment_count} paiement(s) — Format : {batch.format}
                </p>
                <p className="text-sm font-medium">{batch.total_amount.toLocaleString("fr-FR")} FCFA</p>
              </div>
              <div className="flex gap-2">
                {batch.status === "generated" && (
                  <button className="app-btn-primary text-xs" onClick={() => handleExecute(batch.id)}>
                    Marquer exécuté
                  </button>
                )}
                {batch.file_url && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: "#3b82f620", color: "#3b82f6" }}>
                    XML prêt
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}