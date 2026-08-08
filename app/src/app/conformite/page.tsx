"use client";

import { useState, useEffect } from "react";
import { computeComplianceScore, type ComplianceResult } from "@/lib/compliance";

export default function ConformitePage() {
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  async function handleAnalyze() {
    setLoading(true);
    try {
      const r = await computeComplianceScore(from, to);
      setResult(r);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  function getScoreColor(score: number): string {
    if (score >= 90) return "#10b981";
    if (score >= 75) return "#3b82f6";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  }

  function getRiskLabel(level: string): string {
    const labels: Record<string, string> = { elevated: "Risque élevé", medium: "Risque moyen", compliant: "Conforme", excellent: "Excellent" };
    return labels[level] ?? level;
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Score de conformité SYSCOHADA</h1>
          <p className="app-page-desc">Analyse automatique de la qualité comptable et de la conformité normative</p>
        </div>
      </div>

      {/* Sélection période */}
      <div className="app-card mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="app-label">Du</label>
            <input type="date" className="app-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="app-label">Au</label>
            <input type="date" className="app-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="app-btn-primary" onClick={handleAnalyze} disabled={loading}>
            {loading ? "Analyse en cours..." : "Analyser la conformité"}
          </button>
        </div>
      </div>

      {result && (
        <>
          {/* Score global */}
          <div className="app-card mb-6 text-center">
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>Score de conformité</p>
            <p className="text-5xl font-bold" style={{ color: getScoreColor(result.overall_score) }}>
              {result.overall_score}/100
            </p>
            <p className="text-sm mt-1 font-medium" style={{ color: getScoreColor(result.overall_score) }}>
              {getRiskLabel(result.risk_level)}
            </p>
          </div>

          {/* Catégories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="app-card">
              <h3 className="font-semibold mb-2">📊 Qualité comptable</h3>
              <p className="text-2xl font-bold" style={{ color: getScoreColor(result.categories.accounting_quality.score) }}>
                {result.categories.accounting_quality.score}/{result.categories.accounting_quality.max}
              </p>
            </div>
            <div className="app-card">
              <h3 className="font-semibold mb-2">💰 Conformité fiscale</h3>
              <p className="text-2xl font-bold" style={{ color: getScoreColor(result.categories.tax_compliance.score) }}>
                {result.categories.tax_compliance.score}/{result.categories.tax_compliance.max}
              </p>
            </div>
            <div className="app-card">
              <h3 className="font-semibold mb-2">📋 Qualité des états</h3>
              <p className="text-2xl font-bold" style={{ color: getScoreColor(result.categories.financial_quality.score) }}>
                {result.categories.financial_quality.score}/{result.categories.financial_quality.max}
              </p>
            </div>
            <div className="app-card">
              <h3 className="font-semibold mb-2">⚠️ Risques</h3>
              <p className="text-2xl font-bold" style={{ color: getScoreColor(result.categories.risk_penalties.score) }}>
                {result.categories.risk_penalties.score}/{result.categories.risk_penalties.max}
              </p>
            </div>
          </div>

          {/* Recommandations */}
          {result.recommendations.length > 0 && (
            <div className="app-card mb-6" style={{ borderLeft: "4px solid #f59e0b" }}>
              <h3 className="font-semibold mb-3">💡 Recommandations</h3>
              <ul className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span>•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Score calculé sur la période du {from} au {to}
          </div>
        </>
      )}

      <style>{`
        .app-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      `}</style>
    </div>
  );
}