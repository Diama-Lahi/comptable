"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";

export default function AuditPage() {
  const [logs, setLogs] = useState<{
    id: string; table_name: string; operation: string; old_values: string; new_values: string; performed_by: string; performed_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState("");
  const [filterOp, setFilterOp] = useState("");

  useEffect(() => {
    loadLogs();
  }, [filterTable, filterOp]);

  async function loadLogs() {
    setLoading(true);
    try {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .eq("company_id", COMPANY_ID)
        .order("performed_at", { ascending: false })
        .limit(100);

      if (filterTable) query = query.eq("table_name", filterTable);
      if (filterOp) query = query.eq("operation", filterOp);

      const { data } = await query;
      setLogs((data ?? []).map((r) => ({
        id: r.id,
        table_name: r.table_name,
        operation: r.operation,
        old_values: JSON.stringify(r.old_values ?? {}),
        new_values: JSON.stringify(r.new_values ?? {}),
        performed_by: r.performed_by ?? "system",
        performed_at: r.performed_at,
      })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const opColors: Record<string, string> = {
    INSERT: "#10b981",
    UPDATE: "#3b82f6",
    DELETE: "#ef4444",
  };

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Piste d'audit</h1>
          <p className="app-page-desc">Traçabilité complète de toutes les modifications</p>
        </div>
        <button className="app-btn-secondary" onClick={loadLogs}>Actualiser</button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select className="app-input w-auto" value={filterTable} onChange={(e) => setFilterTable(e.target.value)}>
          <option value="">Toutes les tables</option>
          <option value="entries">Écritures</option>
          <option value="entry_lines">Lignes d'écriture</option>
          <option value="invoices">Factures</option>
          <option value="third_parties">Tiers</option>
        </select>
        <select className="app-input w-auto" value={filterOp} onChange={(e) => setFilterOp(e.target.value)}>
          <option value="">Toutes les opérations</option>
          <option value="INSERT">Création</option>
          <option value="UPDATE">Modification</option>
          <option value="DELETE">Suppression</option>
        </select>
        <span className="text-sm self-center" style={{ color: "var(--muted)" }}>
          {logs.length} entrée(s)
        </span>
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Chargement...</p>
      ) : logs.length === 0 ? (
        <p className="text-center py-8" style={{ color: "var(--muted)" }}>Aucune entrée d'audit</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="app-card text-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: opColors[log.operation] + "20", color: opColors[log.operation] }}
                  >
                    {log.operation === "INSERT" ? "CRÉATION" : log.operation === "UPDATE" ? "MODIFICATION" : "SUPPRESSION"}
                  </span>
                  <span className="font-medium">{log.table_name}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>ID: {log.id.slice(0, 8)}...</span>
                </div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {new Date(log.performed_at).toLocaleString("fr-FR")} — {log.performed_by}
                </span>
              </div>
              {log.operation === "UPDATE" && (
                <details className="mt-1">
                  <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>Voir les détails</summary>
                  <div className="grid grid-cols-2 gap-2 mt-2 p-2 rounded" style={{ background: "var(--bg-elevated)", fontSize: 11 }}>
                    <div>
                      <p className="font-medium mb-1" style={{ color: "#ef4444" }}>Ancienne valeur</p>
                      <pre className="whitespace-pre-wrap">{log.old_values}</pre>
                    </div>
                    <div>
                      <p className="font-medium mb-1" style={{ color: "#10b981" }}>Nouvelle valeur</p>
                      <pre className="whitespace-pre-wrap">{log.new_values}</pre>
                    </div>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}