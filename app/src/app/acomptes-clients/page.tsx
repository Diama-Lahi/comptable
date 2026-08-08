"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchDeposits, createDeposit, fetchOpenDepositsBalance, type CustomerDeposit } from "@/lib/customerDeposits";

type Client = { id: string; name: string };

export default function AcomptesClientsPage() {
  const [deposits, setDeposits] = useState<CustomerDeposit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [balance, setBalance] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Formulaire
  const [clientId, setClientId] = useState("");
  const [amountHt, setAmountHt] = useState(0);
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [d, b, third] = await Promise.all([
        fetchDeposits(),
        fetchOpenDepositsBalance(),
        supabase.from("third_parties").select("id, name").eq("company_id", COMPANY_ID).in("type", ["client", "les_deux"]).order("name"),
      ]);
      setDeposits(d);
      setBalance(b);
      setClients(third.data ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!clientId || amountHt <= 0) return;
    try {
      await createDeposit({ client_id: clientId, deposit_date: depositDate, amount_ht: amountHt });
      setShowForm(false);
      setClientId("");
      setAmountHt(0);
      await loadData();
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    }
  }

  const statusColors: Record<string, string> = {
    pending: "#f59e0b",
    partially_deducted: "#3b82f6",
    fully_deducted: "#10b981",
    refunded: "#ef4444",
  };

  const statusLabels: Record<string, string> = {
    pending: "En attente",
    partially_deducted: "Partiellement déduit",
    fully_deducted: "Entièrement déduit",
    refunded: "Remboursé",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Acomptes clients (TVA Sénégal)</h1>
          <p className="app-page-desc">
            Gère les acomptes avec TVA exigible et leur régularisation sur facture finale
          </p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouvel acompte"}
        </button>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="app-card text-center">
          <p className="text-2xl font-bold">{balance.count}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Acomptes en cours</p>
        </div>
        <div className="app-card text-center">
          <p className="text-2xl font-bold">{balance.total.toLocaleString("fr-FR")}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Solde restant FCFA</p>
        </div>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-4">Nouvel acompte client</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="app-label">Client</label>
              <select className="app-input w-full" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="app-label">Montant HT</label>
              <input type="number" className="app-input w-full" value={amountHt || ""} onChange={(e) => setAmountHt(Number(e.target.value))} />
            </div>
            <div>
              <label className="app-label">Date</label>
              <input type="date" className="app-input w-full" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
            </div>
          </div>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            TVA 18% incluse — Écriture générée automatiquement (débit 411 / crédit 701 + 4431)
          </p>
          <button className="app-btn-primary" onClick={handleCreate}>
            Créer l'acompte
          </button>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : deposits.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucun acompte</p>
      ) : (
        <div className="space-y-3">
          {deposits.map((d) => (
            <div key={d.id} className="app-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{d.deposit_number}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: statusColors[d.status] + "20", color: statusColors[d.status] }}
                  >
                    {statusLabels[d.status] ?? d.status}
                  </span>
                </div>
                <span className="font-semibold">{d.amount_ttc.toLocaleString("fr-FR")} FCFA</span>
              </div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {d.client_name} — {d.deposit_date} — TVA : {d.tva_amount.toLocaleString("fr-FR")} FCFA
              </p>
              {d.remaining_balance > 0 && (
                <p className="text-sm font-medium mt-1">
                  Solde restant : <span className="text-amber-600">{d.remaining_balance.toLocaleString("fr-FR")} FCFA</span>
                </p>
              )}
              {d.invoice_id && (
                <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  Lié à la facture : {d.invoice_id}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .app-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}