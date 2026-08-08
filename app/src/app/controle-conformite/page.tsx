"use client";

import { useState, useEffect } from "react";
import { fetchInvoiceControls, controlInvoiceWithPO, type InvoiceControlResult } from "@/lib/invoiceControl";
import { supabase, COMPANY_ID } from "@/lib/supabase";

export default function ControleConformitePage() {
  const [controls, setControls] = useState<InvoiceControlResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string | null; supplier: string }[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const c = await fetchInvoiceControls(filter || undefined);
      setControls(c);

      // Récupère les factures fournisseurs sans contrôle
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number, third_parties!inner(name)")
        .eq("company_id", COMPANY_ID)
        .eq("type", "fournisseur")
        .eq("status", "received")
        .order("invoice_date", { ascending: false });

      setInvoices(
        ((inv ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          invoice_number: r.invoice_number as string | null,
          supplier: (r.third_parties as Record<string, unknown>)?.name as string ?? "",
        }))
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleControl() {
    if (!selectedInvoice) return;
    try {
      await controlInvoiceWithPO(selectedInvoice);
      setSelectedInvoice("");
      await loadAll();
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    }
  }

  useEffect(() => {
    const load = async () => {
      const c = await fetchInvoiceControls(filter || undefined);
      setControls(c);
    };
    load();
  }, [filter]);

  const statusColors: Record<string, string> = {
    pending: "var(--muted)",
    ok: "#10b981",
    warning: "#f59e0b",
    blocking: "#ef4444",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Contrôle conformité BC / Facture</h1>
          <p className="app-page-desc">Compare automatiquement les factures fournisseurs avec leurs bons de commande</p>
        </div>
      </div>

      {/* Lancer un contrôle */}
      <div className="app-card mb-6">
        <h3 className="font-semibold mb-3">Lancer un contrôle</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <select className="app-input w-full" value={selectedInvoice} onChange={(e) => setSelectedInvoice(e.target.value)}>
              <option value="">Sélectionner une facture fournisseur reçue...</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number ?? "Sans numéro"} — {inv.supplier}
                </option>
              ))}
            </select>
          </div>
          <button className="app-btn-primary" onClick={handleControl} disabled={!selectedInvoice}>
            Lancer le contrôle
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "pending", "ok", "warning", "blocking"].map((s) => (
          <button
            key={s}
            className={`app-chip ${filter === s ? "app-chip-active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s === "" ? "Tous" : s === "ok" ? "Conforme" : s === "pending" ? "En attente" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Liste des contrôles */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : controls.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucun contrôle effectué</p>
      ) : (
        <div className="space-y-3">
          {controls.map((ctrl) => (
            <div key={ctrl.control_id} className="app-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: statusColors[ctrl.status] + "20", color: statusColors[ctrl.status] }}
                  >
                    {ctrl.status === "ok" ? "Conforme" : ctrl.status.charAt(0).toUpperCase() + ctrl.status.slice(1)}
                  </span>
                  <span className="text-sm font-semibold">{ctrl.invoice_number ?? "N/A"}</span>
                </div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>BC: {ctrl.po_number ?? "N/A"}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Facture</span>
                  <p className="font-medium">{ctrl.invoice_amount.toLocaleString("fr-FR")} FCFA</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Bon de commande</span>
                  <p className="font-medium">{ctrl.po_amount.toLocaleString("fr-FR")} FCFA</p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Écart</span>
                  <p className={`font-medium ${Math.abs(ctrl.amount_diff) > 0.01 ? "text-red-500" : ""}`}>
                    {ctrl.amount_diff > 0 ? "+" : ""}{ctrl.amount_diff.toLocaleString("fr-FR")} FCFA
                  </p>
                </div>
                <div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Anomalies</span>
                  <p className="font-medium">
                    {[ctrl.qty_diff ? "Qté" : "", ctrl.price_diff ? "Prix" : ""].filter(Boolean).join(", ") || "Aucune"}
                  </p>
                </div>
              </div>

              {ctrl.notes && (
                <p className="text-sm mt-2 p-2 rounded" style={{ background: "var(--bg-warning)", color: "var(--warning)" }}>
                  {ctrl.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .app-chip { padding: 4px 12px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
        .app-chip-active { background: var(--accent-gold-soft); border-color: var(--accent-gold); color: var(--accent-gold); }
      `}</style>
    </div>
  );
}