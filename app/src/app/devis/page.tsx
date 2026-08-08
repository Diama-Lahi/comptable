"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";
import { fetchQuotes, createQuote, sendQuote, respondToQuote, type Quote } from "@/lib/quotes";

type Client = { id: string; name: string };

export default function DevisPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("");

  // Formulaire
  const [clientId, setClientId] = useState("");
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ description: "", quantity: 1, unit_price: 0, tva_rate: 18 }]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const q = await fetchQuotes();
      const { data: thirdParties } = await supabase
        .from("third_parties")
        .select("id, name")
        .eq("company_id", COMPANY_ID)
        .in("type", ["client", "les_deux"])
        .order("name");
      setQuotes(q);
      setClients(thirdParties ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!clientId || lines.length === 0) return;
    try {
      await createQuote({
        client_id: clientId,
        quote_date: quoteDate,
        valid_until: validUntil || undefined,
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
    setClientId("");
    setQuoteDate(new Date().toISOString().slice(0, 10));
    setValidUntil("");
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
    await sendQuote(id);
    await loadData();
  }

  async function handleAccept(id: string) {
    if (!confirm("Accepter ce devis ? Une facture sera automatiquement générée.")) return;
    await respondToQuote(id, true);
    await loadData();
  }

  async function handleRefuse(id: string) {
    await respondToQuote(id, false);
    await loadData();
  }

  const filtered = filter ? quotes.filter((q) => q.status === filter) : quotes;
  const statusColors: Record<string, string> = {
    draft: "var(--muted)",
    sent: "#3b82f6",
    accepted: "#10b981",
    refused: "#ef4444",
    converted_to_invoice: "#8b5cf6",
    expired: "#f59e0b",
  };

  const statusLabels: Record<string, string> = {
    draft: "Brouillon",
    sent: "Envoyé",
    accepted: "Accepté",
    refused: "Refusé",
    converted_to_invoice: "Converti en facture",
    expired: "Expiré",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Devis clients</h1>
          <p className="app-page-desc">Gérez vos devis et leur transformation en factures</p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouveau devis"}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["", "draft", "sent", "accepted", "refused", "converted_to_invoice", "expired"].map((s) => (
          <button
            key={s}
            className={`app-chip ${filter === s ? "app-chip-active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s === "" ? "Tous" : statusLabels[s] ?? s}
          </button>
        ))}
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-4">Nouveau devis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="app-label">Client</label>
              <select className="app-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="app-label">Date du devis</label>
              <input type="date" className="app-input" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Valable jusqu'au</label>
              <input type="date" className="app-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
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

          <button className="app-btn-primary mt-4" onClick={handleCreate}>Créer le devis</button>
        </div>
      )}

      {/* Liste des devis */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucun devis</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <div key={q.id} className="app-card flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{q.quote_number}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[q.status] + "20", color: statusColors[q.status] }}>
                    {statusLabels[q.status] ?? q.status}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  {q.client_name} — {q.quote_date}
                  {q.valid_until ? ` — Valable jusqu'au ${q.valid_until}` : ""}
                </p>
                <p className="text-sm font-medium">{q.total_ttc.toLocaleString("fr-FR")} FCFA</p>
              </div>
              <div className="flex gap-2">
                {q.status === "draft" && (
                  <button className="app-btn-primary text-xs" onClick={() => handleSend(q.id)}>Envoyer</button>
                )}
                {q.status === "sent" && (
                  <>
                    <button className="app-btn-primary text-xs" onClick={() => handleAccept(q.id)}>Accepter → Facture</button>
                    <button className="app-btn-danger text-xs" onClick={() => handleRefuse(q.id)}>Refuser</button>
                  </>
                )}
                {q.status === "accepted" && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: "#10b98120", color: "#10b981" }}>
                    Facture générée
                  </span>
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