"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchPurchaseOrders, createPurchaseOrder, sendPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder, type PurchaseOrder } from "@/lib/purchaseOrders";

type Supplier = { id: string; name: string };

export default function BonsCommandePage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("");

  // Formulaire
  const [supplierId, setSupplierId] = useState("");
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ description: "", quantity: 1, unit_price: 0, tva_rate: 18 }]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: thirdParties } = await supabase
        .from("third_parties")
        .select("id, name")
        .eq("company_id", COMPANY_ID)
        .in("type", ["fournisseur", "les_deux"])
        .order("name");
      const o = await fetchPurchaseOrders();
      setOrders(o);
      setSuppliers(thirdParties ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!supplierId || lines.length === 0) return;
    try {
      await createPurchaseOrder({
        supplier_id: supplierId,
        po_date: poDate,
        expected_date: expectedDate || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tva_rate: l.tva_rate,
        })),
      });
      setShowForm(false);
      resetForm();
      await loadData();
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    }
  }

  function resetForm() {
    setSupplierId("");
    setPoDate(new Date().toISOString().slice(0, 10));
    setExpectedDate("");
    setNotes("");
    setLines([{ description: "", quantity: 1, unit_price: 0, tva_rate: 18 }]);
  }

  function addLine() {
    setLines([...lines, { description: "", quantity: 1, unit_price: 0, tva_rate: 18 }]);
  }

  function updateLine(index: number, field: string, value: string | number) {
    const updated = lines.map((l, i) => (i === index ? { ...l, [field]: value } : l));
    setLines(updated);
  }

  async function handleSend(id: string) {
    if (!confirm("Envoyer ce bon de commande ?")) return;
    await sendPurchaseOrder(id);
    await loadData();
  }

  async function handleReceive(id: string) {
    await receivePurchaseOrder(id, new Date().toISOString().slice(0, 10));
    await loadData();
  }

  async function handleCancel(id: string) {
    if (!confirm("Annuler ce bon de commande ?")) return;
    await cancelPurchaseOrder(id);
    await loadData();
  }

  const filtered = filter ? orders.filter((o) => o.status === filter) : orders;
  const statusColors: Record<string, string> = {
    draft: "var(--muted)",
    sent: "#3b82f6",
    partially_received: "#f59e0b",
    received: "#10b981",
    cancelled: "#ef4444",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Bons de commande fournisseurs</h1>
          <p className="app-page-desc">Gérez vos achats et bons de commande</p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouveau bon de commande"}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4">
        {["", "draft", "sent", "partially_received", "received", "cancelled"].map((s) => (
          <button
            key={s}
            className={`app-chip ${filter === s ? "app-chip-active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s === "" ? "Tous" : s === "partially_received" ? "Partiellement reçu" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-4">Nouveau bon de commande</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="app-label">Fournisseur</label>
              <select className="app-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Sélectionner...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="app-label">Date</label>
              <input type="date" className="app-input" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Date de livraison prévue</label>
              <input type="date" className="app-input" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          {/* Lignes */}
          <h4 className="font-medium mb-2">Lignes</h4>
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
              <input className="app-input col-span-2" placeholder="Description" value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} />
              <input type="number" className="app-input" placeholder="Qté" value={line.quantity} onChange={(e) => updateLine(i, "quantity", Number(e.target.value))} />
              <input type="number" className="app-input" placeholder="Prix unitaire" value={line.unit_price} onChange={(e) => updateLine(i, "unit_price", Number(e.target.value))} />
              <input type="number" className="app-input" placeholder="TVA %" value={line.tva_rate} onChange={(e) => updateLine(i, "tva_rate", Number(e.target.value))} />
            </div>
          ))}
          <button className="app-btn-secondary text-sm" onClick={addLine}>+ Ajouter une ligne</button>

          <div className="mt-4">
            <label className="app-label">Notes</label>
            <textarea className="app-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button className="app-btn-primary mt-4" onClick={handleCreate}>Créer le bon de commande</button>
        </div>
      )}

      {/* Liste des bons de commande */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucun bon de commande</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((po) => (
            <div key={po.id} className="app-card flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{po.po_number}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[po.status] + "20", color: statusColors[po.status] }}>
                    {po.status === "partially_received" ? "Partiellement reçu" : po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {po.supplier_name} — {po.po_date}
                  {po.expected_date ? ` — Livraison prévue : ${po.expected_date}` : ""}
                </p>
                <p className="text-sm font-medium">{po.total_ttc.toLocaleString("fr-FR")} FCFA</p>
              </div>
              <div className="flex gap-2">
                {po.status === "draft" && (
                  <>
                    <button className="app-btn-primary text-xs" onClick={() => handleSend(po.id)}>Envoyer</button>
                    <button className="app-btn-danger text-xs" onClick={() => handleCancel(po.id)}>Annuler</button>
                  </>
                )}
                {po.status === "sent" && (
                  <button className="app-btn-primary text-xs" onClick={() => handleReceive(po.id)}>Réceptionner</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .app-chip { padding: 4px 12px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
        .app-chip-active { background: var(--accent-gold-soft); border-color: var(--accent-gold); color: var(--accent-gold); }
        .app-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}