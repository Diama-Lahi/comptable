"use client";

import { useState, useEffect } from "react";
import { fetchFeeRules, saveFeeRule, fetchFeeHistory, generateFeeInvoice, fetchClientCompanies, type FeeRule, type FeeGeneration } from "@/lib/feeCalculator";

export default function HonorairesPage() {
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [history, setHistory] = useState<FeeGeneration[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Formulaire règle
  const [ruleName, setRuleName] = useState("");
  const [ruleBase, setRuleBase] = useState<FeeRule["calculation_base"]>("flat_fee");
  const [ruleRate, setRuleRate] = useState(0);
  const [ruleMin, setRuleMin] = useState(0);
  const [ruleMax, setRuleMax] = useState(0);

  // Génération facture
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedRule, setSelectedRule] = useState("");
  const [genPeriodFrom, setGenPeriodFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [genPeriodTo, setGenPeriodTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, h, c] = await Promise.all([fetchFeeRules(), fetchFeeHistory(), fetchClientCompanies()]);
      setRules(r);
      setHistory(h);
      setClients(c);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleSaveRule() {
    if (!ruleName) return;
    await saveFeeRule({ rule_name: ruleName, calculation_base: ruleBase, rate: ruleRate, min_fee: ruleMin || undefined, max_fee: ruleMax || undefined });
    setShowForm(false);
    resetForm();
    await loadData();
  }

  function resetForm() {
    setRuleName(""); setRuleBase("flat_fee"); setRuleRate(0); setRuleMin(0); setRuleMax(0);
  }

  async function handleGenerateInvoice() {
    if (!selectedClient || !selectedRule) return;
    try {
      await generateFeeInvoice(selectedClient, selectedRule, genPeriodFrom, genPeriodTo);
      await loadData();
      alert("Facture d'honoraires générée !");
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    }
  }

  const baseLabels: Record<string, string> = {
    flat_fee: "Forfait fixe",
    per_entry: "Par écriture",
    per_invoice: "Par facture",
    percentage_turnover: "% du CA",
  };

  const statusColors: Record<string, string> = {
    calculated: "#f59e0b", invoiced: "#3b82f6", paid: "#10b981",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Honoraires du cabinet</h1>
          <p className="app-page-desc">Gérez les règles d'honoraires et générez les factures pour vos clients</p>
        </div>
        <button className="app-btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Annuler" : "+ Nouvelle règle"}
        </button>
      </div>

      {/* Formulaire nouvelle règle */}
      {showForm && (
        <div className="app-card mb-6">
          <h3 className="font-semibold mb-4">Nouvelle règle d'honoraires</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div>
              <label className="app-label">Nom</label>
              <input className="app-input w-full" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
            </div>
            <div>
              <label className="app-label">Base de calcul</label>
              <select className="app-input w-full" value={ruleBase} onChange={(e) => setRuleBase(e.target.value as FeeRule["calculation_base"])}>
                <option value="flat_fee">Forfait fixe</option>
                <option value="per_entry">Par écriture</option>
                <option value="per_invoice">Par facture</option>
                <option value="percentage_turnover">% du CA</option>
              </select>
            </div>
            <div>
              <label className="app-label">Taux / Montant</label>
              <input type="number" className="app-input w-full" value={ruleRate || ""} onChange={(e) => setRuleRate(Number(e.target.value))} />
            </div>
            <div>
              <label className="app-label">Min (optionnel)</label>
              <input type="number" className="app-input w-full" value={ruleMin || ""} onChange={(e) => setRuleMin(Number(e.target.value))} />
            </div>
            <div>
              <label className="app-label">Max (optionnel)</label>
              <input type="number" className="app-input w-full" value={ruleMax || ""} onChange={(e) => setRuleMax(Number(e.target.value))} />
            </div>
          </div>
          <button className="app-btn-primary" onClick={handleSaveRule}>Enregistrer la règle</button>
        </div>
      )}

      {/* Grille */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Règles */}
        <div className="md:col-span-1">
          <div className="app-card">
            <h3 className="font-semibold mb-3">Règles actives</h3>
            {rules.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune règle</p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div key={rule.id} className="p-3 rounded" style={{ background: "var(--bg-elevated)" }}>
                    <p className="font-medium text-sm">{rule.rule_name}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {baseLabels[rule.calculation_base] ?? rule.calculation_base} — {rule.rate} {rule.calculation_base === "percentage_turnover" ? "%" : "FCFA"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Génération + Historique */}
        <div className="md:col-span-2">
          {/* Générer une facture */}
          <div className="app-card mb-4">
            <h3 className="font-semibold mb-3">Générer une facture d'honoraires</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              <div>
                <label className="app-label">Client</label>
                <select className="app-input w-full" value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
                  <option value="">Choisir...</option>
                  {clients.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              </div>
              <div>
                <label className="app-label">Règle</label>
                <select className="app-input w-full" value={selectedRule} onChange={(e) => setSelectedRule(e.target.value)}>
                  <option value="">Choisir...</option>
                  {rules.map((r) => (<option key={r.id} value={r.id}>{r.rule_name}</option>))}
                </select>
              </div>
              <div>
                <label className="app-label">Du</label>
                <input type="date" className="app-input w-full" value={genPeriodFrom} onChange={(e) => setGenPeriodFrom(e.target.value)} />
              </div>
              <div>
                <label className="app-label">Au</label>
                <input type="date" className="app-input w-full" value={genPeriodTo} onChange={(e) => setGenPeriodTo(e.target.value)} />
              </div>
              <div className="self-end">
                <button className="app-btn-primary" onClick={handleGenerateInvoice} disabled={!selectedClient || !selectedRule}>
                  Générer
                </button>
              </div>
            </div>
          </div>

          {/* Historique */}
          <div className="app-card">
            <h3 className="font-semibold mb-3">Historique des factures générées</h3>
            {history.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune facture générée</p>
            ) : (
              <div className="space-y-2">
                {history.map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between p-3 rounded" style={{ background: "var(--bg-elevated)" }}>
                    <div>
                      <p className="text-sm font-medium">{fee.client_company_name ?? "Client"}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{fee.period_from} → {fee.period_to}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{fee.amount_calculated.toLocaleString("fr-FR")} FCFA</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: statusColors[fee.status] + "20", color: statusColors[fee.status] }}>
                        {fee.status === "paid" ? "Payé" : fee.status === "invoiced" ? "Facturé" : "Calculé"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .app-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}