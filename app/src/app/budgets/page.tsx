"use client";

import { useState, useEffect } from "react";
import { fetchBudgets, createBudget, activateBudget, fetchBudgetLines, saveBudgetLine, updateActuals, fetchBudgetAlerts, type Budget, type BudgetLine } from "@/lib/budgets";

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [alerts, setAlerts] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewBudget, setShowNewBudget] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [showNewLine, setShowNewLine] = useState(false);
  const [lineCode, setLineCode] = useState("");
  const [lineLabel, setLineLabel] = useState("");
  const [lineAmount, setLineAmount] = useState(0);

  useEffect(() => {
    loadBudgets();
  }, []);

  async function loadBudgets() {
    setLoading(true);
    const b = await fetchBudgets();
    setBudgets(b);
    setLoading(false);
  }

  async function selectBudget(id: string) {
    setSelectedBudget(id);
    const [l, a] = await Promise.all([fetchBudgetLines(id), fetchBudgetAlerts(id)]);
    setLines(l);
    setAlerts(a);
  }

  async function handleCreateBudget() {
    if (!newLabel) return;
    await createBudget({ label: newLabel, fiscal_year: newYear });
    setShowNewBudget(false);
    setNewLabel("");
    await loadBudgets();
  }

  async function handleActivate(id: string) {
    await activateBudget(id);
    await loadBudgets();
  }

  async function handleAddLine() {
    if (!selectedBudget || !lineCode) return;
    await saveBudgetLine({ budget_id: selectedBudget, account_code: lineCode, label: lineLabel, amount_budgeted: lineAmount });
    setShowNewLine(false);
    setLineCode("");
    setLineLabel("");
    setLineAmount(0);
    selectBudget(selectedBudget);
  }

  async function handleUpdateActuals() {
    if (!selectedBudget) return;
    const year = budgets.find((b) => b.id === selectedBudget)?.fiscal_year ?? 2026;
    await updateActuals(selectedBudget, `${year}-01-01`, `${year}-12-31`);
    selectBudget(selectedBudget);
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Gestion budgétaire</h1>
          <p className="app-page-desc">Budgets, suivi des écarts et alertes</p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowNewBudget(!showNewBudget)}>
          {showNewBudget ? "Annuler" : "+ Nouveau budget"}
        </button>
      </div>

      {showNewBudget && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-4">Nouveau budget</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="app-label">Nom</label>
              <input className="app-input w-full" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Exercice</label>
              <input type="number" className="app-input w-full" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} />
            </div>
            <div className="self-end">
              <button className="app-btn-primary" onClick={handleCreateBudget}>Créer</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Liste des budgets */}
        <div className="md:col-span-1">
          <div className="app-card">
            <h3 className="font-semibold mb-3">Budgets</h3>
            {loading ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Chargement...</p>
            ) : budgets.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Aucun budget</p>
            ) : (
              <div className="space-y-2">
                {budgets.map((b) => (
                  <div
                    key={b.id}
                    className={`p-2 rounded cursor-pointer text-sm ${selectedBudget === b.id ? "font-semibold" : ""}`}
                    style={{ background: selectedBudget === b.id ? "var(--accent-gold-soft)" : "transparent" }}
                    onClick={() => selectBudget(b.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span>{b.label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: b.status === "active" ? "#10b98120" : "#f59e0b20", color: b.status === "active" ? "#10b981" : "#f59e0b" }}>
                        {b.status}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>{b.fiscal_year}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Détail du budget sélectionné */}
        <div className="md:col-span-3">
          {!selectedBudget ? (
            <div className="app-card text-center py-12" style={{ color: "var(--muted)" }}>
              Sélectionnez un budget pour voir ses lignes
            </div>
          ) : (
            <>
              {/* Alertes */}
              {alerts.length > 0 && (
                <div className="app-card mb-4" style={{ borderLeft: "4px solid #f59e0b" }}>
                  <h4 className="font-semibold text-sm mb-2">⚠️ Alertes budgétaires</h4>
                  {alerts.map((a, i) => (
                    <p key={i} className="text-sm">
                      {a.account_code} — {a.label} : écart de {a.variance_percent.toFixed(1)}%
                    </p>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mb-4">
                <button className="app-btn-secondary text-sm" onClick={handleUpdateActuals}>Mettre à jour les réalisés</button>
                <button className="app-btn-primary text-sm" onClick={() => setShowNewLine(!showNewLine)}>+ Ajouter une ligne</button>
                {budgets.find((b) => b.id === selectedBudget)?.status === "draft" && (
                  <button className="app-btn-primary text-sm" onClick={() => handleActivate(selectedBudget)}>Activer le budget</button>
                )}
              </div>

              {showNewLine && (
                <div className="app-card mb-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="app-label">Compte</label>
                      <input className="app-input w-full" value={lineCode} onChange={(e) => setLineCode(e.target.value)} placeholder="60x" />
                    </div>
                    <div>
                      <label className="app-label">Libellé</label>
                      <input className="app-input w-full" value={lineLabel} onChange={(e) => setLineLabel(e.target.value)} />
                    </div>
                    <div>
                      <label className="app-label">Montant budgété</label>
                      <input type="number" className="app-input w-full" value={lineAmount || ""} onChange={(e) => setLineAmount(Number(e.target.value))} />
                    </div>
                    <div className="self-end">
                      <button className="app-btn-primary" onClick={handleAddLine}>Ajouter</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Lignes budgétaires */}
              <div className="app-card">
                <h3 className="font-semibold mb-3">Lignes budgétaires</h3>
                {lines.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune ligne. Créez votre première ligne budgétaire.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex font-semibold p-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <span className="w-20">Compte</span>
                      <span className="flex-1">Libellé</span>
                      <span className="w-32 text-right">Budgété</span>
                      <span className="w-32 text-right">Réalisé</span>
                      <span className="w-24 text-right">Écart %</span>
                    </div>
                    {lines.map((l) => (
                      <div key={l.id} className="flex p-2" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <span className="w-20 font-mono">{l.account_code}</span>
                        <span className="flex-1">{l.label}</span>
                        <span className="w-32 text-right">{l.amount_budgeted.toLocaleString("fr-FR")}</span>
                        <span className="w-32 text-right">{l.amount_actual.toLocaleString("fr-FR")}</span>
                        <span className="w-24 text-right" style={{ color: l.variance_percent > 10 ? "#ef4444" : l.variance_percent < -10 ? "#f59e0b" : "#10b981" }}>
                          {l.variance_percent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .app-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}