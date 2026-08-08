"use client";

import { useState } from "react";
import { runFullAudit, type AuditAnomaly } from "@/lib/audit";

export default function AuditReportPage() {
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function handleRunAudit() {
    setLoading(true);
    try {
      const results = await runFullAudit();
      setAnomalies(results);
      setLastRun(new Date().toLocaleTimeString("fr-FR"));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  const severityColors: Record<string, string> = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
  const severityLabels: Record<string, string> = { critical: "Critique", warning: "Attention", info: "Information" };
  const typeLabels: Record<string, string> = {
    credit_balance: "Solde créditeur de caisse", missing_audit: "Audit manquant", ledger_gap: "Trou de numérotation",
    inverse_solde: "Solde de compte inversé", duplicate_invoice: "Doublon de facture", missing_arf: "ARF absente/expirée",
    period_lock_violation: "Violation période clôturée",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Rapport d'audit & révision</h1>
          <p className="app-page-desc">Détection automatique des anomalies comptables SYSCOHADA</p>
        </div>
        <button className="app-btn-primary" onClick={handleRunAudit} disabled={loading}>
          {loading ? "Audit en cours..." : "🔄 Lancer l'audit complet"}
        </button>
      </div>

      {lastRun && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="app-card text-center"><p className="text-2xl font-bold">{anomalies.length}</p><p className="text-xs" style={{color:"var(--muted)"}}>Anomalies</p></div>
          <div className="app-card text-center"><p className="text-2xl font-bold" style={{color:"#ef4444"}}>{anomalies.filter(a=>a.severity==="critical").length}</p><p className="text-xs" style={{color:"#ef4444"}}>Critiques</p></div>
          <div className="app-card text-center"><p className="text-2xl font-bold" style={{color:"#f59e0b"}}>{anomalies.filter(a=>a.severity==="warning").length}</p><p className="text-xs" style={{color:"#f59e0b"}}>Avertissements</p></div>
          <div className="app-card text-center"><p className="text-2xl font-bold" style={{color:"#3b82f6"}}>{anomalies.filter(a=>a.severity==="info").length}</p><p className="text-xs" style={{color:"#3b82f6"}}>Infos</p></div>
        </div>
      )}

      {lastRun ? (anomalies.length === 0 ? (
        <div className="app-card text-center py-8"><p className="text-xl">✅</p><p className="font-medium mt-2">Aucune anomalie détectée</p></div>
      ) : (
        <div className="space-y-3">{anomalies.map((a,i)=>(
          <div key={i} className="app-card" style={{borderLeft:`4px solid ${severityColors[a.severity]}`}}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{background:severityColors[a.severity]+"20",color:severityColors[a.severity]}}>{severityLabels[a.severity]}</span>
              <span className="font-semibold text-sm">{typeLabels[a.type]??a.type}</span>
              <span className="text-xs" style={{color:"var(--muted)"}}>{a.entity_type}</span>
            </div>
            <p className="text-sm">{a.description}</p>
            <p className="text-xs mt-2 p-2 rounded" style={{background:"var(--bg-elevated)"}}>💡 {a.recommendation}</p>
          </div>
        ))}</div>
      )) : (
        <div className="app-card text-center py-12" style={{color:"var(--muted)"}}>
          <p className="text-xl mb-2">🔍</p><p>Cliquez sur "Lancer l'audit" pour analyser votre comptabilité.</p>
          <p className="text-sm mt-1">Solde caisse, trous numérotation, comptes inversés, doublons, ARF</p>
        </div>
      )}
      {lastRun && <p className="text-xs text-center mt-4" style={{color:"var(--muted)"}}>Dernier audit : {lastRun}</p>}
    </div>
  );
}